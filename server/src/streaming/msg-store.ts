import { EventEmitter } from 'node:events';
import type { Operation } from 'fast-json-patch';

/**
 * LogMsg types matching vibe-kanban's Rust implementation
 */
export type LogMsgType = 'stdout' | 'stderr' | 'jsonPatch' | 'sessionId' | 'ready' | 'finished';

/**
 * Log message variants
 */
export type LogMsg =
  | { type: 'stdout'; content: string }
  | { type: 'stderr'; content: string }
  | { type: 'jsonPatch'; patch: Operation[] }
  | { type: 'sessionId'; sessionId: string }
  | { type: 'ready' }
  | { type: 'finished' };

/**
 * Stored message with byte tracking for memory limits
 */
interface StoredMsg {
  msg: LogMsg;
  bytes: number;
}

/**
 * Event types emitted by MsgStore
 */
export interface MsgStoreEvents {
  message: (msg: LogMsg) => void;
  finished: () => void;
}

// 100 MB History limit (matching vibe-kanban)
const HISTORY_BYTES = 100000 * 1024;

/**
 * MsgStore - Pub/Sub message store with history buffer
 *
 * TypeScript port of vibe-kanban's MsgStore. Provides:
 * - Broadcast channel for live listeners
 * - History buffer with size limits (100 MB)
 * - Methods to push different message types
 * - Async iterators that combine history + live updates
 */
export class MsgStore {
  private history: StoredMsg[] = [];
  private totalBytes = 0;
  private emitter = new EventEmitter();
  private isFinished = false;

  constructor() {
    // Increase max listeners to support many concurrent WebSocket connections
    this.emitter.setMaxListeners(1000);
  }

  /**
   * Approximate byte size of a message (for history limit tracking)
   */
  private approxBytes(msg: LogMsg): number {
    switch (msg.type) {
      case 'stdout':
      case 'stderr':
        return msg.content.length * 2; // UTF-16
      case 'jsonPatch':
        return JSON.stringify(msg.patch).length * 2;
      case 'sessionId':
        return msg.sessionId.length * 2;
      case 'ready':
      case 'finished':
        return 16; // Small fixed overhead
    }
  }

  /**
   * Push a message to the store and notify all subscribers
   */
  push(msg: LogMsg): void {
    if (this.isFinished) return;

    // Notify live listeners
    this.emitter.emit('message', msg);

    // Track bytes for history limits
    const bytes = this.approxBytes(msg);

    // Trim history if needed
    while (this.totalBytes + bytes > HISTORY_BYTES && this.history.length > 0) {
      const removed = this.history.shift();
      if (removed) {
        this.totalBytes -= removed.bytes;
      }
    }

    // Add to history
    this.history.push({ msg, bytes });
    this.totalBytes += bytes;

    // Handle finished state
    if (msg.type === 'finished') {
      this.isFinished = true;
      this.emitter.emit('finished');
    }
  }

  // Convenience methods for pushing different message types

  pushStdout(content: string): void {
    this.push({ type: 'stdout', content });
  }

  pushStderr(content: string): void {
    this.push({ type: 'stderr', content });
  }

  pushPatch(patch: Operation[]): void {
    this.push({ type: 'jsonPatch', patch });
  }

  pushSessionId(sessionId: string): void {
    this.push({ type: 'sessionId', sessionId });
  }

  pushReady(): void {
    this.push({ type: 'ready' });
  }

  pushFinished(): void {
    this.push({ type: 'finished' });
  }

  /**
   * Get a copy of the message history
   */
  getHistory(): LogMsg[] {
    return this.history.map((s) => s.msg);
  }

  /**
   * Check if the store has finished (no more messages expected)
   */
  hasFinished(): boolean {
    return this.isFinished;
  }

  /**
   * Subscribe to new messages
   * Returns an unsubscribe function
   */
  subscribe(callback: (msg: LogMsg) => void): () => void {
    this.emitter.on('message', callback);
    return () => {
      this.emitter.off('message', callback);
    };
  }

  /**
   * Wait for the store to finish
   */
  waitForFinish(): Promise<void> {
    if (this.isFinished) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const handler = () => {
        this.emitter.off('finished', handler);
        resolve();
      };
      this.emitter.on('finished', handler);
    });
  }

  /**
   * Create an async iterable that yields history first, then live messages
   * Completes when a 'finished' message is received
   */
  async *historyPlusStream(): AsyncGenerator<LogMsg, void, undefined> {
    // Yield history first
    for (const msg of this.getHistory()) {
      yield msg;
    }

    // If already finished, we're done
    if (this.isFinished) {
      return;
    }

    // Create a queue for live messages
    const queue: LogMsg[] = [];
    let resolve: (() => void) | null = null;
    let finished = false;

    const handler = (msg: LogMsg) => {
      queue.push(msg);
      if (msg.type === 'finished') {
        finished = true;
      }
      if (resolve) {
        resolve();
        resolve = null;
      }
    };

    this.emitter.on('message', handler);

    try {
      while (!finished) {
        if (queue.length > 0) {
          const msg = queue.shift()!;
          yield msg;
          if (msg.type === 'finished') {
            break;
          }
        } else {
          // Wait for next message
          await new Promise<void>((r) => {
            resolve = r;
          });
        }
      }
    } finally {
      this.emitter.off('message', handler);
    }
  }

  /**
   * Create an async iterable that yields only stdout messages
   * Completes when a 'finished' message is received
   */
  async *stdoutStream(): AsyncGenerator<string, void, undefined> {
    for await (const msg of this.historyPlusStream()) {
      if (msg.type === 'finished') break;
      if (msg.type === 'stdout') {
        yield msg.content;
      }
    }
  }

  /**
   * Create an async iterable that yields only stderr messages
   * Completes when a 'finished' message is received
   */
  async *stderrStream(): AsyncGenerator<string, void, undefined> {
    for await (const msg of this.historyPlusStream()) {
      if (msg.type === 'finished') break;
      if (msg.type === 'stderr') {
        yield msg.content;
      }
    }
  }

  /**
   * Create an async iterable that yields only JSON patch messages
   * Completes when a 'finished' message is received
   */
  async *patchStream(): AsyncGenerator<Operation[], void, undefined> {
    for await (const msg of this.historyPlusStream()) {
      if (msg.type === 'finished') break;
      if (msg.type === 'jsonPatch') {
        yield msg.patch;
      }
    }
  }

  /**
   * Create an async iterable that yields stdout split by lines
   */
  async *stdoutLines(): AsyncGenerator<string, void, undefined> {
    let buffer = '';

    for await (const chunk of this.stdoutStream()) {
      buffer += chunk;

      const lines = buffer.split('\n');
      // Keep the last incomplete line in buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        yield line;
      }
    }

    // Yield any remaining content
    if (buffer) {
      yield buffer;
    }
  }

  /**
   * Create an async iterable that yields stderr split by lines
   */
  async *stderrLines(): AsyncGenerator<string, void, undefined> {
    let buffer = '';

    for await (const chunk of this.stderrStream()) {
      buffer += chunk;

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        yield line;
      }
    }

    if (buffer) {
      yield buffer;
    }
  }

  /**
   * Get the number of messages in history
   */
  get historySize(): number {
    return this.history.length;
  }

  /**
   * Get the total bytes used by history
   */
  get historyBytes(): number {
    return this.totalBytes;
  }

  /**
   * Clear history buffer only (preserves subscriptions)
   * Used when starting a new task in an existing session
   */
  clear(): void {
    this.history = [];
    this.totalBytes = 0;
    this.isFinished = false;
    // Note: We intentionally do NOT remove listeners here
    // as subscriptions (like database persistence) need to stay active
  }

  /**
   * Clear everything including listeners
   * Only use this when completely disposing of the MsgStore
   */
  dispose(): void {
    this.history = [];
    this.totalBytes = 0;
    this.isFinished = false;
    this.emitter.removeAllListeners();
    this.emitter.setMaxListeners(1000);
  }
}

/**
 * Create a new MsgStore instance
 */
export function createMsgStore(): MsgStore {
  return new MsgStore();
}
