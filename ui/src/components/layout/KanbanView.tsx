'use client';

import { useState, useEffect, useRef } from 'react';
import {
  updateSessionStatus,
  getPersonalities,
  getProjects,
  getSessionWorkDirs,
  type Session,
  type SessionStatus,
  type ScheduledTask,
  type Personality,
  type Project,
} from '@/lib/api';
import { usePaginatedSessions } from '@/hooks/usePaginatedSessions';
import { useScheduledTasks } from '@/hooks/useScheduledTasks';
import { Spinner } from '@/components/ui';
import { SessionCreateModal } from '@/components/session/SessionCreateModal';
import { SessionDetailModal } from '@/components/session/SessionDetailModal';
import { ScheduledTaskCard } from '@/components/scheduled/ScheduledTaskCard';
import { ScheduledTaskDetailModal } from '@/components/scheduled/ScheduledTaskDetailModal';

const COLUMNS: { status: SessionStatus; title: string; color: string; bgColor: string }[] = [
  { status: 'triage', title: 'Todo', color: 'bg-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-800/50' },
  { status: 'in_progress', title: 'Agent WIP', color: 'bg-yellow-400', bgColor: 'bg-yellow-50/30 dark:bg-yellow-900/10' },
  { status: 'approval', title: 'Agent requires approval', color: 'bg-cyan-400', bgColor: 'bg-cyan-50/30 dark:bg-cyan-900/10' },
  { status: 'completed', title: 'Agent completed', color: 'bg-green-400', bgColor: 'bg-green-50/30 dark:bg-green-900/10' },
  { status: 'failed', title: 'Agent failed', color: 'bg-red-400', bgColor: 'bg-red-50/30 dark:bg-red-900/10' },
  { status: 'done', title: 'Done', color: 'bg-emerald-500', bgColor: 'bg-emerald-50/30 dark:bg-emerald-900/10' },
  { status: 'archived', title: 'Archive', color: 'bg-slate-500', bgColor: 'bg-slate-50/30 dark:bg-slate-900/10' },
];

interface KanbanViewProps {
  initialSessionId?: string;
  initialCreateOpen?: boolean;
}

export function KanbanView({ initialSessionId, initialCreateOpen }: KanbanViewProps) {
  const { columns, loadMore, refresh, smartRefresh, moveSessionOptimistically } = usePaginatedSessions();
  const {
    tasks: scheduledTasks,
    loading: scheduledTasksLoading,
    refresh: refreshScheduledTasks,
    enable: enableTask,
    disable: disableTask,
    trigger: triggerTask,
  } = useScheduledTasks();
  const [createModalOpen, setCreateModalOpen] = useState(initialCreateOpen ?? false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initialSessionId ?? null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Personality & Project lookup maps for card display
  const [personalityMap, setPersonalityMap] = useState<Record<string, Personality>>({});
  const [projectMap, setProjectMap] = useState<Record<string, Project>>({});
  const [projectFilter, setProjectFilter] = useState<string>(''); // '' = all
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [workDirFilter, setWorkDirFilter] = useState<string>(''); // '' = all
  const [workDirsList, setWorkDirsList] = useState<string[]>([]);

  // Fetch personalities, projects, and work directories for lookup
  useEffect(() => {
    const fetchLookups = async () => {
      try {
        const [personalitiesRes, projectsRes, workDirsRes] = await Promise.all([
          getPersonalities({ limit: 100 }),
          getProjects({ limit: 100 }),
          getSessionWorkDirs(),
        ]);
        const pMap: Record<string, Personality> = {};
        for (const p of personalitiesRes.personalities) pMap[p.id] = p;
        setPersonalityMap(pMap);

        const prMap: Record<string, Project> = {};
        for (const p of projectsRes.projects) prMap[p.id] = p;
        setProjectMap(prMap);
        setProjectsList(projectsRes.projects);

        setWorkDirsList(workDirsRes.workDirs);
      } catch {
        // Non-critical
      }
    };
    fetchLookups();
  }, []);

  // Sync state with props on initial mount (for direct URL navigation/reload)
  useEffect(() => {
    setSelectedSessionId(initialSessionId ?? null);
  }, [initialSessionId]);

  useEffect(() => {
    setCreateModalOpen(initialCreateOpen ?? false);
  }, [initialCreateOpen]);

  // URL update helpers - use history API to avoid full page navigation
  const openSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    window.history.pushState(null, '', `/kanban/${sessionId}`);
  };

  const closeSession = () => {
    setSelectedSessionId(null);
    window.history.pushState(null, '', '/kanban');
  };

  const openCreateModal = () => {
    setCreateModalOpen(true);
    window.history.pushState(null, '', '/kanban/new');
  };

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    window.history.pushState(null, '', '/kanban');
  };

  // Scheduled task modal handlers
  const openScheduledTask = (taskId: string) => {
    setSelectedTaskId(taskId);
  };

  const closeScheduledTask = () => {
    setSelectedTaskId(null);
  };

  const handleToggleTaskEnabled = async (taskId: string, enabled: boolean) => {
    try {
      if (enabled) {
        await enableTask(taskId);
      } else {
        await disableTask(taskId);
      }
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  };

  const handleTriggerTask = async (taskId: string) => {
    try {
      await triggerTask(taskId);
      // Also refresh sessions since a new one was created
      refresh();
    } catch (err) {
      console.error('Failed to trigger task:', err);
    }
  };

  // Drag state
  const [draggedSession, setDraggedSession] = useState<Session | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<SessionStatus | null>(null);

  // Polling for updates - use smartRefresh for better sync
  useEffect(() => {
    const interval = setInterval(smartRefresh, 2000);
    return () => clearInterval(interval);
  }, [smartRefresh]);

  const handleDragStart = (e: React.DragEvent, session: Session) => {
    setDraggedSession(session);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, status: SessionStatus) => {
    e.preventDefault();
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: SessionStatus) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (!draggedSession || draggedSession.status === newStatus) {
      setDraggedSession(null);
      return;
    }

    const oldStatus = draggedSession.status;

    // Optimistically update UI
    moveSessionOptimistically(draggedSession.id, oldStatus, newStatus);

    try {
      await updateSessionStatus(draggedSession.id, { status: newStatus });
    } catch (err) {
      console.error('Failed to update session status:', err);
      // Revert on error by refreshing
      refresh();
    }

    setDraggedSession(null);
  };

  const handleDragEnd = () => {
    setDraggedSession(null);
    setDragOverColumn(null);
  };

  // Bulk move all sessions from one status to another
  const handleBulkMove = async (fromStatus: SessionStatus, toStatus: SessionStatus) => {
    const sessionsToMove = columns[fromStatus]?.sessions || [];
    if (sessionsToMove.length === 0) return;

    // Optimistically move all sessions
    for (const session of sessionsToMove) {
      moveSessionOptimistically(session.id, fromStatus, toStatus);
    }

    // Update all sessions in the API
    try {
      await Promise.all(
        sessionsToMove.map((session) =>
          updateSessionStatus(session.id, { status: toStatus })
        )
      );
    } catch (err) {
      console.error('Failed to bulk update session statuses:', err);
      // Revert on error by refreshing
      refresh();
    }
  };

  // Check if any column is still in initial loading
  const isInitialLoading = Object.values(columns).some((col) => col.initialLoading);

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* Kanban Sub-header with Filters */}
      <div className="flex-shrink-0 relative px-3 py-2 bg-gray-100 dark:bg-gray-900 border-b border-[var(--card-border)]">
        <div className="flex items-center gap-2 md:gap-4 overflow-x-auto">
          <WorkDirSwitcher
            workDirs={workDirsList}
            value={workDirFilter}
            onChange={setWorkDirFilter}
          />
          <ProjectSwitcher
            projects={projectsList.filter(p => p.status === 'active')}
            value={projectFilter}
            onChange={setProjectFilter}
          />
        </div>
      </div>

      {/* Kanban Columns */}
      <div className="flex-1 overflow-x-auto p-3 bg-gray-100 dark:bg-gray-900">
        {isInitialLoading ? (
          <div className="flex items-center justify-center h-full">
            <Spinner className="h-8 w-8 text-blue-600" />
          </div>
        ) : (
          <div className="flex gap-3 h-full min-w-max min-h-full">
            {/* Scheduled Tasks Column */}
            <ScheduledTasksColumn
              tasks={scheduledTasks}
              loading={scheduledTasksLoading}
              onTaskClick={openScheduledTask}
              onToggleEnabled={handleToggleTaskEnabled}
              onTrigger={handleTriggerTask}
              onCreateClick={openCreateModal}
            />

            {COLUMNS.map((column) => {
              const allSessions = columns[column.status]?.sessions || [];
              let filteredSessions = allSessions;
              if (workDirFilter) {
                filteredSessions = filteredSessions.filter(s => s.workDir === workDirFilter);
              }
              if (projectFilter) {
                filteredSessions = filteredSessions.filter(s => s.projectId === projectFilter);
              }
              return (
                <KanbanColumn
                  key={column.status}
                  status={column.status}
                  title={column.title}
                  color={column.color}
                  bgColor={column.bgColor}
                  sessions={filteredSessions}
                  hasMore={columns[column.status]?.hasMore}
                  loading={columns[column.status]?.loading}
                  onLoadMore={() => loadMore(column.status)}
                  onDragOver={(e) => handleDragOver(e, column.status)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, column.status)}
                  isDragOver={dragOverColumn === column.status}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onCardClick={openSession}
                  draggedSessionId={draggedSession?.id ?? null}
                  onCreateClick={openCreateModal}
                  onBulkMove={handleBulkMove}
                  personalityMap={personalityMap}
                  projectMap={projectMap}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <SessionCreateModal
        open={createModalOpen}
        onClose={closeCreateModal}
        onCreated={refresh}
        onScheduledTaskCreated={refreshScheduledTasks}
        initialWorkDir={workDirFilter}
      />

      {/* Detail Modal */}
      {selectedSessionId && (
        <SessionDetailModal
          sessionId={selectedSessionId}
          open={!!selectedSessionId}
          onClose={closeSession}
        />
      )}

      {/* Scheduled Task Detail Modal */}
      {selectedTaskId && (
        <ScheduledTaskDetailModal
          taskId={selectedTaskId}
          open={!!selectedTaskId}
          onClose={closeScheduledTask}
          onUpdated={refreshScheduledTasks}
        />
      )}
    </div>
  );
}

// Kanban Column Component
interface KanbanColumnProps {
  status: SessionStatus;
  title: string;
  color: string;
  bgColor: string;
  sessions: Session[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent, session: Session) => void;
  onDragEnd: () => void;
  onCardClick: (sessionId: string) => void;
  draggedSessionId: string | null;
  onCreateClick: () => void;
  onBulkMove: (fromStatus: SessionStatus, toStatus: SessionStatus) => void;
  personalityMap: Record<string, Personality>;
  projectMap: Record<string, Project>;
}

function KanbanColumn({
  status,
  title,
  color,
  bgColor,
  sessions = [],
  hasMore,
  loading,
  onLoadMore,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragOver,
  onDragStart,
  onDragEnd,
  onCardClick,
  draggedSessionId,
  onCreateClick,
  onBulkMove,
  personalityMap,
  projectMap,
}: KanbanColumnProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  // Show bulk actions menu for completed and failed columns
  const showBulkActions = status === 'completed' || status === 'failed';
  const hasSessions = sessions.length > 0;

  return (
    <div
      className={`flex flex-col w-72 h-full ${bgColor} rounded-lg ${
        isDragOver ? 'ring-2 ring-blue-400' : ''
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className={`w-1 h-4 rounded-full ${color}`} />
          <h2 className="font-medium text-sm text-gray-700 dark:text-gray-200">{title}</h2>
          <span className="text-sm text-gray-400">
            {sessions?.length}{hasMore ? '+' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Bulk Actions Menu - only for completed/failed columns */}
          {showBulkActions && hasSessions && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer"
                title="Bulk actions"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 py-1">
                  <button
                    onClick={() => {
                      onBulkMove(status, 'done');
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 cursor-pointer"
                  >
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Move all to Done
                  </button>
                  <button
                    onClick={() => {
                      onBulkMove(status, 'archived');
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 cursor-pointer"
                  >
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                    Move all to Archive
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            onClick={onCreateClick}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
            title="Add new session"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Column Content */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onDragStart={(e) => onDragStart(e, session)}
            onDragEnd={onDragEnd}
            onClick={() => onCardClick(session.id)}
            isDragging={draggedSessionId === session.id}
            personality={session.personalityId ? personalityMap[session.personalityId] : undefined}
            project={session.projectId ? projectMap[session.projectId] : undefined}
          />
        ))}
        {sessions.length === 0 && !loading && (
          <div className="text-center text-gray-400 text-sm py-8">
            No sessions
          </div>
        )}
        {/* Scroll Sentinel for infinite scroll */}
        <ScrollSentinel
          onIntersect={onLoadMore}
          hasMore={hasMore}
          loading={loading}
        />
        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-center py-2">
            <Spinner className="h-5 w-5 text-blue-600" />
          </div>
        )}
        {/* Add New button at bottom */}
        <button
          onClick={onCreateClick}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New
        </button>
      </div>
    </div>
  );
}

// Scroll Sentinel Component - triggers load more when visible
interface ScrollSentinelProps {
  onIntersect: () => void;
  hasMore: boolean;
  loading: boolean;
}

function ScrollSentinel({ onIntersect, hasMore, loading }: ScrollSentinelProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onIntersectRef = useRef(onIntersect);

  // Keep callback ref updated
  useEffect(() => {
    onIntersectRef.current = onIntersect;
  }, [onIntersect]);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onIntersectRef.current();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  if (!hasMore) return null;

  return <div ref={sentinelRef} className="h-4" />;
}

// Priority Badge Component - maps session status to priority display
function PriorityBadge({ status }: { status: SessionStatus }) {
  const config: Record<SessionStatus, { label: string; color: string; icon: string }> = {
    failed: { label: 'High', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: '🔥' },
    in_progress: { label: 'Medium', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: '⭐' },
    approval: { label: 'Action', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400', icon: '⏳' },
    triage: { label: 'Low', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400', icon: '○' },
    completed: { label: 'Done', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: '✓' },
    done: { label: 'Done', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: '✓' },
    archived: { label: 'Archived', color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-500', icon: '📦' },
  };
  const { label, color, icon } = config[status];

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md ${color}`}>
      {label} <span>{icon}</span>
    </span>
  );
}

// Category Icon Component - displays connector type as an icon
function CategoryIcon({ type }: { type: string }) {
  const lowerType = type.toLowerCase();

  if (lowerType === 'claude') {
    return (
      <img
        src="/claude.svg"
        alt="Claude"
        title="Claude"
        className="w-3 h-5"
      />
    );
  }

  if (lowerType === 'vibe') {
    return (
      <img
        src="/m-rainbow.png"
        alt="Vibe"
        title="Vibe"
        className="w-3 h-5 object-contain"
      />
    );
  }

  // Fallback for unknown types
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
      {type}
    </span>
  );
}

// Session Card Component
interface SessionCardProps {
  session: Session;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
  isDragging: boolean;
  personality?: Personality;
  project?: Project;
}

function SessionCard({ session, onDragStart, onDragEnd, onClick, isDragging, personality, project }: SessionCardProps) {
  const displayName = session.sessionName || `Session ${session.id.slice(0, 8)}`;

  // Derive some metadata from session for the card display
  const dateDisplay = (() => {
    const now = new Date();
    const created = new Date(session.createdAt);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    // If today, show relative time
    const isToday = created.toDateString() === now.toDateString();
    if (isToday) {
      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins} min ago`;
      const diffHours = Math.floor(diffMins / 60);
      return `${diffHours} hr ago`;
    }

    // Otherwise show readable date like "Feb 10" or "Feb 10, 2024"
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[created.getMonth()];
    const day = created.getDate();
    const year = created.getFullYear();
    const currentYear = now.getFullYear();

    if (year === currentYear) {
      return `${month} ${day}`;
    }
    return `${month} ${day}, ${year}`;
  })();
  const workDir = (() => {
    if (!session.workDir) return 'N/A';
    const parts = session.workDir.split('/').filter(Boolean);
    if (parts.length <= 2) return session.workDir;
    return parts.slice(-2).join('/');
  })();

  // Calculate a "progress" percentage based on status
  const progressPercent = session.status === 'completed' ? 100
    : session.status === 'in_progress' ? 50
    : session.status === 'failed' ? 0
    : 0;

  const isInProgress = session.status === 'in_progress';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`
        p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800
        cursor-pointer hover:shadow-md transition-all
        ${isDragging ? 'opacity-50 rotate-2 scale-105' : ''}
      `}
    >
      {/* Title */}
      <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-1 line-clamp-2">
        {displayName}
      </h3>
      {/* Footer: Metadata row */}
      <div className="flex items-center justify-between text-xs text-gray-400 mb-2 dark:text-gray-500">
        <div className="flex flex-col gap-1 overflow-hidden">
          <div className='truncate'>{workDir}</div>
          <div className='truncate'>{dateDisplay}</div>
        </div>
      </div>
      {/* Tags */}
      <div className="flex flex-wrap gap-1 mb-0">
        <CategoryIcon type={session.connectorType} />
        {session.approvalMode === 'auto' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md  text-green-700  dark:text-green-400">
            Auto approval
          </span>
        )}
        {session.agentMode === 'plan' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md  text-purple-700 dark:text-purple-400">
            Plan
          </span>
        )}
        {personality && (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md text-orange-700 dark:text-orange-400" title={personality.name}>
            {personality.readableId}
          </span>
        )}
        {project && (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md text-indigo-700 dark:text-indigo-400" title={`Project: ${project.name}`}>
            {project.name}
          </span>
        )}
        {/* Loading spinner for in-progress sessions - bottom right */}
        {isInProgress && (
          <div className="ml-auto">
            <Spinner className="h-4 w-4 text-blue-500" />
          </div>
        )}
      </div>
    </div>
  );
}

// Scheduled Tasks Column Component
interface ScheduledTasksColumnProps {
  tasks: ScheduledTask[];
  loading: boolean;
  onTaskClick: (taskId: string) => void;
  onToggleEnabled: (taskId: string, enabled: boolean) => void;
  onTrigger: (taskId: string) => void;
  onCreateClick: () => void;
}

function ScheduledTasksColumn({
  tasks = [],
  loading,
  onTaskClick,
  onToggleEnabled,
  onTrigger,
  onCreateClick,
}: ScheduledTasksColumnProps) {
  const enabledTasks = tasks.filter(t => t.enabled);
  const disabledTasks = tasks.filter(t => !t.enabled);

  return (
    <div className="flex flex-col w-72 h-full bg-blue-50/30 dark:bg-blue-900/10 rounded-lg">
      {/* Column Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-blue-500" />
          <h2 className="font-medium text-sm text-gray-700 dark:text-gray-200">Scheduled</h2>
          <span className="text-sm text-gray-400">
            {enabledTasks.length}
          </span>
        </div>
        <button
          onClick={onCreateClick}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
          title="Add scheduled task"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Column Content */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-6 w-6 text-blue-500" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
            No scheduled tasks
          </div>
        ) : (
          <>
            {/* Enabled tasks first */}
            {enabledTasks.map((task) => (
              <ScheduledTaskCard
                key={task.id}
                task={task}
                onClick={() => onTaskClick(task.id)}
                onToggleEnabled={(enabled) => onToggleEnabled(task.id, enabled)}
                onTrigger={() => onTrigger(task.id)}
              />
            ))}
            {/* Disabled tasks */}
            {disabledTasks.length > 0 && enabledTasks.length > 0 && (
              <div className="text-xs text-gray-400 dark:text-gray-500 px-1 pt-2">
                Disabled ({disabledTasks.length})
              </div>
            )}
            {disabledTasks.map((task) => (
              <ScheduledTaskCard
                key={task.id}
                task={task}
                onClick={() => onTaskClick(task.id)}
                onToggleEnabled={(enabled) => onToggleEnabled(task.id, enabled)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// Project Switcher - matches ServerSwitcher styling
interface ProjectSwitcherProps {
  projects: Project[];
  value: string;
  onChange: (value: string) => void;
}

function ProjectSwitcher({ projects, value, onChange }: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLabel = value
    ? projects.find(p => p.id === value)?.name || 'Unknown'
    : 'All Projects';

  return (
    <div className="min-w-[140px] md:min-w-[180px]" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-lg border border-[var(--input-border)] hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-xs md:text-sm cursor-pointer"
      >
        <svg className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className="flex-1 truncate text-left font-medium">{selectedLabel}</span>
        <svg
          className={`w-3 h-3 md:w-4 md:h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-lg z-50 overflow-hidden min-w-[160px]">
          <button
            onClick={() => { onChange(''); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer ${
              !value
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <span className="flex-1 truncate">All Projects</span>
            {!value && (
              <svg className="w-4 h-4 flex-shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => { onChange(project.id); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer ${
                value === project.id
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span className="flex-1 truncate">{project.name}</span>
              {value === project.id && (
                <svg className="w-4 h-4 flex-shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Work Directory Switcher - similar to ProjectSwitcher
interface WorkDirSwitcherProps {
  workDirs: string[];
  value: string;
  onChange: (value: string) => void;
}

function WorkDirSwitcher({ workDirs, value, onChange }: WorkDirSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Show shortened path for display
  const getShortPath = (path: string) => {
    const parts = path.split('/').filter(Boolean);
    if (parts.length <= 2) return path;
    return '.../' + parts.slice(-2).join('/');
  };

  const selectedLabel = value ? getShortPath(value) : 'All Directories';

  return (
    <div className="min-w-[140px] md:min-w-[180px]" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-lg border border-[var(--input-border)] hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-xs md:text-sm cursor-pointer"
      >
        <svg className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className="flex-1 truncate text-left font-medium">{selectedLabel}</span>
        <svg
          className={`w-3 h-3 md:w-4 md:h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-lg z-[100] overflow-hidden min-w-[200px] max-w-[350px] max-h-[300px] overflow-y-auto">
          <button
            onClick={() => { onChange(''); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer ${
              !value
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <span className="flex-1 truncate">All Directories</span>
            {!value && (
              <svg className="w-4 h-4 flex-shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
          {workDirs.map((workDir) => (
            <button
              key={workDir}
              onClick={() => { onChange(workDir); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer ${
                value === workDir
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={workDir}
            >
              <span className="flex-1 truncate">{getShortPath(workDir)}</span>
              {value === workDir && (
                <svg className="w-4 h-4 flex-shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

