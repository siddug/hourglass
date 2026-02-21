import { EventEmitter } from 'node:events';

/**
 * Typed event emitter for better type safety
 *
 * Usage:
 * ```typescript
 * interface MyEvents {
 *   data: (value: string) => void;
 *   error: (err: Error) => void;
 *   close: () => void;
 * }
 *
 * const emitter = new TypedEventEmitter<MyEvents>();
 * emitter.on('data', (value) => console.log(value)); // value is typed as string
 * emitter.emit('data', 'hello'); // type-safe emit
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class TypedEventEmitter<TEvents extends { [key: string]: (...args: any[]) => void }> {
  private emitter = new EventEmitter();

  constructor(maxListeners = 100) {
    this.emitter.setMaxListeners(maxListeners);
  }

  on<K extends keyof TEvents>(event: K, listener: TEvents[K]): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.emitter.on(event as string, listener as (...args: any[]) => void);
    return this;
  }

  once<K extends keyof TEvents>(event: K, listener: TEvents[K]): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.emitter.once(event as string, listener as (...args: any[]) => void);
    return this;
  }

  off<K extends keyof TEvents>(event: K, listener: TEvents[K]): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.emitter.off(event as string, listener as (...args: any[]) => void);
    return this;
  }

  emit<K extends keyof TEvents>(
    event: K,
    ...args: Parameters<TEvents[K]>
  ): boolean {
    return this.emitter.emit(event as string, ...args);
  }

  removeAllListeners<K extends keyof TEvents>(event?: K): this {
    if (event) {
      this.emitter.removeAllListeners(event as string);
    } else {
      this.emitter.removeAllListeners();
    }
    return this;
  }

  listenerCount<K extends keyof TEvents>(event: K): number {
    return this.emitter.listenerCount(event as string);
  }

  setMaxListeners(n: number): this {
    this.emitter.setMaxListeners(n);
    return this;
  }

  /**
   * Create a promise that resolves when an event is emitted
   */
  waitFor<K extends keyof TEvents>(event: K): Promise<Parameters<TEvents[K]>> {
    return new Promise((resolve) => {
      const handler = (...args: Parameters<TEvents[K]>) => {
        this.off(event, handler as TEvents[K]);
        resolve(args);
      };
      this.on(event, handler as TEvents[K]);
    });
  }

  /**
   * Create an async iterator from an event
   * Note: Must be manually broken out of (e.g., with another event or timeout)
   */
  async *[Symbol.asyncIterator]<K extends keyof TEvents>(
    event: K
  ): AsyncGenerator<Parameters<TEvents[K]>, void, undefined> {
    const queue: Parameters<TEvents[K]>[] = [];
    let resolve: (() => void) | null = null;

    const handler = (...args: Parameters<TEvents[K]>) => {
      queue.push(args);
      if (resolve) {
        resolve();
        resolve = null;
      }
    };

    this.on(event, handler as TEvents[K]);

    try {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          await new Promise<void>((r) => {
            resolve = r;
          });
        }
      }
    } finally {
      this.off(event, handler as TEvents[K]);
    }
  }
}

/**
 * Create a deferred promise with external resolve/reject
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Create a timeout promise that rejects after specified milliseconds
 */
export function timeout<T>(ms: number, message = 'Timeout'): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Race a promise against a timeout
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, timeout<T>(ms)]);
}
