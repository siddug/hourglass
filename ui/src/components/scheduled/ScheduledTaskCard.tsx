'use client';

import { type ScheduledTask } from '../../lib/api';
import { Spinner } from '../ui';

interface ScheduledTaskCardProps {
  task: ScheduledTask;
  onClick: () => void;
  onToggleEnabled?: (enabled: boolean) => void;
  onTrigger?: () => void;
}

/**
 * Format a cron expression into a human-readable string
 */
function formatCronExpression(expression: string): string {
  // Simple common patterns
  if (expression === '* * * * *') return 'Every minute';
  if (expression === '0 * * * *') return 'Every hour';
  if (expression === '0 0 * * *') return 'Every day at midnight';
  if (expression === '0 9 * * *') return 'Every day at 9 AM';
  if (expression === '0 9 * * 1-5') return 'Weekdays at 9 AM';
  if (expression === '0 0 * * 0') return 'Every Sunday at midnight';
  if (expression === '0 0 1 * *') return 'First of every month';

  // Otherwise just show the expression
  return expression;
}

/**
 * Format a relative time string
 */
function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  // Past
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

  // Future
  if (diffMins < 1) return 'in < 1 min';
  if (diffMins < 60) return `in ${diffMins} min`;
  if (diffHours < 24) return `in ${diffHours} hr`;
  if (diffDays < 7) return `in ${diffDays} days`;
  return date.toLocaleDateString();
}

export function ScheduledTaskCard({ task, onClick, onToggleEnabled, onTrigger }: ScheduledTaskCardProps) {
  const workDir = (() => {
    if (!task.workDir) return 'N/A';
    const parts = task.workDir.split('/').filter(Boolean);
    if (parts.length <= 2) return task.workDir;
    return parts.slice(-2).join('/');
  })();

  const scheduleDisplay = task.scheduleType === 'cron' && task.cronExpression
    ? formatCronExpression(task.cronExpression)
    : task.nextRunAt
      ? `Once at ${new Date(task.nextRunAt).toLocaleString()}`
      : 'Not scheduled';

  const nextRunDisplay = task.nextRunAt
    ? formatRelativeTime(task.nextRunAt)
    : 'N/A';

  const lastRunDisplay = task.lastRunAt
    ? formatRelativeTime(task.lastRunAt)
    : 'Never';

  return (
    <div
      onClick={onClick}
      className={`
        p-3 rounded-lg border bg-hg-surface-container-low cursor-pointer hover:border-hg-primary/30 hover:shadow-lg transition-all
        ${task.enabled
          ? 'border-hg-primary/20'
          : 'border-hg-outline-variant/20 opacity-60'
        }
      `}
    >
      {/* Header with name and toggle */}
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium text-sm text-hg-on-surface line-clamp-2 flex-1">
          {task.name}
        </h3>
        {onToggleEnabled && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleEnabled(!task.enabled);
            }}
            className={`
              ml-2 px-2 py-0.5 text-xs font-medium rounded-full transition-colors cursor-pointer
              ${task.enabled
                ? 'bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25'
                : 'bg-hg-surface-container-high text-hg-on-surface-variant hover:bg-hg-outline-variant'
              }
            `}
          >
            {task.enabled ? 'ON' : 'OFF'}
          </button>
        )}
      </div>

      {/* Schedule info */}
      <div className="text-xs text-hg-on-surface-variant/70 mb-2">
        <div className="flex items-center gap-1 mb-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="truncate">{scheduleDisplay}</span>
        </div>
        <div className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <span className="truncate">{workDir}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs text-hg-on-surface-variant/70 mb-2">
        <span>Next: {nextRunDisplay}</span>
        <span>Runs: {task.executionCount}</span>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {/* Schedule type badge */}
        <span className={`
          inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full
          ${task.scheduleType === 'cron'
            ? 'bg-hg-tertiary/10 text-hg-tertiary'
            : 'bg-amber-500/10 text-amber-500'
          }
        `}>
          {task.scheduleType === 'cron' ? 'Recurring' : 'One-time'}
        </span>

        {/* Context inheritance badge */}
        {task.inheritContext && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-hg-primary/10 text-hg-primary">
            Chain
          </span>
        )}

        {/* Connector type */}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-hg-surface-container-high text-hg-on-surface-variant">
          {task.connectorType}
        </span>

        {/* Trigger button */}
        {onTrigger && task.enabled && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTrigger();
            }}
            className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-hg-primary/10 text-hg-primary hover:bg-hg-primary/20 transition-colors cursor-pointer"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Run Now
          </button>
        )}
      </div>
    </div>
  );
}
