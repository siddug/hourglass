import type {
  AcpEvent,
  ApprovalStatus,
  RequestPermissionRequest,
  ApprovalResponse,
} from './types.js';
import { TypedEventEmitter } from '../streaming/event-emitter.js';

/**
 * Approval service interface for handling permission requests
 */
export interface ApprovalService {
  /**
   * Request approval for a tool call
   * Returns the approval status
   */
  requestApproval(request: RequestPermissionRequest): Promise<ApprovalStatus>;
}

/**
 * Events emitted by the ACP client
 */
export interface AcpClientEvents {
  event: (event: AcpEvent) => void;
  permissionRequest: (request: RequestPermissionRequest) => void;
  permissionResponse: (response: ApprovalResponse) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: (...args: any[]) => void;
}

/**
 * ACP Client - Handles ACP protocol communication
 *
 * Provides:
 * - Event forwarding
 * - Permission request routing to approval service
 * - User prompt recording
 */
export class AcpClient {
  private events = new TypedEventEmitter<AcpClientEvents>();
  private approvalService?: ApprovalService;
  private userPrompts: string[] = [];

  constructor(approvalService?: ApprovalService) {
    this.approvalService = approvalService;
  }

  /**
   * Set the approval service
   */
  setApprovalService(service: ApprovalService): void {
    this.approvalService = service;
  }

  /**
   * Record a user prompt for session history
   */
  recordUserPrompt(prompt: string): void {
    this.userPrompts.push(prompt);
    this.events.emit('event', {
      type: 'user',
      content: prompt,
      timestamp: Date.now(),
    });
  }

  /**
   * Get all recorded user prompts
   */
  getUserPrompts(): string[] {
    return [...this.userPrompts];
  }

  /**
   * Handle an incoming ACP event
   */
  async handleEvent(event: AcpEvent): Promise<AcpEvent | null> {
    this.events.emit('event', event);

    // Handle permission requests
    if (event.type === 'requestPermission') {
      return this.handlePermissionRequest(event.request);
    }

    return null;
  }

  /**
   * Handle a permission request
   */
  private async handlePermissionRequest(
    request: RequestPermissionRequest
  ): Promise<AcpEvent | null> {
    this.events.emit('permissionRequest', request);

    // Auto-approve if no approval service
    if (!this.approvalService) {
      const response: ApprovalResponse = {
        toolCallId: request.toolCallId,
        status: 'approved',
      };
      this.events.emit('permissionResponse', response);
      return {
        type: 'approvalResponse',
        response,
        timestamp: Date.now(),
      };
    }

    try {
      const status = await this.approvalService.requestApproval(request);
      const response: ApprovalResponse = {
        toolCallId: request.toolCallId,
        status,
      };
      this.events.emit('permissionResponse', response);
      return {
        type: 'approvalResponse',
        response,
        timestamp: Date.now(),
      };
    } catch (error) {
      // Timeout or error - deny the request
      const response: ApprovalResponse = {
        toolCallId: request.toolCallId,
        status: 'timeout',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      this.events.emit('permissionResponse', response);
      return {
        type: 'approvalResponse',
        response,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Subscribe to client events
   */
  on<K extends keyof AcpClientEvents>(event: K, listener: AcpClientEvents[K]): this {
    this.events.on(event, listener);
    return this;
  }

  /**
   * Unsubscribe from client events
   */
  off<K extends keyof AcpClientEvents>(event: K, listener: AcpClientEvents[K]): this {
    this.events.off(event, listener);
    return this;
  }

  /**
   * Clear all recorded prompts
   */
  clearPrompts(): void {
    this.userPrompts = [];
  }
}

/**
 * Create a new ACP client
 */
export function createAcpClient(approvalService?: ApprovalService): AcpClient {
  return new AcpClient(approvalService);
}

/**
 * Default auto-approve service (approves all requests)
 */
export const autoApproveService: ApprovalService = {
  async requestApproval(_request: RequestPermissionRequest): Promise<ApprovalStatus> {
    return 'approved';
  },
};

/**
 * Default deny service (denies all requests)
 */
export const autoDenyService: ApprovalService = {
  async requestApproval(_request: RequestPermissionRequest): Promise<ApprovalStatus> {
    return 'denied';
  },
};

/**
 * Create a manual approval service that waits for external approval
 */
export function createManualApprovalService(
  onRequest: (
    request: RequestPermissionRequest
  ) => Promise<ApprovalStatus> | ApprovalStatus
): ApprovalService {
  return {
    async requestApproval(request: RequestPermissionRequest): Promise<ApprovalStatus> {
      return onRequest(request);
    },
  };
}
