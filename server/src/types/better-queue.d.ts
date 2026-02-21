// Type declarations for better-queue and better-queue-sqlite

declare module 'better-queue' {
  import { EventEmitter } from 'events';

  interface QueueOptions<T, R> {
    /** Maximum number of concurrent tasks */
    concurrent?: number;
    /** Maximum number of retries for a failed task */
    maxRetries?: number;
    /** Delay between retries in milliseconds */
    retryDelay?: number;
    /** Custom ID function for tasks */
    id?: (task: T, callback: (error: Error | null, id?: string) => void) => void;
    /** Merge function for duplicate tasks */
    merge?: (oldTask: T, newTask: T, callback: (error: Error | null, merged?: T) => void) => void;
    /** Store for task persistence */
    store?: Store;
    /** Priority function */
    priority?: (task: T, callback: (error: Error | null, priority?: number) => void) => void;
    /** Batch size */
    batchSize?: number;
    /** Process delay */
    processDelay?: number;
    /** Max timeout for task processing */
    maxTimeout?: number;
    /** Whether to precondition tasks */
    precondition?: (callback: (error: Error | null, ready?: boolean) => void) => void;
    /** Interval for precondition checks */
    preconditionRetryTimeout?: number;
    /** Filter function */
    filter?: (task: T, callback: (error: Error | null, shouldProcess?: boolean) => void) => void;
    /** Cancel if running */
    cancelIfRunning?: boolean;
    /** Auto resume */
    autoResume?: boolean;
    /** Fail task on process exception */
    failTaskOnProcessException?: boolean;
  }

  interface Store {
    connect(callback: (error: Error | null, length?: number) => void): void;
    getTask(taskId: string, callback: (error: Error | null, task?: unknown) => void): void;
    putTask(taskId: string, task: unknown, priority: number, callback: (error: Error | null) => void): void;
    takeFirstN(n: number, callback: (error: Error | null, tasks?: Record<string, unknown>) => void): void;
    takeLastN(n: number, callback: (error: Error | null, tasks?: Record<string, unknown>) => void): void;
    getLock(lockId: string, callback: (error: Error | null, gotLock?: boolean) => void): void;
    releaseLock(lockId: string, callback: (error: Error | null) => void): void;
    deleteTask(taskId: string, callback: (error: Error | null) => void): void;
  }

  type ProcessFunction<T, R> = (task: T, callback: (error: Error | null, result?: R) => void) => void;

  class Queue<T = unknown, R = unknown> extends EventEmitter {
    constructor(process: ProcessFunction<T, R>, options?: QueueOptions<T, R>);

    push(task: T, callback?: (error: Error | null, result?: R) => void): void;
    push(task: T): void;

    pause(): void;
    resume(): void;
    destroy(callback?: () => void): void;
    cancel(taskId: string, callback?: (error: Error | null) => void): void;

    on(event: 'task_finish', listener: (taskId: string, result: unknown) => void): this;
    on(event: 'task_failed', listener: (taskId: string, error: Error) => void): this;
    on(event: 'task_progress', listener: (taskId: string, progress: number) => void): this;
    on(event: 'task_queued', listener: (taskId: string, task: T) => void): this;
    on(event: 'task_started', listener: (taskId: string) => void): this;
    on(event: 'batch_finish', listener: (taskIds: string[], results: unknown[]) => void): this;
    on(event: 'batch_failed', listener: (taskIds: string[], error: Error) => void): this;
    on(event: 'batch_progress', listener: (taskIds: string[], progress: number) => void): this;
    on(event: 'empty', listener: () => void): this;
    on(event: 'drain', listener: () => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  export = Queue;
}

declare module 'better-queue-sqlite' {
  interface SqliteStoreOptions {
    /** Path to SQLite database file */
    path: string;
  }

  class SqliteStore {
    constructor(options: SqliteStoreOptions);
    connect(callback: (error: Error | null, length?: number) => void): void;
    getTask(taskId: string, callback: (error: Error | null, task?: unknown) => void): void;
    putTask(taskId: string, task: unknown, priority: number, callback: (error: Error | null) => void): void;
    takeFirstN(n: number, callback: (error: Error | null, tasks?: Record<string, unknown>) => void): void;
    takeLastN(n: number, callback: (error: Error | null, tasks?: Record<string, unknown>) => void): void;
    getLock(lockId: string, callback: (error: Error | null, gotLock?: boolean) => void): void;
    releaseLock(lockId: string, callback: (error: Error | null) => void): void;
    deleteTask(taskId: string, callback: (error: Error | null) => void): void;
  }

  export = SqliteStore;
}
