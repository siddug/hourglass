'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSessions, type Session, type SessionStatus } from '@/lib/api';

const PAGE_SIZE = 10;
const STATUSES: SessionStatus[] = ['triage', 'in_progress', 'approval', 'completed', 'failed', 'done', 'archived'];

interface ColumnState {
  sessions: Session[];
  offset: number;
  hasMore: boolean;
  loading: boolean;
  initialLoading: boolean;
}

type ColumnsState = Record<SessionStatus, ColumnState>;

const initialColumnState: ColumnState = {
  sessions: [],
  offset: 0,
  hasMore: true,
  loading: false,
  initialLoading: true,
};

const initialState: ColumnsState = {
  triage: { ...initialColumnState },
  in_progress: { ...initialColumnState },
  approval: { ...initialColumnState },
  completed: { ...initialColumnState },
  failed: { ...initialColumnState },
  done: { ...initialColumnState },
  archived: { ...initialColumnState },
};

export interface UsePaginatedSessionsResult {
  columns: ColumnsState;
  loadMore: (status: SessionStatus) => Promise<void>;
  refresh: () => Promise<void>;
  smartRefresh: () => Promise<void>;
  updateSessionOptimistically: (sessionId: string, updates: Partial<Session>) => void;
  moveSessionOptimistically: (sessionId: string, fromStatus: SessionStatus, toStatus: SessionStatus) => void;
}

export function usePaginatedSessions(): UsePaginatedSessionsResult {
  const [columns, setColumns] = useState<ColumnsState>(initialState);
  const mountedRef = useRef(true);

  // Load initial data for all columns
  useEffect(() => {
    mountedRef.current = true;

    const loadInitial = async () => {
      await Promise.all(
        STATUSES.map(async (status) => {
          try {
            const data = await getSessions({ status, limit: PAGE_SIZE, offset: 0 });
            if (!mountedRef.current) return;

            // Sort by createdAt descending for consistent ordering
            const sortedSessions = [...data.sessions].sort((a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            setColumns((prev) => ({
              ...prev,
              [status]: {
                sessions: sortedSessions,
                offset: sortedSessions.length,
                hasMore: data.hasMore,
                loading: false,
                initialLoading: false,
              },
            }));
          } catch (err) {
            console.error(`Failed to fetch ${status} sessions:`, err);
            if (!mountedRef.current) return;

            setColumns((prev) => ({
              ...prev,
              [status]: {
                ...prev[status],
                loading: false,
                initialLoading: false,
                hasMore: false,
              },
            }));
          }
        })
      );
    };

    loadInitial();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load more sessions for a specific column
  const loadMore = useCallback(async (status: SessionStatus) => {
    // Use a ref to track if we should proceed with the load
    let shouldLoad = false;
    let currentOffset = 0;

    setColumns((prev) => {
      // Don't load if already loading or no more items
      if (prev[status].loading || !prev[status].hasMore) {
        return prev;
      }
      shouldLoad = true;
      currentOffset = prev[status].offset;
      return {
        ...prev,
        [status]: { ...prev[status], loading: true },
      };
    });

    if (!shouldLoad) return;

    try {
      const data = await getSessions({ status, limit: PAGE_SIZE, offset: currentOffset });

      if (!mountedRef.current) return;

      setColumns((prev) => {
        // Deduplicate: filter out any sessions that already exist
        const existingIds = new Set(prev[status].sessions.map(s => s.id));
        const newSessions = data.sessions.filter(s => !existingIds.has(s.id));

        // Merge and sort by createdAt descending for consistent ordering
        const mergedSessions = [...prev[status].sessions, ...newSessions];
        mergedSessions.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        return {
          ...prev,
          [status]: {
            sessions: mergedSessions,
            offset: prev[status].offset + newSessions.length,
            hasMore: data.hasMore,
            loading: false,
            initialLoading: false,
          },
        };
      });
    } catch (err) {
      console.error(`Failed to load more ${status} sessions:`, err);
      if (!mountedRef.current) return;

      setColumns((prev) => ({
        ...prev,
        [status]: { ...prev[status], loading: false, hasMore: false },
      }));
    }
  }, []);

  // Refresh first page of all columns (used for polling)
  const refresh = useCallback(async () => {
    await Promise.all(
      STATUSES.map(async (status) => {
        try {
          const data = await getSessions({ status, limit: PAGE_SIZE, offset: 0 });
          if (!mountedRef.current) return;

          setColumns((prev) => {
            const existingSessions = prev[status].sessions;
            const newIds = new Set(data.sessions.map((s) => s.id));

            // Merge: new sessions first, then existing sessions not in new batch
            // This keeps new sessions at top while preserving loaded history
            const mergedSessions = [
              ...data.sessions,
              ...existingSessions.filter((s) => !newIds.has(s.id)),
            ];

            // Remove sessions that have moved to different status
            // (they will appear in their new column on that column's refresh)
            const filteredSessions = mergedSessions.filter((s) => s.status === status);

            // Deduplicate by ID to prevent duplicate key issues
            const seenIds = new Set<string>();
            const deduplicatedSessions = filteredSessions.filter(s => {
              if (seenIds.has(s.id)) return false;
              seenIds.add(s.id);
              return true;
            });

            // Sort by createdAt descending for consistent ordering
            deduplicatedSessions.sort((a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            return {
              ...prev,
              [status]: {
                ...prev[status],
                sessions: deduplicatedSessions,
                // Update hasMore based on whether we have loaded more than first page
                hasMore: data.hasMore || prev[status].offset > PAGE_SIZE,
              },
            };
          });
        } catch (err) {
          console.error(`Failed to refresh ${status} sessions:`, err);
        }
      })
    );
  }, []);

  // Optimized refresh that only updates changed sessions
  const smartRefresh = useCallback(async () => {
    try {
      // Get all sessions across all statuses
      const allSessionsResponse = await getSessions({ limit: 100, offset: 0 });
      const allSessions = allSessionsResponse.sessions;

      // Create a map of all sessions by ID for quick lookup
      const allSessionsMap = new Map(allSessions.map(s => [s.id, s]));

      setColumns((prev) => {
        const newColumns = { ...prev };
        let hasChanges = false;

        // Update each column based on current session statuses
        for (const status of STATUSES) {
          const currentSessions = prev[status].sessions;
          const currentSessionIds = new Set(currentSessions.map(s => s.id));

          // Find sessions that should be in this column from the API response
          const sessionsForStatus = allSessions.filter(s => s.status === status);
          const sessionsForStatusIds = new Set(sessionsForStatus.map(s => s.id));

          // Check if there are any changes
          const sessionsToAdd = sessionsForStatus.filter(s => !currentSessionIds.has(s.id));
          const sessionsToRemove = currentSessions.filter(s => !sessionsForStatusIds.has(s.id));

          // Also check for updated session data (e.g., status changes detected from other columns)
          const sessionsNeedingUpdate = currentSessions.filter(s => {
            const latest = allSessionsMap.get(s.id);
            return latest && latest.status !== status;
          });

          if (sessionsToAdd.length > 0 || sessionsToRemove.length > 0 || sessionsNeedingUpdate.length > 0) {
            hasChanges = true;

            // Keep sessions that still belong here (haven't moved to another status)
            const retainedSessions = currentSessions.filter(s => {
              const latest = allSessionsMap.get(s.id);
              // Keep if: session is in API response with same status, OR session is not in API response (beyond first 100)
              return !latest || latest.status === status;
            });

            // Add new sessions at the beginning, then retained sessions
            // Sort all by createdAt descending to maintain consistent order
            const mergedSessions = [...sessionsToAdd, ...retainedSessions];

            // Deduplicate by ID (in case of race conditions)
            const seenIds = new Set<string>();
            const deduplicatedSessions = mergedSessions.filter(s => {
              if (seenIds.has(s.id)) return false;
              seenIds.add(s.id);
              return true;
            });

            // Sort by createdAt descending for consistent ordering
            deduplicatedSessions.sort((a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            newColumns[status] = {
              ...prev[status],
              sessions: deduplicatedSessions,
            };
          }
        }

        return hasChanges ? newColumns : prev;
      });
    } catch (err) {
      console.error('Failed to smart refresh sessions:', err);
    }
  }, []);

  // Optimistically update a session (e.g., after name change)
  const updateSessionOptimistically = useCallback(
    (sessionId: string, updates: Partial<Session>) => {
      setColumns((prev) => {
        const newColumns = { ...prev };
        for (const status of STATUSES) {
          const sessions = newColumns[status].sessions;
          const index = sessions.findIndex((s) => s.id === sessionId);
          if (index !== -1) {
            newColumns[status] = {
              ...newColumns[status],
              sessions: [
                ...sessions.slice(0, index),
                { ...sessions[index], ...updates },
                ...sessions.slice(index + 1),
              ],
            };
            break;
          }
        }
        return newColumns;
      });
    },
    []
  );

  // Optimistically move a session between columns (e.g., drag-drop status change)
  const moveSessionOptimistically = useCallback(
    (sessionId: string, fromStatus: SessionStatus, toStatus: SessionStatus) => {
      if (fromStatus === toStatus) return;

      setColumns((prev) => {
        const fromSessions = prev[fromStatus].sessions;
        const sessionIndex = fromSessions.findIndex((s) => s.id === sessionId);

        if (sessionIndex === -1) return prev;

        const session = fromSessions[sessionIndex];
        const updatedSession = { ...session, status: toStatus };

        return {
          ...prev,
          [fromStatus]: {
            ...prev[fromStatus],
            sessions: fromSessions.filter((s) => s.id !== sessionId),
          },
          [toStatus]: {
            ...prev[toStatus],
            // Add to beginning of target column (newest first)
            sessions: [updatedSession, ...prev[toStatus].sessions],
          },
        };
      });
    },
    []
  );

  return {
    columns,
    loadMore,
    refresh,
    smartRefresh,
    updateSessionOptimistically,
    moveSessionOptimistically,
  };
}
