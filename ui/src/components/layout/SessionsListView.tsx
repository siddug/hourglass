'use client';

import { useState, useEffect, useCallback } from 'react';
import { useServer } from '@/contexts/ServerContext';
import { getSessions, type Session } from '@/lib/api';
import { Spinner, StatusBadge } from '@/components/ui';
import { SessionDetailView } from '@/components/session/SessionDetailView';
import { SessionCreateModal } from '@/components/session/SessionCreateModal';

export function SessionsListView() {
  const { activeServer } = useServer();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await getSessions();
      setSessions(data.sessions);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSessions([]);
    setLoading(true);
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions, activeServer?.id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'triage':
        return 'bg-yellow-500';
      case 'in_progress':
      case 'running':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'failed':
      case 'killed':
        return 'bg-red-500';
      case 'done':
        return 'bg-emerald-500';
      case 'archived':
        return 'bg-slate-400';
      default:
        return 'bg-gray-400';
    }
  };

  // Sort sessions by updatedAt descending
  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return (
    <div className="flex h-full overflow-hidden bg-[var(--bg)]">
      {/* Sessions List Sidebar */}
      <div
        className={`flex-shrink-0 transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? 'w-0' : 'w-[300px]'
        } overflow-hidden border-r border-[var(--card-border)] bg-[var(--sidebar-bg)]`}
      >
        <div className="h-full w-[300px] flex flex-col">
          {/* List Header */}
          <div className="flex-shrink-0 p-3 border-b border-[var(--sidebar-border)]">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold">Sessions</span>
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer md:hidden"
                title="Collapse list"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </div>
            {/* New Session Button */}
            <button
              onClick={() => setCreateModalOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--input-border)] hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Session
            </button>
          </div>

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner className="h-5 w-5 text-gray-400" />
              </div>
            ) : sortedSessions.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-8">
                No sessions yet
              </div>
            ) : (
              <div className="space-y-1">
                {sortedSessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors cursor-pointer ${
                      selectedSessionId === session.id
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className={`flex-shrink-0 w-2 h-2 rounded-full ${getStatusColor(session.status)}`} />
                    <span className="flex-1 truncate">
                      {session.sessionName || `Session ${session.id.slice(0, 8)}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 p-3 border-t border-[var(--sidebar-border)] text-xs text-gray-500">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Expand sidebar button (shown when collapsed on mobile) */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="fixed top-16 left-3 z-20 p-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm md:hidden"
          title="Expand list"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {selectedSessionId ? (
          <SessionDetailView
            sessionId={selectedSessionId}
            onNavigateHome={() => setSelectedSessionId(null)}
            showCloseButton
            onClose={() => setSelectedSessionId(null)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-lg font-medium mb-1">Select a session</p>
              <p className="text-sm">Choose a session from the list or create a new one</p>
            </div>
          </div>
        )}
      </main>

      {/* Create Modal */}
      <SessionCreateModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(sessionId) => {
          if (sessionId) {
            setSelectedSessionId(sessionId);
          }
          fetchSessions();
        }}
      />
    </div>
  );
}
