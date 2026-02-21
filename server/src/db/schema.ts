import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// Session status enum
export type SessionStatus = 'triage' | 'in_progress' | 'completed' | 'failed' | 'approval' | 'done' | 'archived';

// Approval mode enum
export type ApprovalMode = 'manual' | 'auto';

// Agent mode enum - controls agent behavior (plan mode vs default)
export type AgentMode = 'default' | 'plan';

// Schedule type enum - for scheduled tasks
export type ScheduleType = 'once' | 'cron';

// Execution process status enum
export type ExecutionProcessStatus = 'running' | 'completed' | 'failed' | 'killed';

// Log type enum
export type LogType = 'stdout' | 'stderr' | 'event';

// Project status enum
export type ProjectStatus = 'active' | 'archived';

/**
 * Personalities table - agent identity/persona definitions
 */
export const personalities = sqliteTable(
  'personalities',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    // Unique readable identifier like "@mark" — lowercase, no spaces
    readableId: text('readable_id').notNull().unique(),
    // Soul instructions injected into the agent prompt
    instructions: text('instructions').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    personalitiesReadableIdIdx: index('personalities_readable_id_idx').on(table.readableId),
  })
);

/**
 * Projects table - groups related sessions into a shared workspace
 */
export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    // Unique URL-safe slug like "q1-marketing"
    projectSlug: text('project_slug').notNull().unique(),
    // Absolute path to the workspace folder on disk
    workspacePath: text('workspace_path').notNull(),
    status: text('status').$type<ProjectStatus>().notNull().default('active'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    projectsSlugIdx: index('projects_slug_idx').on(table.projectSlug),
    projectsStatusIdx: index('projects_status_idx').on(table.status),
  })
);

/**
 * Sessions table - represents a coding session with an AI agent
 */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    connectorType: text('connector_type').notNull(),
    workDir: text('work_dir').notNull(),
    sessionName: text('session_name'),
    status: text('status').$type<SessionStatus>().notNull().default('in_progress'),
    // Approval mode: 'manual' requires user approval, 'auto' auto-approves all tool calls
    approvalMode: text('approval_mode').$type<ApprovalMode>().notNull().default('manual'),
    // Agent mode: 'default' for normal operation, 'plan' for read-only planning mode
    agentMode: text('agent_mode').$type<AgentMode>().notNull().default('default'),
    // Agent's own session ID (e.g., Claude's UUID) used for --resume
    agentSessionId: text('agent_session_id'),
    // Reference to scheduled task that created this session (null if manually created)
    scheduledTaskId: text('scheduled_task_id'),
    // Reference to personality assigned to this session (null if no personality)
    personalityId: text('personality_id'),
    // Reference to project this session belongs to (null if standalone)
    projectId: text('project_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    sessionsStatusIdx: index('sessions_status_idx').on(table.status),
    sessionsScheduledTaskIdx: index('sessions_scheduled_task_idx').on(table.scheduledTaskId),
    sessionsPersonalityIdx: index('sessions_personality_idx').on(table.personalityId),
    sessionsProjectIdx: index('sessions_project_idx').on(table.projectId),
  })
);

/**
 * Execution processes table - represents individual agent execution runs
 */
export const executionProcesses = sqliteTable(
  'execution_processes',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .references(() => sessions.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status').$type<ExecutionProcessStatus>().notNull().default('running'),
    prompt: text('prompt').notNull(),
    exitCode: integer('exit_code'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
  },
  (table) => ({
    execProcSessionIdx: index('exec_proc_session_idx').on(table.sessionId),
    execProcStatusIdx: index('exec_proc_status_idx').on(table.status),
  })
);

/**
 * Process logs table - stores stdout, stderr, and ACP events
 */
export const processLogs = sqliteTable(
  'process_logs',
  {
    id: text('id').primaryKey(),
    processId: text('process_id')
      .references(() => executionProcesses.id, { onDelete: 'cascade' })
      .notNull(),
    logType: text('log_type').$type<LogType>().notNull(),
    content: text('content').notNull(),
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    procLogsProcessIdx: index('proc_logs_process_idx').on(table.processId),
    procLogsTimestampIdx: index('proc_logs_timestamp_idx').on(table.timestamp),
  })
);

/**
 * Scheduled tasks table - defines tasks that run on a schedule
 */
export const scheduledTasks = sqliteTable(
  'scheduled_tasks',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    prompt: text('prompt').notNull(),
    connectorType: text('connector_type').notNull(),
    workDir: text('work_dir').notNull(),

    // Scheduling configuration
    scheduleType: text('schedule_type').$type<ScheduleType>().notNull(),
    cronExpression: text('cron_expression'), // For cron type: '0 9 * * *'
    nextRunAt: integer('next_run_at', { mode: 'timestamp' }),
    timezone: text('timezone').notNull().default('UTC'),

    // Context inheritance - whether to chain sessions
    inheritContext: integer('inherit_context', { mode: 'boolean' }).notNull().default(false),
    lastSessionId: text('last_session_id'),
    lastAgentSessionId: text('last_agent_session_id'),

    // Session configuration
    agentMode: text('agent_mode').$type<AgentMode>().notNull().default('default'),
    approvalMode: text('approval_mode').$type<ApprovalMode>().notNull().default('manual'),
    env: text('env'), // JSON stringified environment variables

    // Personality and project associations
    personalityId: text('personality_id'),
    projectId: text('project_id'),

    // State tracking
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    executionCount: integer('execution_count').notNull().default(0),
    lastRunAt: integer('last_run_at', { mode: 'timestamp' }),

    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    scheduledTasksEnabledIdx: index('scheduled_tasks_enabled_idx').on(table.enabled),
    scheduledTasksNextRunIdx: index('scheduled_tasks_next_run_idx').on(table.nextRunAt),
    scheduledTasksProjectIdx: index('scheduled_tasks_project_idx').on(table.projectId),
  })
);

/**
 * API Keys table - stores API keys for external services
 */
export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    apiKey: text('api_key').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    apiKeysProviderIdx: index('api_keys_provider_idx').on(table.provider),
  })
);

// Type exports for use in application code
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type ExecutionProcess = typeof executionProcesses.$inferSelect;
export type NewExecutionProcess = typeof executionProcesses.$inferInsert;
export type ProcessLog = typeof processLogs.$inferSelect;
export type NewProcessLog = typeof processLogs.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type ScheduledTask = typeof scheduledTasks.$inferSelect;
export type NewScheduledTask = typeof scheduledTasks.$inferInsert;
export type Personality = typeof personalities.$inferSelect;
export type NewPersonality = typeof personalities.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
