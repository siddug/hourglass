'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getGitStatus,
  getGitDiff,
  type GitStatus,
  type GitFileChange,
  type GitDiff,
  type GitFileStatus,
} from '@/lib/api';
import { Button, Spinner } from '@/components/ui';
import { FileExplorer } from './FileExplorer';

// --- Comment types ---
export interface DiffComment {
  id: string;
  lineIndex: number;
  lineNumber: number | null; // Actual file line number (new for +/context, old for -)
  lineContent: string;
  lineType: 'added' | 'deleted' | 'context' | 'header';
  text: string;
}

// All comments keyed by file path
export type CommentsMap = Map<string, DiffComment[]>;

interface GitExplorerProps {
  initialPath: string;
  onRepoChange?: (repoPath: string | null) => void;
  sessionId?: string;
  onSendComments?: (formattedMessage: string) => void;
}

type ViewState =
  | { type: 'loading' }
  | { type: 'git-not-available'; error: string }
  | { type: 'not-a-repo'; path: string }
  | { type: 'select-repo' }
  | { type: 'repo-view'; status: GitStatus }
  | { type: 'error'; error: string };

/** Format all comments into a structured prompt for the agent */
function formatCommentsForAgent(comments: CommentsMap): string {
  const sections: string[] = [];

  for (const [filePath, fileComments] of comments) {
    if (fileComments.length === 0) continue;

    const lines = fileComments.map((c) => {
      const typeLabel =
        c.lineType === 'added' ? '(added)' :
        c.lineType === 'deleted' ? '(deleted)' :
        c.lineType === 'header' ? '(hunk)' : '';
      const lineNum = c.lineNumber != null ? `Line ${c.lineNumber}` : `Diff line ${c.lineIndex + 1}`;
      const lineRef = `${lineNum} ${typeLabel}`.trim();
      const context = c.lineContent.trim() ? ` \`${c.lineContent.trim()}\`` : '';
      return `- ${lineRef}${context}: "${c.text}"`;
    });

    sections.push(`**File: ${filePath}**\n${lines.join('\n')}`);
  }

  return `Please address these code review comments on your changes:\n\n${sections.join('\n\n')}`;
}

/** Count total comments across all files */
function totalCommentCount(comments: CommentsMap): number {
  let count = 0;
  for (const fileComments of comments.values()) {
    count += fileComments.length;
  }
  return count;
}

export function GitExplorer({ initialPath, onRepoChange, sessionId, onSendComments }: GitExplorerProps) {
  const [viewState, setViewState] = useState<ViewState>({ type: 'loading' });
  const [selectedFile, setSelectedFile] = useState<GitFileChange | null>(null);
  const [fileDiff, setFileDiff] = useState<GitDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<GitFileStatus>>(
    new Set(['added', 'modified', 'deleted', 'untracked', 'renamed'])
  );
  const [currentRepoPath, setCurrentRepoPath] = useState<string | null>(null);

  // Comments state: Map<filePath, DiffComment[]>
  const [comments, setComments] = useState<CommentsMap>(new Map());

  const addComment = useCallback((filePath: string, comment: DiffComment) => {
    setComments((prev) => {
      const next = new Map(prev);
      const existing = next.get(filePath) || [];
      next.set(filePath, [...existing, comment]);
      return next;
    });
  }, []);

  const editComment = useCallback((filePath: string, commentId: string, newText: string) => {
    setComments((prev) => {
      const next = new Map(prev);
      const existing = next.get(filePath);
      if (!existing) return prev;
      next.set(filePath, existing.map((c) => c.id === commentId ? { ...c, text: newText } : c));
      return next;
    });
  }, []);

  const deleteComment = useCallback((filePath: string, commentId: string) => {
    setComments((prev) => {
      const next = new Map(prev);
      const existing = next.get(filePath);
      if (!existing) return prev;
      const filtered = existing.filter((c) => c.id !== commentId);
      if (filtered.length === 0) {
        next.delete(filePath);
      } else {
        next.set(filePath, filtered);
      }
      return next;
    });
  }, []);

  const handleSendComments = useCallback(() => {
    const total = totalCommentCount(comments);
    if (total === 0) return;

    const message = formatCommentsForAgent(comments);
    onSendComments?.(message);
    setComments(new Map());
  }, [comments, onSendComments]);

  const loadGitStatus = useCallback(async (path: string) => {
    setViewState({ type: 'loading' });
    setSelectedFile(null);
    setFileDiff(null);

    try {
      const status = await getGitStatus(path);

      if (!status.gitAvailable) {
        setViewState({
          type: 'git-not-available',
          error: status.error || 'Git is not available on this system',
        });
        return;
      }

      if (!status.isGitRepo) {
        setViewState({ type: 'not-a-repo', path });
        return;
      }

      setCurrentRepoPath(status.repoRoot || path);
      onRepoChange?.(status.repoRoot || path);
      setViewState({ type: 'repo-view', status });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setViewState({ type: 'error', error: message });
    }
  }, [onRepoChange]);

  // Load git status on mount
  useEffect(() => {
    loadGitStatus(initialPath);
  }, [initialPath, loadGitStatus]);

  const handleFileClick = async (file: GitFileChange) => {
    setSelectedFile(file);
    setDiffLoading(true);
    setFileDiff(null);

    try {
      if (currentRepoPath) {
        const diff = await getGitDiff(currentRepoPath, file.path, file.staged);
        setFileDiff(diff);
      }
    } catch (error) {
      console.error('Failed to load diff:', error);
    } finally {
      setDiffLoading(false);
    }
  };

  const toggleSection = (status: GitFileStatus) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const handleRepoSelect = (path: string) => {
    loadGitStatus(path);
  };

  const handleRefresh = () => {
    if (currentRepoPath) {
      loadGitStatus(currentRepoPath);
    }
  };

  const total = totalCommentCount(comments);
  const canSend = total > 0 && (!!sessionId || !!onSendComments);

  // Render based on view state
  if (viewState.type === 'loading') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner className="h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (viewState.type === 'git-not-available') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 mb-4 text-gray-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">Git Not Available</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
          {viewState.error}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          Please install Git on your system to use this feature.
        </p>
      </div>
    );
  }

  if (viewState.type === 'not-a-repo' || viewState.type === 'select-repo') {
    return (
      <div className="flex-1 flex flex-col h-full">
        <div className="px-4 py-3 border-b border-[var(--card-border)] bg-[var(--sidebar-bg)]">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.6 10.59L8.38 4.8l1.69 1.7c-.24.85.15 1.78.93 2.23v5.54c-.6.34-1 .99-1 1.73a2 2 0 0 0 2 2 2 2 0 0 0 2-2c0-.74-.4-1.39-1-1.73V9.41l2.07 2.09c-.07.15-.07.32-.07.5a2 2 0 0 0 2 2 2 2 0 0 0 2-2 2 2 0 0 0-2-2c-.18 0-.35 0-.5.07L13.93 7.5a1.98 1.98 0 0 0-1.15-2.34c-.43-.16-.88-.2-1.28-.09L9.8 3.38l.79-.78c.78-.79 2.04-.79 2.82 0l7.99 7.99c.79.78.79 2.04 0 2.82l-7.99 7.99c-.78.78-2.04.78-2.82 0L2.6 13.41c-.79-.78-.79-2.04 0-2.82z" />
            </svg>
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {viewState.type === 'not-a-repo'
                ? 'Not a Git Repository'
                : 'Select a Git Repository'}
            </span>
          </div>
          {viewState.type === 'not-a-repo' && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              The current directory is not a git repository. Select a folder that contains a git repository.
            </p>
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <FileExplorer
            initialPath={viewState.type === 'not-a-repo' ? viewState.path : initialPath}
            mode="select-directory"
            onSelect={handleRepoSelect}
            onCancel={() => {
              if (currentRepoPath) {
                loadGitStatus(currentRepoPath);
              }
            }}
          />
        </div>
      </div>
    );
  }

  if (viewState.type === 'error') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 mb-4 text-red-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">Error</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-4">
          {viewState.error}
        </p>
        <Button variant="secondary" onClick={() => loadGitStatus(initialPath)}>
          Try Again
        </Button>
      </div>
    );
  }

  // Repo view
  const { status } = viewState;
  const changes = status.changes || [];

  // Group changes by status
  const groupedChanges = changes.reduce<Record<GitFileStatus, GitFileChange[]>>(
    (acc, change) => {
      if (!acc[change.status]) {
        acc[change.status] = [];
      }
      acc[change.status].push(change);
      return acc;
    },
    {} as Record<GitFileStatus, GitFileChange[]>
  );

  const statusConfig: Record<GitFileStatus, { label: string; color: string; icon: string }> = {
    added: { label: 'Added', color: 'text-green-500', icon: '+' },
    untracked: { label: 'Untracked', color: 'text-green-500', icon: '?' },
    modified: { label: 'Modified', color: 'text-yellow-500', icon: '~' },
    deleted: { label: 'Deleted', color: 'text-red-500', icon: '-' },
    renamed: { label: 'Renamed', color: 'text-blue-500', icon: 'R' },
  };

  const statusOrder: GitFileStatus[] = ['added', 'untracked', 'modified', 'deleted', 'renamed'];

  const fileComments = selectedFile ? (comments.get(selectedFile.path) || []) : [];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header with repo info */}
      <div className="px-4 py-3 border-b border-[var(--card-border)] bg-[var(--sidebar-bg)] flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.6 10.59L8.38 4.8l1.69 1.7c-.24.85.15 1.78.93 2.23v5.54c-.6.34-1 .99-1 1.73a2 2 0 0 0 2 2 2 2 0 0 0 2-2c0-.74-.4-1.39-1-1.73V9.41l2.07 2.09c-.07.15-.07.32-.07.5a2 2 0 0 0 2 2 2 2 0 0 0 2-2 2 2 0 0 0-2-2c-.18 0-.35 0-.5.07L13.93 7.5a1.98 1.98 0 0 0-1.15-2.34c-.43-.16-.88-.2-1.28-.09L9.8 3.38l.79-.78c.78-.79 2.04-.79 2.82 0l7.99 7.99c.79.78.79 2.04 0 2.82l-7.99 7.99c-.78.78-2.04.78-2.82 0L2.6 13.41c-.79-.78-.79-2.04 0-2.82z" />
            </svg>
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {status.info?.branch || 'Unknown Branch'}
            </span>
            {status.info?.remoteBranch && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                tracking {status.info.remoteBranch}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewState({ type: 'select-repo' })}
              className="text-xs text-blue-500 hover:text-blue-600 cursor-pointer"
            >
              Change repo
            </button>
            <button
              onClick={handleRefresh}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
              title="Refresh"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Ahead/Behind info */}
        {status.info && (status.info.ahead > 0 || status.info.behind > 0) && (
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-2">
            {status.info.ahead > 0 && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                {status.info.ahead} ahead
              </span>
            )}
            {status.info.behind > 0 && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                {status.info.behind} behind
              </span>
            )}
          </div>
        )}

        {/* Last commit info */}
        {status.info?.lastCommit && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <span className="font-mono text-orange-500">{status.info.lastCommit.shortHash}</span>
            {' - '}
            <span className="truncate">{status.info.lastCommit.message}</span>
            {' '}
            <span className="text-gray-400">({status.info.lastCommit.date})</span>
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Changes list */}
        <div className={`${selectedFile ? 'w-1/3' : 'w-full'} flex flex-col border-r border-[var(--card-border)] overflow-hidden transition-all`}>
          {changes.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-12 h-12 mb-3 text-green-500">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">Working tree clean</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No changes detected in this repository
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {statusOrder.map((statusKey) => {
                const files = groupedChanges[statusKey];
                if (!files || files.length === 0) return null;

                const config = statusConfig[statusKey];
                const isExpanded = expandedSections.has(statusKey);

                return (
                  <div key={statusKey} className="border-b border-[var(--card-border)] last:border-b-0">
                    <button
                      onClick={() => toggleSection(statusKey)}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    >
                      <svg
                        className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className={`font-mono text-sm font-bold ${config.color}`}>{config.icon}</span>
                      <span className="text-sm font-medium text-[var(--text-primary)]">{config.label}</span>
                      <span className="text-xs text-gray-400">({files.length})</span>
                    </button>
                    {isExpanded && (
                      <div className="pb-1">
                        {files.map((file) => {
                          const fileCommentCount = (comments.get(file.path) || []).length;
                          return (
                            <button
                              key={file.path}
                              onClick={() => handleFileClick(file)}
                              className={`w-full px-3 py-1.5 pl-8 flex items-center gap-2 text-left text-sm cursor-pointer transition-colors ${
                                selectedFile?.path === file.path
                                  ? 'bg-blue-500 text-white'
                                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-[var(--text-primary)]'
                              }`}
                            >
                              <span className={`font-mono text-xs ${selectedFile?.path === file.path ? 'text-white' : config.color}`}>
                                {config.icon}
                              </span>
                              <span className="truncate font-mono text-xs">{file.path}</span>
                              {file.staged && (
                                <span className={`text-xs px-1 rounded ${selectedFile?.path === file.path ? 'bg-blue-400' : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'}`}>
                                  staged
                                </span>
                              )}
                              {fileCommentCount > 0 && (
                                <span className={`ml-auto flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                  selectedFile?.path === file.path
                                    ? 'bg-blue-400 text-white'
                                    : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                                }`}>
                                  {fileCommentCount}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Diff viewer */}
        {selectedFile && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-[var(--card-border)] bg-[var(--sidebar-bg)] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`font-mono text-sm font-bold ${statusConfig[selectedFile.status].color}`}>
                  {statusConfig[selectedFile.status].icon}
                </span>
                <span className="text-sm font-mono truncate text-[var(--text-primary)]">
                  {selectedFile.path}
                </span>
                {fileComments.length > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-medium">
                    {fileComments.length} comment{fileComments.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setFileDiff(null);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
              {diffLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Spinner className="h-6 w-6 text-blue-500" />
                </div>
              ) : fileDiff ? (
                fileDiff.isBinary ? (
                  <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                    Binary file - diff not available
                  </div>
                ) : (
                  <div className="p-2">
                    <div className="flex items-center gap-4 mb-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="text-green-500">+{fileDiff.additions} additions</span>
                      <span className="text-red-500">-{fileDiff.deletions} deletions</span>
                    </div>
                    <DiffView
                      diff={fileDiff.diff}
                      filePath={selectedFile.path}
                      comments={fileComments}
                      onAddComment={(comment) => addComment(selectedFile.path, comment)}
                      onEditComment={(commentId, newText) => editComment(selectedFile.path, commentId, newText)}
                      onDeleteComment={(commentId) => deleteComment(selectedFile.path, commentId)}
                    />
                  </div>
                )
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                  No diff available
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sticky "Send to Agent" bar */}
      {canSend && (
        <div className="flex-shrink-0 border-t border-[var(--card-border)] bg-[var(--sidebar-bg)] px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              <span className="font-medium">
                {total} review comment{total !== 1 ? 's' : ''}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                across {comments.size} file{comments.size !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setComments(new Map())}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer px-2 py-1"
              >
                Clear all
              </button>
              <Button variant="primary" onClick={handleSendComments}>
                Send to Agent
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Interactive DiffView with inline commenting ---

interface DiffViewProps {
  diff: string;
  filePath: string;
  comments: DiffComment[];
  onAddComment: (comment: DiffComment) => void;
  onEditComment: (commentId: string, newText: string) => void;
  onDeleteComment: (commentId: string) => void;
}

function getLineType(line: string): DiffComment['lineType'] {
  if (line.startsWith('@@')) return 'header';
  if (line.startsWith('+') && !line.startsWith('+++')) return 'added';
  if (line.startsWith('-') && !line.startsWith('---')) return 'deleted';
  return 'context';
}

/** Parsed line info with old/new file line numbers */
interface ParsedDiffLine {
  raw: string;
  type: 'added' | 'deleted' | 'context' | 'header' | 'meta';
  oldLineNum: number | null;
  newLineNum: number | null;
}

/** Parse unified diff to compute old/new line numbers from @@ headers */
function parseDiffLines(diff: string): ParsedDiffLine[] {
  const rawLines = diff.split('\n');
  const result: ParsedDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of rawLines) {
    const isMeta = raw.startsWith('diff ') || raw.startsWith('index ') || raw.startsWith('---') || raw.startsWith('+++');

    if (raw.startsWith('@@')) {
      // Parse hunk header: @@ -oldStart[,oldCount] +newStart[,newCount] @@
      const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({ raw, type: 'header', oldLineNum: null, newLineNum: null });
    } else if (isMeta) {
      result.push({ raw, type: 'meta', oldLineNum: null, newLineNum: null });
    } else if (raw.startsWith('+')) {
      result.push({ raw, type: 'added', oldLineNum: null, newLineNum: newLine });
      newLine++;
    } else if (raw.startsWith('-')) {
      result.push({ raw, type: 'deleted', oldLineNum: oldLine, newLineNum: null });
      oldLine++;
    } else {
      // Context line
      result.push({ raw, type: 'context', oldLineNum: oldLine, newLineNum: newLine });
      oldLine++;
      newLine++;
    }
  }

  return result;
}

function DiffView({ diff, filePath, comments, onAddComment, onEditComment, onDeleteComment }: DiffViewProps) {
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [commentingLine, setCommentingLine] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // Focus the comment textarea when opening
  useEffect(() => {
    if (commentingLine !== null && commentInputRef.current) {
      commentInputRef.current.focus();
    }
  }, [commentingLine]);

  useEffect(() => {
    if (editingCommentId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingCommentId]);

  if (!diff) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
        No changes to display
      </div>
    );
  }

  const parsedLines = parseDiffLines(diff);

  const handleAddComment = (lineIndex: number) => {
    setCommentingLine(lineIndex);
    setCommentText('');
  };

  const handleSubmitComment = (lineIndex: number) => {
    if (!commentText.trim()) return;
    const parsed = parsedLines[lineIndex];
    if (!parsed) return;
    const lineNumber = parsed.newLineNum ?? parsed.oldLineNum;
    onAddComment({
      id: `${filePath}-${lineIndex}-${Date.now()}`,
      lineIndex,
      lineNumber,
      lineContent: parsed.raw,
      lineType: getLineType(parsed.raw),
      text: commentText.trim(),
    });
    setCommentingLine(null);
    setCommentText('');
  };

  const handleStartEdit = (comment: DiffComment) => {
    setEditingCommentId(comment.id);
    setEditText(comment.text);
  };

  const handleSubmitEdit = () => {
    if (!editingCommentId || !editText.trim()) return;
    onEditComment(editingCommentId, editText.trim());
    setEditingCommentId(null);
    setEditText('');
  };

  const handleCommentKeyDown = (e: React.KeyboardEvent, lineIndex: number) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmitComment(lineIndex);
    } else if (e.key === 'Escape') {
      setCommentingLine(null);
      setCommentText('');
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmitEdit();
    } else if (e.key === 'Escape') {
      setEditingCommentId(null);
      setEditText('');
    }
  };

  // Build a lookup: lineIndex -> comments on that line
  const commentsByLine = new Map<number, DiffComment[]>();
  for (const c of comments) {
    const existing = commentsByLine.get(c.lineIndex) || [];
    existing.push(c);
    commentsByLine.set(c.lineIndex, existing);
  }

  // Compute max line number width for consistent column sizing
  let maxNum = 0;
  for (const pl of parsedLines) {
    if (pl.oldLineNum != null && pl.oldLineNum > maxNum) maxNum = pl.oldLineNum;
    if (pl.newLineNum != null && pl.newLineNum > maxNum) maxNum = pl.newLineNum;
  }
  const numWidth = Math.max(String(maxNum).length, 2);

  return (
    <pre className="text-xs font-mono leading-5 overflow-x-auto">
      {parsedLines.map((parsed, idx) => {
        let lineClass = 'whitespace-pre relative';
        const isInteractive = parsed.type !== 'meta' && parsed.type !== 'header';

        if (parsed.type === 'header') {
          lineClass += ' bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
        } else if (parsed.type === 'added') {
          lineClass += ' bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300';
        } else if (parsed.type === 'deleted') {
          lineClass += ' bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300';
        } else if (parsed.type === 'meta') {
          lineClass += ' text-gray-500 dark:text-gray-400';
        } else {
          lineClass += ' text-[var(--text-primary)]';
        }

        const lineComments = commentsByLine.get(idx) || [];
        const hasComments = lineComments.length > 0;
        const isHovered = hoveredLine === idx;
        const isCommenting = commentingLine === idx;

        // Format line numbers
        const oldNum = parsed.oldLineNum != null ? String(parsed.oldLineNum).padStart(numWidth, ' ') : ' '.repeat(numWidth);
        const newNum = parsed.newLineNum != null ? String(parsed.newLineNum).padStart(numWidth, ' ') : ' '.repeat(numWidth);
        const showLineNums = parsed.type !== 'meta';

        return (
          <div key={idx}>
            {/* The diff line itself */}
            <div
              className={`${lineClass} group flex`}
              onMouseEnter={() => isInteractive && setHoveredLine(idx)}
              onMouseLeave={() => setHoveredLine(null)}
            >
              {/* Gutter: comment button */}
              <span className="w-7 flex-shrink-0 flex items-center justify-center select-none">
                {isInteractive && (isHovered || hasComments) ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddComment(idx);
                    }}
                    className={`w-5 h-5 flex items-center justify-center rounded text-xs font-bold cursor-pointer transition-colors ${
                      hasComments
                        ? 'bg-blue-500 text-white'
                        : 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300 opacity-0 group-hover:opacity-100'
                    }`}
                    title="Add comment"
                  >
                    {hasComments ? lineComments.length : '+'}
                  </button>
                ) : null}
              </span>

              {/* Line numbers: old | new */}
              {showLineNums ? (
                <>
                  <span className="select-none text-gray-400 dark:text-gray-600 border-r border-gray-200 dark:border-gray-700 pr-1 text-right" style={{ minWidth: `${numWidth + 0.5}ch` }}>
                    {oldNum}
                  </span>
                  <span className="select-none text-gray-400 dark:text-gray-600 border-r border-gray-200 dark:border-gray-700 px-1 text-right" style={{ minWidth: `${numWidth + 0.5}ch` }}>
                    {newNum}
                  </span>
                </>
              ) : (
                <span className="select-none border-r border-gray-200 dark:border-gray-700 px-1" style={{ minWidth: `${(numWidth + 0.5) * 2 + 0.5}ch` }}> </span>
              )}

              {/* Line content */}
              <span className="px-2 flex-1">{parsed.raw || ' '}</span>
            </div>

            {/* Existing comments on this line */}
            {hasComments && (
              <div className="ml-8 mr-2 my-1 space-y-1">
                {lineComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2 text-xs"
                  >
                    {editingCommentId === comment.id ? (
                      // Edit mode
                      <div>
                        <textarea
                          ref={editInputRef}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={handleEditKeyDown}
                          className="w-full px-2 py-1.5 text-xs rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-900 text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none font-sans"
                          rows={2}
                        />
                        <div className="flex items-center gap-2 mt-1.5">
                          <button
                            onClick={handleSubmitEdit}
                            className="text-xs px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 cursor-pointer font-sans"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingCommentId(null); setEditText(''); }}
                            className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer font-sans"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Display mode
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[var(--text-primary)] whitespace-pre-wrap font-sans">{comment.text}</p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleStartEdit(comment)}
                            className="p-0.5 text-gray-400 hover:text-blue-500 cursor-pointer"
                            title="Edit comment"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => onDeleteComment(comment.id)}
                            className="p-0.5 text-gray-400 hover:text-red-500 cursor-pointer"
                            title="Delete comment"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Inline comment form (when user clicks "+") */}
            {isCommenting && (
              <div className="ml-8 mr-2 my-1 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 rounded-md p-2 shadow-sm">
                <textarea
                  ref={commentInputRef}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => handleCommentKeyDown(e, idx)}
                  placeholder="Add a review comment..."
                  className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none font-sans"
                  rows={2}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-gray-400 font-sans">
                    {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to submit
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setCommentingLine(null); setCommentText(''); }}
                      className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer font-sans"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSubmitComment(idx)}
                      disabled={!commentText.trim()}
                      className="text-xs px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-sans"
                    >
                      Add Comment
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </pre>
  );
}
