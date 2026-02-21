/**
 * ACP (Agent Communication Protocol) Types
 *
 * TypeScript port of the agent-client-protocol types used in vibe-kanban.
 * These types define the structure of events exchanged between the server
 * and AI coding agents.
 */

// ============================================================================
// Core Event Types
// ============================================================================

/**
 * All possible ACP event types
 */
export type AcpEventType =
  | 'user'
  | 'sessionStart'
  | 'message'
  | 'thought'
  | 'toolCall'
  | 'toolUpdate'
  | 'plan'
  | 'availableCommands'
  | 'currentMode'
  | 'requestPermission'
  | 'approvalResponse'
  | 'error'
  | 'done'
  | 'terminalOutput'
  | 'fileRead'
  | 'fileWrite'
  | 'other';

/**
 * Base interface for all ACP events
 */
export interface AcpEventBase {
  type: AcpEventType;
  timestamp: number;
}

// ============================================================================
// Content Block Types
// ============================================================================

/**
 * Text content block from agent
 */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

/**
 * Image content block from agent
 */
export interface ImageContentBlock {
  type: 'image';
  url: string;
  mimeType?: string;
}

/**
 * Content block union type
 */
export type ContentBlock = TextContentBlock | ImageContentBlock;

// ============================================================================
// Tool Call Types
// ============================================================================

/**
 * Tool call initiated by the agent
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool call update (progress or result)
 */
export interface ToolCallUpdate {
  id: string;
  status: 'running' | 'completed' | 'failed';
  output?: unknown;
  error?: string;
}

// ============================================================================
// Plan Types
// ============================================================================

/**
 * Plan item in agent's execution plan
 */
export interface PlanItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

/**
 * Agent's execution plan
 */
export interface Plan {
  items: PlanItem[];
  summary?: string;
}

// ============================================================================
// Command Types
// ============================================================================

/**
 * Available command that the user can invoke
 */
export interface AvailableCommand {
  name: string;
  description: string;
  args?: CommandArg[];
}

/**
 * Command argument definition
 */
export interface CommandArg {
  name: string;
  description: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean';
}

// ============================================================================
// Permission Types
// ============================================================================

/**
 * Approval status for permission requests
 */
export type ApprovalStatus = 'approved' | 'denied' | 'timeout';

/**
 * Permission request from agent
 */
export interface RequestPermissionRequest {
  id: string;
  toolCallId: string;
  toolName: string;
  description: string;
  risk?: 'low' | 'medium' | 'high';
  input?: Record<string, unknown>;
}

/**
 * Approval response to a permission request
 */
export interface ApprovalResponse {
  toolCallId: string;
  status: ApprovalStatus;
  message?: string;
}

// ============================================================================
// Session Types
// ============================================================================

/**
 * Session mode identifier
 */
export type SessionModeId = 'default' | 'plan' | 'code' | 'review' | string;

// ============================================================================
// Event Definitions
// ============================================================================

/**
 * User input event
 */
export interface UserEvent extends AcpEventBase {
  type: 'user';
  content: string;
}

/**
 * Session start event with session ID
 */
export interface SessionStartEvent extends AcpEventBase {
  type: 'sessionStart';
  sessionId: string;
}

/**
 * Assistant message event
 */
export interface MessageEvent extends AcpEventBase {
  type: 'message';
  content: ContentBlock;
}

/**
 * Agent thinking/reasoning event
 */
export interface ThoughtEvent extends AcpEventBase {
  type: 'thought';
  content: ContentBlock;
}

/**
 * Tool call event
 */
export interface ToolCallEvent extends AcpEventBase {
  type: 'toolCall';
  toolCall: ToolCall;
}

/**
 * Tool update event
 */
export interface ToolUpdateEvent extends AcpEventBase {
  type: 'toolUpdate';
  update: ToolCallUpdate;
}

/**
 * Plan update event
 */
export interface PlanEvent extends AcpEventBase {
  type: 'plan';
  plan: Plan;
}

/**
 * Available commands event
 */
export interface AvailableCommandsEvent extends AcpEventBase {
  type: 'availableCommands';
  commands: AvailableCommand[];
}

/**
 * Current mode event
 */
export interface CurrentModeEvent extends AcpEventBase {
  type: 'currentMode';
  mode: SessionModeId;
}

/**
 * Permission request event
 */
export interface RequestPermissionEvent extends AcpEventBase {
  type: 'requestPermission';
  request: RequestPermissionRequest;
}

/**
 * Approval response event
 */
export interface ApprovalResponseEvent extends AcpEventBase {
  type: 'approvalResponse';
  response: ApprovalResponse;
}

/**
 * Error event
 */
export interface ErrorEvent extends AcpEventBase {
  type: 'error';
  message: string;
  code?: string;
}

/**
 * Session completion event
 */
export interface DoneEvent extends AcpEventBase {
  type: 'done';
  reason: string;
  result?: string;
}

/**
 * Other/unknown event type
 */
export interface OtherEvent extends AcpEventBase {
  type: 'other';
  rawType?: string;
  data: unknown;
}

/**
 * Terminal output event (Vibe-specific)
 */
export interface TerminalOutputEvent extends AcpEventBase {
  type: 'terminalOutput';
  terminalId: string;
  toolCallId?: string;
  output: string;
  exited: boolean;
  exitCode: number | null;
}

/**
 * File read event (Vibe-specific)
 */
export interface FileReadEvent extends AcpEventBase {
  type: 'fileRead';
  path: string;
  contentLength: number;
}

/**
 * File write event (Vibe-specific)
 */
export interface FileWriteEvent extends AcpEventBase {
  type: 'fileWrite';
  path: string;
  contentLength: number;
}

/**
 * Union type of all ACP events
 */
export type AcpEvent =
  | UserEvent
  | SessionStartEvent
  | MessageEvent
  | ThoughtEvent
  | ToolCallEvent
  | ToolUpdateEvent
  | PlanEvent
  | AvailableCommandsEvent
  | CurrentModeEvent
  | RequestPermissionEvent
  | ApprovalResponseEvent
  | ErrorEvent
  | DoneEvent
  | TerminalOutputEvent
  | FileReadEvent
  | FileWriteEvent
  | OtherEvent;

// ============================================================================
// Parsing Utilities
// ============================================================================

/**
 * Parse a raw line from agent stdout into an ACP event
 * Returns null if the line is not a valid ACP event
 */
export function parseAcpLine(line: string): AcpEvent | null {
  try {
    const trimmed = line.trim();
    if (!trimmed) return null;

    const parsed = JSON.parse(trimmed);

    // Handle session ID notification (direct sessionId field)
    if (parsed.sessionId && !parsed.type) {
      return {
        type: 'sessionStart',
        sessionId: parsed.sessionId,
        timestamp: Date.now(),
      };
    }

    // Handle Claude Code system init message which contains session_id
    if (parsed.type === 'system' && parsed.subtype === 'init' && parsed.session_id) {
      return {
        type: 'sessionStart',
        sessionId: parsed.session_id,
        timestamp: Date.now(),
      };
    }

    // Map ACP protocol types to our event types
    const timestamp = parsed.timestamp || Date.now();

    // Handle different notification types
    if (parsed.type === 'sessionNotification' || parsed.notification) {
      const notification = parsed.notification || parsed;

      switch (notification.type) {
        case 'message':
          return {
            type: 'message',
            content: normalizeContentBlock(notification.content),
            timestamp,
          };

        case 'thinking':
          return {
            type: 'thought',
            content: normalizeContentBlock(notification.content),
            timestamp,
          };

        case 'toolCall':
          return {
            type: 'toolCall',
            toolCall: {
              id: notification.id || notification.toolCallId,
              name: notification.name || notification.toolName,
              input: notification.input || {},
            },
            timestamp,
          };

        case 'toolUpdate':
        case 'toolCallUpdate':
          return {
            type: 'toolUpdate',
            update: {
              id: notification.id || notification.toolCallId,
              status: notification.status || 'running',
              output: notification.output,
              error: notification.error,
            },
            timestamp,
          };

        case 'plan':
          return {
            type: 'plan',
            plan: {
              items: notification.items || [],
              summary: notification.summary,
            },
            timestamp,
          };

        case 'requestPermission':
          return {
            type: 'requestPermission',
            request: {
              id: notification.id,
              toolCallId: notification.toolCallId,
              toolName: notification.toolName,
              description: notification.description || '',
              risk: notification.risk,
              input: notification.input,
            },
            timestamp,
          };

        case 'error':
          return {
            type: 'error',
            message: notification.message || notification.error || 'Unknown error',
            code: notification.code,
            timestamp,
          };

        case 'done':
        case 'complete':
          return {
            type: 'done',
            reason: notification.reason || 'completed',
            timestamp,
          };

        default:
          return {
            type: 'other',
            data: notification,
            timestamp,
          };
      }
    }

    // Handle Claude Code 'result' event (task completion)
    if (parsed.type === 'result') {
      return {
        type: 'done',
        reason: parsed.result || 'completed',
        timestamp,
      };
    }

    // Direct event format
    if (parsed.type) {
      return {
        ...parsed,
        timestamp: parsed.timestamp || Date.now(),
      } as AcpEvent;
    }

    // Handle Vibe streaming format: {"role": "assistant|tool|system|user", "content": "...", "tool_calls": [...]}
    if (parsed.role) {
      return parseVibeStreamingLine(parsed, timestamp);
    }

    return null;
  } catch {
    // Not valid JSON, not an ACP event
    return null;
  }
}

/**
 * Parse a Vibe streaming format line into an ACP event.
 *
 * Vibe streaming format (--output streaming):
 *   {"role": "system",    "content": "...", "tool_calls": null}  - System prompt (skip)
 *   {"role": "user",      "content": "...", "tool_calls": null}  - User input (skip)
 *   {"role": "assistant", "content": "...", "tool_calls": [...]} - Assistant message or tool call
 *   {"role": "tool",      "content": "...", "name": "bash", "tool_call_id": "abc"} - Tool result
 */
function parseVibeStreamingLine(
  parsed: Record<string, unknown>,
  timestamp: number
): AcpEvent | null {
  const role = parsed.role as string;
  const content = (parsed.content as string) || '';
  const toolCalls = parsed.tool_calls as Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }> | null;

  switch (role) {
    case 'system':
      // Skip system prompt lines
      return null;

    case 'user':
      return {
        type: 'user',
        content,
        timestamp,
      };

    case 'assistant': {
      // Assistant can have tool calls and/or text content
      if (toolCalls && toolCalls.length > 0) {
        // Emit a toolCall event for the first tool call
        // (vibe typically sends one tool call per line)
        const tc = toolCalls[0];
        let input: Record<string, unknown> = {};
        try {
          input = typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : (tc.function.arguments as Record<string, unknown>) || {};
        } catch {
          input = { raw: tc.function.arguments };
        }
        return {
          type: 'toolCall',
          toolCall: {
            id: tc.id,
            name: tc.function.name,
            input,
          },
          timestamp,
        };
      }

      // Plain text response
      if (content) {
        return {
          type: 'message',
          content: { type: 'text', text: content },
          timestamp,
        };
      }
      return null;
    }

    case 'tool': {
      // Tool result - emit as toolUpdate with completed status
      const toolCallId = (parsed.tool_call_id as string) || '';
      return {
        type: 'toolUpdate',
        update: {
          id: toolCallId,
          status: 'completed',
          output: content,
        },
        timestamp,
      };
    }

    default:
      return {
        type: 'other',
        data: parsed,
        timestamp,
      };
  }
}

/**
 * Normalize content block to standard format
 */
function normalizeContentBlock(content: unknown): ContentBlock {
  if (typeof content === 'string') {
    return { type: 'text', text: content };
  }

  if (typeof content === 'object' && content !== null) {
    const c = content as Record<string, unknown>;
    if (c.type === 'text' && typeof c.text === 'string') {
      return { type: 'text', text: c.text };
    }
    if (c.type === 'image' && typeof c.url === 'string') {
      return {
        type: 'image',
        url: c.url,
        mimeType: typeof c.mimeType === 'string' ? c.mimeType : undefined,
      };
    }
    // Try to extract text from any text-like property
    if (typeof c.text === 'string') {
      return { type: 'text', text: c.text };
    }
  }

  return { type: 'text', text: String(content) };
}

/**
 * Serialize an ACP event to JSON string for transmission
 */
export function serializeAcpEvent(event: AcpEvent): string {
  return JSON.stringify(event);
}

/**
 * Type guard to check if an event is a specific type
 */
export function isEventType<T extends AcpEvent['type']>(
  event: AcpEvent,
  type: T
): event is Extract<AcpEvent, { type: T }> {
  return event.type === type;
}
