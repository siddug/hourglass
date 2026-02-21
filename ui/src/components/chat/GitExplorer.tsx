'use client';

import { useState, useEffect, useCallback } from 'react';
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

interface GitExplorerProps {
  initialPath: string;
  onRepoChange?: (repoPath: string | null) => void;
}

type ViewState =
  | { type: 'loading' }
  | { type: 'git-not-available'; error: string }
  | { type: 'not-a-repo'; path: string }
  | { type: 'select-repo' }
  | { type: 'repo-view'; status: GitStatus }
  | { type: 'error'; error: string };

export function GitExplorer({ initialPath, onRepoChange }: GitExplorerProps) {
  const [viewState, setViewState] = useState<ViewState>({ type: 'loading' });
  const [selectedFile, setSelectedFile] = useState<GitFileChange | null>(null);
  const [fileDiff, setFileDiff] = useState<GitDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<GitFileStatus>>(
    new Set(['added', 'modified', 'deleted', 'untracked', 'renamed'])
  );
  const [currentRepoPath, setCurrentRepoPath] = useState<string | null>(null);

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
                        {files.map((file) => (
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
                          </button>
                        ))}
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
                    <DiffView diff={fileDiff.diff} />
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
    </div>
  );
}

/**
 * Diff viewer component - renders unified diff with syntax highlighting
 */
function DiffView({ diff }: { diff: string }) {
  if (!diff) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
        No changes to display
      </div>
    );
  }

  const lines = diff.split('\n');

  return (
    <pre className="text-xs font-mono leading-5 overflow-x-auto">
      {lines.map((line, idx) => {
        let className = 'px-2 whitespace-pre';
        let prefix = ' ';

        if (line.startsWith('@@')) {
          className += ' bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
          className += ' bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300';
          prefix = '+';
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          className += ' bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300';
          prefix = '-';
        } else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
          className += ' text-gray-500 dark:text-gray-400';
        } else {
          className += ' text-[var(--text-primary)]';
        }

        return (
          <div key={idx} className={className}>
            {line || ' '}
          </div>
        );
      })}
    </pre>
  );
}
