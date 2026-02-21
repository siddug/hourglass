/**
 * Control Protocol Types for Claude Code SDK
 *
 * Implements bidirectional communication with Claude Code for:
 * - Tool approval requests
 * - Hook callbacks
 * - Permission management
 */

// ============================================================================
// Message Types from CLI stdout
// ============================================================================

export type CLIMessage =
  | ControlRequestMessage
  | ControlResponseMessage
  | ResultMessage
  | OtherMessage;

export interface ControlRequestMessage {
  type: 'control_request';
  request_id: string;
  request: ControlRequestType;
}

export interface ControlResponseMessage {
  type: 'control_response';
  response: ControlResponseType;
}

export interface ResultMessage {
  type: 'result';
  [key: string]: unknown;
}

export interface OtherMessage {
  type: string;
  [key: string]: unknown;
}

// ============================================================================
// Control Request Types (from CLI)
// ============================================================================

export type ControlRequestType = CanUseToolRequest | HookCallbackRequest;

export interface CanUseToolRequest {
  subtype: 'can_use_tool';
  tool_name: string;
  input: unknown;
  permission_suggestions?: PermissionUpdate[];
  tool_use_id?: string;
}

export interface HookCallbackRequest {
  subtype: 'hook_callback';
  callback_id: string;
  input: unknown;
  tool_use_id?: string;
}

// ============================================================================
// Control Response Types (to CLI)
// ============================================================================

export type ControlResponseType = SuccessResponse | ErrorResponse;

export interface SuccessResponse {
  subtype: 'success';
  request_id: string;
  response?: unknown;
}

export interface ErrorResponse {
  subtype: 'error';
  request_id: string;
  error?: string;
}

// ============================================================================
// Permission Types
// ============================================================================

export type PermissionResult = PermissionAllow | PermissionDeny;

export interface PermissionAllow {
  behavior: 'allow';
  updatedInput: unknown;
  updatedPermissions?: PermissionUpdate[];
}

export interface PermissionDeny {
  behavior: 'deny';
  message: string;
  interrupt?: boolean;
}

export type PermissionUpdateType = 'setMode' | 'addRules' | 'removeRules' | 'clearRules';
export type PermissionUpdateDestination = 'session' | 'userSettings' | 'projectSettings' | 'localSettings';
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

export interface PermissionUpdate {
  type: PermissionUpdateType;
  mode?: PermissionMode;
  destination: PermissionUpdateDestination;
}

// ============================================================================
// SDK Control Request Types (to CLI)
// ============================================================================

export interface SDKControlRequest {
  type: 'control_request';
  request_id: string;
  request: SDKControlRequestType;
}

export type SDKControlRequestType =
  | SetPermissionModeRequest
  | InitializeRequest
  | InterruptRequest;

export interface SetPermissionModeRequest {
  subtype: 'set_permission_mode';
  mode: PermissionMode;
}

export interface InitializeRequest {
  subtype: 'initialize';
  hooks?: unknown;
}

export interface InterruptRequest {
  subtype: 'interrupt';
}

// ============================================================================
// User Message Types (to CLI)
// ============================================================================

/**
 * Image content block for multimodal messages
 */
export interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string;
  };
}

/**
 * Text content block for messages
 */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

/**
 * Content block union type for user messages
 */
export type UserMessageContent = TextContentBlock | ImageContentBlock;

export interface UserMessage {
  type: 'user';
  message: {
    role: 'user';
    content: string | UserMessageContent[];
  };
}

// ============================================================================
// Hook Callback Response
// ============================================================================

export interface HookCallbackResponse {
  hookSpecificOutput: {
    hookEventName: string;
    permissionDecision: 'allow' | 'deny' | 'ask';
    permissionDecisionReason: string;
  };
}

// ============================================================================
// Approval Request (for frontend)
// ============================================================================

export interface ApprovalRequest {
  id: string;
  requestId: string;
  toolName: string;
  toolInput: unknown;
  toolUseId?: string;
  timestamp: number;
}

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'timeout';

export interface ApprovalResponse {
  requestId: string;
  status: ApprovalStatus;
  reason?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

import { randomUUID } from 'node:crypto';

export function createSDKControlRequest(request: SDKControlRequestType): SDKControlRequest {
  return {
    type: 'control_request',
    request_id: randomUUID(),
    request,
  };
}

export function createControlResponse(
  requestId: string,
  response?: unknown
): { type: 'control_response'; response: SuccessResponse } {
  return {
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: requestId,
      response,
    },
  };
}

export function createErrorResponse(
  requestId: string,
  error: string
): { type: 'control_response'; response: ErrorResponse } {
  return {
    type: 'control_response',
    response: {
      subtype: 'error',
      request_id: requestId,
      error,
    },
  };
}

/**
 * Image data for user messages
 */
export interface ImageData {
  /** Base64-encoded image data */
  data: string;
  /** Image media type */
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

export function createUserMessage(content: string, images?: ImageData[]): UserMessage {
  // If no images, send simple text message
  if (!images || images.length === 0) {
    return {
      type: 'user',
      message: {
        role: 'user',
        content,
      },
    };
  }

  // Build content blocks with images first, then text
  const contentBlocks: UserMessageContent[] = [];

  // Add image blocks
  for (const image of images) {
    contentBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mediaType,
        data: image.data,
      },
    });
  }

  // Add text block
  if (content) {
    contentBlocks.push({
      type: 'text',
      text: content,
    });
  }

  return {
    type: 'user',
    message: {
      role: 'user',
      content: contentBlocks,
    },
  };
}

export function parseControlMessage(line: string): CLIMessage | null {
  try {
    const parsed = JSON.parse(line);
    if (parsed.type === 'control_request') {
      return parsed as ControlRequestMessage;
    }
    if (parsed.type === 'control_response') {
      return parsed as ControlResponseMessage;
    }
    if (parsed.type === 'result') {
      return parsed as ResultMessage;
    }
    return parsed as OtherMessage;
  } catch {
    return null;
  }
}
