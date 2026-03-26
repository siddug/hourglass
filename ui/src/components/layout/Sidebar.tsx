'use client';

import { useState } from 'react';
import { useScheduledTasks } from '@/hooks/useScheduledTasks';
import { ScheduledTaskDetailModal } from '@/components/scheduled/ScheduledTaskDetailModal';
import { ScheduledTaskCreateModal } from '@/components/scheduled/ScheduledTaskCreateModal';
import { Spinner } from '@/components/ui';
import { useServer } from '@/contexts/ServerContext';

function formatNextRun(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMs < 0) return 'overdue';
  if (diffMins < 1) return '< 1m';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.round(diffMs / 3600000);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.round(diffMs / 86400000)}d`;
}

function formatCronShort(expression: string): string {
  if (expression === '* * * * *') return 'Every 1m';
  if (expression === '0 * * * *') return 'Every 1h';
  if (expression === '0 0 * * *') return 'Daily 00:00';
  if (expression === '0 9 * * *') return 'Daily 09:00';
  if (expression === '0 9 * * 1-5') return 'Weekdays 09:00';
  if (expression === '0 0 * * 0') return 'Weekly';
  if (expression === '0 0 1 * *') return 'Monthly';
  const match = expression.match(/^\*\/(\d+) \* \* \* \*$/);
  if (match) return `Every ${match[1]}m`;
  return expression;
}

const BORDER_COLORS = [
  'border-hg-primary-container',
  'border-hg-tertiary',
  'border-hg-outline-variant',
  'border-hg-secondary',
];

export function Sidebar() {
  const {
    tasks: scheduledTasks,
    loading: scheduledTasksLoading,
    refresh: refreshScheduledTasks,
  } = useScheduledTasks();
  const { activeServer } = useServer();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const enabledTasks = scheduledTasks.filter(t => t.enabled);
  const nextTask = enabledTasks
    .filter(t => t.nextRunAt)
    .sort((a, b) => new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime())[0];

  return (
    <>
      <aside className="fixed left-0 top-14 w-64 h-[calc(100vh-3.5rem)] bg-hg-sidebar-bg border-r border-hg-outline-variant/20 flex flex-col text-sm z-40">
        {/* Scheduled Tasks Section */}
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-bold text-hg-on-surface text-xs uppercase tracking-widest">
                Scheduled Tasks
              </h3>
              {nextTask && (
                <p className="text-[10px] text-hg-primary/70 font-mono">
                  Next: {nextTask.name} ({formatNextRun(nextTask.nextRunAt)})
                </p>
              )}
            </div>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="bg-hg-surface-container p-1 rounded hover:bg-hg-surface-container-high transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4 text-hg-on-surface-variant" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {/* Compact Task Cards */}
          <div className="space-y-2">
            {scheduledTasksLoading && scheduledTasks.length === 0 ? (
              <div className="flex justify-center py-4">
                <Spinner className="w-4 h-4" />
              </div>
            ) : scheduledTasks.length === 0 ? (
              <p className="text-xs text-hg-on-surface-variant/60 text-center py-4">
                No scheduled tasks
              </p>
            ) : (
              scheduledTasks.slice(0, 5).map((task, idx) => (
                <button
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  className={`w-full text-left p-3 bg-hg-surface-container-low rounded border-l-2 ${
                    BORDER_COLORS[idx % BORDER_COLORS.length]
                  } group hover:bg-hg-surface-container transition-all cursor-pointer ${
                    !task.enabled ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-semibold text-hg-on-surface truncate">
                      {task.name}
                    </span>
                    {task.enabled && (
                      <svg className="w-3 h-3 text-hg-primary flex-shrink-0 ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13.01 3h1l-1 7h3.51c.4 0 .62.19.4.66C12.97 17.55 11 21 11 21z" />
                      </svg>
                    )}
                  </div>
                  <div className="text-[10px] text-hg-on-surface-variant/60 font-mono">
                    {task.scheduleType === 'cron' && task.cronExpression
                      ? formatCronShort(task.cronExpression)
                      : 'One-time'
                    }
                    {task.connectorType && ` · ${task.connectorType}`}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom: System Health */}
        <div className="p-4 border-t border-hg-outline-variant/20">
          <div className="flex items-center gap-2 text-xs text-hg-on-surface-variant">
            <span className={`w-2 h-2 rounded-full ${activeServer ? 'bg-emerald-400' : 'bg-hg-outline-variant'}`} />
            <span>System Health</span>
          </div>
        </div>
      </aside>

      {/* Modals */}
      {selectedTaskId && (
        <ScheduledTaskDetailModal
          taskId={selectedTaskId}
          open={!!selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onUpdated={refreshScheduledTasks}
        />
      )}
      <ScheduledTaskCreateModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={refreshScheduledTasks}
      />
    </>
  );
}
