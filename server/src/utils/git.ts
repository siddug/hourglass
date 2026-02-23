import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * Git availability status
 */
export interface GitAvailability {
  available: boolean;
  version?: string;
  error?: string;
}

/**
 * Git file change status
 */
export type GitFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';

/**
 * A file with git change information
 */
export interface GitFileChange {
  path: string;
  status: GitFileStatus;
  oldPath?: string; // For renamed files
  staged: boolean;
}

/**
 * Git repository information
 */
export interface GitRepoInfo {
  branch: string;
  remoteBranch?: string;
  remoteUrl?: string;
  lastCommit?: {
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    date: string;
  };
  ahead: number;
  behind: number;
}

/**
 * Git status response
 */
export interface GitStatus {
  isGitRepo: boolean;
  gitAvailable: boolean;
  gitVersion?: string;
  repoRoot?: string;
  info?: GitRepoInfo;
  changes?: GitFileChange[];
  error?: string;
}

/**
 * Git diff response
 */
export interface GitDiff {
  path: string;
  diff: string;
  additions: number;
  deletions: number;
  isBinary: boolean;
  isNew: boolean;
  isDeleted: boolean;
}

// Cache for git availability check (check once per process)
let gitAvailabilityCache: GitAvailability | null = null;

/**
 * Check if git is available on the system
 */
export async function checkGitAvailable(): Promise<GitAvailability> {
  if (gitAvailabilityCache) {
    return gitAvailabilityCache;
  }

  try {
    const { stdout } = await execFileAsync('git', ['--version'], { timeout: 5000 });
    const version = stdout.trim().replace('git version ', '');
    gitAvailabilityCache = { available: true, version };
    return gitAvailabilityCache;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    gitAvailabilityCache = {
      available: false,
      error: errorMessage.includes('ENOENT')
        ? 'Git is not installed on this system'
        : `Git check failed: ${errorMessage}`
    };
    return gitAvailabilityCache;
  }
}

/**
 * Execute a git command in a directory
 */
async function execGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string } | null> {
  try {
    const result = await execFileAsync('git', args, {
      cwd,
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large diffs
    });
    return result;
  } catch (error) {
    // Git command failed (not a git repo, etc.)
    return null;
  }
}

/**
 * Check if a directory is inside a git repository
 */
export async function isGitRepository(path: string): Promise<{ isRepo: boolean; repoRoot?: string }> {
  const gitCheck = await checkGitAvailable();
  if (!gitCheck.available) {
    return { isRepo: false };
  }

  const result = await execGit(path, ['rev-parse', '--show-toplevel']);
  if (result && result.stdout) {
    return { isRepo: true, repoRoot: result.stdout.trim() };
  }
  return { isRepo: false };
}

/**
 * Get git repository information (branch, remote, last commit)
 */
export async function getGitRepoInfo(repoPath: string): Promise<GitRepoInfo | null> {
  const gitCheck = await checkGitAvailable();
  if (!gitCheck.available) {
    return null;
  }

  // Get current branch
  const branchResult = await execGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branchResult) return null;
  const branch = branchResult.stdout.trim();

  const info: GitRepoInfo = {
    branch,
    ahead: 0,
    behind: 0,
  };

  // Get remote tracking branch
  const trackingResult = await execGit(repoPath, ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`]);
  if (trackingResult && trackingResult.stdout) {
    info.remoteBranch = trackingResult.stdout.trim();
  }

  // Get remote URL (for the default remote, usually 'origin')
  const remoteResult = await execGit(repoPath, ['remote', 'get-url', 'origin']);
  if (remoteResult && remoteResult.stdout) {
    info.remoteUrl = remoteResult.stdout.trim();
  }

  // Get last commit info
  const logResult = await execGit(repoPath, ['log', '-1', '--format=%H|%h|%s|%an|%ar']);
  if (logResult && logResult.stdout) {
    const [hash, shortHash, message, author, date] = logResult.stdout.trim().split('|');
    info.lastCommit = { hash, shortHash, message, author, date };
  }

  // Get ahead/behind counts if we have a tracking branch
  if (info.remoteBranch) {
    const aheadBehindResult = await execGit(repoPath, ['rev-list', '--left-right', '--count', `${info.remoteBranch}...HEAD`]);
    if (aheadBehindResult && aheadBehindResult.stdout) {
      const [behind, ahead] = aheadBehindResult.stdout.trim().split(/\s+/).map(Number);
      info.ahead = ahead || 0;
      info.behind = behind || 0;
    }
  }

  return info;
}

/**
 * Parse git status --porcelain output into structured changes
 */
function parseGitStatus(output: string): GitFileChange[] {
  const changes: GitFileChange[] = [];
  const lines = output.split('\n').filter(line => line.length > 0);

  for (const line of lines) {
    // Format: XY filename or XY oldname -> newname (for renames)
    const indexStatus = line[0];
    const workTreeStatus = line[1];
    let filePath = line.slice(3);
    let oldPath: string | undefined;

    // Handle renames: "R  oldname -> newname"
    if (filePath.includes(' -> ')) {
      const parts = filePath.split(' -> ');
      oldPath = parts[0];
      filePath = parts[1];
    }

    // Determine file status
    let status: GitFileStatus;
    let staged = false;

    // Index status (staged changes)
    if (indexStatus === 'A') {
      status = 'added';
      staged = true;
    } else if (indexStatus === 'D') {
      status = 'deleted';
      staged = true;
    } else if (indexStatus === 'M') {
      status = 'modified';
      staged = true;
    } else if (indexStatus === 'R') {
      status = 'renamed';
      staged = true;
    } else if (indexStatus === '?') {
      status = 'untracked';
      staged = false;
    } else if (workTreeStatus === 'D') {
      status = 'deleted';
      staged = false;
    } else if (workTreeStatus === 'M' || workTreeStatus === 'A') {
      status = 'modified';
      staged = false;
    } else {
      // Default to modified for any other status
      status = 'modified';
      staged = indexStatus !== ' ' && indexStatus !== '?';
    }

    changes.push({
      path: filePath,
      status,
      oldPath,
      staged,
    });
  }

  return changes;
}

/**
 * Get git status for a repository
 */
export async function getGitStatus(path: string): Promise<GitStatus> {
  // First check if git is available
  const gitCheck = await checkGitAvailable();
  if (!gitCheck.available) {
    return {
      isGitRepo: false,
      gitAvailable: false,
      error: gitCheck.error,
    };
  }

  // Check if this is a git repository
  const repoCheck = await isGitRepository(path);
  if (!repoCheck.isRepo) {
    return {
      isGitRepo: false,
      gitAvailable: true,
      gitVersion: gitCheck.version,
    };
  }

  const repoRoot = repoCheck.repoRoot!;

  // Get repository info
  const info = await getGitRepoInfo(repoRoot);

  // Get status (porcelain for machine-readable output)
  const statusResult = await execGit(repoRoot, ['status', '--porcelain']);
  const changes = statusResult ? parseGitStatus(statusResult.stdout) : [];

  return {
    isGitRepo: true,
    gitAvailable: true,
    gitVersion: gitCheck.version,
    repoRoot,
    info: info || undefined,
    changes,
  };
}

/**
 * Get diff for a specific file
 */
export async function getFileDiff(repoPath: string, filePath: string, staged: boolean = false): Promise<GitDiff | null> {
  const gitCheck = await checkGitAvailable();
  if (!gitCheck.available) {
    return null;
  }

  const repoCheck = await isGitRepository(repoPath);
  if (!repoCheck.isRepo) {
    return null;
  }

  const repoRoot = repoCheck.repoRoot!;

  // Check if file is untracked (new file not yet staged)
  const statusResult = await execGit(repoRoot, ['status', '--porcelain', '--', filePath]);
  const isUntracked = statusResult?.stdout.startsWith('??') || statusResult?.stdout.startsWith('A ') || false;
  const isDeleted = statusResult?.stdout.includes('D') || false;

  let diffArgs = staged ? ['diff', '--cached'] : ['diff'];

  // For untracked files, show the whole file as additions
  if (isUntracked && !staged) {
    diffArgs = ['diff', '--no-index', '/dev/null'];
  }

  const diffResult = await execGit(repoRoot, [...diffArgs, '--', filePath]);

  // If no diff result for untracked file, try to read the file content directly
  if (!diffResult?.stdout && isUntracked) {
    const fullPath = join(repoRoot, filePath);
    if (existsSync(fullPath)) {
      try {
        const { readFileSync } = await import('node:fs');
        const content = readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        const diffContent = lines.map((line, idx) => `+${line}`).join('\n');
        return {
          path: filePath,
          diff: `@@ -0,0 +1,${lines.length} @@\n${diffContent}`,
          additions: lines.length,
          deletions: 0,
          isBinary: false,
          isNew: true,
          isDeleted: false,
        };
      } catch {
        // Could be binary or permission issue
        return {
          path: filePath,
          diff: '',
          additions: 0,
          deletions: 0,
          isBinary: true,
          isNew: true,
          isDeleted: false,
        };
      }
    }
  }

  const diff = diffResult?.stdout || '';

  // Check if binary
  const isBinary = diff.includes('Binary files') || diff.includes('GIT binary patch');

  // Count additions and deletions
  let additions = 0;
  let deletions = 0;

  if (!isBinary) {
    const diffLines = diff.split('\n');
    for (const line of diffLines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
      }
    }
  }

  return {
    path: filePath,
    diff,
    additions,
    deletions,
    isBinary,
    isNew: isUntracked,
    isDeleted: isDeleted || false,
  };
}

/**
 * Clear the git availability cache (useful for testing)
 */
export function clearGitCache(): void {
  gitAvailabilityCache = null;
}
