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

    // Handle Claude Code stream-json format:
    //   {"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"..."},{"type":"tool_use",...}]}}
    //   {"type":"tool","content":[{"type":"tool_result","tool_use_id":"...","content":"..."}]}
    if (parsed.type === 'assistant' && parsed.message) {
      return parseClaudeStreamJsonAssistant(parsed, timestamp);
    }
    if (parsed.type === 'tool' && parsed.content) {
      return parseClaudeStreamJsonToolResult(parsed, timestamp);
    }

    // Codex CLI JSONL format (`codex exec --json`)
    if (typeof parsed.type === 'string' && parsed.type.includes('.')) {
      return parseCodexExecEvent(parsed, timestamp);
    }

    // Direct event format (for types already matching AcpEventType)
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

function parseCodexExecEvent(
  parsed: Record<string, unknown>,
  timestamp: number
): AcpEvent | null {
  const type = parsed.type as string;

  switch (type) {
    case 'thread.started':
      if (typeof parsed.thread_id === 'string') {
        return {
          type: 'sessionStart',
          sessionId: parsed.thread_id,
          timestamp,
        };
      }
      return null;

    case 'turn.completed':
      return {
        type: 'done',
        reason: 'completed',
        result: extractCodexText(parsed) || undefined,
        timestamp,
      };

    case 'turn.failed':
      return {
        type: 'done',
        reason: 'error',
        result: extractCodexText(parsed) || undefined,
        timestamp,
      };

    case 'error':
      return {
        type: 'error',
        message: extractCodexText(parsed) || 'Unknown Codex error',
        timestamp,
      };
  }

  if (type === 'item.started' || type === 'item.completed') {
    return parseCodexItemEvent(parsed, timestamp);
  }

  if (type.startsWith('agent_message')) {
    const text = extractCodexText(parsed);
    if (!text) return null;
    return {
      type: 'message',
      content: { type: 'text', text },
      timestamp,
    };
  }

  if (type.startsWith('agent_reasoning')) {
    const text = extractCodexText(parsed);
    if (!text) return null;
    return {
      type: 'thought',
      content: { type: 'text', text },
      timestamp,
    };
  }

  if (type.startsWith('exec_command') || type.startsWith('patch_apply')) {
    const codexToolId = getCodexToolId(parsed);
    const status = getCodexToolStatus(type);
    const toolName = type.startsWith('patch_apply') ? 'apply_patch' : 'shell';

    if (status === 'running') {
      return {
        type: 'toolCall',
        toolCall: {
          id: codexToolId,
          name: toolName,
          input: extractCodexToolInput(parsed),
        },
        timestamp,
      };
    }

    const output = extractCodexText(parsed)
      || (type.startsWith('patch_apply') ? 'Patch applied' : undefined);

    return {
      type: 'toolUpdate',
      update: {
        id: codexToolId,
        status,
        output,
        error: status === 'failed' ? output : undefined,
      },
      timestamp,
    };
  }

  return null;
}

function parseCodexItemEvent(
  parsed: Record<string, unknown>,
  timestamp: number
): AcpEvent | null {
  const item = parsed.item;
  if (typeof item !== 'object' || item === null) {
    return null;
  }

  const codexItem = item as Record<string, unknown>;
  const itemType = typeof codexItem.type === 'string' ? codexItem.type : null;
  if (!itemType) {
    return null;
  }

  switch (itemType) {
    case 'agent_message': {
      const text = extractCodexText(codexItem);
      if (!text) return null;
      return {
        type: 'message',
        content: { type: 'text', text },
        timestamp,
      };
    }

    case 'agent_reasoning':
    case 'reasoning': {
      const text = extractCodexText(codexItem);
      if (!text) return null;
      return {
        type: 'thought',
        content: { type: 'text', text },
        timestamp,
      };
    }

    case 'command_execution': {
      const toolId = getCodexToolId(codexItem);
      const status = getCodexItemExecutionStatus(parsed.type as string, codexItem);

      if (status === 'running') {
        return {
          type: 'toolCall',
          toolCall: {
            id: toolId,
            name: 'shell',
            input: extractCodexToolInput(codexItem),
          },
          timestamp,
        };
      }

      const output = extractCodexCommandOutput(codexItem);
      return {
        type: 'toolUpdate',
        update: {
          id: toolId,
          status,
          output,
          error: status === 'failed' ? output : undefined,
        },
        timestamp,
      };
    }

    case 'file_change': {
      const toolId = getCodexToolId(codexItem);
      const status = getCodexItemLifecycleStatus(parsed.type as string, codexItem);

      if (status === 'running') {
        return {
          type: 'toolCall',
          toolCall: {
            id: toolId,
            name: 'file_change',
            input: extractCodexFileChangeInput(codexItem),
          },
          timestamp,
        };
      }

      const output = summarizeCodexFileChanges(codexItem);
      return {
        type: 'toolUpdate',
        update: {
          id: toolId,
          status,
          output,
          error: status === 'failed' ? output : undefined,
        },
        timestamp,
      };
    }

    default:
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
 * Parse a Claude Code stream-json assistant message into ACP events.
 *
 * Claude Code stream-json format (--output-format stream-json --verbose):
 *   {"type":"assistant","message":{"id":"msg_...","role":"assistant","content":[
 *     {"type":"text","text":"Hello!"},
 *     {"type":"thinking","thinking":"Let me think..."},
 *     {"type":"tool_use","id":"toolu_...","name":"Read","input":{...}}
 *   ]}}
 *
 * We extract the FIRST meaningful content block and return the appropriate ACP event.
 * Multiple content blocks in a single message are handled by Claude sending multiple lines.
 */
function parseClaudeStreamJsonAssistant(
  parsed: Record<string, unknown>,
  timestamp: number
): AcpEvent | null {
  const message = parsed.message as Record<string, unknown> | undefined;
  if (!message) return null;

  const contentBlocks = message.content;
  if (!Array.isArray(contentBlocks) || contentBlocks.length === 0) {
    // Some assistant messages have string content
    if (typeof message.content === 'string' && message.content) {
      return {
        type: 'message',
        content: { type: 'text', text: message.content },
        timestamp,
      };
    }
    return null;
  }

  // Process content blocks - emit the most significant one as the ACP event
  // Priority: tool_use > thinking > text (tool calls are most actionable)
  let textEvent: AcpEvent | null = null;
  let thinkingEvent: AcpEvent | null = null;

  for (const block of contentBlocks) {
    if (!block || typeof block !== 'object') continue;

    switch (block.type) {
      case 'tool_use':
        // Tool use takes priority - return immediately
        return {
          type: 'toolCall',
          toolCall: {
            id: block.id || '',
            name: block.name || '',
            input: block.input || {},
          },
          timestamp,
        };

      case 'thinking':
        thinkingEvent = {
          type: 'thought',
          content: { type: 'text', text: block.thinking || '' },
          timestamp,
        };
        break;

      case 'text':
        if (block.text) {
          textEvent = {
            type: 'message',
            content: { type: 'text', text: block.text },
            timestamp,
          };
        }
        break;
    }
  }

  // Return thinking if present (since text + thinking usually means the thinking is more interesting)
  // Otherwise return text
  return thinkingEvent || textEvent;
}

/**
 * Parse a Claude Code stream-json tool result into an ACP toolUpdate event.
 *
 * Format: {"type":"tool","content":[{"type":"tool_result","tool_use_id":"toolu_...","content":"..."}]}
 */
function parseClaudeStreamJsonToolResult(
  parsed: Record<string, unknown>,
  timestamp: number
): AcpEvent | null {
  const contentBlocks = parsed.content;
  if (!Array.isArray(contentBlocks) || contentBlocks.length === 0) return null;

  const block = contentBlocks[0];
  if (!block || typeof block !== 'object') return null;

  const toolUseId = block.tool_use_id || block.toolUseId || '';
  const content = block.content;
  const isError = block.is_error === true;

  return {
    type: 'toolUpdate',
    update: {
      id: toolUseId,
      status: isError ? 'failed' : 'completed',
      output: typeof content === 'string' ? content : JSON.stringify(content),
      error: isError ? (typeof content === 'string' ? content : undefined) : undefined,
    },
    timestamp,
  };
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

function extractCodexText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => extractCodexText(item))
      .filter(Boolean)
      .join('');
  }

  if (typeof value !== 'object' || value === null) {
    return '';
  }

  const record = value as Record<string, unknown>;

  const directKeys = [
    'text',
    'delta',
    'message',
    'content',
    'output',
    'aggregated_output',
    'stderr',
    'stdout',
    'error',
  ] as const;

  for (const key of directKeys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate) {
      return candidate;
    }
  }

  if (record.error && typeof record.error === 'object') {
    const nested = extractCodexText(record.error);
    if (nested) return nested;
  }

  if (record.last_message && typeof record.last_message === 'object') {
    const nested = extractCodexText(record.last_message);
    if (nested) return nested;
  }

  if (record.item && typeof record.item === 'object') {
    const nested = extractCodexText(record.item);
    if (nested) return nested;
  }

  if (record.patch && typeof record.patch === 'object') {
    const nested = extractCodexText(record.patch);
    if (nested) return nested;
  }

  return '';
}

function extractCodexToolInput(parsed: Record<string, unknown>): Record<string, unknown> {
  const input: Record<string, unknown> = {};

  if (typeof parsed.command === 'string') {
    input.command = parsed.command;
  }

  if (Array.isArray(parsed.argv)) {
    input.argv = parsed.argv;
  }

  if (typeof parsed.cwd === 'string') {
    input.cwd = parsed.cwd;
  }

  if (typeof parsed.path === 'string') {
    input.path = parsed.path;
  }

  if (typeof parsed.file_path === 'string') {
    input.file_path = parsed.file_path;
  }

  if (parsed.patch) {
    input.patch = parsed.patch;
  }

  return input;
}

function extractCodexFileChangeInput(parsed: Record<string, unknown>): Record<string, unknown> {
  const changes = Array.isArray(parsed.changes) ? parsed.changes : [];
  return changes.length > 0 ? { changes } : {};
}

function getCodexToolId(parsed: Record<string, unknown>): string {
  const toolId = parsed.call_id || parsed.command_id || parsed.id || parsed.event_id;
  return typeof toolId === 'string' ? toolId : 'codex-tool';
}

function getCodexToolStatus(type: string): ToolCallUpdate['status'] {
  if (type.endsWith('.begin') || type.endsWith('.started')) {
    return 'running';
  }

  if (type.endsWith('.failed')) {
    return 'failed';
  }

  return 'completed';
}

function getCodexItemLifecycleStatus(
  eventType: string,
  item: Record<string, unknown>
): ToolCallUpdate['status'] {
  if (eventType === 'item.started' || item.status === 'in_progress') {
    return 'running';
  }

  if (item.status === 'failed') {
    return 'failed';
  }

  return 'completed';
}

function getCodexItemExecutionStatus(
  eventType: string,
  item: Record<string, unknown>
): ToolCallUpdate['status'] {
  if (eventType === 'item.started' || item.status === 'in_progress') {
    return 'running';
  }

  const exitCode = typeof item.exit_code === 'number' ? item.exit_code : null;
  if (item.status === 'failed' || (exitCode !== null && exitCode !== 0)) {
    return 'failed';
  }

  return 'completed';
}

function extractCodexCommandOutput(item: Record<string, unknown>): string {
  const output = extractCodexText(item);
  if (output) {
    return output;
  }

  const exitCode = typeof item.exit_code === 'number' ? item.exit_code : null;
  if (exitCode !== null) {
    return exitCode === 0
      ? 'Command completed (exit code 0)'
      : `Command failed (exit code ${exitCode})`;
  }

  return extractCodexCommandSummary(item) || 'Command completed';
}

function extractCodexCommandSummary(item: Record<string, unknown>): string {
  if (typeof item.command === 'string' && item.command) {
    return item.command;
  }

  if (Array.isArray(item.argv) && item.argv.length > 0) {
    return item.argv.map((part) => String(part)).join(' ');
  }

  return '';
}

function summarizeCodexFileChanges(item: Record<string, unknown>): string {
  if (!Array.isArray(item.changes) || item.changes.length === 0) {
    return 'Files changed';
  }

  const lines = item.changes
    .map((change) => {
      if (typeof change !== 'object' || change === null) {
        return null;
      }

      const record = change as Record<string, unknown>;
      const path = typeof record.path === 'string' ? record.path : 'unknown file';
      const kind = typeof record.kind === 'string' ? record.kind : 'update';
      return `${kind}: ${path}`;
    })
    .filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join('\n') : 'Files changed';
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
