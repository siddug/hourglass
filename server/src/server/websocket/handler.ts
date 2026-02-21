import type { WebSocket } from 'ws';
import type { LogMsg } from '../../streaming/msg-store.js';
import type { AcpEvent } from '../../acp/types.js';

/**
 * WebSocket message types
 */
export interface WsMessage {
  type: string;
  data?: unknown;
  timestamp?: number;
}

/**
 * Send a typed message over WebSocket
 */
export function sendMessage(socket: WebSocket, message: WsMessage): boolean {
  try {
    socket.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

/**
 * Send a log message over WebSocket
 */
export function sendLogMsg(socket: WebSocket, msg: LogMsg): boolean {
  return sendMessage(socket, {
    type: msg.type,
    data: 'content' in msg ? msg.content : 'patch' in msg ? msg.patch : 'sessionId' in msg ? msg.sessionId : undefined,
    timestamp: Date.now(),
  });
}

/**
 * Send an ACP event over WebSocket
 */
export function sendAcpEvent(socket: WebSocket, event: AcpEvent): boolean {
  return sendMessage(socket, {
    type: 'acpEvent',
    data: event,
    timestamp: event.timestamp,
  });
}

/**
 * Send an error message over WebSocket
 */
export function sendError(socket: WebSocket, error: string, code?: string): boolean {
  return sendMessage(socket, {
    type: 'error',
    data: { message: error, code },
    timestamp: Date.now(),
  });
}

/**
 * Send a ready message over WebSocket
 */
export function sendReady(socket: WebSocket): boolean {
  return sendMessage(socket, {
    type: 'ready',
    timestamp: Date.now(),
  });
}

/**
 * Send a finished message over WebSocket
 */
export function sendFinished(socket: WebSocket, reason?: string): boolean {
  return sendMessage(socket, {
    type: 'finished',
    data: { reason },
    timestamp: Date.now(),
  });
}

/**
 * Create a WebSocket handler that streams from a MsgStore
 */
export function createMsgStoreStreamHandler(
  socket: WebSocket,
  msgStore: { getHistory: () => LogMsg[]; subscribe: (cb: (msg: LogMsg) => void) => () => void; hasFinished: () => boolean }
): void {
  // Send history
  for (const msg of msgStore.getHistory()) {
    sendLogMsg(socket, msg);
  }

  // If already finished, close
  if (msgStore.hasFinished()) {
    sendFinished(socket, 'already_finished');
    socket.close();
    return;
  }

  // Subscribe to new messages
  const unsubscribe = msgStore.subscribe((msg) => {
    const sent = sendLogMsg(socket, msg);
    if (!sent || msg.type === 'finished') {
      unsubscribe();
      if (msg.type === 'finished') {
        socket.close();
      }
    }
  });

  // Handle socket close
  socket.on('close', unsubscribe);
  socket.on('error', unsubscribe);
}
