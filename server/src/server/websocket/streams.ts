import type { WebSocket } from 'ws';
import type { Operation } from 'fast-json-patch';

/**
 * JSON Patch WebSocket stream utilities
 *
 * Provides helpers for streaming state updates via JSON patches
 * to connected WebSocket clients.
 */

/**
 * Patch message sent over WebSocket
 */
export interface PatchMessage {
  type: 'patch';
  patch: Operation[];
  timestamp: number;
}

/**
 * Send a JSON patch over WebSocket
 */
export function sendPatch(socket: WebSocket, patch: Operation[]): boolean {
  try {
    const message: PatchMessage = {
      type: 'patch',
      patch,
      timestamp: Date.now(),
    };
    socket.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

/**
 * Batch and send multiple patches
 */
export function sendBatchedPatches(socket: WebSocket, patches: Operation[][]): boolean {
  const combined = patches.flat();
  if (combined.length === 0) return true;
  return sendPatch(socket, combined);
}

/**
 * Create a patch sender that batches operations
 */
export function createPatchBatcher(
  socket: WebSocket,
  options: { maxBatchSize?: number; flushInterval?: number } = {}
): {
  add: (patch: Operation | Operation[]) => void;
  flush: () => void;
  close: () => void;
} {
  const { maxBatchSize = 100, flushInterval = 50 } = options;

  let buffer: Operation[] = [];
  let timer: NodeJS.Timeout | null = null;

  const flush = () => {
    if (buffer.length > 0) {
      sendPatch(socket, buffer);
      buffer = [];
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const scheduleFlush = () => {
    if (!timer) {
      timer = setTimeout(flush, flushInterval);
    }
  };

  return {
    add(patch: Operation | Operation[]) {
      const ops = Array.isArray(patch) ? patch : [patch];
      buffer.push(...ops);

      if (buffer.length >= maxBatchSize) {
        flush();
      } else {
        scheduleFlush();
      }
    },

    flush,

    close() {
      flush();
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

/**
 * Stream state changes as patches
 */
export interface StateStream<T> {
  getState: () => T;
  subscribe: (callback: (patch: Operation[]) => void) => () => void;
}

/**
 * Create a WebSocket handler that streams state patches
 */
export function createStateStreamHandler<T>(
  socket: WebSocket,
  stream: StateStream<T>
): void {
  // Send initial state
  const initialState = stream.getState();
  const initMessage = {
    type: 'init',
    data: initialState,
    timestamp: Date.now(),
  };
  socket.send(JSON.stringify(initMessage));

  // Create patch batcher
  const batcher = createPatchBatcher(socket);

  // Subscribe to state changes
  const unsubscribe = stream.subscribe((patch) => {
    batcher.add(patch);
  });

  // Handle socket close
  socket.on('close', () => {
    batcher.close();
    unsubscribe();
  });

  socket.on('error', () => {
    batcher.close();
    unsubscribe();
  });
}
