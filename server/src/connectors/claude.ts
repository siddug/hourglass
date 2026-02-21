import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { nanoid } from 'nanoid';
import {
  AbstractConnector,
  type AgentMode,
  type AvailabilityInfo,
  type ConnectorConfig,
  type SpawnOptions,
  type SpawnedSession,
  type SessionEvents,
  npxExists,
  getCommandVersion,
} from './base.js';
import { AcpHarness, type SpawnedProcess } from '../acp/harness.js';
import { ApprovalService } from '../acp/approval-service.js';
import { TypedEventEmitter } from '../streaming/event-emitter.js';
import type { AcpEvent } from '../acp/types.js';
import type { ApprovalRequest, PermissionMode } from '../acp/control-protocol.js';

/**
 * Claude Code specific configuration
 */
export interface ClaudeConnectorConfig extends ConnectorConfig {
  /** NPX package to use (default: @anthropic-ai/claude-code) */
  package?: string;

  /** Package version (default: latest) */
  version?: string;

  /** Use dangerously skip permissions flag (ignored when enableApprovals is true) */
  dangerouslySkipPermissions?: boolean;

  /** Enable interactive approval flow for tool calls */
  enableApprovals?: boolean;

  /** Permission mode for approval flow */
  permissionMode?: PermissionMode;
}

/**
 * Claude Code Connector
 *
 * Implements the BaseConnector interface for Claude Code (Anthropic's CLI).
 * Spawns Claude Code via npx and manages the ACP communication.
 */
export class ClaudeConnector extends AbstractConnector {
  readonly name = 'claude';
  readonly displayName = 'Claude Code';

  private claudeConfig: ClaudeConnectorConfig;
  private harness: AcpHarness;

  constructor(config: ClaudeConnectorConfig = {}) {
    super(config);
    this.claudeConfig = config;
    this.harness = new AcpHarness({
      sessionNamespace: 'claude_sessions',
      model: config.model,
      mode: config.mode,
    });
  }

  async checkAvailability(): Promise<AvailabilityInfo> {
    // Check if npx is available
    if (!(await npxExists())) {
      return {
        status: 'not_installed',
        message: 'npx is not available. Please install Node.js.',
      };
    }

    // Try to get Claude Code version
    const pkg = this.getPackageName();
    try {
      const version = await getCommandVersion('npx', `-y ${pkg} --version`);
      if (version) {
        return {
          status: 'available',
          version,
          path: `npx ${pkg}`,
        };
      }
    } catch {
      // Continue to check if it's installable
    }

    // Assume available since npx can install on-demand
    return {
      status: 'available',
      message: 'Claude Code will be installed on first run via npx',
      path: `npx ${pkg}`,
    };
  }

  async spawn(options: SpawnOptions): Promise<SpawnedSession> {
    const { workDir, prompt, env, startupTimeout, enableApprovals, agentMode } = options;

    const command = this.claudeConfig.command || 'npx';
    // Use enableApprovals from options if provided, otherwise fall back to config
    const useInteractive = enableApprovals ?? this.claudeConfig.enableApprovals ?? false;
    const args = this.buildArgs(options, undefined, useInteractive, agentMode);

    // Create approval service for interactive mode
    const approvalService = useInteractive ? new ApprovalService() : undefined;

    const spawned = await this.harness.spawn({
      cwd: workDir,
      command,
      args,
      env: this.mergeEnv(env),
      // In interactive mode, prompt is sent via stdin after spawn
      prompt: useInteractive ? prompt : undefined,
      startupTimeout,
      interactive: useInteractive,
      approvalService,
    });

    return this.wrapSpawnedProcess(spawned, workDir, approvalService);
  }

  async spawnFollowUp(
    options: SpawnOptions & { sessionId: string }
  ): Promise<SpawnedSession> {
    const { workDir, prompt, sessionId, env, startupTimeout, enableApprovals, agentMode } = options;

    const command = this.claudeConfig.command || 'npx';
    // Use enableApprovals from options if provided, otherwise fall back to config
    const useInteractive = enableApprovals ?? this.claudeConfig.enableApprovals ?? false;
    const args = this.buildArgs(options, sessionId, useInteractive, agentMode);

    // Create approval service for interactive mode
    const approvalService = useInteractive ? new ApprovalService() : undefined;

    const spawned = await this.harness.spawnFollowUp({
      cwd: workDir,
      command,
      args,
      env: this.mergeEnv(env),
      // In interactive mode, prompt is sent via stdin after spawn
      prompt: useInteractive ? prompt : undefined,
      sessionId,
      startupTimeout,
      interactive: useInteractive,
      approvalService,
    });

    return this.wrapSpawnedProcess(spawned, workDir, approvalService);
  }

  getMcpConfigPath(): string | null {
    // Claude Code uses ~/.claude/claude_desktop_config.json or similar
    const configPaths = [
      join(homedir(), '.claude', 'claude_desktop_config.json'),
      join(homedir(), '.config', 'claude', 'config.json'),
    ];

    for (const path of configPaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    return null;
  }

  getSetupInstructions(): string {
    return `
Claude Code Setup Instructions:

1. Ensure Node.js (v18+) is installed
2. Run: npx @anthropic-ai/claude-code --help
3. Follow the authentication prompts

For more information, visit: https://docs.anthropic.com/claude-code
    `.trim();
  }

  /**
   * Get the npx package name
   */
  private getPackageName(): string {
    const pkg = this.claudeConfig.package || '@anthropic-ai/claude-code';
    const version = this.claudeConfig.version;
    return version ? `${pkg}@${version}` : pkg;
  }

  /**
   * Build command arguments
   *
   * Note: agentMode is no longer used here - it's now handled via prompt prepending.
   * Plan mode and other modes are implemented by modifying the prompt text, not CLI flags.
   */
  private buildArgs(options: SpawnOptions, sessionId?: string, interactive?: boolean, _agentMode?: AgentMode): string[] {
    const args: string[] = ['-y', this.getPackageName()];

    if (interactive) {
      // Interactive mode: full bidirectional communication via control protocol
      // Based on Rust implementation in vibe-kanban
      args.push('-p'); // Primary mode flag
      args.push('--permission-prompt-tool=stdio'); // Routes permission prompts through stdio
      // Always use bypassPermissions - agent mode is now handled via prompt prepending
      args.push('--permission-mode=bypassPermissions');
      args.push('--verbose');
      args.push('--output-format=stream-json');
      args.push('--input-format=stream-json'); // Required for stdin JSON input
      // Note: We don't use --include-partial-messages as it causes duplicate/fragmented output
      // Prompt will be sent via stdin using the control protocol after initialization
    } else {
      // Print mode: one-way output, no approval flow
      args.push('--print');
      args.push('--output-format', 'stream-json');
      args.push('--verbose');
      // Note: We don't use --include-partial-messages as it causes duplicate/fragmented output

      // Non-interactive mode: skip permissions (no approval possible)
      if (this.claudeConfig.dangerouslySkipPermissions !== false) {
        args.push('--dangerously-skip-permissions');
      }

      // Add the prompt as the final argument (only in print mode)
      if (options.prompt) {
        args.push(options.prompt);
      }
    }

    // Add session resume if provided
    if (sessionId) {
      args.push('--resume', sessionId);
    }

    // Add model if specified
    if (this.claudeConfig.model) {
      args.push('--model', this.claudeConfig.model);
    }

    // Add any custom args from config
    if (this.claudeConfig.args) {
      args.push(...this.claudeConfig.args);
    }

    return args;
  }

  /**
   * Wrap a SpawnedProcess into a SpawnedSession
   */
  private wrapSpawnedProcess(
    spawned: SpawnedProcess,
    workDir: string,
    approvalService?: ApprovalService
  ): SpawnedSession {
    // Create a new event emitter with SessionEvents type
    const events = new TypedEventEmitter<SessionEvents>();

    // Forward events from the harness
    spawned.events.on('event', (event) => events.emit('event', event));
    spawned.events.on('sessionId', (id) => events.emit('sessionId', id));
    spawned.events.on('stdout', (data) => events.emit('stdout', data));
    spawned.events.on('stderr', (data) => events.emit('stderr', data));
    spawned.events.on('exit', (code, signal) => events.emit('exit', code, signal));
    spawned.events.on('error', (error) => events.emit('error', error));

    // Forward approval requests if approval service is provided
    if (approvalService) {
      spawned.events.on('approvalRequest', (request) => {
        events.emit('approvalRequest', request);
      });
    }

    return {
      id: spawned.id,
      get agentSessionId() {
        return spawned.sessionId;
      },
      connectorType: this.name,
      process: spawned.process,
      msgStore: spawned.msgStore,
      events,
      workDir,
      approvalService,

      sendInput: spawned.sendInput.bind(spawned),
      interrupt: spawned.interrupt.bind(spawned),
      kill: spawned.kill.bind(spawned),
      waitForExit: spawned.waitForExit.bind(spawned),

      async *[Symbol.asyncIterator](): AsyncGenerator<AcpEvent, void, undefined> {
        for await (const event of spawned) {
          yield event;
        }
      },
    };
  }
}

/**
 * Create a new Claude connector
 */
export function createClaudeConnector(
  config: ClaudeConnectorConfig = {}
): ClaudeConnector {
  return new ClaudeConnector(config);
}
