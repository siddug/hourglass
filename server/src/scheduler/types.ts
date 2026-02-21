import type { ScheduleType, AgentMode, ApprovalMode } from '../db/schema.js';

/**
 * Configuration for creating a scheduled task
 */
export interface CreateScheduledTaskConfig {
  name: string;
  prompt: string;
  connectorType: string;
  workDir: string;
  scheduleType: ScheduleType;
  cronExpression?: string;
  runAt?: Date;
  timezone?: string;
  inheritContext?: boolean;
  agentMode?: AgentMode;
  approvalMode?: ApprovalMode;
  env?: Record<string, string>;
  personalityId?: string;
  projectId?: string;
}

/**
 * Configuration for updating a scheduled task
 */
export interface UpdateScheduledTaskConfig {
  name?: string;
  prompt?: string;
  connectorType?: string;
  workDir?: string;
  scheduleType?: ScheduleType;
  cronExpression?: string;
  runAt?: Date;
  timezone?: string;
  inheritContext?: boolean;
  agentMode?: AgentMode;
  approvalMode?: ApprovalMode;
  env?: Record<string, string>;
  enabled?: boolean;
  personalityId?: string | null;
  projectId?: string | null;
}

/**
 * Result of a task execution
 */
export interface TaskExecutionResult {
  sessionId: string;
  processId: string;
  agentSessionId?: string;
  success: boolean;
  error?: string;
}

/**
 * Event types emitted by the scheduler
 */
export interface SchedulerEvents {
  taskExecuted: (taskId: string, result: TaskExecutionResult) => void;
  taskFailed: (taskId: string, error: Error) => void;
  taskScheduled: (taskId: string) => void;
  taskCancelled: (taskId: string) => void;
}
