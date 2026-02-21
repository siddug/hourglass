import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import {
  AbstractConnector,
  type AvailabilityInfo,
  type ConnectorConfig,
  type SpawnOptions,
  type SpawnedSession,
  type SessionEvents,
  commandExists,
  getCommandVersion,
} from './base.js';
import { AcpHarness, type SpawnedProcess } from '../acp/harness.js';
import { ApprovalService } from '../acp/approval-service.js';
import { TypedEventEmitter } from '../streaming/event-emitter.js';
import type { AcpEvent } from '../acp/types.js';
import { MsgStore } from '../streaming/msg-store.js';

/**
 * Mistral Vibe specific configuration
 */
export interface VibeConnectorConfig extends ConnectorConfig {
  /** Use auto-approve mode (bypasses tool confirmations) */
  autoApprove?: boolean;

  /** Enable interactive approval flow for tool calls */
  enableApprovals?: boolean;
}

/**
 * Mistral Vibe Connector
 *
 * Implements the BaseConnector interface for Mistral Vibe (Mistral's CLI agent).
 * Two-mode architecture matching Claude connector:
 *
 * - **Print mode** (default): Uses `vibe -p PROMPT --output streaming --auto-approve`
 *   One-shot execution with stdin ignored. Process exits after completion.
 *   Uses native `--resume SESSION_ID` for follow-ups.
 *
 * - **Interactive mode**: Uses `vibe-acp` with JSON-RPC protocol via VibeProtocolPeer
 *   Bidirectional communication for approval flows.
 *
 * Both modes delegate to AcpHarness for process management, matching ClaudeConnector's pattern.
 */
export class VibeConnector extends AbstractConnector {
  readonly name = 'vibe';
  readonly displayName = 'Mistral Vibe';

  private vibeConfig: VibeConnectorConfig;
  private harness: AcpHarness;

  constructor(config: VibeConnectorConfig = {}) {
    super(config);
    this.vibeConfig = config;
    this.harness = new AcpHarness({
      sessionNamespace: 'vibe_sessions',
    });
  }

  async checkAvailability(): Promise<AvailabilityInfo> {
    // Check if vibe command exists (primary)
    if (!(await commandExists('vibe'))) {
      // Try vibe-acp as fallback
      if (!(await commandExists('vibe-acp'))) {
        return {
          status: 'not_installed',
          message: 'Mistral Vibe is not installed. Install with: pip install mistral-vibe',
        };
      }
    }

    // Try to get version
    try {
      const version = await getCommandVersion('vibe', '--version');
      if (version) {
        return {
          status: 'available',
          version,
          path: 'vibe',
        };
      }
    } catch {
      // Continue without version
    }

    // Check for API key
    const hasApiKey = !!process.env.MISTRAL_API_KEY || this.hasVibeConfig();
    if (!hasApiKey) {
      return {
        status: 'not_configured',
        message: 'MISTRAL_API_KEY environment variable not set',
        path: 'vibe',
      };
    }

    return {
      status: 'available',
      message: 'Mistral Vibe is available',
      path: 'vibe',
    };
  }

  async spawn(options: SpawnOptions): Promise<SpawnedSession> {
    const { workDir, prompt, env, startupTimeout } = options;

    // Only use interactive mode (vibe-acp) when manual approval is needed.
    // Print mode (vibe -p --auto-approve) handles everything else, including auto-approve mode.
    if (this.needsInteractiveMode(options)) {
      return this.spawnInteractive(options);
    }

    // Print mode: vibe -p PROMPT --output streaming --auto-approve
    const command = this.vibeConfig.command || 'vibe';
    const args = this.buildArgs(options);

    // Record time before spawn to find the session file later
    const spawnTime = Date.now();

    const spawned = await this.harness.spawn({
      cwd: workDir,
      command,
      args,
      env: this.mergeEnv(env),
      startupTimeout,
      // Print mode: stdin ignored, no interactive protocol
    });

    return this.wrapSpawnedProcess(spawned, workDir, undefined, spawnTime, options.prompt);
  }

  async spawnFollowUp(
    options: SpawnOptions & { sessionId: string }
  ): Promise<SpawnedSession> {
    const { workDir, sessionId, env, startupTimeout } = options;

    // Only use interactive mode (vibe-acp) when manual approval is needed.
    if (this.needsInteractiveMode(options)) {
      return this.spawnInteractiveFollowUp(options);
    }

    // Print mode with native --resume: vibe -p PROMPT --resume SESSION_ID --output streaming
    const command = this.vibeConfig.command || 'vibe';
    const args = this.buildArgs(options, sessionId);

    const spawnTime = Date.now();

    const spawned = await this.harness.spawnFollowUp({
      cwd: workDir,
      command,
      args,
      env: this.mergeEnv(env),
      sessionId,
      startupTimeout,
    });

    // Pass prompt so wrapSpawnedProcess can filter replayed history from --resume
    return this.wrapSpawnedProcess(spawned, workDir, undefined, spawnTime, options.prompt);
  }

  /**
   * Determine if interactive mode (vibe-acp with JSON-RPC) is needed.
   * Interactive mode is only needed when manual approval flow is required.
   * Print mode (vibe -p --auto-approve) handles auto-approve and all other cases.
   */
  private needsInteractiveMode(options: SpawnOptions): boolean {
    const enableApprovals = options.enableApprovals ?? this.vibeConfig.enableApprovals ?? false;
    if (!enableApprovals) return false;

    // Only use interactive mode for manual approval — auto-approve uses print mode
    return options.approvalMode === 'manual';
  }

  getMcpConfigPath(): string | null {
    // Mistral Vibe uses ~/.vibe/config.toml
    const configPaths = [
      join(homedir(), '.vibe', 'config.toml'),
      join(process.cwd(), '.vibe', 'config.toml'),
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
Mistral Vibe Setup Instructions:

1. Install Mistral Vibe:
   pip install mistral-vibe
   # or
   uv tool install mistral-vibe

2. Set your API key:
   export MISTRAL_API_KEY="your_key"

3. Verify installation:
   vibe --version

For more information, visit: https://github.com/mistralai/mistral-vibe
    `.trim();
  }

  /**
   * Build command arguments for print mode
   *
   * Print mode: vibe -p PROMPT --output streaming --auto-approve [--resume SESSION_ID]
   */
  private buildArgs(options: SpawnOptions, sessionId?: string): string[] {
    const args: string[] = [];

    // -p requires the prompt immediately after it (vibe -p "prompt")
    // Otherwise vibe sees -p with no value and errors: "No prompt provided for programmatic mode"
    args.push('-p');
    if (options.prompt) {
      args.push(options.prompt);
    }

    args.push('--output', 'streaming');
    args.push('--auto-approve');

    // Add session resume if provided (native --resume for follow-ups)
    if (sessionId) {
      args.push('--resume', sessionId);
    }

    // Add model if specified
    if (this.vibeConfig.model) {
      args.push('--model', this.vibeConfig.model);
    }

    // Add any custom args from config
    if (this.vibeConfig.args) {
      args.push(...this.vibeConfig.args);
    }

    return args;
  }

  /**
   * Spawn in interactive mode using vibe-acp with JSON-RPC protocol
   * Used when approval flow is needed
   */
  private async spawnInteractive(options: SpawnOptions): Promise<SpawnedSession> {
    const { workDir, prompt, env } = options;

    const autoApprove = this.vibeConfig.autoApprove ?? false;
    const command = 'vibe-acp';
    const approvalService = autoApprove ? undefined : new ApprovalService();

    const spawned = await this.harness.spawn({
      cwd: workDir,
      command,
      args: [],
      env: this.mergeEnv(env),
      prompt,
      vibeProtocol: true,
      vibeAutoApprove: autoApprove,
      approvalService: approvalService || new ApprovalService(),
    });

    return this.wrapSpawnedProcess(spawned, workDir, approvalService);
  }

  /**
   * Spawn follow-up in interactive mode
   * Interactive mode doesn't support native --resume, so we use conversation history injection
   */
  private async spawnInteractiveFollowUp(
    options: SpawnOptions & { sessionId: string }
  ): Promise<SpawnedSession> {
    const { conversationHistory, prompt, ...restOptions } = options;

    // Build a context-aware prompt if we have conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      const contextPrompt = this.buildContextAwarePrompt(conversationHistory, prompt);
      return this.spawnInteractive({ ...restOptions, prompt: contextPrompt });
    }

    // No history, just spawn with the original prompt
    return this.spawnInteractive({ ...restOptions, prompt });
  }

  /**
   * Build a prompt that includes conversation history for context (interactive mode only)
   */
  private buildContextAwarePrompt(
    history: Array<{ role: string; content: string }>,
    newPrompt: string
  ): string {
    const historyText = history
      .map((msg) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        return `${role}: ${msg.content}`;
      })
      .join('\n\n');

    return `Here is the previous conversation for context:

${historyText}

---

Now, please respond to this new message:
User: ${newPrompt}`;
  }

  /**
   * Wrap a SpawnedProcess into a SpawnedSession
   *
   * For vibe print mode with --resume, the stdout replays the full conversation history.
   * We filter out replayed lines by skipping until we see the current prompt as a user message.
   * The filtering happens at the MsgStore level so both DB persistence and WebSocket streaming
   * only see the new exchange. We also track the last assistant message to emit a `done` event.
   */
  private wrapSpawnedProcess(
    spawned: SpawnedProcess,
    workDir: string,
    approvalService?: ApprovalService,
    spawnTime?: number,
    prompt?: string
  ): SpawnedSession {
    const events = new TypedEventEmitter<SessionEvents>();

    // State for filtering replayed history from --resume output.
    // When prompt is provided, we skip everything until the user message matching our prompt.
    let passThrough = !prompt;
    let lastAssistantText = '';

    // Create a filtered MsgStore that only receives messages after the replay boundary.
    // The harness's MsgStore captures ALL stdout (including replayed history).
    // DB persistence and WebSocket streaming subscribe to this filtered store instead.
    const filteredMsgStore = new MsgStore();

    spawned.msgStore.subscribe((msg) => {
      // Don't forward 'finished' from harness — sessions.ts pushes it after the done event
      // for correct ordering (done must come before finished).
      if (msg.type === 'finished') return;

      if (passThrough) {
        filteredMsgStore.push(msg);
        return;
      }

      // Check if this stdout message contains our prompt as a user message
      if (msg.type === 'stdout' && prompt) {
        try {
          const parsed = JSON.parse(msg.content);
          if (parsed.role === 'user' && parsed.content === prompt) {
            passThrough = true;
            filteredMsgStore.push(msg);
          }
        } catch {
          // Not JSON — still in replay, skip
        }
        return;
      }

      // Pass through non-stdout messages (stderr, etc.) even during replay
      if (msg.type !== 'stdout') {
        filteredMsgStore.push(msg);
      }
    });

    // Forward events with the same filtering + track last assistant text
    spawned.events.on('event', (event) => {
      if (!passThrough) {
        if (event.type === 'user' && prompt && (event as { content: string }).content === prompt) {
          passThrough = true;
        } else {
          return;
        }
      }

      if (event.type === 'message') {
        const text = (event as { content: { type: string; text: string } }).content?.text;
        if (text) lastAssistantText = text;
      }

      events.emit('event', event);
    });

    spawned.events.on('stdout', (data) => {
      // stdout forwarding on events is handled by the MsgStore filter above.
      // Only emit on the events emitter if passThrough (for any direct event listeners).
      if (passThrough) {
        events.emit('stdout', data);
      }
    });

    spawned.events.on('sessionId', (id) => events.emit('sessionId', id));
    spawned.events.on('stderr', (data) => events.emit('stderr', data));
    spawned.events.on('exit', (code, signal) => {
      // In print mode, extract the session ID from vibe's session files
      if (spawnTime && !spawned.sessionId) {
        const vibeSessionId = this.extractVibeSessionId(spawnTime);
        if (vibeSessionId) {
          events.emit('sessionId', vibeSessionId);
        }
      }

      // Emit a done event with the last assistant message as the result.
      // This matches Claude's behavior where the final result is a separate event.
      // sessions.ts will call msgStore.pushFinished() when it receives this done event.
      if (lastAssistantText) {
        events.emit('event', {
          type: 'done',
          reason: 'end_turn',
          result: lastAssistantText,
          timestamp: Date.now(),
        } as AcpEvent);
      } else {
        // No done event to emit — push finished directly so streaming clients complete
        filteredMsgStore.pushFinished();
      }

      events.emit('exit', code, signal);
    });
    spawned.events.on('error', (error) => events.emit('error', error));

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
      msgStore: filteredMsgStore,
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

  /**
   * Extract session ID from vibe's session log files.
   *
   * Vibe saves sessions to ~/.vibe/logs/session/session_YYYYMMDD_HHMMSS_SHORTID.json
   * The UUID session ID is stored inside the file's metadata.session_id field.
   * We find the newest file created after spawnTime and read the session ID from it.
   */
  private extractVibeSessionId(spawnTime: number): string | null {
    try {
      const sessionDir = join(homedir(), '.vibe', 'logs', 'session');
      if (!existsSync(sessionDir)) return null;

      const files = readdirSync(sessionDir)
        .filter((f) => f.startsWith('session_') && f.endsWith('.json'))
        .sort()
        .reverse(); // newest first

      for (const file of files) {
        const filePath = join(sessionDir, file);
        // Extract timestamp from filename: session_YYYYMMDD_HHMMSS_shortid.json
        const match = file.match(/^session_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_/);
        if (!match) continue;

        const [, y, m, d, h, min, s] = match;
        const fileTime = new Date(`${y}-${m}-${d}T${h}:${min}:${s}`).getTime();

        // Only consider files created after (or around) spawn time (with 2s tolerance)
        if (fileTime < spawnTime - 2000) break; // Files are sorted newest first, so we can stop

        // Read the file and extract session_id
        try {
          const content = readFileSync(filePath, 'utf-8');
          if (!content.trim()) continue; // Skip empty files
          const data = JSON.parse(content);
          if (data.metadata?.session_id) {
            return data.metadata.session_id;
          }
          // Also try short ID from filename (the 8-char hex after last underscore)
          const shortIdMatch = file.match(/_([a-f0-9]{8})\.json$/);
          if (shortIdMatch) {
            return shortIdMatch[1];
          }
        } catch {
          // File might still be written, skip
          continue;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if vibe config exists with API key
   */
  private hasVibeConfig(): boolean {
    const envPath = join(homedir(), '.vibe', '.env');
    return existsSync(envPath);
  }
}

/**
 * Create a new Vibe connector
 */
export function createVibeConnector(
  config: VibeConnectorConfig = {}
): VibeConnector {
  return new VibeConnector(config);
}
