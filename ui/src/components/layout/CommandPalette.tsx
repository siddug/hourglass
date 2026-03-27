'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '@/components/ui';
import { useCommandCenter, type CommandSessionTab } from '@/contexts/CommandCenterContext';
import { useViewMode, type ViewMode } from '@/contexts/ViewModeContext';
import type { Session, SessionStatus } from '@/lib/api';

interface CommandItem {
  id: string;
  group: 'Actions' | 'Sessions' | 'Session Actions';
  title: string;
  subtitle?: string;
  keywords: string[];
  action: () => Promise<void> | void;
}

const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  triage: 'Triage',
  in_progress: 'In Progress',
  approval: 'Approval',
  completed: 'Completed',
  failed: 'Failed',
  done: 'Done',
  archived: 'Archived',
};

const STATUS_ACTIONS: Array<{
  status: SessionStatus;
  title: string;
  keywords: string[];
}> = [
  { status: 'triage', title: 'Move to Triage', keywords: ['triage', 'todo', 'backlog', 'move'] },
  { status: 'in_progress', title: 'Move to In Progress', keywords: ['progress', 'wip', 'active', 'move'] },
  { status: 'approval', title: 'Move to Approval', keywords: ['approval', 'review', 'waiting', 'move'] },
  { status: 'completed', title: 'Move to Completed', keywords: ['completed', 'complete', 'finish', 'move'] },
  { status: 'failed', title: 'Move to Failed', keywords: ['failed', 'failure', 'broken', 'move'] },
  { status: 'done', title: 'Move to Done', keywords: ['done', 'closed', 'resolved', 'move'] },
  { status: 'archived', title: 'Move to Archived', keywords: ['archived', 'archive', 'hidden', 'move'] },
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function getSessionLabel(session: Session): string {
  return session.sessionName?.trim() || `Session ${session.id.slice(0, 8)}`;
}

function getSessionSubtitle(session: Session): string {
  return `${SESSION_STATUS_LABELS[session.status]} · ${session.workDir}`;
}

function getQueryScore(query: string, fields: string[]): number {
  if (!query) {
    return 1;
  }

  const haystack = fields.map(normalize).join(' ');
  if (!haystack) {
    return -1;
  }

  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  let score = 0;

  for (const token of tokens) {
    if (!haystack.includes(token)) {
      return -1;
    }

    if (fields.some((field) => normalize(field).startsWith(token))) {
      score += 12;
    } else {
      score += 6;
    }

    if (fields.some((field) => normalize(field) === token)) {
      score += 10;
    }
  }

  if (fields.some((field) => normalize(field).startsWith(normalize(query)))) {
    score += 15;
  }

  if (haystack.includes(normalize(query))) {
    score += 8;
  }

  return score;
}

function getTabActions(session: Session): Array<{ tab: CommandSessionTab; title: string; keywords: string[] }> {
  const actions: Array<{ tab: CommandSessionTab; title: string; keywords: string[] }> = [
    { tab: 'agent', title: 'Open Agent Tab', keywords: ['agent', 'chat', 'conversation', 'logs'] },
    { tab: 'files', title: 'Open Files Tab', keywords: ['files', 'explorer', 'browse'] },
    { tab: 'git', title: 'Open Git Tab', keywords: ['git', 'diff', 'review'] },
  ];

  if (session.projectId || session.project) {
    actions.push(
      { tab: 'messages', title: 'Open Messages Tab', keywords: ['messages', 'team', 'chat'] },
      { tab: 'workspace', title: 'Open Workspace Tab', keywords: ['workspace', 'project', 'repo'] }
    );
  }

  return actions;
}

export function CommandPalette() {
  const {
    closePalette,
    requestNewSession,
    requestOpenSession,
    focusedSession,
    commandSessions,
    commandSessionsLoading,
    refreshCommandSessions,
    performSessionStatusChange,
    performSessionInterrupt,
    performSessionKill,
  } = useCommandCenter();
  const { viewMode, setViewMode } = useViewMode();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshCommandSessions();
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [refreshCommandSessions]);

  const sessionMatches = useMemo(() => {
    const ranked = commandSessions
      .map((session) => ({
        session,
        score: getQueryScore(query, [
          getSessionLabel(session),
          session.workDir,
          session.id,
          session.status,
          SESSION_STATUS_LABELS[session.status],
          session.projectId || '',
        ]),
      }))
      .filter((match) => match.score >= 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return new Date(b.session.updatedAt).getTime() - new Date(a.session.updatedAt).getTime();
      });

    return query ? ranked.slice(0, 8) : ranked.slice(0, 6);
  }, [commandSessions, query]);

  const currentSession = sessionMatches.length === 1
    ? sessionMatches[0].session
    : (focusedSession?.session ?? null);

  const actionItems = useMemo<CommandItem[]>(() => {
    const navigate = (mode: ViewMode, label: string, keywords: string[]): CommandItem => ({
      id: `goto-${mode}`,
      group: 'Actions',
      title: label,
      subtitle: mode === viewMode ? 'Current view' : undefined,
      keywords,
      action: () => {
        setViewMode(mode);
        closePalette();
      },
    });

    return [
      {
        id: 'new-session',
        group: 'Actions',
        title: 'New Session',
        subtitle: 'Create and start a new session',
        keywords: ['new', 'session', 'create', 'start'],
        action: () => {
          requestNewSession();
          closePalette();
        },
      },
      navigate('kanban', 'Go to Kanban', ['kanban', 'board', 'tasks']),
      navigate('sessions', 'Go to Sessions', ['sessions', 'history', 'list']),
      navigate('files', 'Go to Files', ['files', 'explorer', 'browser']),
      navigate('settings', 'Go to Settings', ['settings', 'config', 'preferences']),
    ];
  }, [closePalette, requestNewSession, setViewMode, viewMode]);

  const sessionItems = useMemo<CommandItem[]>(() => {
    return sessionMatches.map(({ session }) => ({
      id: `session-${session.id}`,
      group: 'Sessions',
      title: getSessionLabel(session),
      subtitle: getSessionSubtitle(session),
      keywords: [
        getSessionLabel(session),
        session.workDir,
        session.id,
        session.status,
        SESSION_STATUS_LABELS[session.status],
      ],
      action: () => {
        requestOpenSession({ sessionId: session.id });
        closePalette();
      },
    }));
  }, [closePalette, requestOpenSession, sessionMatches]);

  const sessionActionItems = useMemo<CommandItem[]>(() => {
    if (!currentSession) {
      return [];
    }

    const label = getSessionLabel(currentSession);
    const items: CommandItem[] = [
      {
        id: `open-session-${currentSession.id}`,
        group: 'Session Actions',
        title: 'Open Session',
        subtitle: label,
        keywords: ['open', 'session', label],
        action: () => {
          requestOpenSession({ sessionId: currentSession.id });
          closePalette();
        },
      },
    ];

    for (const tabAction of getTabActions(currentSession)) {
      items.push({
        id: `${currentSession.id}-tab-${tabAction.tab}`,
        group: 'Session Actions',
        title: tabAction.title,
        subtitle: label,
        keywords: [...tabAction.keywords, label],
        action: () => {
          requestOpenSession({ sessionId: currentSession.id, tab: tabAction.tab });
          closePalette();
        },
      });
    }

    if (focusedSession?.session.id === currentSession.id && focusedSession.openRename) {
      items.push({
        id: `${currentSession.id}-rename`,
        group: 'Session Actions',
        title: 'Rename Session',
        subtitle: label,
        keywords: ['rename', 'name', 'title', label],
        action: () => {
          focusedSession.openRename?.();
          closePalette();
        },
      });
    }

    for (const statusAction of STATUS_ACTIONS) {
      if (statusAction.status === currentSession.status) {
        continue;
      }

      items.push({
        id: `${currentSession.id}-status-${statusAction.status}`,
        group: 'Session Actions',
        title: statusAction.title,
        subtitle: label,
        keywords: [...statusAction.keywords, label],
        action: async () => {
          try {
            await performSessionStatusChange(currentSession.id, statusAction.status);
            closePalette();
          } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to update session status');
          }
        },
      });
    }

    if (currentSession.status === 'in_progress') {
      items.push(
        {
          id: `${currentSession.id}-interrupt`,
          group: 'Session Actions',
          title: 'Interrupt Session',
          subtitle: label,
          keywords: ['interrupt', 'pause', 'stop', label],
          action: async () => {
            try {
              await performSessionInterrupt(currentSession.id);
              closePalette();
            } catch (error) {
              alert(error instanceof Error ? error.message : 'Failed to interrupt session');
            }
          },
        },
        {
          id: `${currentSession.id}-kill`,
          group: 'Session Actions',
          title: 'Kill Session',
          subtitle: label,
          keywords: ['kill', 'terminate', 'stop', label],
          action: async () => {
            if (!confirm(`Kill "${label}"?`)) {
              return;
            }

            try {
              await performSessionKill(currentSession.id);
              closePalette();
            } catch (error) {
              alert(error instanceof Error ? error.message : 'Failed to kill session');
            }
          },
        }
      );
    }

    return items;
  }, [
    closePalette,
    currentSession,
    focusedSession,
    performSessionInterrupt,
    performSessionKill,
    performSessionStatusChange,
    requestOpenSession,
  ]);

  const visibleItems = useMemo(() => {
    const filterItems = (items: CommandItem[]) => {
      return items
        .map((item) => ({
          item,
          score: getQueryScore(query, [item.title, item.subtitle || '', ...item.keywords]),
        }))
        .filter((entry) => entry.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.item);
    };

    return [
      ...filterItems(actionItems),
      ...filterItems(sessionActionItems),
      ...sessionItems,
    ];
  }, [actionItems, query, sessionActionItems, sessionItems]);

  const resolvedActiveIndex = visibleItems.length === 0
    ? -1
    : Math.min(activeIndex, visibleItems.length - 1);

  useEffect(() => {
    const activeElement = document.getElementById(`command-palette-item-${resolvedActiveIndex}`);
    activeElement?.scrollIntoView({ block: 'nearest' });
  }, [resolvedActiveIndex]);

  const groupedItems = useMemo(() => {
    const groups: Array<{ label: CommandItem['group']; items: CommandItem[] }> = [];

    for (const label of ['Actions', 'Session Actions', 'Sessions'] as const) {
      const items = visibleItems.filter((item) => item.group === label);
      if (items.length > 0) {
        groups.push({ label, items });
      }
    }

    return groups;
  }, [visibleItems]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closePalette}
      />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-hg-outline-variant/30 bg-hg-surface-container-low shadow-2xl">
        <div className="border-b border-hg-outline-variant/20 px-4 py-3">
          <div className="flex items-center gap-3 rounded-xl border border-hg-outline-variant/20 bg-hg-surface-container px-3 py-2.5">
            <svg className="h-4 w-4 flex-shrink-0 text-hg-on-surface-variant" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={async (event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActiveIndex((current) => Math.min(current + 1, visibleItems.length - 1));
                  return;
                }

                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveIndex((current) => Math.max(current - 1, 0));
                  return;
                }

                if (event.key === 'Enter') {
                  event.preventDefault();
                  const activeItem = resolvedActiveIndex >= 0 ? visibleItems[resolvedActiveIndex] : undefined;
                  if (activeItem) {
                    await activeItem.action();
                  }
                  return;
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  closePalette();
                }
              }}
              placeholder="Search actions and sessions..."
              className="w-full bg-transparent text-sm text-hg-on-surface outline-none placeholder:text-hg-on-surface-variant/70"
            />
            {commandSessionsLoading ? <Spinner className="h-4 w-4 text-hg-primary" /> : null}
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
          {groupedItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-hg-on-surface-variant">
              No matching actions or sessions
            </div>
          ) : (
            groupedItems.map((group) => (
              <div key={group.label} className="mb-2 last:mb-0">
                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-hg-on-surface-variant/60">
                  {group.label}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const itemIndex = visibleItems.findIndex((visibleItem) => visibleItem.id === item.id);
                    const isActive = itemIndex === resolvedActiveIndex;

                    return (
                      <button
                        key={item.id}
                        id={`command-palette-item-${itemIndex}`}
                        onMouseEnter={() => setActiveIndex(itemIndex)}
                        onClick={() => {
                          void item.action();
                        }}
                        className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                          isActive
                            ? 'bg-hg-primary text-white'
                            : 'text-hg-on-surface hover:bg-hg-surface-container'
                        }`}
                      >
                        <span className={`mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-[10px] font-semibold ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-hg-surface-container-high text-hg-on-surface-variant'
                        }`}>
                          {item.group === 'Sessions' ? 'S' : item.group === 'Session Actions' ? 'SA' : 'A'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.title}</span>
                          {item.subtitle ? (
                            <span className={`block truncate text-xs ${
                              isActive ? 'text-white/80' : 'text-hg-on-surface-variant'
                            }`}>
                              {item.subtitle}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-hg-outline-variant/20 px-4 py-2 text-xs text-hg-on-surface-variant">
          <span>Enter to run</span>
          <span className="mx-2">·</span>
          <span>↑↓ to navigate</span>
          <span className="mx-2">·</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
