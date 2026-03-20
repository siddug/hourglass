import { platform, homedir } from 'node:os';
import { writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Sandbox configuration options
 */
export interface SandboxConfig {
  /** Enable sandbox wrapping (default: true on macOS) */
  enabled?: boolean;

  /** Working directory to grant read-write access */
  workDir?: string;

  /** Additional read-only paths */
  additionalReadPaths?: string[];

  /** Additional read-write paths */
  additionalWritePaths?: string[];

  /** Allow network access (default: true - agents need API access) */
  allowNetwork?: boolean;
}

/**
 * Result of wrapping a command with sandbox-exec
 */
export interface SandboxWrappedCommand {
  command: string;
  args: string[];
  cleanup: () => void;
}

/**
 * Check if sandboxing is supported on this platform
 */
export function isSandboxSupported(): boolean {
  if (platform() !== 'darwin') return false;
  try {
    execFileSync('which', ['sandbox-exec'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get intermediate directory paths between a base path and a target path.
 * Needed so that realpathSync can lstat each path component when resolving
 * the working directory (e.g., /Users/x/Documents, /Users/x/Documents/code).
 */
function getIntermediateDirectories(basePath: string, targetPath: string): string[] {
  if (!targetPath.startsWith(basePath + '/') || targetPath === basePath) {
    return [];
  }

  const dirs: string[] = [];
  let current = dirname(targetPath);

  while (current !== basePath && current !== dirname(current)) {
    dirs.push(current);
    current = dirname(current);
  }

  return dirs;
}

/**
 * Resolve symlink targets inside agent data directories (e.g. ~/.vibe/skills, ~/.claude).
 * Returns real paths that the sandbox needs to allow read access to,
 * plus their intermediate parent directories for path resolution.
 */
function resolveSymlinkTargets(home: string): string[] {
  const paths = new Set<string>();
  const dirsToScan = [
    join(home, '.vibe', 'skills'),
    join(home, '.claude'),
  ];

  for (const dir of dirsToScan) {
    try {
      if (!existsSync(dir)) continue;
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const entryPath = join(dir, entry);
        try {
          const stat = lstatSync(entryPath);
          if (stat.isSymbolicLink()) {
            const realPath = realpathSync(entryPath);
            paths.add(realPath);
            // Also add parent directories up to home for path resolution
            let parent = dirname(realPath);
            while (parent.startsWith(home + '/') && parent !== home) {
              paths.add(parent);
              parent = dirname(parent);
            }
          }
        } catch {
          // Skip unresolvable symlinks
        }
      }
    } catch {
      // Directory not readable, skip
    }
  }

  return Array.from(paths);
}

/**
 * Generate a macOS sandbox profile (.sb) for an agent process.
 *
 * Follows agent-safehouse's deny-first philosophy:
 * - Deny all by default
 * - Allow network (agents need API calls)
 * - Allow system binary/library reads
 * - Allow toolchain paths (node, python, etc.)
 * - Allow read-write to working directory and temp dirs
 * - Deny sensitive files (SSH private keys, cloud credentials, docker socket)
 */
export function generateSandboxProfile(config: SandboxConfig): string {
  const home = homedir();
  const workDir = config.workDir || process.cwd();
  const allowNetwork = config.allowNetwork !== false;

  const lines: string[] = [
    '(version 1)',
    '',
    ';; Hourglass Agent Sandbox Profile',
    ';; Based on agent-safehouse deny-first approach',
    '',
    ';; Deny everything by default',
    '(deny default)',
    '',

    // NOTE: Sensitive denials are at the END of the profile to override any allows.

    // --- Network ---
    ';; === Network ===',
    allowNetwork ? '(allow network*)' : ';; Network disabled',
    '',

    // --- Process execution ---
    ';; === Process execution ===',
    '(allow process*)',
    '(allow signal (target same-sandbox))',
    '',

    // --- System reads ---
    ';; === System binaries and libraries ===',
    '(allow file-read*',
    '  (literal "/")',               // Root directory (needed for path resolution)
    '  (literal "/Users")',          // Home parent (needed for lstat path resolution)
    `  (literal "${home}")`,         // Home directory itself
    '  (subpath "/usr")',
    '  (subpath "/bin")',
    '  (subpath "/sbin")',
    '  (subpath "/opt")',             // Homebrew
    '  (subpath "/System")',
    '  (subpath "/Library")',
    '  (subpath "/private/etc")',
    '  (subpath "/private/var")',
    '  (subpath "/etc")',
    '  (subpath "/var")',
    '  (subpath "/Applications")',   // App bundles (for Electron-based tools)
    ')',
    '',

    // --- Device access ---
    ';; === Device access ===',
    '(allow file-read*',
    '  (subpath "/dev")',
    ')',
    '(allow file-write*',
    '  (literal "/dev/null")',
    '  (literal "/dev/tty")',
    '  (literal "/dev/ptmx")',
    '  (regex #"^/dev/ttys[0-9]+")',
    '  (regex #"^/dev/fd/[0-9]+")',
    ')',
    '(allow file-ioctl)',
    '',

    // --- Pseudo-TTY ---
    ';; === Pseudo-TTY ===',
    '(allow pseudo-tty)',
    '',

    // --- Temporary directories (read-write) ---
    ';; === Temp directories ===',
    '(allow file-read* file-write*',
    '  (subpath "/tmp")',
    '  (subpath "/private/tmp")',
    '  (subpath "/var/folders")',
    '  (subpath "/private/var/folders")',
    ')',
    '',

    // --- Working directory (read-write) ---
    ';; === Working directory ===',
    `(allow file-read* file-write* (subpath "${workDir}"))`,
    '',
  ];

  // --- Intermediate path components between home and workDir ---
  // realpathSync needs to lstat each directory in the path chain.
  // Without this, paths like /Users/x/Documents are denied when workDir is deeper.
  const intermediates = getIntermediateDirectories(home, workDir);
  if (intermediates.length > 0) {
    lines.push(';; === Intermediate path components (for path resolution) ===');
    lines.push('(allow file-read*');
    for (const dir of intermediates) {
      lines.push(`  (literal "${dir}")`);
    }
    lines.push(')');
    lines.push('');
  }

  // --- Symlink targets in agent data directories ---
  // Directories like ~/.vibe/skills often contain symlinks to external paths.
  // Resolve them and allow read access so agents can discover skills/plugins.
  const symlinkTargets = resolveSymlinkTargets(home);
  if (symlinkTargets.length > 0) {
    lines.push(';; === Symlink targets (resolved from agent data dirs) ===');
    lines.push('(allow file-read*');
    for (const target of symlinkTargets) {
      lines.push(`  (subpath "${target}")`);
    }
    lines.push(')');
    lines.push('');
  }

  lines.push(
    // --- Home directory selective access ---
    ';; === Home directory (selective) ===',
    `(allow file-read* (literal "${home}"))`,
    `(allow file-read* (literal "${home}/"))`,
    '',
    ';; XDG config and cache (metadata + read)',
    `(allow file-read* (subpath "${home}/.config"))`,
    `(allow file-read* (subpath "${home}/.cache"))`,
    `(allow file-read* (subpath "${home}/.local"))`,
    '',
    ';; User preferences',
    `(allow file-read* (subpath "${home}/Library/Preferences"))`,
    '',

    // --- Node.js / npm toolchain ---
    ';; === Node.js toolchain ===',
    `(allow file-read* file-write* (subpath "${home}/.npm"))`,
    `(allow file-read* file-write* (subpath "${home}/.npx-cache"))`,
    `(allow file-read* (subpath "${home}/.nvm"))`,
    `(allow file-read* file-write* (subpath "${home}/.pnpm-store"))`,
    `(allow file-read* (subpath "${home}/.yarn"))`,
    `(allow file-read* (subpath "${home}/.bun"))`,
    '',

    // --- Python toolchain ---
    ';; === Python toolchain ===',
    `(allow file-read* (subpath "${home}/.pyenv"))`,
    `(allow file-read* file-write* (subpath "${home}/.cache/pip"))`,
    `(allow file-read* (subpath "${home}/.virtualenvs"))`,
    `(allow file-read* (subpath "${home}/.local/share/uv"))`,
    `(allow file-read* file-write* (subpath "${home}/.cache/uv"))`,
    '',

    // --- Go toolchain ---
    ';; === Go toolchain ===',
    `(allow file-read* (subpath "${home}/go"))`,
    `(allow file-read* file-write* (subpath "${home}/.cache/go-build"))`,
    '',

    // --- Rust toolchain ---
    ';; === Rust toolchain ===',
    `(allow file-read* (subpath "${home}/.cargo"))`,
    `(allow file-read* (subpath "${home}/.rustup"))`,
    '',

    // --- Ruby toolchain ---
    ';; === Ruby toolchain ===',
    `(allow file-read* (subpath "${home}/.rbenv"))`,
    `(allow file-read* (subpath "${home}/.gem"))`,
    `(allow file-read* (subpath "${home}/.bundle"))`,
    '',

    // --- Claude Code specific ---
    ';; === Claude Code data ===',
    `(allow file-read* file-write* (subpath "${home}/.claude"))`,
    '',

    // --- Vibe specific ---
    ';; === Vibe data ===',
    `(allow file-read* file-write* (subpath "${home}/.vibe"))`,
    '',

    // --- Hourglass data ---
    ';; === Hourglass data ===',
    `(allow file-read* file-write* (subpath "${home}/.hourglass"))`,
    '',

    // --- Mach/IPC services ---
    ';; === Mach services (baseline) ===',
    '(allow mach-lookup',
    '  (global-name "com.apple.system.notification_center")',
    '  (global-name "com.apple.system.logger")',
    '  (global-name "com.apple.logd")',
    '  (global-name "com.apple.distributed_notifications@Uv3")',
    '  (global-name "com.apple.lsd.mapdb")',
    '  (global-name "com.apple.FSEvents")',
    '  (global-name "com.apple.cfprefsd.daemon")',
    '  (global-name "com.apple.cfprefsd.agent")',
    '  (global-name "com.apple.trustd.agent")',
    '  (global-name "com.apple.SecurityServer")',
    '  (global-name "com.apple.coreservices.launchservicesd")',
    '  (global-name "com.apple.DiskArbitration.diskarbitrationd")',
    ')',
    '',

    // --- Sysctl ---
    ';; === Sysctl ===',
    '(allow sysctl-read)',
    '',
  );

  // Additional read-only paths
  if (config.additionalReadPaths?.length) {
    lines.push(';; === Additional read-only paths ===');
    for (const p of config.additionalReadPaths) {
      lines.push(`(allow file-read* (subpath "${p}"))`);
    }
    lines.push('');
  }

  // Additional read-write paths
  if (config.additionalWritePaths?.length) {
    lines.push(';; === Additional read-write paths ===');
    for (const p of config.additionalWritePaths) {
      lines.push(`(allow file-read* file-write* (subpath "${p}"))`);
    }
    lines.push('');
  }

  // --- Sensitive file denials (LAST to override any broader allows above) ---
  lines.push(
    ';; === DEFENSE-IN-DEPTH: Deny sensitive paths (overrides allows above) ===',
    '',
    ';; Deny SSH private keys',
    `(deny file-read* (subpath "${home}/.ssh"))`,
    '',
    ';; Deny cloud credentials',
    `(deny file-read* (subpath "${home}/.aws"))`,
    `(deny file-read* (subpath "${home}/.config/gcloud"))`,
    `(deny file-read* (subpath "${home}/.azure"))`,
    '',
    ';; Deny Docker/Podman sockets',
    '(deny file-read* (literal "/var/run/docker.sock"))',
    '(deny file-read* (literal "/var/run/podman/podman.sock"))',
    `(deny file-read* (subpath "${home}/.docker/run"))`,
    '',
    ';; Deny Keychain database files',
    `(deny file-read* (subpath "${home}/Library/Keychains"))`,
    '',
  );

  return lines.join('\n');
}

/**
 * Write a sandbox profile to a temporary file and return the path.
 * The caller is responsible for cleanup via the returned cleanup function.
 */
export function writeSandboxProfile(config: SandboxConfig): { profilePath: string; cleanup: () => void } {
  const tmpDir = join(homedir(), '.hourglass', 'sandbox');
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }

  const profilePath = join(tmpDir, `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sb`);
  const profile = generateSandboxProfile(config);
  writeFileSync(profilePath, profile, 'utf-8');

  return {
    profilePath,
    cleanup: () => {
      try {
        unlinkSync(profilePath);
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Wrap a command with sandbox-exec.
 *
 * Instead of spawning `command args...`, this transforms it to:
 *   sandbox-exec -f <profile> command args...
 *
 * Returns the wrapped command, args, and a cleanup function to remove the temp profile.
 */
export function wrapWithSandbox(
  command: string,
  args: string[],
  config: SandboxConfig
): SandboxWrappedCommand {
  const { profilePath, cleanup } = writeSandboxProfile(config);

  return {
    command: '/usr/bin/sandbox-exec',
    args: ['-f', profilePath, command, ...args],
    cleanup,
  };
}
