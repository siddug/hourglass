import type { Operation } from 'fast-json-patch';

/**
 * JSON Patch utilities for streaming state updates
 *
 * These utilities help create RFC 6902 JSON Patches for efficient
 * state synchronization between server and frontend.
 */

/**
 * Create an "add" operation
 */
export function addOp(path: string, value: unknown): Operation {
  return { op: 'add', path, value };
}

/**
 * Create a "remove" operation
 */
export function removeOp(path: string): Operation {
  return { op: 'remove', path };
}

/**
 * Create a "replace" operation
 */
export function replaceOp(path: string, value: unknown): Operation {
  return { op: 'replace', path, value };
}

/**
 * Create a "move" operation
 */
export function moveOp(from: string, path: string): Operation {
  return { op: 'move', from, path };
}

/**
 * Create a "copy" operation
 */
export function copyOp(from: string, path: string): Operation {
  return { op: 'copy', from, path };
}

/**
 * Create a "test" operation
 */
export function testOp(path: string, value: unknown): Operation {
  return { op: 'test', path, value };
}

/**
 * Escape a JSON Pointer path segment (RFC 6901)
 * ~ becomes ~0
 * / becomes ~1
 */
export function escapePathSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Build a JSON Pointer path from segments
 */
export function buildPath(...segments: (string | number)[]): string {
  return '/' + segments.map((s) => escapePathSegment(String(s))).join('/');
}

/**
 * Common patch patterns for normalized entries (matching vibe-kanban)
 */
export const ConversationPatch = {
  /**
   * Add a new normalized entry at an index
   */
  addNormalizedEntry(index: number, entry: unknown): Operation[] {
    return [addOp(buildPath('normalizedEntries', index), entry)];
  },

  /**
   * Replace an existing normalized entry
   */
  replaceNormalizedEntry(index: number, entry: unknown): Operation[] {
    return [replaceOp(buildPath('normalizedEntries', index), entry)];
  },

  /**
   * Add to the end of normalized entries array
   */
  appendNormalizedEntry(entry: unknown): Operation[] {
    return [addOp('/normalizedEntries/-', entry)];
  },
};

/**
 * Session patch patterns
 */
export const SessionPatch = {
  /**
   * Update session status
   */
  updateStatus(status: string): Operation[] {
    return [replaceOp('/status', status)];
  },

  /**
   * Update session ID
   */
  setSessionId(sessionId: string): Operation[] {
    return [replaceOp('/sessionId', sessionId)];
  },
};

/**
 * Process patch patterns
 */
export const ProcessPatch = {
  /**
   * Update process status
   */
  updateStatus(status: string): Operation[] {
    return [replaceOp('/status', status)];
  },

  /**
   * Set exit code
   */
  setExitCode(exitCode: number): Operation[] {
    return [replaceOp('/exitCode', exitCode)];
  },

  /**
   * Set completion time
   */
  setCompletedAt(timestamp: number): Operation[] {
    return [replaceOp('/completedAt', timestamp)];
  },
};
