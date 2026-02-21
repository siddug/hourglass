/**
 * Protocol Peer
 *
 * Handles bidirectional control protocol communication with Claude Code.
 * - Reads control requests from stdout
 * - Sends control responses via stdin
 * - Forwards non-control messages to the message store
 */

import { createInterface } from 'node:readline';
import type { ChildProcess } from 'node:child_process';
import type { Writable, Readable } from 'node:stream';
import { TypedEventEmitter } from '../streaming/event-emitter.js';
import { MsgStore } from '../streaming/msg-store.js';
import { ApprovalService } from './approval-service.js';
import {
  parseControlMessage,
  createControlResponse,
  createErrorResponse,
  createSDKControlRequest,
  createUserMessage,
  type CLIMessage,
  type ControlRequestMessage,
  type PermissionResult,
  type PermissionMode,
  type HookCallbackResponse,
  type ApprovalStatus,
  type ImageData,
} from './control-protocol.js';
import { parseAcpLine, type AcpEvent } from './types.js';

const AUTO_APPROVE_CALLBACK_ID = 'AUTO_APPROVE_CALLBACK_ID';

export interface ProtocolPeerEvents {
  event: (event: AcpEvent) => void;
  sessionId: (sessionId: string) => void;
  stdout: (data: string) => void;
  stderr: (data: string) => void;
  controlRequest: (request: ControlRequestMessage) => void;
  error: (error: Error) => void;
  close: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: (...args: any[]) => void;
}

export interface ProtocolPeerOptions {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  msgStore: MsgStore;
  approvalService: ApprovalService;
  autoApprove?: boolean;
  permissionMode?: PermissionMode;
  hooks?: unknown;
}

/**
 * Protocol Peer handles bidirectional communication
 */
export class ProtocolPeer extends TypedEventEmitter<ProtocolPeerEvents> {
  private stdin: Writable;
  private msgStore: MsgStore;
  private approvalService: ApprovalService;
  private autoApprove: boolean;
  private sessionId: string | null = null;
  private closed = false;

  constructor(options: ProtocolPeerOptions) {
    super();
    this.stdin = options.stdin;
    this.msgStore = options.msgStore;
    this.approvalService = options.approvalService;
    this.autoApprove = options.autoApprove ?? false;

    // Set up stdout reader
    const stdoutRl = createInterface({
      input: options.stdout,
      crlfDelay: Infinity,
    });

    stdoutRl.on('line', (line) => this.handleStdoutLine(line));
    stdoutRl.on('close', () => this.handleClose());

    // Set up stderr reader
    const stderrRl = createInterface({
      input: options.stderr,
      crlfDelay: Infinity,
    });

    stderrRl.on('line', (line) => {
      this.msgStore.pushStderr(line);
      this.emit('stderr', line);
    });

    // NOTE: Initialization is now handled explicitly by the caller via initializeProtocol()
    // This ensures proper sequencing: initialize -> setPermissionMode -> sendUserMessage
  }

  private handleStdoutLine(line: string): void {
    if (this.closed) return;

    const trimmed = line.trim();
    if (!trimmed) return;

    // Try to parse as control message
    const controlMsg = parseControlMessage(trimmed);

    if (controlMsg?.type === 'control_request') {
      this.handleControlRequest(controlMsg as ControlRequestMessage);
      return;
    }

    if (controlMsg?.type === 'result') {
      // Forward to non-control handler and signal completion
      this.handleNonControlMessage(trimmed);
      return;
    }

    // Non-control message - forward to message store and parse as ACP event
    this.handleNonControlMessage(trimmed);
  }

  private handleNonControlMessage(line: string): void {
    // Push raw line to stdout
    this.msgStore.pushStdout(line);
    this.emit('stdout', line);

    // Try to parse as ACP event
    const acpEvent = parseAcpLine(line);
    if (acpEvent) {
      this.emit('event', acpEvent);

      // Handle session ID
      if (acpEvent.type === 'sessionStart') {
        this.sessionId = acpEvent.sessionId;
        this.emit('sessionId', acpEvent.sessionId);
        this.msgStore.pushSessionId(acpEvent.sessionId);
      }
    }
  }

  private async handleControlRequest(msg: ControlRequestMessage): Promise<void> {
    const { request_id, request } = msg;

    this.emit('controlRequest', msg);

    try {
      if (request.subtype === 'can_use_tool') {
        const result = await this.handleCanUseTool(
          request.tool_name,
          request.input,
          request.tool_use_id
        );
        await this.sendControlResponse(request_id, result);
      } else if (request.subtype === 'hook_callback') {
        const result = await this.handleHookCallback(
          request.callback_id,
          request.input,
          request.tool_use_id
        );
        await this.sendControlResponse(request_id, result);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await this.sendErrorResponse(request_id, errorMsg);
    }
  }

  private async handleCanUseTool(
    toolName: string,
    input: unknown,
    toolUseId?: string
  ): Promise<PermissionResult> {
    if (this.autoApprove) {
      return {
        behavior: 'allow',
        updatedInput: input,
      };
    }

    // Request approval from the service (which forwards to UI)
    const { status, reason } = await this.approvalService.requestApproval(
      toolName,
      input,
      toolUseId
    );

    return this.statusToPermissionResult(status, input, reason);
  }

  private async handleHookCallback(
    callbackId: string,
    input: unknown,
    toolUseId?: string
  ): Promise<HookCallbackResponse> {
    if (this.autoApprove || callbackId === AUTO_APPROVE_CALLBACK_ID) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          permissionDecisionReason: 'Auto-approved',
        },
      };
    }

    // Forward to can_use_tool by returning 'ask'
    // This tells Claude to send a can_use_tool request
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: 'Forwarding to approval service',
      },
    };
  }

  private statusToPermissionResult(
    status: ApprovalStatus,
    input: unknown,
    reason?: string
  ): PermissionResult {
    switch (status) {
      case 'approved':
        return {
          behavior: 'allow',
          updatedInput: input,
        };
      case 'denied':
        return {
          behavior: 'deny',
          message: reason || 'Denied by user',
          interrupt: false,
        };
      case 'timeout':
        return {
          behavior: 'deny',
          message: reason || 'Approval request timed out',
          interrupt: false,
        };
      default:
        return {
          behavior: 'deny',
          message: 'Unknown approval status',
          interrupt: false,
        };
    }
  }

  private async sendControlResponse(requestId: string, response: unknown): Promise<void> {
    const msg = createControlResponse(requestId, response);
    await this.sendJson(msg);
  }

  private async sendErrorResponse(requestId: string, error: string): Promise<void> {
    const msg = createErrorResponse(requestId, error);
    await this.sendJson(msg);
  }

  private async sendJson(data: unknown): Promise<void> {
    if (this.closed) return;

    const json = JSON.stringify(data);
    return new Promise((resolve, reject) => {
      this.stdin.write(json + '\n', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  /**
   * Initialize the control protocol with proper sequencing.
   * This must be called and awaited before sending user messages.
   *
   * Sequence: initialize -> setPermissionMode -> ready for user messages
   */
  async initializeProtocol(options: {
    hooks?: unknown;
    permissionMode?: PermissionMode;
  }): Promise<void> {
    const { hooks, permissionMode = 'default' } = options;

    // Step 1: Initialize with hooks configuration
    await this.initialize(hooks);

    // Give CLI a moment to process initialization
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Step 2: Set permission mode (default = require approvals)
    await this.setPermissionMode(permissionMode);

    // Give CLI a moment to process permission mode change
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  /**
   * Send initialization request
   */
  async initialize(hooks?: unknown): Promise<void> {
    const request = createSDKControlRequest({
      subtype: 'initialize',
      hooks,
    });
    await this.sendJson(request);
  }

  /**
   * Set permission mode
   */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    const request = createSDKControlRequest({
      subtype: 'set_permission_mode',
      mode,
    });
    await this.sendJson(request);
  }

  /**
   * Send user message with optional images
   */
  async sendUserMessage(content: string, images?: ImageData[]): Promise<void> {
    const msg = createUserMessage(content, images);
    await this.sendJson(msg);
  }

  /**
   * Send interrupt signal
   */
  async interrupt(): Promise<void> {
    const request = createSDKControlRequest({
      subtype: 'interrupt',
    });
    await this.sendJson(request);
  }

  /**
   * Wait for Claude to be ready for a new message.
   * This waits for a result message indicating the previous task has completed.
   * Used after interrupt to ensure Claude is ready before sending a new message.
   */
  async waitForReady(timeout = 5000): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        // Resolve anyway after timeout - Claude might already be ready
        // or might have been idle when interrupted
        resolve();
      }, timeout);

      const handleStdout = (line: string) => {
        // Check for result message indicating Claude is done
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'result') {
            cleanup();
            resolve();
          }
        } catch {
          // Not JSON, ignore
        }
      };

      const handleClose = () => {
        cleanup();
        // Don't reject - just resolve since we want to allow the follow-up attempt
        resolve();
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.off('stdout', handleStdout);
        this.off('close', handleClose);
      };

      this.on('stdout', handleStdout);
      this.on('close', handleClose);
    });
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  private handleClose(): void {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }

  /**
   * Close the protocol peer
   */
  close(): void {
    this.handleClose();
  }
}

/**
 * Create a new protocol peer
 */
export function createProtocolPeer(options: ProtocolPeerOptions): ProtocolPeer {
  return new ProtocolPeer(options);
}
