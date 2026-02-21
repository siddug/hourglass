import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Get the base directory for all project workspaces
 */
export function getProjectsBaseDir(): string {
  return join(homedir(), '.hourglass', 'projects');
}

/**
 * Get the workspace path for a project
 */
export function getProjectWorkspacePath(projectSlug: string): string {
  return join(getProjectsBaseDir(), projectSlug);
}

/**
 * Initialize a project workspace with the standard folder structure and templates
 */
export function initializeProjectWorkspace(projectSlug: string): string {
  const workspacePath = getProjectWorkspacePath(projectSlug);

  // Create directory structure
  mkdirSync(join(workspacePath, 'daily-work'), { recursive: true });
  mkdirSync(join(workspacePath, 'team-messages'), { recursive: true });
  mkdirSync(join(workspacePath, 'project-management'), { recursive: true });
  mkdirSync(join(workspacePath, 'artifacts'), { recursive: true });

  // Initialize template files
  const pendingTodosPath = join(workspacePath, 'project-management', 'pending_todos.md');
  if (!existsSync(pendingTodosPath)) {
    writeFileSync(pendingTodosPath, `# Pending Tasks

<!--
Format:
- [ ] Task description @owner-readable-id

Example:
- [ ] Write landing page copy @mark
- [ ] Review API endpoints @dev
-->
`, 'utf-8');
  }

  const completedTodosPath = join(workspacePath, 'project-management', 'completed_todos.md');
  if (!existsSync(completedTodosPath)) {
    writeFileSync(completedTodosPath, `# Completed Tasks

<!--
Format:
- [x] Task description @owner-readable-id (completed: YYYY-MM-DD)

Example:
- [x] Set up project structure @dev (completed: 2026-02-07)
-->
`, 'utf-8');
  }

  // Initialize read-cursors.json
  const cursorsPath = join(workspacePath, 'read-cursors.json');
  if (!existsSync(cursorsPath)) {
    writeFileSync(cursorsPath, '{}', 'utf-8');
  }

  return workspacePath;
}

/**
 * Check if a project workspace exists
 */
export function projectWorkspaceExists(projectSlug: string): boolean {
  return existsSync(getProjectWorkspacePath(projectSlug));
}
