'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getWebSocketUrl, getWebSocketProtocols } from '@/lib/api';

export interface LogMessage {
  type: 'stdout' | 'stderr' | 'jsonPatch' | 'sessionId' | 'ready' | 'finished';
  content?: string;
  data?: unknown;
  timestamp?: number;
}

export interface UseLogStreamResult {
  logs: LogMessage[];
  isConnected: boolean;
  isFinished: boolean;
  error: string | null;
  /** The process ID these logs belong to (for verification) */
  connectedProcessId: string | null;
  connect: () => void;
  disconnect: () => void;
}

export function useLogStream(processId: string | null): UseLogStreamResult {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedProcessId, setConnectedProcessId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const processIdRef = useRef<string | null>(null);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    const currentProcessId = processIdRef.current;
    if (!currentProcessId) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const url = getWebSocketUrl(`/api/processes/${currentProcessId}/stream`);
    const protocols = getWebSocketProtocols();
    const ws = protocols.length > 0 ? new WebSocket(url, protocols) : new WebSocket(url);

    ws.onopen = () => {
      setIsConnected(true);
      setConnectedProcessId(currentProcessId);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as LogMessage;
        setLogs((prev) => [...prev, msg]);

        if (msg.type === 'finished') {
          setIsFinished(true);
        }
      } catch {
        // Non-JSON message
        setLogs((prev) => [...prev, { type: 'stdout', content: event.data }]);
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    wsRef.current = ws;
  }, []);

  // Handle processId changes
  useEffect(() => {
    // Skip if same processId
    if (processIdRef.current === processId) return;

    processIdRef.current = processId;

    // Clean up previous connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clear logs immediately when processId changes to prevent showing stale data
    setLogs([]);
    setIsFinished(false);
    setError(null);
    setIsConnected(false);
    setConnectedProcessId(null);

    // Only connect if we have a processId
    if (processId) {
      connect();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processId]);

  return {
    logs,
    isConnected,
    isFinished,
    error,
    connectedProcessId,
    connect,
    disconnect,
  };
}
