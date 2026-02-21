import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, desc, sql } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { scheduledTasks, sessions, apiKeys, type ScheduleType } from '../../db/schema.js';
import type { SchedulerService } from '../../scheduler/index.js';
import { generateSessionNameWithFallback } from '../../utils/session-name-generator.js';

/**
 * Expand ~ to home directory
 */
function expandTilde(path: string): string {
  if (path.startsWith('~/')) {
    return path.replace('~', homedir());
  }
  if (path === '~') {
    return homedir();
  }
  return path;
}

/**
 * Request body schemas
 */
const createScheduledTaskSchema = z.object({
  name: z.string().min(1).optional(), // Optional - will be auto-generated from prompt if not provided
  prompt: z.string().min(1),
  connector: z.string().min(1),
  workDir: z.string().min(1),
  scheduleType: z.enum(['once', 'cron']),
  cronExpression: z.string().optional(),
  runAt: z.string().datetime().optional(),
  timezone: z.string().optional().default('UTC'),
  inheritContext: z.boolean().optional().default(false),
  agentMode: z.enum(['default', 'plan']).optional().default('default'),
  approvalMode: z.enum(['manual', 'auto']).optional().default('auto'), // Default to auto for scheduled tasks
  env: z.record(z.string()).optional(),
  personalityId: z.string().optional(),
  projectId: z.string().optional(),
}).refine(
  (data) => {
    if (data.scheduleType === 'cron') {
      return !!data.cronExpression;
    }
    if (data.scheduleType === 'once') {
      return !!data.runAt;
    }
    return true;
  },
  {
    message: "cronExpression required for 'cron' type, runAt required for 'once' type",
  }
);

const updateScheduledTaskSchema = z.object({
  name: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  connector: z.string().min(1).optional(),
  workDir: z.string().min(1).optional(),
  scheduleType: z.enum(['once', 'cron']).optional(),
  cronExpression: z.string().optional(),
  runAt: z.string().datetime().optional(),
  timezone: z.string().optional(),
  inheritContext: z.boolean().optional(),
  agentMode: z.enum(['default', 'plan']).optional(),
  approvalMode: z.enum(['manual', 'auto']).optional(),
  env: z.record(z.string()).optional(),
  enabled: z.boolean().optional(),
  personalityId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
});

/**
 * Scheduled tasks routes
 */
export const scheduledTasksRoutes = (scheduler: SchedulerService): FastifyPluginAsync => async (server) => {
  const { db, registry } = server.state;

  /**
   * Try to auto-generate a task name from the prompt using available API keys
   * Tries Anthropic first, then falls back to Mistral
   * Checks database first, then falls back to environment variables
   * Returns null if no API keys are available or generation fails
   */
  async function tryGenerateTaskName(prompt: string): Promise<string | null> {
    try {
      // Fetch available API keys from database
      const anthropicKey = db.db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.provider, 'anthropic'))
        .get();

      const mistralKey = db.db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.provider, 'mistral'))
        .get();

      // Fall back to environment variables if database keys not found
      const anthropicApiKey = anthropicKey?.apiKey || process.env.ANTHROPIC_API_KEY;
      const mistralApiKey = mistralKey?.apiKey || process.env.MISTRAL_API_KEY;

      // Try to generate task name with retries
      const maxRetries = 3;
      const generatedName = await generateSessionNameWithFallback(prompt, {
        anthropic: anthropicApiKey,
        mistral: mistralApiKey,
      }, maxRetries);

      if (generatedName) {
        server.log.info({ maxRetries }, 'Successfully generated task name after retries');
      } else {
        server.log.warn({ maxRetries }, 'Failed to generate task name after all retries');
      }

      return generatedName;
    } catch (error) {
      server.log.error({ error }, 'Failed to auto-generate task name');
      return null;
    }
  }

  /**
   * GET /api/scheduled-tasks
   * List all scheduled tasks
   * Query params:
   *   - enabled: Filter by enabled status (true/false)
   *   - limit: Number of tasks to return (default: 50, max: 100)
   *   - offset: Number of tasks to skip (default: 0)
   */
  server.get('/scheduled-tasks', async (request, reply) => {
    const query = request.query as {
      enabled?: string;
      limit?: string;
      offset?: string;
    };

    // Parse pagination params
    const limit = Math.min(parseInt(query.limit || '50', 10), 100);
    const offset = parseInt(query.offset || '0', 10);

    // Build base query
    let baseQuery = db.db.select().from(scheduledTasks);
    let countQuery = db.db.select({ count: sql<number>`count(*)` }).from(scheduledTasks);

    // Filter by enabled status if provided
    if (query.enabled !== undefined) {
      const enabled = query.enabled === 'true';
      baseQuery = baseQuery.where(eq(scheduledTasks.enabled, enabled));
      countQuery = countQuery.where(eq(scheduledTasks.enabled, enabled));
    }

    // Get total count
    const countResult = countQuery.get();
    const total = countResult?.count ?? 0;

    // Apply sorting (newest first) and pagination
    const results = baseQuery
      .orderBy(desc(scheduledTasks.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    return reply.send({
      tasks: results,
      total,
      limit,
      offset,
      hasMore: offset + results.length < total,
    });
  });

  /**
   * GET /api/scheduled-tasks/:id
   * Get scheduled task details
   */
  server.get<{ Params: { id: string } }>('/scheduled-tasks/:id', async (request, reply) => {
    const { id } = request.params;

    const task = scheduler.getTask(id);
    if (!task) {
      return reply.status(404).send({
        error: 'Scheduled task not found',
      });
    }

    return reply.send(task);
  });

  /**
   * GET /api/scheduled-tasks/:id/history
   * Get execution history for a scheduled task
   */
  server.get<{ Params: { id: string } }>('/scheduled-tasks/:id/history', async (request, reply) => {
    const { id } = request.params;
    const query = request.query as { limit?: string };

    const task = scheduler.getTask(id);
    if (!task) {
      return reply.status(404).send({
        error: 'Scheduled task not found',
      });
    }

    const limit = Math.min(parseInt(query.limit || '20', 10), 100);

    // Get sessions created by this task
    const history = db.db
      .select()
      .from(sessions)
      .where(eq(sessions.scheduledTaskId, id))
      .orderBy(desc(sessions.createdAt))
      .limit(limit)
      .all();

    return reply.send({
      taskId: id,
      executions: history,
      total: history.length,
    });
  });

  /**
   * POST /api/scheduled-tasks
   * Create a new scheduled task
   */
  server.post('/scheduled-tasks', async (request, reply) => {
    const body = createScheduledTaskSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    const { connector, workDir: rawWorkDir, name, personalityId, projectId, ...rest } = body.data;
    const workDir = expandTilde(rawWorkDir);

    // Validate connector exists
    const connectorInstance = registry.get(connector);
    if (!connectorInstance) {
      return reply.status(400).send({
        error: `Unknown connector: ${connector}`,
        available: registry.names(),
      });
    }

    // Validate working directory exists
    if (!existsSync(workDir)) {
      return reply.status(400).send({
        error: `Working directory does not exist: ${workDir}`,
      });
    }

    // Auto-generate task name if not provided
    let finalName = name || null;
    if (!name) {
      const generatedName = await tryGenerateTaskName(rest.prompt);
      if (generatedName) {
        finalName = generatedName;
        server.log.info({ generatedName }, 'Auto-generated task name');
      } else {
        // Fallback to truncated prompt if generation fails
        finalName = rest.prompt.slice(0, 50) + (rest.prompt.length > 50 ? '...' : '');
        server.log.info({ finalName }, 'Using truncated prompt as task name');
      }
    }

    try {
      const task = await scheduler.createTask({
        ...rest,
        name: finalName!,
        connectorType: connector,
        workDir,
        runAt: rest.runAt ? new Date(rest.runAt) : undefined,
        personalityId,
        projectId,
      });

      return reply.status(201).send(task);
    } catch (error) {
      server.log.error({ error }, 'Failed to create scheduled task');
      return reply.status(500).send({
        error: 'Failed to create scheduled task',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * PATCH /api/scheduled-tasks/:id
   * Update a scheduled task
   */
  server.patch<{ Params: { id: string } }>('/scheduled-tasks/:id', async (request, reply) => {
    const { id } = request.params;

    const body = updateScheduledTaskSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    const task = scheduler.getTask(id);
    if (!task) {
      return reply.status(404).send({
        error: 'Scheduled task not found',
      });
    }

    const { connector, workDir: rawWorkDir, runAt, ...rest } = body.data;

    // Validate connector if being updated
    if (connector) {
      const connectorInstance = registry.get(connector);
      if (!connectorInstance) {
        return reply.status(400).send({
          error: `Unknown connector: ${connector}`,
          available: registry.names(),
        });
      }
    }

    // Validate working directory if being updated
    if (rawWorkDir) {
      const workDir = expandTilde(rawWorkDir);
      if (!existsSync(workDir)) {
        return reply.status(400).send({
          error: `Working directory does not exist: ${workDir}`,
        });
      }
    }

    try {
      const updatedTask = await scheduler.updateTask(id, {
        ...rest,
        connectorType: connector,
        workDir: rawWorkDir ? expandTilde(rawWorkDir) : undefined,
        runAt: runAt ? new Date(runAt) : undefined,
      });

      if (!updatedTask) {
        return reply.status(404).send({
          error: 'Scheduled task not found',
        });
      }

      return reply.send(updatedTask);
    } catch (error) {
      server.log.error({ error }, 'Failed to update scheduled task');
      return reply.status(500).send({
        error: 'Failed to update scheduled task',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /api/scheduled-tasks/:id
   * Delete a scheduled task
   */
  server.delete<{ Params: { id: string } }>('/scheduled-tasks/:id', async (request, reply) => {
    const { id } = request.params;

    const deleted = await scheduler.deleteTask(id);
    if (!deleted) {
      return reply.status(404).send({
        error: 'Scheduled task not found',
      });
    }

    return reply.status(204).send();
  });

  /**
   * POST /api/scheduled-tasks/:id/enable
   * Enable a scheduled task
   */
  server.post<{ Params: { id: string } }>('/scheduled-tasks/:id/enable', async (request, reply) => {
    const { id } = request.params;

    const enabled = await scheduler.enableTask(id);
    if (!enabled) {
      return reply.status(404).send({
        error: 'Scheduled task not found',
      });
    }

    const task = scheduler.getTask(id);
    return reply.send(task);
  });

  /**
   * POST /api/scheduled-tasks/:id/disable
   * Disable a scheduled task
   */
  server.post<{ Params: { id: string } }>('/scheduled-tasks/:id/disable', async (request, reply) => {
    const { id } = request.params;

    const disabled = await scheduler.disableTask(id);
    if (!disabled) {
      return reply.status(404).send({
        error: 'Scheduled task not found',
      });
    }

    const task = scheduler.getTask(id);
    return reply.send(task);
  });

  /**
   * POST /api/scheduled-tasks/:id/trigger
   * Manually trigger a scheduled task to run now
   */
  server.post<{ Params: { id: string } }>('/scheduled-tasks/:id/trigger', async (request, reply) => {
    const { id } = request.params;

    const task = scheduler.getTask(id);
    if (!task) {
      return reply.status(404).send({
        error: 'Scheduled task not found',
      });
    }

    try {
      const result = await scheduler.triggerTask(id);
      return reply.send({
        message: 'Task triggered successfully',
        result,
      });
    } catch (error) {
      server.log.error({ error }, 'Failed to trigger scheduled task');
      return reply.status(500).send({
        error: 'Failed to trigger scheduled task',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
};
