import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AcpEvent } from './types.js';

/**
 * Session info stored for each session
 */
export interface SessionInfo {
  id: string;
  namespace: string;
  createdAt: Date;
  lastModified: Date;
  eventCount: number;
}

/**
 * SessionManager - Manages session persistence for ACP interactions
 *
 * TypeScript port of vibe-kanban's SessionManager. Handles:
 * - Session file persistence (JSONL format)
 * - Event normalization before storage
 * - Session history retrieval
 * - Session forking for follow-ups
 */
export class SessionManager {
  private baseDir: string;
  private namespace: string;

  constructor(namespace: string, options: { baseDir?: string; dev?: boolean } = {}) {
    this.namespace = namespace;

    // Determine base directory
    let vibeDir = options.baseDir || join(homedir(), '.hourglass');

    // Use dev subdirectory in development mode
    if (options.dev ?? process.env.NODE_ENV === 'development') {
      vibeDir = join(vibeDir, 'dev');
    }

    this.baseDir = join(vibeDir, namespace);

    // Ensure directory exists
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Get the file path for a session
   */
  private getSessionFilePath(sessionId: string): string {
    return join(this.baseDir, `${sessionId}.jsonl`);
  }

  /**
   * Normalize an ACP event for storage
   * Removes transient data and simplifies structure
   */
  private normalizeEvent(event: AcpEvent): Record<string, unknown> | null {
    // Skip events that shouldn't be persisted
    switch (event.type) {
      case 'sessionStart':
      case 'error':
      case 'done':
      case 'other':
        return null;
    }

    // Normalize different event types
    switch (event.type) {
      case 'user':
        return { user: event.content };

      case 'message':
        if (event.content.type === 'text') {
          return { assistant: event.content.text };
        }
        return { message: event.content };

      case 'thought':
        if (event.content.type === 'text') {
          return { thinking: event.content.text };
        }
        return { thought: event.content };

      case 'toolCall':
        return {
          toolCall: {
            id: event.toolCall.id,
            name: event.toolCall.name,
            input: event.toolCall.input,
          },
        };

      case 'toolUpdate':
        return {
          toolUpdate: {
            id: event.update.id,
            status: event.update.status,
            output: event.update.output,
            error: event.update.error,
          },
        };

      case 'plan':
        return { plan: event.plan };

      case 'availableCommands':
        return { availableCommands: event.commands };

      case 'currentMode':
        return { currentMode: event.mode };

      case 'requestPermission':
        // Convert to tool update for persistence
        return {
          toolUpdate: {
            id: event.request.toolCallId,
            status: 'pending',
          },
        };

      case 'approvalResponse':
        return {
          approval: {
            toolCallId: event.response.toolCallId,
            status: event.response.status,
          },
        };

      default:
        return null;
    }
  }

  /**
   * Append an event to a session log
   */
  appendEvent(sessionId: string, event: AcpEvent): void {
    const normalized = this.normalizeEvent(event);
    if (!normalized) return;

    const path = this.getSessionFilePath(sessionId);
    const line = JSON.stringify(normalized) + '\n';
    appendFileSync(path, line, 'utf-8');
  }

  /**
   * Append a raw JSON line to a session log
   */
  appendRawLine(sessionId: string, json: string): void {
    const path = this.getSessionFilePath(sessionId);
    appendFileSync(path, json.trim() + '\n', 'utf-8');
  }

  /**
   * Get all events from a session
   */
  getSessionEvents(sessionId: string): Record<string, unknown>[] {
    const path = this.getSessionFilePath(sessionId);
    if (!existsSync(path)) {
      return [];
    }

    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    return lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
  }

  /**
   * Check if a session exists
   */
  sessionExists(sessionId: string): boolean {
    return existsSync(this.getSessionFilePath(sessionId));
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId: string): SessionInfo | null {
    const path = this.getSessionFilePath(sessionId);
    if (!existsSync(path)) {
      return null;
    }

    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    // Get file stats for timestamps
    const stats = require('fs').statSync(path);

    return {
      id: sessionId,
      namespace: this.namespace,
      createdAt: stats.birthtime,
      lastModified: stats.mtime,
      eventCount: lines.length,
    };
  }

  /**
   * List all sessions in this namespace
   */
  listSessions(): SessionInfo[] {
    if (!existsSync(this.baseDir)) {
      return [];
    }

    const files = readdirSync(this.baseDir).filter((f) => f.endsWith('.jsonl'));

    return files
      .map((file) => {
        const sessionId = file.replace('.jsonl', '');
        return this.getSessionInfo(sessionId);
      })
      .filter((info): info is SessionInfo => info !== null);
  }

  /**
   * Fork a session (copy events to a new session ID)
   */
  forkSession(sourceSessionId: string, newSessionId: string): boolean {
    const sourcePath = this.getSessionFilePath(sourceSessionId);
    if (!existsSync(sourcePath)) {
      return false;
    }

    const content = readFileSync(sourcePath, 'utf-8');
    const destPath = this.getSessionFilePath(newSessionId);
    appendFileSync(destPath, content, 'utf-8');

    return true;
  }

  /**
   * Generate a resume prompt from session history
   * Used for follow-up sessions
   */
  generateResumePrompt(sessionId: string): string | null {
    const events = this.getSessionEvents(sessionId);
    if (events.length === 0) {
      return null;
    }

    const parts: string[] = [];

    for (const event of events) {
      if ('user' in event) {
        parts.push(`User: ${event.user}`);
      } else if ('assistant' in event) {
        parts.push(`Assistant: ${event.assistant}`);
      } else if ('thinking' in event) {
        parts.push(`[Thinking: ${(event.thinking as string).slice(0, 100)}...]`);
      } else if ('toolCall' in event) {
        const tc = event.toolCall as { name: string };
        parts.push(`[Tool: ${tc.name}]`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Get the base directory for this namespace
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Get the namespace
   */
  getNamespace(): string {
    return this.namespace;
  }
}

/**
 * Create a new session manager
 */
export function createSessionManager(
  namespace: string,
  options: { baseDir?: string; dev?: boolean } = {}
): SessionManager {
  return new SessionManager(namespace, options);
}
