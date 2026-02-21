import type { ChildProcess } from 'node:child_process';
import type { AcpEvent } from '../acp/types.js';
import type { MsgStore } from '../streaming/msg-store.js';
import type { TypedEventEmitter } from '../streaming/event-emitter.js';
import type { ApprovalService, ApprovalServiceMode } from '../acp/approval-service.js';
import type { ApprovalRequest, ImageData } from '../acp/control-protocol.js';

// Re-export ImageData for convenience
export type { ImageData } from '../acp/control-protocol.js';

/**
 * Events emitted by a spawned session
 */
export interface SessionEvents {
  event: (event: AcpEvent) => void;
  sessionId: (sessionId: string) => void;
  stdout: (data: string) => void;
  stderr: (data: string) => void;
  exit: (code: number | null, signal: NodeJS.Signals | null) => void;
  error: (error: Error) => void;
  approvalRequest: (request: ApprovalRequest) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: (...args: any[]) => void;
}

/**
 * Availability status for a connector
 */
export type AvailabilityStatus = 'available' | 'not_installed' | 'not_configured' | 'error';

/**
 * Information about connector availability
 */
export interface AvailabilityInfo {
  status: AvailabilityStatus;
  message?: string;
  version?: string;
  path?: string;
}

/**
 * Configuration for a connector
 */
export interface ConnectorConfig {
  /** Custom command to use instead of default */
  command?: string;

  /** Custom arguments to append */
  args?: string[];

  /** Environment variables to set */
  env?: Record<string, string>;

  /** Model to use (if applicable) */
  model?: string;

  /** Mode to use (if applicable) */
  mode?: string;
}

/** Agent mode type - controls agent behavior */
export type AgentMode = 'default' | 'plan';

/**
 * Options for spawning a session
 */
export interface SpawnOptions {
  /** Working directory for the agent */
  workDir: string;

  /** Initial prompt to send */
  prompt: string;

  /** Session ID for follow-up (resume existing session) */
  sessionId?: string;

  /** VibeX internal session ID - used by Vibe for history tracking */
  vibeXSessionId?: string;

  /** Conversation history for context injection (used by Vibe when resuming) */
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;

  /** MCP configuration to apply */
  mcpConfig?: McpConfig;

  /** Additional environment variables */
  env?: Record<string, string>;

  /** Timeout for process startup in ms */
  startupTimeout?: number;

  /** Enable interactive approval flow for tool calls (overrides connector config) */
  enableApprovals?: boolean;

  /** Approval mode: 'manual' requires user approval, 'auto' auto-approves all */
  approvalMode?: ApprovalServiceMode;

  /** Agent mode: 'default' for normal operation, 'plan' for read-only planning mode */
  agentMode?: AgentMode;
}

/**
 * MCP server configuration
 */
export interface McpConfig {
  servers?: Record<string, McpServerConfig>;
}

/**
 * Individual MCP server configuration
 */
export interface McpServerConfig {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

/**
 * A spawned session with an AI agent
 */
export interface SpawnedSession {
  /** Unique ID for this session */
  id: string;

  /** Session ID from the agent (may differ from id) */
  agentSessionId: string | null;

  /** The connector type that created this session */
  connectorType: string;

  /** The underlying child process */
  process: ChildProcess;

  /** Message store for logs and events */
  msgStore: MsgStore;

  /** Event emitter for session events */
  events: TypedEventEmitter<SessionEvents>;

  /** Working directory */
  workDir: string;

  /** Approval service for interactive mode (optional) */
  approvalService?: ApprovalService;

  /** Send input to the agent with optional images */
  sendInput(input: string, images?: ImageData[]): void;

  /** Interrupt the agent (graceful stop) */
  interrupt(): Promise<void>;

  /** Kill the agent (force stop) */
  kill(): Promise<void>;

  /** Wait for the session to complete */
  waitForExit(): Promise<{ code: number | null; signal: NodeJS.Signals | null }>;

  /** Async iterator for ACP events */
  [Symbol.asyncIterator](): AsyncGenerator<AcpEvent, void, undefined>;
}

/**
 * Base interface for AI agent connectors
 *
 * Connectors implement this interface to provide a unified way to:
 * - Check agent availability
 * - Spawn new sessions
 * - Resume existing sessions (follow-ups)
 * - Get MCP configuration paths
 */
export interface BaseConnector {
  /** Unique name for this connector */
  readonly name: string;

  /** Display name for UI */
  readonly displayName: string;

  /**
   * Check if the agent is available and properly configured
   */
  checkAvailability(): Promise<AvailabilityInfo>;

  /**
   * Spawn a new session with the agent
   */
  spawn(options: SpawnOptions): Promise<SpawnedSession>;

  /**
   * Spawn a follow-up session (resume existing session)
   */
  spawnFollowUp(options: SpawnOptions & { sessionId: string }): Promise<SpawnedSession>;

  /**
   * Get the default MCP configuration path for this agent
   */
  getMcpConfigPath(): string | null;

  /**
   * Get setup instructions if the agent is not available
   */
  getSetupInstructions(): string;
}

/**
 * Abstract base class for connectors with common functionality
 */
export abstract class AbstractConnector implements BaseConnector {
  abstract readonly name: string;
  abstract readonly displayName: string;

  protected config: ConnectorConfig;

  constructor(config: ConnectorConfig = {}) {
    this.config = config;
  }

  abstract checkAvailability(): Promise<AvailabilityInfo>;
  abstract spawn(options: SpawnOptions): Promise<SpawnedSession>;
  abstract spawnFollowUp(options: SpawnOptions & { sessionId: string }): Promise<SpawnedSession>;

  getMcpConfigPath(): string | null {
    return null;
  }

  getSetupInstructions(): string {
    return `Install ${this.displayName} to use this connector.`;
  }

  /**
   * Merge config with spawn options
   */
  protected mergeEnv(
    spawnEnv?: Record<string, string>
  ): Record<string, string> {
    return {
      ...this.config.env,
      ...spawnEnv,
    };
  }
}

/**
 * Check if a command exists in PATH
 */
export async function commandExists(command: string): Promise<boolean> {
  const { execSync } = await import('node:child_process');
  try {
    // Use 'which' on Unix, 'where' on Windows
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${cmd} ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the version of a command
 */
export async function getCommandVersion(
  command: string,
  versionFlag = '--version'
): Promise<string | null> {
  const { execSync } = await import('node:child_process');
  try {
    const output = execSync(`${command} ${versionFlag}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    // Extract version number (first match of semver-like pattern)
    const match = output.match(/\d+\.\d+\.\d+/);
    return match ? match[0] : output.trim().slice(0, 50);
  } catch {
    return null;
  }
}

/**
 * Check if npx is available
 */
export async function npxExists(): Promise<boolean> {
  return commandExists('npx');
}
