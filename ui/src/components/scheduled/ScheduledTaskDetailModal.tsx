'use client';

import { useState, useEffect } from 'react';
import { Dialog, Button, Input, Spinner } from '@/components/ui';
import {
  getScheduledTask,
  getScheduledTaskHistory,
  updateScheduledTask,
  deleteScheduledTask,
  enableScheduledTask,
  disableScheduledTask,
  triggerScheduledTask,
  getConnectors,
  type ScheduledTask,
  type Session,
  type ScheduleType,
  type Connector,
  type AgentMode,
  type ApprovalMode,
} from '@/lib/api';

interface ScheduledTaskDetailModalProps {
  taskId: string;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

/**
 * Format a cron expression into a human-readable string
 */
function formatCronExpression(expression: string): string {
  if (expression === '* * * * *') return 'Every minute';
  if (expression === '0 * * * *') return 'Every hour';
  if (expression === '0 0 * * *') return 'Every day at midnight';
  if (expression === '0 9 * * *') return 'Every day at 9 AM';
  if (expression === '0 9 * * 1-5') return 'Weekdays at 9 AM';
  if (expression === '0 0 * * 0') return 'Every Sunday at midnight';
  if (expression === '0 0 1 * *') return 'First of every month';
  return expression;
}

/**
 * Format a date to a relative time string
 */
function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (diffMs < 0) {
    const absMins = Math.abs(diffMins);
    const absHours = Math.abs(diffHours);
    const absDays = Math.abs(diffDays);

    if (absMins < 1) return 'just now';
    if (absMins < 60) return `${absMins} min ago`;
    if (absHours < 24) return `${absHours} hr ago`;
    if (absDays < 7) return `${absDays} days ago`;
    return date.toLocaleDateString();
  }

  if (diffMins < 1) return 'in < 1 min';
  if (diffMins < 60) return `in ${diffMins} min`;
  if (diffHours < 24) return `in ${diffHours} hr`;
  if (diffDays < 7) return `in ${diffDays} days`;
  return date.toLocaleDateString();
}

// Common cron presets
const cronPresets = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at 9 AM', value: '0 9 * * *' },
  { label: 'Every day at midnight', value: '0 0 * * *' },
  { label: 'Weekdays at 9 AM', value: '0 9 * * 1-5' },
  { label: 'Every Sunday', value: '0 0 * * 0' },
  { label: 'First of month', value: '0 0 1 * *' },
];

export function ScheduledTaskDetailModal({ taskId, open, onClose, onUpdated }: ScheduledTaskDetailModalProps) {
  const [task, setTask] = useState<ScheduledTask | null>(null);
  const [history, setHistory] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [triggering, setTriggering] = useState(false);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [editScheduleType, setEditScheduleType] = useState<ScheduleType>('cron');
  const [editCronExpression, setEditCronExpression] = useState('');
  const [editRunAt, setEditRunAt] = useState('');
  const [editTimezone, setEditTimezone] = useState('UTC');
  const [editInheritContext, setEditInheritContext] = useState(false);
  const [editConnector, setEditConnector] = useState('');
  const [editAgentMode, setEditAgentMode] = useState<AgentMode>('default');
  const [editApprovalMode, setEditApprovalMode] = useState<ApprovalMode>('auto');
  const [editWorkDir, setEditWorkDir] = useState('');
  const [connectors, setConnectors] = useState<Connector[]>([]);

  useEffect(() => {
    if (open && taskId) {
      loadTaskData();
    }
  }, [open, taskId]);

  const loadTaskData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const [taskData, historyData, connectorsData] = await Promise.all([
        getScheduledTask(taskId),
        getScheduledTaskHistory(taskId, 10),
        getConnectors(),
      ]);
      setTask(taskData);
      setHistory(historyData.executions);
      setConnectors(connectorsData.connectors);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!task) return;
    try {
      if (task.enabled) {
        await disableScheduledTask(taskId);
      } else {
        await enableScheduledTask(taskId);
      }
      await loadTaskData(false);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle task');
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await triggerScheduledTask(taskId);
      await loadTaskData(false);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger task');
    } finally {
      setTriggering(false);
    }
  };

  const enterEditMode = () => {
    if (!task) return;
    setEditName(task.name);
    setEditPrompt(task.prompt);
    setEditScheduleType(task.scheduleType);
    setEditCronExpression(task.cronExpression || '0 9 * * *');
    setEditRunAt(task.nextRunAt ? new Date(task.nextRunAt).toISOString().slice(0, 16) : '');
    setEditTimezone(task.timezone);
    setEditInheritContext(task.inheritContext);
    setEditConnector(task.connectorType);
    setEditAgentMode(task.agentMode);
    setEditApprovalMode(task.approvalMode);
    setEditWorkDir(task.workDir);
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!task) return;

    if (!editName.trim()) {
      setError('Task name is required');
      return;
    }

    if (!editPrompt.trim()) {
      setError('Prompt is required');
      return;
    }

    if (editScheduleType === 'cron' && !editCronExpression) {
      setError('Cron expression is required');
      return;
    }

    if (editScheduleType === 'once' && !editRunAt) {
      setError('Run date/time is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateScheduledTask(taskId, {
        name: editName.trim(),
        prompt: editPrompt.trim(),
        scheduleType: editScheduleType,
        cronExpression: editScheduleType === 'cron' ? editCronExpression : undefined,
        runAt: editScheduleType === 'once' ? new Date(editRunAt).toISOString() : undefined,
        timezone: editTimezone,
        inheritContext: editInheritContext,
        connector: editConnector,
        agentMode: editAgentMode,
        approvalMode: editApprovalMode,
        workDir: editWorkDir,
      });
      setEditMode(false);
      await loadTaskData(false);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteScheduledTask(taskId);
      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task');
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onClose={onClose} title="Scheduled Task" className="max-w-2xl w-full">
        <div className="flex items-center justify-center p-8">
          <Spinner className="h-8 w-8" />
        </div>
      </Dialog>
    );
  }

  if (error || !task) {
    return (
      <Dialog open={open} onClose={onClose} title="Scheduled Task" className="max-w-2xl w-full">
        <div className="p-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-300">
            {error || 'Task not found'}
          </div>
        </div>
      </Dialog>
    );
  }

  const scheduleDisplay = task.scheduleType === 'cron' && task.cronExpression
    ? formatCronExpression(task.cronExpression)
    : task.nextRunAt
      ? `Once at ${new Date(task.nextRunAt).toLocaleString()}`
      : 'Not scheduled';

  // Edit Mode UI
  if (editMode) {
    return (
      <Dialog open={open} onClose={cancelEdit} title="Edit Scheduled Task" className="max-w-2xl w-full" fullHeight>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Task Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Task Name
            </label>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Task name"
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Prompt
            </label>
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="What should the agent do?"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px]"
            />
          </div>

          {/* Work Directory */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Work Directory
            </label>
            <Input
              value={editWorkDir}
              onChange={(e) => setEditWorkDir(e.target.value)}
              placeholder="~/Documents"
            />
          </div>

          {/* Connector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Connector
            </label>
            <select
              value={editConnector}
              onChange={(e) => setEditConnector(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {connectors
                .filter((c) => c.status === 'available')
                .map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.displayName}
                  </option>
                ))}
            </select>
          </div>

          {/* Agent Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Agent Mode
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditAgentMode('default')}
                className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors cursor-pointer ${
                  editAgentMode === 'default'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="font-medium">Default</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Full capabilities</div>
              </button>
              <button
                type="button"
                onClick={() => setEditAgentMode('plan')}
                className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors cursor-pointer ${
                  editAgentMode === 'plan'
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="font-medium">Plan</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Read-only mode</div>
              </button>
            </div>
          </div>

          {/* Approval Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Approval Mode
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditApprovalMode('auto')}
                className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors cursor-pointer ${
                  editApprovalMode === 'auto'
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="font-medium">Auto</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Auto-approve actions</div>
              </button>
              <button
                type="button"
                onClick={() => setEditApprovalMode('manual')}
                className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors cursor-pointer ${
                  editApprovalMode === 'manual'
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="font-medium">Manual</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Require approval</div>
              </button>
            </div>
          </div>

          {/* Schedule Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Schedule Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="editScheduleType"
                  value="cron"
                  checked={editScheduleType === 'cron'}
                  onChange={() => setEditScheduleType('cron')}
                  className="text-blue-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Recurring (cron)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="editScheduleType"
                  value="once"
                  checked={editScheduleType === 'once'}
                  onChange={() => setEditScheduleType('once')}
                  className="text-blue-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">One-time</span>
              </label>
            </div>
          </div>

          {/* Cron Expression or DateTime */}
          {editScheduleType === 'cron' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Cron Expression
              </label>
              <Input
                value={editCronExpression}
                onChange={(e) => setEditCronExpression(e.target.value)}
                placeholder="0 9 * * *"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {cronPresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setEditCronExpression(preset.value)}
                    className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                      editCronExpression === preset.value
                        ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-300'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Format: minute hour day-of-month month day-of-week
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Run At
              </label>
              <Input
                type="datetime-local"
                value={editRunAt}
                onChange={(e) => setEditRunAt(e.target.value)}
              />
            </div>
          )}

          {/* Context Inheritance */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={editInheritContext}
                onChange={(e) => setEditInheritContext(e.target.checked)}
                className="mt-1 text-blue-600"
              />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Inherit context between runs
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Each execution will continue from the previous session's context.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Edit Mode Footer */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <Button variant="secondary" onClick={cancelEdit} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Spinner className="h-4 w-4 mr-2" /> : null}
            Save Changes
          </Button>
        </div>
      </Dialog>
    );
  }

  // View Mode UI (default)
  return (
    <Dialog open={open} onClose={onClose} title={task.name} className="max-w-2xl w-full" fullHeight>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-300 text-sm mb-4">
            {error}
          </div>
        )}

        {/* Status badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`
              px-3 py-1 rounded-full text-sm font-medium
              ${task.enabled
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
              }
            `}>
              {task.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <span className={`
              px-3 py-1 rounded-full text-sm font-medium
              ${task.scheduleType === 'cron'
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
              }
            `}>
              {task.scheduleType === 'cron' ? 'Recurring' : 'One-time'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={enterEditMode}
            >
              Edit
            </Button>
            <Button
              variant="secondary"
              onClick={handleToggleEnabled}
            >
              {task.enabled ? 'Disable' : 'Enable'}
            </Button>
            {task.enabled && (
              <Button
                variant="primary"
                onClick={handleTrigger}
                disabled={triggering}
              >
                {triggering ? <Spinner className="h-4 w-4" /> : 'Run Now'}
              </Button>
            )}
          </div>
        </div>

        {/* Schedule info */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Schedule</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Pattern:</span>
              <p className="font-medium text-gray-900 dark:text-gray-100">{scheduleDisplay}</p>
              {task.cronExpression && (
                <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-1">
                  {task.cronExpression}
                </p>
              )}
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Timezone:</span>
              <p className="font-medium text-gray-900 dark:text-gray-100">{task.timezone}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Next run:</span>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {task.nextRunAt ? formatRelativeTime(task.nextRunAt) : 'N/A'}
              </p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Last run:</span>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {task.lastRunAt ? formatRelativeTime(task.lastRunAt) : 'Never'}
              </p>
            </div>
          </div>
        </div>

        {/* Task configuration */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Configuration</h3>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Connector:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">{task.connectorType}</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Work Directory:</span>
              <p className="font-mono text-gray-900 dark:text-gray-100 text-xs mt-1 bg-gray-100 dark:bg-gray-700 rounded px-2 py-1">
                {task.workDir}
              </p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Agent Mode:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                {task.agentMode === 'plan' ? 'Plan (read-only)' : 'Default'}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Approval Mode:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                {task.approvalMode === 'auto' ? 'Auto-approve' : 'Manual'}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Context Inheritance:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                {task.inheritContext ? 'Enabled (chains sessions)' : 'Disabled (fresh each run)'}
              </span>
            </div>
          </div>
        </div>

        {/* Prompt */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Prompt</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {task.prompt}
          </p>
        </div>

        {/* Execution History */}
        <div>
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
            Execution History ({task.executionCount} total)
          </h3>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No executions yet</p>
          ) : (
            <div className="space-y-2">
              {history.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className={`
                      w-2 h-2 rounded-full
                      ${session.status === 'completed' || session.status === 'done' ? 'bg-green-500' : ''}
                      ${session.status === 'failed' ? 'bg-red-500' : ''}
                      ${session.status === 'in_progress' ? 'bg-yellow-500' : ''}
                      ${session.status === 'triage' ? 'bg-gray-500' : ''}
                    `} />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {session.sessionName || `Session ${session.id.slice(0, 8)}`}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(session.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <span className={`
                    text-xs px-2 py-1 rounded
                    ${session.status === 'completed' || session.status === 'done'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : session.status === 'failed'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                        : session.status === 'in_progress'
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    }
                  `}>
                    {session.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-between">
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-red-600 dark:text-red-400">Delete this task?</span>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Spinner className="h-4 w-4" /> : 'Yes, Delete'}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="danger"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete Task
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}
