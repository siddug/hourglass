/**
 * Vibe Protocol Peer
 *
 * Handles bidirectional ACP (Agent Communication Protocol) communication with Mistral Vibe.
 * Uses JSON-RPC 2.0 format with methods like:
 * - initialize
 * - session/new
 * - session/prompt
 * - session/setMode
 * - session/setModel
 * - cancel
 */

import { createInterface } from 'node:readline';
import { spawn, type ChildProcess } from 'node:child_process';
import { nanoid } from 'nanoid';
import type { Writable, Readable } from 'node:stream';
import { TypedEventEmitter } from '../streaming/event-emitter.js';
import { MsgStore } from '../streaming/msg-store.js';
import { ApprovalService } from './approval-service.js';
import type { AcpEvent } from './types.js';
import type { ApprovalStatus } from './control-protocol.js';

// Terminal management types
interface TerminalInfo {
  id: string;
  process: ChildProcess;
  output: string;
  exitCode: number | null;
  exited: boolean;
  toolCallId?: string; // Track which tool call this terminal belongs to
}

interface CreateTerminalParams {
  sessionId: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Array<{ name: string; value: string }>;
  outputByteLimit?: number;
}

// JSON-RPC types
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params: unknown;
}

// Vibe-specific types
interface SessionUpdateParams {
  sessionId: string;
  update: SessionUpdate;
}

interface SessionUpdate {
  sessionUpdate: string;
  content?: TextContent | ToolCallContent | unknown[];
  toolCallId?: string;
  toolName?: string;
  toolInput?: unknown;
  result?: unknown;
  isError?: boolean;
  allowed?: string;
  requestId?: string;
  // Additional fields from ACP spec
  title?: string;
  kind?: string;
  rawInput?: unknown;
  rawOutput?: unknown;
  status?: string;
}

interface TextContent {
  type: 'text';
  text: string;
}

interface ToolCallContent {
  type: 'tool_call';
  name: string;
  input: unknown;
}

interface RequestPermissionParams {
  sessionId: string;
  requestId: string;
  toolName: string;
  toolInput: unknown;
  allowedOutcomes: string[];
}

export interface VibeProtocolPeerEvents {
  event: (event: AcpEvent) => void;
  sessionId: (sessionId: string) => void;
  stdout: (data: string) => void;
  stderr: (data: string) => void;
  error: (error: Error) => void;
  close: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: (...args: any[]) => void;
}

export interface VibeProtocolPeerOptions {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  msgStore: MsgStore;
  approvalService: ApprovalService;
  cwd: string;
  autoApprove?: boolean;
  /** Pre-existing conversation history to inject (for session resumption) */
  conversationHistory?: ConversationMessage[];
}

/** A message in the conversation history */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Vibe Protocol Peer handles bidirectional communication with Mistral Vibe
 */
export class VibeProtocolPeer extends TypedEventEmitter<VibeProtocolPeerEvents> {
  private stdin: Writable;
  private msgStore: MsgStore;
  private approvalService: ApprovalService;
  private cwd: string;
  private autoApprove: boolean;
  private sessionId: string | null = null;
  private closed = false;
  private requestId = 0;
  private pendingRequests: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }> = new Map();
  private currentMessageText = '';
  private terminals: Map<string, TerminalInfo> = new Map();
  /** Conversation history for context preservation across process restarts */
  private conversationHistory: ConversationMessage[] = [];
  /** Track pending tool calls by ID to get tool info for permission requests */
  private pendingToolCalls: Map<string, {
    name: string;
    title?: string;
    kind?: string;
    input: unknown;
    rawInput?: string;
  }> = new Map();
  /** Track terminal IDs associated with each tool call for output retrieval */
  private toolCallTerminals: Map<string, string[]> = new Map();
  /** Store captured terminal output per tool call for final result */
  private toolCallOutputs: Map<string, string> = new Map();

  constructor(options: VibeProtocolPeerOptions) {
    super();
    this.stdin = options.stdin;
    this.msgStore = options.msgStore;
    this.approvalService = options.approvalService;
    this.cwd = options.cwd;
    this.autoApprove = options.autoApprove ?? false;
    // Initialize with pre-existing conversation history if provided (for session resumption)
    this.conversationHistory = options.conversationHistory || [];

    // Set up stdout reader
    const stdoutRl = createInterface({
      input: options.stdout,
      crlfDelay: Infinity,
    });

    stdoutRl.on('line', (line) => this.handleStdoutLine(line));
    stdoutRl.on('close', () => {
      console.log('[VibeProtocolPeer] stdout readline closed');
      this.handleClose();
    });

    // Set up stderr reader
    const stderrRl = createInterface({
      input: options.stderr,
      crlfDelay: Infinity,
    });

    stderrRl.on('line', (line) => {
      this.msgStore.pushStderr(line);
      this.emit('stderr', line);
    });

    stderrRl.on('close', () => {
      console.log('[VibeProtocolPeer] stderr readline closed');
    });
  }

  private handleStdoutLine(line: string): void {
    if (this.closed) return;

    const trimmed = line.trim();
    if (!trimmed) return;

    // Push raw line to stdout
    this.msgStore.pushStdout(trimmed);
    this.emit('stdout', trimmed);

    try {
      const msg = JSON.parse(trimmed);

      if (msg.jsonrpc === '2.0') {
        if ('id' in msg && msg.id !== undefined && 'method' in msg) {
          // Request from Vibe (e.g., createTerminal, readTextFile)
          console.log('[VibeProtocolPeer] Incoming request:', msg.method, 'id:', msg.id);
          this.handleIncomingRequest(msg as JsonRpcRequest);
        } else if ('id' in msg && msg.id !== undefined) {
          // Response to a request we sent
          this.handleResponse(msg as JsonRpcResponse);
        } else if ('method' in msg) {
          // Notification from server
          if (msg.method !== 'session/update') {
            console.log('[VibeProtocolPeer] Notification:', msg.method);
          }
          this.handleNotification(msg as JsonRpcNotification);
        }
      }
    } catch {
      // Not JSON, just emit as raw event
      this.emit('event', {
        type: 'other',
        rawType: 'raw',
        data: { line: trimmed },
        timestamp: Date.now(),
      });
    }
  }

  private handleResponse(msg: JsonRpcResponse): void {
    console.log('[VibeProtocolPeer] handleResponse id:', msg.id, 'error:', !!msg.error, 'result keys:', msg.result ? Object.keys(msg.result as object) : 'null');
    const pending = this.pendingRequests.get(msg.id);
    if (pending) {
      this.pendingRequests.delete(msg.id);
      if (msg.error) {
        console.log('[VibeProtocolPeer] Response error:', msg.error.message);
        pending.reject(new Error(`${msg.error.message}: ${JSON.stringify(msg.error.data)}`));
      } else {
        pending.resolve(msg.result);
      }
    } else {
      console.log('[VibeProtocolPeer] No pending request for id:', msg.id);
    }
  }

  /**
   * Handle incoming requests from Vibe (client-side capabilities)
   */
  private async handleIncomingRequest(msg: JsonRpcRequest): Promise<void> {
    const { id, method, params } = msg;

    try {
      let result: unknown;

      switch (method) {
        // Handle terminal operations - Vibe uses terminal/ prefix
        case 'createTerminal':
        case 'terminal/create':
          result = await this.handleTerminalCreate(params as CreateTerminalParams);
          break;
        case 'waitForTerminalExit':
        case 'terminal/wait_for_exit':
          result = await this.handleWaitForTerminalExit(params as { terminalId: string });
          break;
        case 'terminalOutput':
        case 'terminal/output':
          result = await this.handleTerminalOutput(params as { terminalId: string });
          break;
        case 'terminalRelease':
        case 'terminal/release':
          result = await this.handleTerminalRelease(params as { terminalId: string });
          break;
        // Handle file operations - Vibe uses both formats: with and without fs/ prefix
        case 'readTextFile':
        case 'fs/read_text_file':
          result = await this.handleReadTextFile(params as { path: string });
          break;
        case 'writeTextFile':
        case 'fs/write_text_file':
          result = await this.handleWriteTextFile(params as { path: string; content: string });
          break;
        // Handle permission requests - Vibe may send these as requests (with id) instead of notifications
        case 'session/request_permission':
        case 'session/requestPermission':
          result = await this.handleRequestPermissionAsRequest(id, params as RequestPermissionParams);
          return; // Don't send another response - handleRequestPermissionAsRequest handles it
        default:
          await this.sendJsonRpcError(id, -32601, `Method not found: ${method}`);
          return;
      }

      await this.sendJsonRpcResponse(id, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.sendJsonRpcError(id, -32000, message);
    }
  }

  /**
   * Handle permission request that came as a JSON-RPC request (with id)
   * Returns the approval outcome as the response
   *
   * Vibe's permission request structure:
   * {
   *   "options": [
   *     { "kind": "allow_once", "name": "Allow once", "optionId": "allow_once" },
   *     { "kind": "allow_always", "name": "Allow always", "optionId": "allow_always" },
   *     { "kind": "reject_once", "name": "Reject once", "optionId": "reject_once" }
   *   ],
   *   "sessionId": "...",
   *   "toolCall": { "toolCallId": "..." }
   * }
   *
   * Response format (discriminated union):
   * { "outcome": { "outcome": "selected", "optionId": "allow_once" } }
   * or
   * { "outcome": { "outcome": "cancelled" } }
   */
  private async handleRequestPermissionAsRequest(requestMsgId: number, params: unknown): Promise<void> {
    // Log the raw params to understand the structure
    console.log('[VibeProtocolPeer] Permission request params:', JSON.stringify(params));

    const p = params as Record<string, unknown>;

    // Extract Vibe's permission request structure
    const toolCall = p.toolCall as Record<string, unknown> | undefined;

    // Get the tool call ID for tracking
    const toolCallId = toolCall?.toolCallId as string ?? String(requestMsgId);

    // Look up the pending tool call info from our recent tool_call events
    // The tool name, kind, and input come from the session/update tool_call notification
    const pendingInfo = this.pendingToolCalls.get(toolCallId);
    const toolName = pendingInfo?.name ?? 'Tool Call';
    const toolInput = pendingInfo?.input ?? {};

    console.log('[VibeProtocolPeer] Permission request for tool:', toolName, 'toolCallId:', toolCallId, 'input:', JSON.stringify(toolInput));

    let optionId: string;

    if (this.autoApprove) {
      console.log('[VibeProtocolPeer] Auto-approving tool:', toolName);
      optionId = 'allow_once';
    } else {
      // Request approval from the service
      console.log('[VibeProtocolPeer] Requesting approval for tool:', toolName);
      const { status } = await this.approvalService.requestApproval(
        toolName,
        toolInput,
        toolCallId
      );
      // Map our status to Vibe's optionId
      optionId = status === 'approved' ? 'allow_once' : 'reject_once';
      console.log('[VibeProtocolPeer] Approval result:', optionId);
    }

    // Respond with Vibe's expected format (discriminated union)
    // { "outcome": { "outcome": "selected", "optionId": "allow_once" } }
    await this.sendJsonRpcResponse(requestMsgId, {
      outcome: {
        outcome: 'selected',
        optionId,
      },
    });
  }

  /**
   * Handle terminal/create - spawn command asynchronously, return terminalId
   * Output is retrieved via terminal/output, exit status via terminal/wait_for_exit
   */
  private async handleTerminalCreate(params: CreateTerminalParams): Promise<{ terminalId: string }> {
    const terminalId = nanoid(10);
    const { command, args = [], cwd, env = [], outputByteLimit } = params;

    console.log('[VibeProtocolPeer] terminal/create:', command, args.join(' '));

    // Build environment
    const processEnv = { ...process.env };
    for (const envVar of env) {
      processEnv[envVar.name] = envVar.value;
    }

    // Spawn the process
    const child = spawn(command, args, {
      cwd: cwd || this.cwd,
      env: processEnv,
      shell: true,
    });

    const maxBytes = outputByteLimit || 100000;
    const terminalInfo: TerminalInfo = {
      id: terminalId,
      process: child,
      output: '',
      exitCode: null,
      exited: false,
    };

    this.terminals.set(terminalId, terminalInfo);

    // Capture output from both stdout and stderr
    let totalBytes = 0;

    child.stdout?.on('data', (data: Buffer) => {
      if (totalBytes < maxBytes) {
        const chunk = data.toString();
        terminalInfo.output += chunk;
        totalBytes += data.length;
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      if (totalBytes < maxBytes) {
        const chunk = data.toString();
        terminalInfo.output += chunk;
        totalBytes += data.length;
      }
    });

    child.on('exit', (code) => {
      terminalInfo.exitCode = code;
      terminalInfo.exited = true;
      console.log('[VibeProtocolPeer] Terminal', terminalId, 'exited with code:', code, 'output length:', terminalInfo.output.length);
    });

    child.on('error', (err) => {
      console.error('[VibeProtocolPeer] Terminal', terminalId, 'error:', err.message);
      terminalInfo.output += `\nError: ${err.message}`;
      terminalInfo.exited = true;
      terminalInfo.exitCode = 1;
    });

    // Return the terminal ID per ACP spec
    return { terminalId };
  }

  /**
   * Handle terminal/output - return output captured so far
   * exitStatus must be an object with exitCode and signal, not a number
   */
  private async handleTerminalOutput(params: { terminalId: string }): Promise<{
    output: string;
    truncated: boolean;
    exitStatus?: { exitCode: number | null; signal: string | null };
  }> {
    const terminal = this.terminals.get(params.terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${params.terminalId}`);
    }

    console.log('[VibeProtocolPeer] terminal/output for', params.terminalId, 'output length:', terminal.output.length, 'exited:', terminal.exited, 'toolCallId:', terminal.toolCallId);

    // Store terminal output for the associated tool call
    // This is retrieved later when tool_call_update with status: completed arrives
    if (terminal.output && terminal.toolCallId) {
      const existingOutput = this.toolCallOutputs.get(terminal.toolCallId) || '';
      this.toolCallOutputs.set(terminal.toolCallId, existingOutput + terminal.output);
    }

    // Emit terminal output event so UI can capture it
    // This is the actual output that flows through JSON-RPC, not session updates
    if (terminal.output) {
      this.emit('event', {
        type: 'terminalOutput',
        terminalId: params.terminalId,
        toolCallId: terminal.toolCallId,
        output: terminal.output,
        exited: terminal.exited,
        exitCode: terminal.exitCode,
        timestamp: Date.now(),
      });
    }

    return {
      output: terminal.output,
      truncated: false, // We track byte limits during capture
      exitStatus: terminal.exited ? { exitCode: terminal.exitCode, signal: null } : undefined,
    };
  }

  /**
   * Handle terminal/release - clean up terminal resources
   */
  private async handleTerminalRelease(params: { terminalId: string }): Promise<void> {
    const terminal = this.terminals.get(params.terminalId);
    if (terminal) {
      console.log('[VibeProtocolPeer] terminal/release for', params.terminalId);
      // Kill process if still running
      if (!terminal.exited) {
        terminal.process.kill();
      }
      // Clean up
      this.terminals.delete(params.terminalId);
    }
  }

  /**
   * Handle terminal/wait_for_exit - wait for command to complete and return exit status
   * Output should be retrieved separately via terminal/output
   */
  private async handleWaitForTerminalExit(params: { terminalId: string }): Promise<{ exitCode: number | null; signal: string | null }> {
    const terminal = this.terminals.get(params.terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${params.terminalId}`);
    }

    // Wait for process to exit if it hasn't already
    if (!terminal.exited) {
      await new Promise<void>((resolve) => {
        terminal.process.on('exit', () => resolve());
      });
    }

    console.log('[VibeProtocolPeer] terminal/wait_for_exit for', params.terminalId, 'exitCode:', terminal.exitCode);

    return {
      exitCode: terminal.exitCode,
      signal: null, // We track exit codes, not signals currently
    };
  }

  private async handleReadTextFile(params: { path: string }): Promise<{ content: string }> {
    const { readFile } = await import('node:fs/promises');
    const { resolve, isAbsolute } = await import('node:path');

    const filePath = isAbsolute(params.path) ? params.path : resolve(this.cwd, params.path);
    const content = await readFile(filePath, 'utf-8');

    // Emit file read event for UI tracking
    this.emit('event', {
      type: 'fileRead',
      path: filePath,
      contentLength: content.length,
      timestamp: Date.now(),
    });

    return { content };
  }

  private async handleWriteTextFile(params: { path: string; content: string }): Promise<void> {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { resolve, isAbsolute, dirname } = await import('node:path');

    const filePath = isAbsolute(params.path) ? params.path : resolve(this.cwd, params.path);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, params.content, 'utf-8');

    // Emit file write event for UI tracking
    this.emit('event', {
      type: 'fileWrite',
      path: filePath,
      contentLength: params.content.length,
      timestamp: Date.now(),
    });
  }

  private async sendJsonRpcResponse(id: number, result: unknown): Promise<void> {
    await this.sendJson({
      jsonrpc: '2.0',
      id,
      result,
    });
  }

  private async sendJsonRpcError(id: number, code: number, message: string): Promise<void> {
    await this.sendJson({
      jsonrpc: '2.0',
      id,
      error: { code, message },
    });
  }

  private handleNotification(msg: JsonRpcNotification): void {
    if (msg.method === 'session/update') {
      this.handleSessionUpdate(msg.params as SessionUpdateParams);
    } else if (msg.method === 'session/requestPermission') {
      this.handleRequestPermission(msg.params as RequestPermissionParams);
    }
  }

  private handleSessionUpdate(params: SessionUpdateParams): void {
    const { update } = params;

    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
        if (update.content && !Array.isArray(update.content) && update.content.type === 'text') {
          this.currentMessageText += update.content.text;
          // NOTE: We don't emit a 'message' event here because the raw stdout
          // already contains the message chunk and is stored/streamed separately.
          // Emitting would cause duplicate messages in the UI.
        }
        break;

      case 'tool_call':
        // Track the tool call for permission requests (which come separately)
        // Vibe provides rich info: title, kind, rawInput, content, locations
        if (update.toolCallId) {
          // Parse rawInput if it's a JSON string
          let parsedInput = update.toolInput;
          if (update.rawInput && typeof update.rawInput === 'string') {
            try {
              parsedInput = JSON.parse(update.rawInput);
            } catch {
              parsedInput = { raw: update.rawInput };
            }
          }

          this.pendingToolCalls.set(update.toolCallId, {
            name: update.title || update.toolName || 'Tool Call',
            title: update.title,
            kind: update.kind,
            input: parsedInput,
            rawInput: typeof update.rawInput === 'string' ? update.rawInput : undefined,
          });
        }
        // NOTE: We don't emit a 'toolCall' event here because the raw stdout
        // already contains the tool_call info with better details (rawInput).
        // The UI parses the stdout directly for tool call display.
        break;

      case 'tool_call_update':
        // Tool call status update (in_progress, completed, etc.)
        // May contain content like terminal references
        {
          const toolCallId = update.toolCallId || '';
          let outputContent: unknown;

          // If content is provided, extract it and track terminal associations
          // Note: ACP Terminal content only has terminalId, we need to look up actual output
          if (update.content && Array.isArray(update.content)) {
            const contentParts = (update.content as Array<{ type: string; terminalId?: string; text?: string }>).map((c) => {
              if (c.type === 'terminal' && c.terminalId) {
                // Track this terminal as belonging to this tool call
                if (toolCallId) {
                  const existingTerminals = this.toolCallTerminals.get(toolCallId) || [];
                  if (!existingTerminals.includes(c.terminalId)) {
                    existingTerminals.push(c.terminalId);
                    this.toolCallTerminals.set(toolCallId, existingTerminals);
                  }
                  // Also mark the terminal with its tool call ID
                  const terminal = this.terminals.get(c.terminalId);
                  if (terminal) {
                    terminal.toolCallId = toolCallId;
                  }
                }
                // Look up actual terminal output from our terminals Map
                const terminal = this.terminals.get(c.terminalId);
                if (terminal && terminal.output) {
                  return terminal.output;
                }
                return `[Terminal ${c.terminalId}]`;
              } else if (c.type === 'text') {
                return c.text || '';
              } else if (c.type === 'content') {
                // Handle nested content blocks
                return JSON.stringify(c);
              }
              return JSON.stringify(c);
            });
            const combinedContent = contentParts.filter(p => p).join('\n');
            if (combinedContent) {
              outputContent = combinedContent;
            }
          }

          // Also check rawOutput field which may contain the result
          if (update.rawOutput !== undefined) {
            outputContent = typeof update.rawOutput === 'string'
              ? update.rawOutput
              : JSON.stringify(update.rawOutput);
          }

          // Map status string to ToolCallUpdate status
          const statusStr = (update.status as string) || 'in_progress';

          // If status is completed and we don't have content, look up stored terminal output
          if (statusStr === 'completed' && !outputContent && toolCallId) {
            const storedOutput = this.toolCallOutputs.get(toolCallId);
            if (storedOutput) {
              outputContent = storedOutput;
            } else {
              // Try to get output from associated terminals
              const terminalIds = this.toolCallTerminals.get(toolCallId);
              if (terminalIds) {
                const outputs = terminalIds
                  .map(tid => this.terminals.get(tid)?.output)
                  .filter(o => o)
                  .join('\n');
                if (outputs) {
                  outputContent = outputs;
                }
              }
            }
            // Clean up tracking for this tool call
            this.toolCallTerminals.delete(toolCallId);
            this.toolCallOutputs.delete(toolCallId);
          }

          const mappedStatus: 'running' | 'completed' | 'failed' =
            statusStr === 'completed' ? 'completed' :
            statusStr === 'failed' ? 'failed' : 'running';

          this.emit('event', {
            type: 'toolUpdate',
            timestamp: Date.now(),
            update: {
              id: toolCallId,
              status: mappedStatus,
              output: outputContent,
            },
          });
        }
        break;

      case 'tool_result':
        // Clean up the pending tool call tracking
        if (update.toolCallId) {
          this.pendingToolCalls.delete(update.toolCallId);
        }
        this.emit('event', {
          type: 'toolUpdate',
          timestamp: Date.now(),
          update: {
            id: update.toolCallId || '',
            status: update.isError ? 'failed' : 'completed',
            output: typeof update.result === 'string' ? update.result : JSON.stringify(update.result),
            error: update.isError ? (typeof update.result === 'string' ? update.result : JSON.stringify(update.result)) : undefined,
          },
        });
        break;

      case 'permission_response':
        // Permission was handled, emit info
        this.emit('event', {
          type: 'approvalResponse',
          timestamp: Date.now(),
          response: {
            toolCallId: update.toolCallId || '',
            status: update.allowed === 'allow' ? 'approved' : 'denied',
          },
        });
        break;

      default:
        // Unknown update type, emit as other
        this.emit('event', {
          type: 'other',
          rawType: update.sessionUpdate,
          data: update,
          timestamp: Date.now(),
        });
    }
  }

  private async handleRequestPermission(params: RequestPermissionParams): Promise<void> {
    const { requestId, toolName, toolInput } = params;
    console.log('[VibeProtocolPeer] Permission request for tool:', toolName, 'requestId:', requestId);

    if (this.autoApprove) {
      // Auto-approve
      console.log('[VibeProtocolPeer] Auto-approving tool:', toolName);
      await this.sendPermissionResponse(requestId, 'allow');
      return;
    }

    // Request approval from the service
    console.log('[VibeProtocolPeer] Requesting approval for tool:', toolName);
    const { status } = await this.approvalService.requestApproval(
      toolName,
      toolInput,
      requestId
    );

    const allowed = status === 'approved' ? 'allow' : 'deny';
    console.log('[VibeProtocolPeer] Approval result:', allowed);
    await this.sendPermissionResponse(requestId, allowed);
  }

  private async sendPermissionResponse(requestId: string, outcome: string): Promise<void> {
    const msg: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.nextRequestId(),
      method: 'session/permissionResponse',
      params: {
        sessionId: this.sessionId,
        requestId,
        outcome,
      },
    };
    await this.sendJson(msg);
  }

  private nextRequestId(): number {
    return ++this.requestId;
  }

  private async sendRequest(method: string, params: unknown): Promise<unknown> {
    const id = this.nextRequestId();
    const msg: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.sendJson(msg).catch(reject);
    });
  }

  private async sendJson(data: unknown): Promise<void> {
    if (this.closed) {
      console.log('[VibeProtocolPeer] sendJson called but peer is closed, data:', JSON.stringify(data).substring(0, 100));
      throw new Error('VibeProtocolPeer is closed');
    }

    const json = JSON.stringify(data);
    console.log('[VibeProtocolPeer] sendJson:', json.substring(0, 150));
    return new Promise((resolve, reject) => {
      this.stdin.write(json + '\n', (error) => {
        if (error) {
          console.log('[VibeProtocolPeer] sendJson write error:', error.message);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Initialize the ACP protocol
   */
  async initialize(): Promise<unknown> {
    const result = await this.sendRequest('initialize', {
      protocolVersion: 1,
      // Vibe expects clientCapabilities (not capabilities)
      clientCapabilities: {
        // Enable terminal/bash support - we'll handle createTerminal requests
        terminal: true,
        // Enable filesystem support
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
      },
      // Send client info to help Vibe understand our capabilities
      clientInfo: {
        name: 'hourglass',
        version: '0.1.0',
      },
    });
    return result;
  }

  /**
   * Create a new session
   */
  async newSession(): Promise<string> {
    const result = await this.sendRequest('session/new', {
      cwd: this.cwd,
      mcpServers: [],
    }) as { sessionId: string };

    this.sessionId = result.sessionId;
    this.emit('sessionId', this.sessionId);
    this.msgStore.pushSessionId(this.sessionId);

    // Emit session start event
    this.emit('event', {
      type: 'sessionStart',
      sessionId: this.sessionId,
      timestamp: Date.now(),
    });

    return this.sessionId;
  }

  /**
   * Send a prompt to the session
   */
  async sendPrompt(prompt: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No session ID - call newSession first');
    }

    console.log('[VibeProtocolPeer] sendPrompt called, sessionId:', this.sessionId, 'closed:', this.closed);
    this.currentMessageText = '';

    // Add user message to conversation history
    this.conversationHistory.push({ role: 'user', content: prompt });

    // NOTE: We don't push user messages to MsgStore or emit events here
    // because the UI already shows the user message via process.prompt in the turn header.
    // Pushing/emitting would cause duplicate display.

    const result = await this.sendRequest('session/prompt', {
      sessionId: this.sessionId,
      prompt: [{ type: 'text', text: prompt }],
    }) as { stopReason: string };

    // Add assistant response to conversation history
    if (this.currentMessageText) {
      this.conversationHistory.push({ role: 'assistant', content: this.currentMessageText });
    }

    console.log('[VibeProtocolPeer] sendPrompt completed, stopReason:', result.stopReason, 'closed:', this.closed, 'history length:', this.conversationHistory.length);

    // Emit done event with the accumulated message text so UI can display it
    this.emit('event', {
      type: 'done',
      reason: result.stopReason || 'completed',
      result: this.currentMessageText || undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Set session mode
   */
  async setMode(mode: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No session ID - call newSession first');
    }

    await this.sendRequest('session/setMode', {
      sessionId: this.sessionId,
      modeId: mode,
    });
  }

  /**
   * Cancel the current operation
   */
  async cancel(): Promise<void> {
    if (!this.sessionId) return;

    const msg: JsonRpcNotification = {
      jsonrpc: '2.0',
      method: 'cancel',
      params: { sessionId: this.sessionId },
    };
    await this.sendJson(msg);
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get the conversation history for context preservation
   */
  getConversationHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  private handleClose(): void {
    console.log('[VibeProtocolPeer] handleClose called, already closed:', this.closed);
    if (this.closed) return;
    this.closed = true;

    console.log('[VibeProtocolPeer] Closing peer, pending requests:', this.pendingRequests.size);

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

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
 * Create a new Vibe protocol peer
 */
export function createVibeProtocolPeer(options: VibeProtocolPeerOptions): VibeProtocolPeer {
  return new VibeProtocolPeer(options);
}
