/**
 * Approval Service
 *
 * Handles tool approval requests by:
 * 1. Forwarding them to connected WebSocket clients
 * 2. Waiting for approval responses
 * 3. Returning the result to the caller
 *
 * Supports two modes:
 * - 'manual': Requires user approval for each tool call
 * - 'auto': Automatically approves all tool calls
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  ApprovalRequest,
  ApprovalResponse,
  ApprovalStatus,
} from './control-protocol.js';

const DEFAULT_TIMEOUT_MS = 60000; // 60 seconds

export type ApprovalServiceMode = 'manual' | 'auto';

interface PendingApproval {
  request: ApprovalRequest;
  resolve: (status: ApprovalStatus, reason?: string) => void;
  timeoutId: NodeJS.Timeout;
}

/**
 * Approval Service manages tool approval requests
 */
export class ApprovalService extends EventEmitter {
  private pendingApprovals: Map<string, PendingApproval> = new Map();
  private timeoutMs: number;
  private _mode: ApprovalServiceMode = 'manual';

  constructor(options: { timeoutMs?: number; mode?: ApprovalServiceMode } = {}) {
    super();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this._mode = options.mode ?? 'manual';
  }

  /**
   * Get current approval mode
   */
  get mode(): ApprovalServiceMode {
    return this._mode;
  }

  /**
   * Set approval mode
   * - 'manual': Requires user approval for each tool call
   * - 'auto': Automatically approves all tool calls
   */
  setMode(mode: ApprovalServiceMode): void {
    const oldMode = this._mode;
    this._mode = mode;
    this.emit('modeChanged', mode, oldMode);
  }

  /**
   * Check if auto-approve mode is enabled
   */
  isAutoApprove(): boolean {
    return this._mode === 'auto';
  }

  /**
   * Request approval for a tool call
   * Returns a promise that resolves when the user approves/denies or times out
   * If auto-approve mode is enabled, immediately returns 'approved'
   */
  async requestApproval(
    toolName: string,
    toolInput: unknown,
    toolUseId?: string
  ): Promise<{ status: ApprovalStatus; reason?: string }> {
    // If auto-approve mode is enabled, immediately approve
    if (this._mode === 'auto') {
      const autoApprovedRequest: ApprovalRequest = {
        id: randomUUID(),
        requestId: randomUUID(),
        toolName,
        toolInput,
        toolUseId,
        timestamp: Date.now(),
      };
      // Emit event for logging/tracking (auto-approved)
      this.emit('autoApproved', autoApprovedRequest);
      return { status: 'approved', reason: 'Auto-approved' };
    }

    const id = randomUUID();
    const requestId = id;

    const request: ApprovalRequest = {
      id,
      requestId,
      toolName,
      toolInput,
      toolUseId,
      timestamp: Date.now(),
    };

    return new Promise((resolve) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.handleResponse({
          requestId,
          status: 'timeout',
          reason: 'Approval request timed out',
        });
      }, this.timeoutMs);

      // Store pending approval
      this.pendingApprovals.set(requestId, {
        request,
        resolve: (status, reason) => resolve({ status, reason }),
        timeoutId,
      });

      // Emit event for WebSocket handlers to pick up
      this.emit('approvalRequest', request);
    });
  }

  /**
   * Handle an approval response from the frontend
   */
  handleResponse(response: ApprovalResponse): boolean {
    const pending = this.pendingApprovals.get(response.requestId);
    if (!pending) {
      return false;
    }

    // Clear timeout and remove from pending
    clearTimeout(pending.timeoutId);
    this.pendingApprovals.delete(response.requestId);

    // Resolve the promise
    pending.resolve(response.status, response.reason);

    // Emit event for logging/tracking
    this.emit('approvalResponse', response);

    return true;
  }

  /**
   * Get all pending approval requests
   */
  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values()).map((p) => p.request);
  }

  /**
   * Cancel all pending approvals (e.g., when session ends)
   */
  cancelAll(reason = 'Session ended'): void {
    for (const [requestId, pending] of this.pendingApprovals) {
      clearTimeout(pending.timeoutId);
      pending.resolve('denied', reason);
    }
    this.pendingApprovals.clear();
  }

  /**
   * Check if there are any pending approvals
   */
  hasPending(): boolean {
    return this.pendingApprovals.size > 0;
  }
}

/**
 * Create a new approval service
 */
export function createApprovalService(
  options: { timeoutMs?: number; mode?: ApprovalServiceMode } = {}
): ApprovalService {
  return new ApprovalService(options);
}
