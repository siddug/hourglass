'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getWebSocketUrl, getWebSocketProtocols, type ApprovalRequest, type ApprovalResponse } from '@/lib/api';

export interface ApprovalMessage {
  type: 'approvalRequest' | 'approvalResponse' | 'sessionEnded' | 'error';
  data?: ApprovalRequest | ApprovalResponse;
  error?: string;
}

export interface UseApprovalStreamResult {
  pendingApprovals: ApprovalRequest[];
  isConnected: boolean;
  error: string | null;
  respond: (requestId: string, status: 'approved' | 'denied', reason?: string) => void;
}

export function useApprovalStream(sessionId: string | null): UseApprovalStreamResult {
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const respond = useCallback((requestId: string, status: 'approved' | 'denied', reason?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    const response: { type: string; data: ApprovalResponse } = {
      type: 'approvalResponse',
      data: {
        requestId,
        status,
        reason,
      },
    };

    wsRef.current.send(JSON.stringify(response));

    // Optimistically remove from pending
    setPendingApprovals((prev) => prev.filter((a) => a.requestId !== requestId));
  }, []);

  const connect = useCallback(() => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const url = getWebSocketUrl(`/api/sessions/${currentSessionId}/approvals/stream`);
    const protocols = getWebSocketProtocols();
    const ws = protocols.length > 0 ? new WebSocket(url, protocols) : new WebSocket(url);

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ApprovalMessage;

        if (msg.type === 'approvalRequest' && msg.data) {
          const request = msg.data as ApprovalRequest;
          setPendingApprovals((prev) => {
            // Avoid duplicates
            if (prev.some((a) => a.requestId === request.requestId)) {
              return prev;
            }
            return [...prev, request];
          });
        } else if (msg.type === 'approvalResponse' && msg.data) {
          const response = msg.data as ApprovalResponse;
          setPendingApprovals((prev) => prev.filter((a) => a.requestId !== response.requestId));
        } else if (msg.type === 'sessionEnded') {
          setPendingApprovals([]);
        } else if (msg.type === 'error' || msg.error) {
          setError(msg.error || 'Unknown error');
        }
      } catch {
        console.error('Failed to parse approval message:', event.data);
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

  // Handle sessionId changes
  useEffect(() => {
    if (sessionIdRef.current === sessionId) return;

    sessionIdRef.current = sessionId;

    // Clean up previous connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Only connect if we have a sessionId
    if (sessionId) {
      setPendingApprovals([]);
      setError(null);
      connect();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return {
    pendingApprovals,
    isConnected,
    error,
    respond,
  };
}
