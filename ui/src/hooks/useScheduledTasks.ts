import { useState, useEffect, useCallback } from 'react';
import {
  getScheduledTasks,
  getScheduledTask,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  enableScheduledTask,
  disableScheduledTask,
  triggerScheduledTask,
  getScheduledTaskHistory,
  type ScheduledTask,
  type CreateScheduledTaskRequest,
  type UpdateScheduledTaskRequest,
  type GetScheduledTasksParams,
  type Session,
} from '../lib/api';

interface UseScheduledTasksState {
  tasks: ScheduledTask[];
  total: number;
  loading: boolean;
  error: string | null;
}

interface UseScheduledTasksReturn extends UseScheduledTasksState {
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  create: (data: CreateScheduledTaskRequest) => Promise<ScheduledTask>;
  update: (id: string, data: UpdateScheduledTaskRequest) => Promise<ScheduledTask>;
  remove: (id: string) => Promise<void>;
  enable: (id: string) => Promise<ScheduledTask>;
  disable: (id: string) => Promise<ScheduledTask>;
  trigger: (id: string) => Promise<void>;
  getHistory: (id: string, limit?: number) => Promise<Session[]>;
}

const PAGE_SIZE = 20;

export function useScheduledTasks(
  params?: GetScheduledTasksParams
): UseScheduledTasksReturn {
  const [state, setState] = useState<UseScheduledTasksState>({
    tasks: [],
    total: 0,
    loading: true,
    error: null,
  });
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchTasks = useCallback(async (resetOffset = true) => {
    setState(prev => ({ ...prev, loading: prev.tasks.length === 0, error: null }));
    try {
      const currentOffset = resetOffset ? 0 : offset;
      const response = await getScheduledTasks({
        ...params,
        limit: PAGE_SIZE,
        offset: currentOffset,
      });

      setState(prev => ({
        ...prev,
        tasks: resetOffset ? response.tasks : [...prev.tasks, ...response.tasks],
        total: response.total,
        loading: false,
      }));
      setOffset(currentOffset + response.tasks.length);
      setHasMore(response.hasMore);
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch scheduled tasks',
      }));
    }
  }, [params, offset]);

  const refresh = useCallback(async () => {
    setOffset(0);
    await fetchTasks(true);
  }, [fetchTasks]);

  const loadMore = useCallback(async () => {
    if (!hasMore || state.loading) return;
    await fetchTasks(false);
  }, [fetchTasks, hasMore, state.loading]);

  const create = useCallback(async (data: CreateScheduledTaskRequest): Promise<ScheduledTask> => {
    const task = await createScheduledTask(data);
    setState(prev => ({
      ...prev,
      tasks: [task, ...prev.tasks],
      total: prev.total + 1,
    }));
    return task;
  }, []);

  const update = useCallback(async (id: string, data: UpdateScheduledTaskRequest): Promise<ScheduledTask> => {
    const task = await updateScheduledTask(id, data);
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === id ? task : t),
    }));
    return task;
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    await deleteScheduledTask(id);
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.filter(t => t.id !== id),
      total: prev.total - 1,
    }));
  }, []);

  const enable = useCallback(async (id: string): Promise<ScheduledTask> => {
    const task = await enableScheduledTask(id);
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === id ? task : t),
    }));
    return task;
  }, []);

  const disable = useCallback(async (id: string): Promise<ScheduledTask> => {
    const task = await disableScheduledTask(id);
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === id ? task : t),
    }));
    return task;
  }, []);

  const trigger = useCallback(async (id: string): Promise<void> => {
    await triggerScheduledTask(id);
    // Refresh to get updated execution count and last run time
    await refresh();
  }, [refresh]);

  const getHistory = useCallback(async (id: string, limit?: number): Promise<Session[]> => {
    const response = await getScheduledTaskHistory(id, limit);
    return response.executions;
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchTasks(true);
  }, []);

  return {
    ...state,
    hasMore,
    refresh,
    loadMore,
    create,
    update,
    remove,
    enable,
    disable,
    trigger,
    getHistory,
  };
}

/**
 * Hook for fetching a single scheduled task
 */
export function useScheduledTask(taskId: string | null) {
  const [task, setTask] = useState<ScheduledTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!taskId) {
      setTask(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await getScheduledTask(taskId);
      setTask(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch scheduled task');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return {
    task,
    loading,
    error,
    refresh: fetch,
  };
}
