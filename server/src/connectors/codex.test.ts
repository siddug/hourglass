import { describe, expect, it } from 'vitest';
import { CodexConnector } from './codex.js';
import type { SpawnOptions } from './base.js';

const baseOptions: SpawnOptions = {
  workDir: '/tmp',
  prompt: 'test prompt',
  approvalMode: 'auto',
};

function getExecArgs(connector: CodexConnector, options: SpawnOptions): string[] {
  return (connector as unknown as { buildExecArgs: (opts: SpawnOptions) => string[] }).buildExecArgs(options);
}

describe('CodexConnector', () => {
  it('uses no-prompt auto mode with workspace-write sandbox by default', () => {
    const connector = new CodexConnector();

    const args = getExecArgs(connector, baseOptions);

    expect(args).toContain('--json');
    expect(args).toContain('-c');
    expect(args).toContain('approval_policy="never"');
    expect(args).toContain('--sandbox');
    expect(args).toContain('workspace-write');
    expect(args).not.toContain('--full-auto');
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
  });

  it('bypasses Codex approvals and sandbox when Hourglass already sandboxes the process', () => {
    const connector = new CodexConnector({
      sandbox: {
        enabled: true,
        allowNetwork: false,
      },
    });

    const args = getExecArgs(connector, baseOptions);

    expect(args).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(args).not.toContain('-c');
    expect(args).not.toContain('--sandbox');
  });

  it('respects an explicit Codex sandbox mode even when Hourglass sandboxing is enabled', () => {
    const connector = new CodexConnector({
      sandbox: {
        enabled: true,
        allowNetwork: false,
      },
      sandboxMode: 'read-only',
    });

    const args = getExecArgs(connector, baseOptions);

    expect(args).toContain('-c');
    expect(args).toContain('approval_policy="never"');
    expect(args).toContain('--sandbox');
    expect(args).toContain('read-only');
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
  });
});
