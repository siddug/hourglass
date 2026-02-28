import cron, { type ScheduledTask as CronTask } from 'node-cron';
import { CronExpressionParser } from 'cron-parser';
import Queue from 'better-queue';
import SqliteStore from 'better-queue-sqlite';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { EventEmitter } from 'events';
import { join, dirname } from 'path';
import type { DatabaseInstance } from '../db/index.js';
import { scheduledTasks, sessions, executionProcesses, processLogs, personalities, projects, type ScheduledTask, type SessionStatus, type ApprovalMode, type AgentMode } from '../db/schema.js';
import type { ConnectorRegistry } from '../connectors/registry.js';
import type { SpawnedSession } from '../connectors/base.js';
import type { CreateScheduledTaskConfig, UpdateScheduledTaskConfig, TaskExecutionResult } from './types.js';
import { applyFullPromptContext, type ProjectAgent } from '../utils/prompt-utils.js';
import { loadConfig } from '../utils/config.js';
import { SkillsService } from '../services/skills-service.js';

/**
 * Logger interface matching pino's API
 */
interface Logger {
  info: (obj: Record<string, unknown> | string, msg?: string) => void;
  error: (obj: Record<string, unknown> | string, msg?: string) => void;
  warn: (obj: Record<string, unknown> | string, msg?: string) => void;
  debug: (obj: Record<string, unknown> | string, msg?: string) => void;
}

/**
 * Queue configuration options
 */
export interface QueueConfig {
  /** Maximum concurrent task executions (default: 3) */
  concurrent?: number;
  /** Maximum retry attempts for failed tasks (default: 2) */
  maxRetries?: number;
  /** Delay between retries in ms (default: 10000) */
  retryDelay?: number;
  /** Path to queue database file (default: ./scheduler-queue.db) */
  queueDbPath?: string;
}

/**
 * Dependencies for the scheduler service
 */
export interface SchedulerDependencies {
  db: DatabaseInstance;
  registry: ConnectorRegistry;
  activeSessions: Map<string, SpawnedSession>;
  logger: Logger;
  queueConfig?: QueueConfig;
}

/**
 * Job payload for the queue
 */
interface QueueJob {
  taskId: string;
  triggeredAt: number;
  isManualTrigger?: boolean;
}

/**
 * SchedulerService - Manages scheduled tasks using node-cron + better-queue
 *
 * Architecture:
 * - node-cron: Handles WHEN tasks should run (cron expressions, one-time schedules)
 * - better-queue: Handles HOW tasks execute (concurrency, retries, persistence)
 *
 * Features:
 * - Cron-based recurring tasks
 * - One-time scheduled tasks
 * - Context inheritance between executions
 * - Persistent job queue (SQLite)
 * - Concurrency control
 * - Automatic retries with backoff
 */
export class SchedulerService extends EventEmitter {
  private cronJobs: Map<string, CronTask> = new Map();
  private oneTimeTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private jobQueue!: Queue;
  private db: DatabaseInstance;
  private registry: ConnectorRegistry;
  private activeSessions: Map<string, SpawnedSession>;
  private logger: Logger;
  private queueConfig: Required<QueueConfig>;
  private initialized = false;

  constructor(deps: SchedulerDependencies) {
    super();
    this.db = deps.db;
    this.registry = deps.registry;
    this.activeSessions = deps.activeSessions;
    this.logger = deps.logger;

    // Set queue config with defaults
    this.queueConfig = {
      concurrent: deps.queueConfig?.concurrent ?? 3,
      maxRetries: deps.queueConfig?.maxRetries ?? 2,
      retryDelay: deps.queueConfig?.retryDelay ?? 10000,
      queueDbPath: deps.queueConfig?.queueDbPath ?? './scheduler-queue.db',
    };

    this.initializeQueue();
  }

  /**
   * Initialize the job queue with SQLite persistence
   */
  private initializeQueue(): void {
    this.logger.info({ config: this.queueConfig }, 'Initializing job queue');

    this.jobQueue = new Queue<QueueJob, TaskExecutionResult>(
      async (job: QueueJob, callback: (error: Error | null, result?: TaskExecutionResult) => void) => {
        try {
          const result = await this.processJob(job);
          callback(null, result);
        } catch (error) {
          callback(error instanceof Error ? error : new Error(String(error)));
        }
      },
      {
        // SQLite persistence
        store: new SqliteStore({
          path: this.queueConfig.queueDbPath,
        }),
        // Concurrency control
        concurrent: this.queueConfig.concurrent,
        // Retry configuration
        maxRetries: this.queueConfig.maxRetries,
        retryDelay: this.queueConfig.retryDelay,
        // Process jobs one at a time per task (prevent duplicate runs)
        id: (job: QueueJob, callback: (error: Error | null, id?: string) => void) => {
          callback(null, job.taskId);
        },
        // Merge duplicate jobs (if same task is queued multiple times, keep latest)
        merge: (oldJob: QueueJob, newJob: QueueJob, callback: (error: Error | null, merged?: QueueJob) => void) => {
          // Keep the newer trigger
          callback(null, newJob);
        },
      }
    );

    // Queue event handlers
    this.jobQueue.on('task_finish', (taskId: string, result: unknown) => {
      this.logger.info({ taskId, result }, 'Queue task finished');
      this.emit('taskExecuted', taskId, result as TaskExecutionResult);
    });

    this.jobQueue.on('task_failed', (taskId: string, error: Error) => {
      this.logger.error({ taskId, error: error.message }, 'Queue task failed');
      this.emit('taskFailed', taskId, error);
    });

    this.jobQueue.on('task_progress', (taskId: string, progress: number) => {
      this.logger.debug({ taskId, progress }, 'Queue task progress');
    });

    this.logger.info('Job queue initialized');
  }

  /**
   * Process a job from the queue
   */
  private async processJob(job: QueueJob): Promise<TaskExecutionResult> {
    this.logger.info({ taskId: job.taskId, triggeredAt: new Date(job.triggeredAt).toISOString() }, 'Processing queued job');

    // Get fresh task data from database
    const task = this.db.db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, job.taskId))
      .get();

    if (!task) {
      throw new Error(`Task not found: ${job.taskId}`);
    }

    // Execute the task
    return this.executeTaskInternal(task);
  }

  /**
   * Initialize the scheduler by loading all enabled tasks from the database
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Scheduler already initialized');
      return;
    }

    this.logger.info('Initializing scheduler service...');

    // Load all enabled tasks
    const tasks = this.db.db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.enabled, true))
      .all();

    this.logger.info({ count: tasks.length }, 'Loading scheduled tasks');

    for (const task of tasks) {
      try {
        this.scheduleTask(task);
      } catch (error) {
        this.logger.error({ taskId: task.id, error }, 'Failed to schedule task');
      }
    }

    this.initialized = true;
    this.logger.info('Scheduler service initialized');
  }

  /**
   * Shutdown the scheduler, cancelling all jobs
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down scheduler service...');

    // Stop all cron jobs
    for (const [taskId, job] of this.cronJobs) {
      job.stop();
      this.logger.debug({ taskId }, 'Stopped cron job');
    }
    this.cronJobs.clear();

    // Clear all one-time timeouts
    for (const [taskId, timeout] of this.oneTimeTimeouts) {
      clearTimeout(timeout);
      this.logger.debug({ taskId }, 'Cleared one-time timeout');
    }
    this.oneTimeTimeouts.clear();

    // Destroy the queue (waits for current jobs to finish)
    if (this.jobQueue) {
      await new Promise<void>((resolve) => {
        this.jobQueue.destroy(() => {
          this.logger.info('Job queue destroyed');
          resolve();
        });
      });
    }

    this.initialized = false;
    this.logger.info('Scheduler service shut down');
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): { concurrent: number; maxRetries: number; retryDelay: number } {
    return {
      concurrent: this.queueConfig.concurrent,
      maxRetries: this.queueConfig.maxRetries,
      retryDelay: this.queueConfig.retryDelay,
    };
  }

  /**
   * Create a new scheduled task
   */
  async createTask(config: CreateScheduledTaskConfig): Promise<ScheduledTask> {
    const taskId = nanoid();
    const now = new Date();

    // Calculate next run time
    let nextRunAt: Date | null = null;
    if (config.scheduleType === 'once' && config.runAt) {
      nextRunAt = config.runAt;
    } else if (config.scheduleType === 'cron' && config.cronExpression) {
      nextRunAt = this.getNextCronRun(config.cronExpression, config.timezone || 'UTC');
    }

    const task: ScheduledTask = {
      id: taskId,
      name: config.name,
      prompt: config.prompt,
      connectorType: config.connectorType,
      workDir: config.workDir,
      scheduleType: config.scheduleType,
      cronExpression: config.cronExpression || null,
      nextRunAt,
      timezone: config.timezone || 'UTC',
      inheritContext: config.inheritContext ?? false,
      lastSessionId: null,
      lastAgentSessionId: null,
      agentMode: config.agentMode || 'default',
      approvalMode: config.approvalMode || 'manual',
      env: config.env ? JSON.stringify(config.env) : null,
      personalityId: config.personalityId || null,
      projectId: config.projectId || null,
      enabled: true,
      executionCount: 0,
      lastRunAt: null,
      createdAt: now,
      updatedAt: now,
    };

    // Insert into database
    this.db.db.insert(scheduledTasks).values(task).run();

    // Schedule the task
    this.scheduleTask(task);

    this.emit('taskScheduled', taskId);
    this.logger.info({ taskId, name: config.name, scheduleType: config.scheduleType }, 'Created scheduled task');

    return task;
  }

  /**
   * Update an existing scheduled task
   */
  async updateTask(taskId: string, config: UpdateScheduledTaskConfig): Promise<ScheduledTask | null> {
    const existingTask = this.db.db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, taskId))
      .get();

    if (!existingTask) {
      return null;
    }

    // Cancel existing schedule
    this.cancelTaskSchedule(taskId);

    // Calculate new next run time if schedule changed
    let nextRunAt = existingTask.nextRunAt;
    const scheduleType = config.scheduleType || existingTask.scheduleType;
    const cronExpression = config.cronExpression !== undefined ? config.cronExpression : existingTask.cronExpression;
    const timezone = config.timezone || existingTask.timezone;

    if (config.runAt && scheduleType === 'once') {
      nextRunAt = config.runAt;
    } else if (config.cronExpression && scheduleType === 'cron') {
      nextRunAt = this.getNextCronRun(config.cronExpression, timezone);
    }

    // Update in database
    const updateData: Partial<ScheduledTask> = {
      ...config,
      env: config.env ? JSON.stringify(config.env) : existingTask.env,
      nextRunAt,
      updatedAt: new Date(),
    };

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key as keyof typeof updateData] === undefined) {
        delete updateData[key as keyof typeof updateData];
      }
    });

    this.db.db
      .update(scheduledTasks)
      .set(updateData)
      .where(eq(scheduledTasks.id, taskId))
      .run();

    // Get updated task
    const updatedTask = this.db.db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, taskId))
      .get();

    // Re-schedule if enabled
    if (updatedTask && updatedTask.enabled) {
      this.scheduleTask(updatedTask);
    }

    this.logger.info({ taskId }, 'Updated scheduled task');
    return updatedTask || null;
  }

  /**
   * Delete a scheduled task
   */
  async deleteTask(taskId: string): Promise<boolean> {
    const task = this.db.db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, taskId))
      .get();

    if (!task) {
      return false;
    }

    // Cancel schedule
    this.cancelTaskSchedule(taskId);

    // Delete from database
    this.db.db
      .delete(scheduledTasks)
      .where(eq(scheduledTasks.id, taskId))
      .run();

    this.emit('taskCancelled', taskId);
    this.logger.info({ taskId }, 'Deleted scheduled task');
    return true;
  }

  /**
   * Enable a scheduled task
   */
  async enableTask(taskId: string): Promise<boolean> {
    const task = this.db.db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, taskId))
      .get();

    if (!task) {
      return false;
    }

    // Update in database
    this.db.db
      .update(scheduledTasks)
      .set({ enabled: true, updatedAt: new Date() })
      .where(eq(scheduledTasks.id, taskId))
      .run();

    // Schedule the task
    const updatedTask = this.db.db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, taskId))
      .get();

    if (updatedTask) {
      this.scheduleTask(updatedTask);
    }

    this.logger.info({ taskId }, 'Enabled scheduled task');
    return true;
  }

  /**
   * Disable a scheduled task
   */
  async disableTask(taskId: string): Promise<boolean> {
    const task = this.db.db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, taskId))
      .get();

    if (!task) {
      return false;
    }

    // Cancel schedule
    this.cancelTaskSchedule(taskId);

    // Update in database
    this.db.db
      .update(scheduledTasks)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(scheduledTasks.id, taskId))
      .run();

    this.logger.info({ taskId }, 'Disabled scheduled task');
    return true;
  }

  /**
   * Manually trigger a task to run now
   * This bypasses the cron schedule and immediately queues the task
   */
  async triggerTask(taskId: string): Promise<TaskExecutionResult> {
    const task = this.db.db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, taskId))
      .get();

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Queue the job for immediate execution
    return new Promise((resolve, reject) => {
      this.jobQueue.push(
        {
          taskId: task.id,
          triggeredAt: Date.now(),
          isManualTrigger: true,
        },
        (error: Error | null, result?: unknown) => {
          if (error) {
            reject(error);
          } else {
            resolve(result as TaskExecutionResult);
          }
        }
      );
    });
  }

  /**
   * Get a scheduled task by ID
   */
  getTask(taskId: string): ScheduledTask | null {
    return this.db.db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, taskId))
      .get() || null;
  }

  /**
   * List all scheduled tasks
   */
  listTasks(options?: { enabled?: boolean }): ScheduledTask[] {
    if (options?.enabled !== undefined) {
      return this.db.db
        .select()
        .from(scheduledTasks)
        .where(eq(scheduledTasks.enabled, options.enabled))
        .all();
    }

    return this.db.db.select().from(scheduledTasks).all();
  }

  /**
   * Get execution history for a task (sessions created by this task)
   */
  getTaskHistory(taskId: string, limit = 20): Array<{
    id: string;
    status: SessionStatus;
    createdAt: Date;
    updatedAt: Date;
  }> {
    return this.db.db
      .select({
        id: sessions.id,
        status: sessions.status,
        createdAt: sessions.createdAt,
        updatedAt: sessions.updatedAt,
      })
      .from(sessions)
      .where(eq(sessions.scheduledTaskId, taskId))
      .limit(limit)
      .all();
  }

  // --- Private methods ---

  /**
   * Schedule a task based on its type (registers with cron/setTimeout)
   * When triggered, the task is pushed to the job queue
   */
  private scheduleTask(task: ScheduledTask): void {
    if (!task.enabled) {
      return;
    }

    if (task.scheduleType === 'cron' && task.cronExpression) {
      this.scheduleCronTask(task);
    } else if (task.scheduleType === 'once' && task.nextRunAt) {
      this.scheduleOneTimeTask(task);
    }
  }

  /**
   * Schedule a cron-based recurring task
   */
  private scheduleCronTask(task: ScheduledTask): void {
    if (!task.cronExpression) {
      this.logger.error({ taskId: task.id }, 'Cron task missing expression');
      return;
    }

    // Validate cron expression
    if (!cron.validate(task.cronExpression)) {
      this.logger.error({ taskId: task.id, expression: task.cronExpression }, 'Invalid cron expression');
      return;
    }

    const job = cron.schedule(
      task.cronExpression,
      () => {
        // Push to queue instead of executing directly
        this.logger.info({ taskId: task.id }, 'Cron triggered, queuing job');
        this.queueJob(task.id);

        // Update next run time
        const nextRun = this.getNextCronRun(task.cronExpression!, task.timezone);
        this.db.db
          .update(scheduledTasks)
          .set({ nextRunAt: nextRun, updatedAt: new Date() })
          .where(eq(scheduledTasks.id, task.id))
          .run();
      },
      {
        timezone: task.timezone,
        scheduled: true,
      }
    );

    this.cronJobs.set(task.id, job);
    this.logger.info({ taskId: task.id, expression: task.cronExpression, timezone: task.timezone }, 'Scheduled cron task');
  }

  /**
   * Schedule a one-time task
   */
  private scheduleOneTimeTask(task: ScheduledTask): void {
    if (!task.nextRunAt) {
      this.logger.error({ taskId: task.id }, 'One-time task missing run time');
      return;
    }

    const delay = task.nextRunAt.getTime() - Date.now();

    if (delay <= 0) {
      // Task is overdue, queue immediately
      this.logger.info({ taskId: task.id }, 'One-time task overdue, queuing immediately');
      this.queueJob(task.id);
      this.disableTask(task.id);
      return;
    }

    const timeout = setTimeout(() => {
      this.logger.info({ taskId: task.id }, 'One-time task triggered, queuing job');
      this.queueJob(task.id);
      this.disableTask(task.id);
    }, delay);

    this.oneTimeTimeouts.set(task.id, timeout);
    this.logger.info({ taskId: task.id, runAt: task.nextRunAt, delayMs: delay }, 'Scheduled one-time task');
  }

  /**
   * Queue a job for execution
   */
  private queueJob(taskId: string): void {
    this.jobQueue.push({
      taskId,
      triggeredAt: Date.now(),
    });
  }

  /**
   * Cancel a task's schedule
   */
  private cancelTaskSchedule(taskId: string): void {
    // Cancel cron job if exists
    const cronJob = this.cronJobs.get(taskId);
    if (cronJob) {
      cronJob.stop();
      this.cronJobs.delete(taskId);
    }

    // Cancel one-time timeout if exists
    const timeout = this.oneTimeTimeouts.get(taskId);
    if (timeout) {
      clearTimeout(timeout);
      this.oneTimeTimeouts.delete(taskId);
    }
  }

  /**
   * Internal task execution logic
   */
  private async executeTaskInternal(task: ScheduledTask): Promise<TaskExecutionResult> {
    this.logger.info({ taskId: task.id, name: task.name }, 'Executing scheduled task');

    // Get the connector
    const connector = this.registry.get(task.connectorType);
    if (!connector) {
      throw new Error(`Unknown connector: ${task.connectorType}`);
    }

    // Check availability
    const availability = await connector.checkAvailability();
    if (availability.status !== 'available') {
      throw new Error(`Connector ${task.connectorType} is not available: ${availability.message}`);
    }

    // Create session
    const sessionId = nanoid();
    const processId = nanoid();
    const now = new Date();

    // Insert session record (linked to scheduled task)
    this.db.db.insert(sessions).values({
      id: sessionId,
      connectorType: task.connectorType,
      workDir: task.workDir,
      sessionName: `[Scheduled] ${task.name}`,
      status: 'in_progress' as SessionStatus,
      approvalMode: task.approvalMode as ApprovalMode,
      agentMode: task.agentMode as AgentMode,
      agentSessionId: task.inheritContext ? task.lastAgentSessionId : null,
      scheduledTaskId: task.id,
      personalityId: task.personalityId || null,
      projectId: task.projectId || null,
      createdAt: now,
      updatedAt: now,
    }).run();

    // Parse environment variables
    const env = task.env ? JSON.parse(task.env) : undefined;

    try {
      // Spawn the session
      const approvalMode = task.approvalMode as ApprovalMode;
      const agentMode = task.agentMode as AgentMode;

      // Resolve personality and project context for prompt injection
      let personality = undefined;
      let project = undefined;
      let projectAgents: ProjectAgent[] = [];

      if (task.personalityId) {
        personality = this.db.db
          .select()
          .from(personalities)
          .where(eq(personalities.id, task.personalityId))
          .get() || undefined;
      }

      if (task.projectId) {
        project = this.db.db
          .select()
          .from(projects)
          .where(eq(projects.id, task.projectId))
          .get() || undefined;

        if (project) {
          const agentSessions = this.db.db
            .select({
              personalityId: sessions.personalityId,
              count: sql<number>`count(*)`,
            })
            .from(sessions)
            .where(eq(sessions.projectId, task.projectId))
            .groupBy(sessions.personalityId)
            .all();

          for (const agentSession of agentSessions) {
            if (agentSession.personalityId) {
              const p = this.db.db
                .select()
                .from(personalities)
                .where(eq(personalities.id, agentSession.personalityId))
                .get();
              if (p) {
                projectAgents.push({
                  name: p.name,
                  readableId: p.readableId,
                  sessionCount: agentSession.count,
                });
              }
            }
          }
        }
      }

      // Apply full prompt context (personality + project + agent mode)
      const effectivePrompt = applyFullPromptContext(task.prompt, {
        agentMode,
        personality,
        project,
        projectAgents,
      });

      // Inject global skills before spawning
      const config = loadConfig();
      const skillsDir = config.skills?.globalDirectory;
      if (skillsDir) {
        const skillsService = new SkillsService(skillsDir);
        const validation = await skillsService.validate();
        if (validation.valid) {
          await skillsService.injectSkills(task.connectorType as 'claude' | 'vibe');
          this.logger.info({ skillsDir, connector: task.connectorType, taskId: task.id }, 'Injected global skills for scheduled task');
        } else {
          this.logger.warn({ skillsDir, error: validation.error, taskId: task.id }, 'Skills directory invalid, skipping injection');
        }
      }

      const spawnOptions = {
        workDir: task.workDir,
        prompt: effectivePrompt,
        env,
        enableApprovals: true, // Enable interactive approval flow
        approvalMode,
        agentMode,
        // Use previous session ID for context inheritance
        ...(task.inheritContext && task.lastAgentSessionId
          ? { agentSessionId: task.lastAgentSessionId }
          : {}),
      };

      const spawned = await connector.spawn(spawnOptions);

      // Set approval mode on the approval service (auto-approve or manual)
      if (spawned.approvalService) {
        spawned.approvalService.setMode(approvalMode);
        this.logger.info({ taskId: task.id, sessionId, approvalMode }, 'Set approval mode for scheduled task');
      }

      // Track the active session
      this.activeSessions.set(sessionId, spawned);

      // Create execution process record
      this.db.db.insert(executionProcesses).values({
        id: processId,
        sessionId,
        status: 'running',
        prompt: task.prompt,
        createdAt: now,
      }).run();

      // Update task execution state
      this.db.db
        .update(scheduledTasks)
        .set({
          lastSessionId: sessionId,
          lastAgentSessionId: spawned.agentSessionId || task.lastAgentSessionId,
          lastRunAt: now,
          executionCount: task.executionCount + 1,
          updatedAt: now,
        })
        .where(eq(scheduledTasks.id, task.id))
        .run();

      // Listen for agent session ID updates
      spawned.events.on('sessionId', (agentSessionId) => {
        this.logger.info({ taskId: task.id, sessionId, agentSessionId }, 'Captured agent session ID');

        // Update session
        this.db.db
          .update(sessions)
          .set({ agentSessionId, updatedAt: new Date() })
          .where(eq(sessions.id, sessionId))
          .run();

        // Update task for context inheritance
        this.db.db
          .update(scheduledTasks)
          .set({ lastAgentSessionId: agentSessionId, updatedAt: new Date() })
          .where(eq(scheduledTasks.id, task.id))
          .run();
      });

      // Listen for ACP events including 'done' for session completion
      spawned.events.on('event', (event) => {
        // Persist ACP event to database
        try {
          this.db.db.insert(processLogs).values({
            id: nanoid(),
            processId,
            logType: 'event',
            content: JSON.stringify(event),
            timestamp: new Date(),
          }).run();
        } catch {
          // Ignore persistence errors
        }

        // Handle task completion (done event)
        if (event.type === 'done') {
          const completedAt = new Date();
          this.logger.info({ taskId: task.id, sessionId, processId }, 'Scheduled task session completed (done event)');

          // Update process status to completed
          this.db.db
            .update(executionProcesses)
            .set({
              status: 'completed',
              exitCode: 0,
              completedAt,
            })
            .where(eq(executionProcesses.id, processId))
            .run();

          // Update session status to completed
          this.db.db
            .update(sessions)
            .set({ status: 'completed' as SessionStatus, updatedAt: completedAt })
            .where(eq(sessions.id, sessionId))
            .run();

          // Remove from active sessions
          this.activeSessions.delete(sessionId);
        }
      });

      // Subscribe to MsgStore to persist stdout/stderr logs to database
      // This is critical for scheduled tasks so logs appear in the UI
      spawned.msgStore.subscribe((msg) => {
        try {
          // Map MsgStore types to database LogType
          let logType: 'stdout' | 'stderr' | 'event';
          let content: string;

          switch (msg.type) {
            case 'stdout':
              logType = 'stdout';
              content = msg.content;
              break;
            case 'stderr':
              logType = 'stderr';
              content = msg.content;
              break;
            case 'jsonPatch':
              logType = 'event';
              content = JSON.stringify({ type: 'jsonPatch', patch: msg.patch });
              break;
            case 'sessionId':
              logType = 'event';
              content = JSON.stringify({ type: 'sessionId', sessionId: msg.sessionId });
              break;
            case 'ready':
              logType = 'event';
              content = JSON.stringify({ type: 'ready' });
              break;
            case 'finished':
              logType = 'event';
              content = JSON.stringify({ type: 'finished' });
              break;
          }

          this.db.db.insert(processLogs).values({
            id: nanoid(),
            processId,
            logType,
            content,
            timestamp: new Date(),
          }).run();
        } catch {
          // Ignore persistence errors for now
        }
      });

      // Listen for approval requests to update session status (for manual mode)
      if (spawned.approvalService) {
        spawned.approvalService.on('approvalRequest', () => {
          // Update session status to 'approval' when awaiting user approval
          this.db.db.update(sessions)
            .set({ status: 'approval' as SessionStatus, updatedAt: new Date() })
            .where(eq(sessions.id, sessionId))
            .run();
        });

        spawned.approvalService.on('approvalResponse', () => {
          // Only restore if no more pending approvals
          if (!spawned.approvalService!.hasPending()) {
            this.db.db.update(sessions)
              .set({ status: 'in_progress' as SessionStatus, updatedAt: new Date() })
              .where(eq(sessions.id, sessionId))
              .run();
          }
        });
      }

      const result: TaskExecutionResult = {
        sessionId,
        processId,
        agentSessionId: spawned.agentSessionId || undefined,
        success: true,
      };

      this.logger.info({ taskId: task.id, sessionId, processId }, 'Scheduled task execution started');

      return result;
    } catch (error) {
      // Update session status to failed
      this.db.db
        .update(sessions)
        .set({ status: 'failed' as SessionStatus, updatedAt: new Date() })
        .where(eq(sessions.id, sessionId))
        .run();

      throw error;
    }
  }

  /**
   * Calculate the next run time for a cron expression
   */
  private getNextCronRun(expression: string, timezone: string): Date {
    try {
      // cron-parser expects 6-field expressions (with seconds)
      // node-cron uses 5-field (min hour dom month dow) or 6-field
      const fields = expression.trim().split(/\s+/);
      const parserExpression = fields.length === 5 ? `0 ${expression}` : expression;

      const parsed = CronExpressionParser.parse(parserExpression, {
        tz: timezone,
        currentDate: new Date(),
      });
      return parsed.next().toDate();
    } catch (error) {
      this.logger.warn({ expression, timezone, error }, 'Failed to parse cron expression for next run calculation');
      // Fallback: 1 minute from now
      const nextRun = new Date();
      nextRun.setSeconds(0);
      nextRun.setMilliseconds(0);
      nextRun.setMinutes(nextRun.getMinutes() + 1);
      return nextRun;
    }
  }
}
