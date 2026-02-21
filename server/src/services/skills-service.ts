import { existsSync, readdirSync, lstatSync, symlinkSync, readlinkSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

export interface SkillsValidationResult {
  valid: boolean;
  error?: string;
}

export interface SkillsList {
  skills: string[];
}

/**
 * Expand ~ to home directory
 */
function expandTilde(path: string): string {
  if (path.startsWith('~/')) {
    return path.replace('~', homedir());
  }
  if (path === '~') {
    return homedir();
  }
  return path;
}

/**
 * SkillsService handles injection of global skills into agent config directories.
 *
 * Skills are organized in a flat structure:
 * - {globalDir}/<skill-name>/SKILL.md (or any structure)
 *
 * On injection, skills are symlinked to BOTH agents:
 * - ~/.claude/commands/<skill-name> (symlink to skill directory)
 * - ~/.vibe/skills/<skill-name> (symlink to skill directory)
 *
 * This allows the same skills to be available in both Claude Code and Vibe.
 */
export class SkillsService {
  private resolvedDir: string;

  constructor(private globalDir: string) {
    this.resolvedDir = resolve(expandTilde(globalDir));
  }

  /**
   * Get the resolved global skills directory path
   */
  getGlobalDirectory(): string {
    return this.resolvedDir;
  }

  /**
   * Validate the skills directory exists and contains skill directories
   */
  async validate(): Promise<SkillsValidationResult> {
    if (!existsSync(this.resolvedDir)) {
      return { valid: false, error: `Directory does not exist: ${this.resolvedDir}` };
    }

    const stat = lstatSync(this.resolvedDir);
    if (!stat.isDirectory()) {
      return { valid: false, error: `Path is not a directory: ${this.resolvedDir}` };
    }

    // Check for at least one subdirectory (skill)
    const skills = await this.listSkills();
    if (skills.skills.length === 0) {
      return {
        valid: false,
        error: `No skills found in directory. Expected subdirectories with skill definitions.`
      };
    }

    return { valid: true };
  }

  /**
   * List skills found in the global directory
   * Skills are subdirectories in the root of the skills directory
   */
  async listSkills(): Promise<SkillsList> {
    const result: SkillsList = { skills: [] };

    if (!existsSync(this.resolvedDir)) {
      return result;
    }

    try {
      const entries = readdirSync(this.resolvedDir);
      result.skills = entries.filter(entry => {
        // Skip hidden files/directories
        if (entry.startsWith('.')) return false;

        const entryPath = join(this.resolvedDir, entry);
        try {
          const stat = lstatSync(entryPath);
          // Skills are directories (or symlinks to directories)
          return stat.isDirectory() || stat.isSymbolicLink();
        } catch {
          return false;
        }
      });
    } catch {
      // Ignore errors reading directory
    }

    return result;
  }

  /**
   * Inject skills from global directory to agent config directories.
   * Injects to BOTH Claude and Vibe regardless of which connector is being used.
   * Uses symlinks to keep updates synchronized.
   */
  async injectSkills(_connector: 'claude' | 'vibe'): Promise<void> {
    // Inject to both agents - skills are shared
    await this.injectToAgent('claude');
    await this.injectToAgent('vibe');
  }

  /**
   * Inject skills to a specific agent's config directory
   */
  private async injectToAgent(agent: 'claude' | 'vibe'): Promise<void> {
    const skills = await this.listSkills();
    if (skills.skills.length === 0) {
      return;
    }

    // Determine target directory based on agent
    // Claude: ~/.claude/commands/<skill-name> (symlink to directory)
    // Vibe: ~/.vibe/skills/<skill-name> (symlink to directory)
    const targetDir = agent === 'claude'
      ? join(homedir(), '.claude', 'commands')
      : join(homedir(), '.vibe', 'skills');

    // Ensure target directory exists
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    for (const skillName of skills.skills) {
      const sourcePath = join(this.resolvedDir, skillName);
      const targetPath = join(targetDir, skillName);

      // Handle existing target
      if (existsSync(targetPath) || this.isSymlink(targetPath)) {
        if (this.isSymlink(targetPath)) {
          try {
            const existingTarget = readlinkSync(targetPath);
            // Skip if already linked to the same target
            if (resolve(targetDir, existingTarget) === sourcePath) {
              continue;
            }
          } catch {
            // Ignore read errors
          }
        }
        // Skip if already exists (don't overwrite user's files)
        continue;
      }

      // Create symlink
      try {
        symlinkSync(sourcePath, targetPath);
      } catch {
        // Ignore symlink creation errors (permissions, etc.)
      }
    }
  }

  /**
   * Check if a path is a symlink (even if broken)
   */
  private isSymlink(path: string): boolean {
    try {
      return lstatSync(path).isSymbolicLink();
    } catch {
      return false;
    }
  }
}
