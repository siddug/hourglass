import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  AbstractConnector,
  type AvailabilityInfo,
  type ConnectorApprovalMode,
  type ConnectorConfig,
  type SpawnOptions,
  type SpawnedSession,
  commandExists,
  getCommandVersion,
} from './base.js';
import { AcpHarness } from '../acp/harness.js';

/**
 * Codex CLI specific configuration
 */
export interface CodexConnectorConfig extends ConnectorConfig {
  /** Sandbox mode to use for Codex CLI */
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';

  /** Allow running outside a git repository */
  skipGitRepoCheck?: boolean;

  /** Use Codex ephemeral mode */
  ephemeral?: boolean;
}

/**
 * OpenAI Codex CLI connector
 *
 * Uses Codex's documented non-interactive JSONL mode:
 * - `codex exec --json` for new runs
 * - `codex exec resume ... --json` for follow-ups
 *
 * Hourglass approval streaming is not available for this connector because
 * Codex exec does not expose the same interactive control protocol used by
 * the Claude/Vibe connectors.
 */
export class CodexConnector extends AbstractConnector {
  readonly name = 'codex';
  readonly displayName = 'Codex CLI';

  private codexConfig: CodexConnectorConfig;
  private harness: AcpHarness;

  constructor(config: CodexConnectorConfig = {}) {
    super(config);
    this.codexConfig = config;
    this.harness = new AcpHarness({
      sessionNamespace: 'codex_sessions',
      model: config.model,
      mode: config.mode,
    });
  }

  async checkAvailability(): Promise<AvailabilityInfo> {
    const command = this.codexConfig.command || 'codex';
    if (!(await commandExists(command))) {
      return {
        status: 'not_installed',
        message: 'Codex CLI is not installed. Install it with npm install -g @openai/codex.',
      };
    }

    const version = await getCommandVersion(command, '--version');
    const configuredProvider = this.getConfiguredProviderEnv();
    const configured = this.hasApiKeyEnv() || !!configuredProvider || this.isLoggedIn(command);

    if (!configured) {
      return {
        status: 'not_configured',
        version: version || undefined,
        path: command,
        message: 'Codex CLI is installed but not authenticated. Run `codex login` or set OPENAI_API_KEY.',
      };
    }

    return {
      status: 'available',
      version: version || undefined,
      path: command,
      message: configuredProvider
        ? `Codex CLI is available via configured ${configuredProvider.provider} provider`
        : 'Codex CLI is available',
    };
  }

  supportsApprovalMode(mode: ConnectorApprovalMode): boolean {
    return mode === 'auto';
  }

  getUnsupportedApprovalModeMessage(mode: ConnectorApprovalMode): string | null {
    if (mode === 'manual') {
      return 'Codex CLI currently supports Hourglass sessions in auto approval mode only.';
    }

    return null;
  }

  async spawn(options: SpawnOptions): Promise<SpawnedSession> {
    const { workDir, prompt, env, startupTimeout, approvalMode } = options;

    if (approvalMode && !this.supportsApprovalMode(approvalMode)) {
      throw new Error(this.getUnsupportedApprovalModeMessage(approvalMode) || 'Unsupported approval mode');
    }

    const spawned = await this.harness.spawn({
      cwd: workDir,
      command: this.codexConfig.command || 'codex',
      args: this.buildExecArgs(options),
      env: this.mergeEnv(env),
      startupTimeout,
      sandbox: this.codexConfig.sandbox,
    });

    return {
      id: spawned.id,
      get agentSessionId() {
        return spawned.sessionId;
      },
      connectorType: this.name,
      process: spawned.process,
      msgStore: spawned.msgStore,
      events: spawned.events,
      workDir,
      sendInput: spawned.sendInput.bind(spawned),
      interrupt: spawned.interrupt.bind(spawned),
      kill: spawned.kill.bind(spawned),
      waitForExit: spawned.waitForExit.bind(spawned),
      async *[Symbol.asyncIterator]() {
        for await (const event of spawned) {
          yield event;
        }
      },
    };
  }

  async spawnFollowUp(
    options: SpawnOptions & { sessionId: string }
  ): Promise<SpawnedSession> {
    const { workDir, env, startupTimeout, approvalMode } = options;

    if (approvalMode && !this.supportsApprovalMode(approvalMode)) {
      throw new Error(this.getUnsupportedApprovalModeMessage(approvalMode) || 'Unsupported approval mode');
    }

    const spawned = await this.harness.spawnFollowUp({
      cwd: workDir,
      command: this.codexConfig.command || 'codex',
      args: this.buildResumeArgs(options),
      env: this.mergeEnv(env),
      sessionId: options.sessionId,
      startupTimeout,
      sandbox: this.codexConfig.sandbox,
    });

    return {
      id: spawned.id,
      get agentSessionId() {
        return spawned.sessionId;
      },
      connectorType: this.name,
      process: spawned.process,
      msgStore: spawned.msgStore,
      events: spawned.events,
      workDir,
      sendInput: spawned.sendInput.bind(spawned),
      interrupt: spawned.interrupt.bind(spawned),
      kill: spawned.kill.bind(spawned),
      waitForExit: spawned.waitForExit.bind(spawned),
      async *[Symbol.asyncIterator]() {
        for await (const event of spawned) {
          yield event;
        }
      },
    };
  }

  getMcpConfigPath(): string | null {
    const configPath = join(homedir(), '.codex', 'config.toml');
    return existsSync(configPath) ? configPath : null;
  }

  getSetupInstructions(): string {
    return `
Codex CLI Setup Instructions:

1. Install Codex CLI:
   npm install -g @openai/codex

2. Authenticate:
   codex login
   # or set OPENAI_API_KEY in your shell environment

3. Verify installation:
   codex exec --help

For more information, visit: https://developers.openai.com/codex/cli
    `.trim();
  }

  private buildExecArgs(options: SpawnOptions): string[] {
    const args = ['exec'];

    this.appendCommonArgs(args);

    if (options.prompt) {
      args.push(options.prompt);
    }

    return args;
  }

  private buildResumeArgs(options: SpawnOptions & { sessionId: string }): string[] {
    const args = ['exec', 'resume'];

    this.appendResumeArgs(args);

    args.push(options.sessionId);

    if (options.prompt) {
      args.push(options.prompt);
    }

    return args;
  }

  private appendCommonArgs(args: string[]): void {
    args.push('--json');

    if (this.codexConfig.model) {
      args.push('--model', this.codexConfig.model);
    }

    args.push('--full-auto');

    if (this.codexConfig.sandboxMode) {
      args.push('--sandbox', this.codexConfig.sandboxMode);
    }

    if (this.codexConfig.skipGitRepoCheck ?? true) {
      args.push('--skip-git-repo-check');
    }

    if (this.codexConfig.ephemeral) {
      args.push('--ephemeral');
    }

    if (this.codexConfig.args) {
      args.push(...this.codexConfig.args);
    }
  }

  private appendResumeArgs(args: string[]): void {
    this.appendCommonArgs(args);
  }

  private hasApiKeyEnv(): boolean {
    return !!process.env.OPENAI_API_KEY || !!process.env.AZURE_OPENAI_API_KEY;
  }

  private isLoggedIn(command: string): boolean {
    try {
      const result = spawnSync(command, ['login', 'status'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const output = `${result.stdout || ''}\n${result.stderr || ''}`.toLowerCase();

      if (output.includes('not logged in')) {
        return false;
      }

      return output.includes('logged in') || result.status === 0;
    } catch {
      return false;
    }
  }

  private getConfiguredProviderEnv(): { provider: string; envKey: string } | null {
    const configPath = this.getMcpConfigPath();
    if (!configPath) {
      return null;
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const providerMatch = content.match(/^\s*model_provider\s*=\s*"([^"]+)"/m);
      if (!providerMatch) {
        return null;
      }

      const provider = providerMatch[1];
      const sectionHeader = `[model_providers.${provider}]`;
      const sectionStart = content.indexOf(sectionHeader);
      if (sectionStart === -1) {
        return null;
      }

      const sectionBody = content.slice(sectionStart + sectionHeader.length);
      const nextSectionIndex = sectionBody.search(/^\s*\[[^\]]+\]/m);
      const providerBlock = nextSectionIndex === -1
        ? sectionBody
        : sectionBody.slice(0, nextSectionIndex);

      const envKeyMatch = providerBlock.match(/^\s*env_key\s*=\s*"([^"]+)"/m);
      if (!envKeyMatch) {
        return null;
      }

      const envKey = envKeyMatch[1];
      return process.env[envKey]
        ? { provider, envKey }
        : null;
    } catch {
      return null;
    }
  }
}

/**
 * Create a new Codex connector
 */
export function createCodexConnector(
  config: CodexConnectorConfig = {}
): CodexConnector {
  return new CodexConnector(config);
}
