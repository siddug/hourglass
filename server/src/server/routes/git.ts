import { FastifyPluginAsync } from 'fastify';
import { existsSync, statSync } from 'node:fs';
import { expandHome } from '../../utils/paths.js';
import {
  checkGitAvailable,
  getGitStatus,
  getFileDiff,
  type GitStatus,
  type GitDiff,
} from '../../utils/git.js';

/**
 * Git API routes
 *
 * These routes provide git repository information and diff viewing capabilities.
 * All routes gracefully handle the case where git is not installed.
 */
const gitRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /git/available
   * Check if git is available on the system
   */
  fastify.get('/git/available', async () => {
    const availability = await checkGitAvailable();
    return availability;
  });

  /**
   * GET /git/status
   * Get git status for a directory
   *
   * Query params:
   *   - path: Directory path to check (required)
   *
   * Returns:
   *   - isGitRepo: boolean
   *   - gitAvailable: boolean
   *   - gitVersion?: string
   *   - repoRoot?: string
   *   - info?: { branch, remoteBranch, remoteUrl, lastCommit, ahead, behind }
   *   - changes?: [{ path, status, oldPath, staged }]
   *   - error?: string
   */
  fastify.get('/git/status', async (request, reply) => {
    const { path: rawPath } = request.query as { path?: string };

    if (!rawPath) {
      return reply.status(400).send({ error: 'path query parameter is required' });
    }

    const resolvedPath = expandHome(rawPath);

    // Validate path exists
    if (!existsSync(resolvedPath)) {
      return reply.status(400).send({ error: `Path does not exist: ${rawPath}` });
    }

    // Validate it's a directory
    let stat;
    try {
      stat = statSync(resolvedPath);
    } catch {
      return reply.status(400).send({ error: `Cannot access path: ${rawPath}` });
    }

    if (!stat.isDirectory()) {
      return reply.status(400).send({ error: `Path is not a directory: ${rawPath}` });
    }

    try {
      const status = await getGitStatus(resolvedPath);
      return status;
    } catch (error) {
      // Catch-all for any unexpected errors
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        isGitRepo: false,
        gitAvailable: false,
        error: `Failed to get git status: ${message}`,
      } satisfies GitStatus;
    }
  });

  /**
   * GET /git/diff
   * Get diff for a specific file
   *
   * Query params:
   *   - path: Repository directory path (required)
   *   - file: File path relative to repo root (required)
   *   - staged: Whether to show staged diff (optional, default: false)
   *
   * Returns:
   *   - path: string
   *   - diff: string (unified diff format)
   *   - additions: number
   *   - deletions: number
   *   - isBinary: boolean
   *   - isNew: boolean
   *   - isDeleted: boolean
   */
  fastify.get('/git/diff', async (request, reply) => {
    const { path: rawPath, file, staged } = request.query as {
      path?: string;
      file?: string;
      staged?: string;
    };

    if (!rawPath) {
      return reply.status(400).send({ error: 'path query parameter is required' });
    }

    if (!file) {
      return reply.status(400).send({ error: 'file query parameter is required' });
    }

    const resolvedPath = expandHome(rawPath);

    // Validate path exists
    if (!existsSync(resolvedPath)) {
      return reply.status(400).send({ error: `Path does not exist: ${rawPath}` });
    }

    try {
      const isStaged = staged === 'true';
      const diff = await getFileDiff(resolvedPath, file, isStaged);

      if (!diff) {
        return reply.status(404).send({
          error: 'Could not get diff for file. Either git is not available, the path is not a git repository, or the file has no changes.',
        });
      }

      return diff;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({
        error: `Failed to get diff: ${message}`,
      });
    }
  });
};

export default gitRoutes;
