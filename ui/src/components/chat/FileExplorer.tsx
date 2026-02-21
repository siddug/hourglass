'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { listDirectory, readFile, getRawFileUrl, fetchRawFileAsBlob, downloadDirectory, downloadFile, type FileEntry } from '@/lib/api';
import { Button, Spinner } from '@/components/ui';

interface Column {
  path: string;
  entries: FileEntry[];
  loading: boolean;
  error: string | null;
  selectedEntry: string | null; // name of the selected entry in this column
}

interface FileExplorerProps {
  initialPath: string;
  mode: 'select-directory' | 'browse';
  onSelect?: (path: string) => void;
  onCancel?: () => void;
}

type FileCategory = 'markdown' | 'image' | 'audio' | 'text' | 'binary';

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico',
]);

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.webm',
]);

const KNOWN_TEXT_EXTENSIONS = new Set([
  // Code
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.scala', '.swift',
  '.c', '.cpp', '.cc', '.h', '.hpp', '.cs',
  '.php', '.lua', '.pl', '.r', '.m', '.mm',
  '.zig', '.nim', '.ex', '.exs', '.erl', '.hs', '.clj',
  '.dart', '.v', '.sol',
  // Web
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.vue', '.svelte', '.astro',
  // Config / data
  '.json', '.yaml', '.yml', '.toml', '.xml', '.ini', '.conf', '.cfg',
  '.env', '.env.local', '.env.example',
  '.properties', '.plist',
  // Shell / scripts
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  // Docs / text
  '.txt', '.log', '.csv', '.tsv', '.rst', '.tex', '.adoc',
  // Build / project
  '.dockerfile', '.containerfile',
  '.gitignore', '.gitattributes', '.editorconfig', '.prettierrc',
  '.eslintrc', '.babelrc', '.npmrc',
  '.makefile', '.cmake',
  '.tf', '.hcl',
  '.graphql', '.gql', '.proto', '.sql',
  // Lock / manifest
  '.lock', '.sum',
]);

// Files with no extension that are typically text
const KNOWN_TEXT_FILENAMES = new Set([
  'Makefile', 'Dockerfile', 'Containerfile', 'Vagrantfile', 'Procfile',
  'Gemfile', 'Rakefile', 'Brewfile',
  'LICENSE', 'LICENCE', 'CHANGELOG', 'AUTHORS', 'CONTRIBUTORS',
  'README', 'INSTALL', 'TODO', 'NOTES',
  '.gitignore', '.gitattributes', '.editorconfig', '.dockerignore',
  '.prettierrc', '.eslintrc', '.babelrc', '.npmrc', '.nvmrc',
  '.env', '.env.local', '.env.example',
]);

function getFileCategory(path: string): FileCategory {
  const name = path.split('/').pop() || '';
  const ext = name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : '';

  if (/\.(md|mdx|markdown)$/i.test(name)) return 'markdown';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (KNOWN_TEXT_EXTENSIONS.has(ext)) return 'text';
  if (KNOWN_TEXT_FILENAMES.has(name)) return 'text';

  // Dotfiles without a recognized extension — likely text config
  if (name.startsWith('.') && ext && !IMAGE_EXTENSIONS.has(ext) && !AUDIO_EXTENSIONS.has(ext)) return 'text';

  // No extension and not a known filename — try text anyway
  if (!ext) return 'text';

  return 'binary';
}

function getLanguageHint(path: string): string {
  const ext = ('.' + (path.split('.').pop() || '')).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TSX', '.js': 'JavaScript', '.jsx': 'JSX',
    '.py': 'Python', '.rb': 'Ruby', '.go': 'Go', '.rs': 'Rust',
    '.java': 'Java', '.kt': 'Kotlin', '.swift': 'Swift',
    '.c': 'C', '.cpp': 'C++', '.h': 'C Header', '.cs': 'C#',
    '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS',
    '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML', '.toml': 'TOML', '.xml': 'XML',
    '.sh': 'Shell', '.bash': 'Bash', '.sql': 'SQL',
    '.graphql': 'GraphQL', '.proto': 'Protobuf',
    '.dockerfile': 'Dockerfile',
  };
  return map[ext] || '';
}

export function FileExplorer({ initialPath, mode, onSelect, onCancel }: FileExplorerProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'file' | 'directory' | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Download state
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);

  // Preview state
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [showRawMarkdown, setShowRawMarkdown] = useState(false);

  const loadDirectory = useCallback(async (path: string): Promise<{ entries: FileEntry[]; resolvedPath: string } | null> => {
    try {
      const result = await listDirectory(path);
      return { entries: result.entries, resolvedPath: result.path };
    } catch {
      return null;
    }
  }, []);

  // Load initial directory
  useEffect(() => {
    const init = async () => {
      const pathToLoad = initialPath || '~';
      setColumns([{ path: pathToLoad, entries: [], loading: true, error: null, selectedEntry: null }]);

      const result = await loadDirectory(pathToLoad);
      if (result) {
        setColumns([{ path: result.resolvedPath, entries: result.entries, loading: false, error: null, selectedEntry: null }]);
      } else {
        // Fallback to home if initial path fails
        const fallback = await loadDirectory('~');
        if (fallback) {
          setColumns([{ path: fallback.resolvedPath, entries: fallback.entries, loading: false, error: null, selectedEntry: null }]);
        } else {
          setColumns([{ path: pathToLoad, entries: [], loading: false, error: 'Failed to load directory', selectedEntry: null }]);
        }
      }
    };
    init();
  }, [initialPath, loadDirectory]);

  // Auto-scroll right when new columns are added
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
    }
  }, [columns.length]);

  // Load audio blob URL when an audio file is selected
  useEffect(() => {
    if (!selectedPath || selectedType !== 'file' || getFileCategory(selectedPath) !== 'audio') {
      setAudioBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    fetchRawFileAsBlob(selectedPath)
      .then((url) => {
        if (!cancelled) {
          setAudioBlobUrl(url);
          setPreviewLoading(false);
        } else {
          URL.revokeObjectURL(url);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPreviewError(err instanceof Error ? err.message : 'Failed to load audio');
          setPreviewLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [selectedPath, selectedType]);

  // Load file preview when a file is selected
  useEffect(() => {
    if (!selectedPath || selectedType !== 'file') {
      setPreviewContent(null);
      setPreviewError(null);
      setShowRawMarkdown(false);
      return;
    }

    // Reset raw markdown toggle when file changes
    setShowRawMarkdown(false);

    const category = getFileCategory(selectedPath);

    // Images, audio, and binary files don't need text content loaded
    if (category === 'image' || category === 'audio' || category === 'binary') {
      setPreviewContent(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    // Load text content for markdown and text/code files
    let cancelled = false;
    const loadPreview = async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const result = await readFile(selectedPath);
        if (!cancelled) {
          setPreviewContent(result.content);
        }
      } catch (err) {
        if (!cancelled) {
          setPreviewError(err instanceof Error ? err.message : 'Failed to load file');
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    };
    loadPreview();
    return () => { cancelled = true; };
  }, [selectedPath, selectedType]);

  const handleEntryClick = async (columnIndex: number, entry: FileEntry) => {
    // Update selection in this column and remove columns to the right
    setColumns((prev) => {
      const updated = prev.slice(0, columnIndex + 1);
      updated[columnIndex] = { ...updated[columnIndex], selectedEntry: entry.name };
      return updated;
    });

    setSelectedPath(entry.path);
    setSelectedType(entry.type);

    if (entry.type === 'directory') {
      // Add a loading column for the directory contents
      setColumns((prev) => {
        const updated = prev.slice(0, columnIndex + 1);
        updated[columnIndex] = { ...updated[columnIndex], selectedEntry: entry.name };
        return [...updated, { path: entry.path, entries: [], loading: true, error: null, selectedEntry: null }];
      });

      const result = await loadDirectory(entry.path);
      setColumns((prev) => {
        // Only update if this column is still the last one (user hasn't clicked elsewhere)
        if (prev.length < columnIndex + 2) return prev;
        const updated = [...prev];
        const targetIdx = columnIndex + 1;
        if (updated[targetIdx]?.path === entry.path) {
          updated[targetIdx] = result
            ? { path: result.resolvedPath, entries: result.entries, loading: false, error: null, selectedEntry: null }
            : { path: entry.path, entries: [], loading: false, error: 'Failed to load', selectedEntry: null };
        }
        return updated;
      });
    }
  };

  const fileCategory = selectedPath ? getFileCategory(selectedPath) : null;
  const showPreview = selectedPath && selectedType === 'file';
  const canSelect = mode === 'select-directory' ? selectedType === 'directory' : selectedPath !== null;

  const renderPreviewContent = () => {
    if (!selectedPath || !fileCategory) return null;

    if (previewLoading) {
      return (
        <div className="flex items-center justify-center h-32">
          <Spinner className="h-5 w-5 text-blue-500" />
        </div>
      );
    }

    if (previewError) {
      return <div className="text-sm text-red-500">{previewError}</div>;
    }

    if (fileCategory === 'image') {
      return (
        <div className="flex items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getRawFileUrl(selectedPath)}
            alt={selectedPath.split('/').pop() || 'Image'}
            className="max-w-full max-h-[60vh] object-contain rounded"
          />
        </div>
      );
    }

    if (fileCategory === 'audio' && audioBlobUrl) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-4">
          <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <audio
            controls
            src={audioBlobUrl}
            className="w-full max-w-md"
          >
            Your browser does not support the audio element.
          </audio>
        </div>
      );
    }

    if (fileCategory === 'binary') {
      return (
        <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <span className="text-sm">Binary file — cannot preview</span>
        </div>
      );
    }

    if (fileCategory === 'markdown' && previewContent !== null) {
      if (showRawMarkdown) {
        const lines = previewContent.split('\n');
        const gutterWidth = String(lines.length).length;
        return (
          <div className="text-sm font-mono overflow-x-auto">
            <table className="border-collapse w-full">
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className="hover:bg-gray-100 dark:hover:bg-gray-800/50">
                    <td className="select-none text-right pr-3 pl-2 text-gray-400 dark:text-gray-600 align-top" style={{ minWidth: `${gutterWidth + 2}ch` }}>
                      {i + 1}
                    </td>
                    <td className="whitespace-pre pr-4">{line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{previewContent}</ReactMarkdown>
        </div>
      );
    }

    // Text / code file
    if (previewContent !== null) {
      const lines = previewContent.split('\n');
      const gutterWidth = String(lines.length).length;
      return (
        <div className="text-sm font-mono overflow-x-auto">
          <table className="border-collapse w-full">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="hover:bg-gray-100 dark:hover:bg-gray-800/50">
                  <td className="select-none text-right pr-3 pl-2 text-gray-400 dark:text-gray-600 align-top" style={{ minWidth: `${gutterWidth + 2}ch` }}>
                    {i + 1}
                  </td>
                  <td className="whitespace-pre pr-4">{line}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return null;
  };

  const previewLabel = fileCategory === 'image' ? 'Image' : fileCategory === 'audio' ? 'Audio' : fileCategory === 'markdown' ? 'Preview' : getLanguageHint(selectedPath || '') || 'File';

  return (
    <div className={`flex flex-col overflow-hidden ${mode === 'browse' ? 'h-full' : 'h-[480px]'}`}>
      {/* Path bar */}
      <div className="px-4 py-2 border-b border-[var(--card-border)] bg-[var(--sidebar-bg)] flex items-center gap-2 min-h-[40px]">
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className="text-sm text-gray-600 dark:text-gray-300 truncate font-mono">
          {selectedPath || columns[0]?.path || '~'}
        </span>
      </div>

      {/* Main content: columns + preview */}
      <div className="flex-1 flex flex-col sm:flex-row overflow-hidden bg-gray-50 dark:bg-gray-900">
        {/* Columns container */}
        <div
          ref={scrollContainerRef}
          className={`flex overflow-x-auto overflow-y-hidden ${showPreview ? 'w-full sm:w-1/2 shrink-0 sm:border-r border-b sm:border-b-0 border-[var(--card-border)] max-h-[40vh] sm:max-h-none' : 'flex-1'}`}
        >
          <div className="flex h-full overflow-hidden min-w-max">
            {columns.map((column, idx) => (
              <div
                key={`${column.path}-${idx}`}
                className="w-56 flex flex-col border-r border-[var(--card-border)] shrink-0"
              >
                {column.loading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Spinner className="h-5 w-5 text-blue-500" />
                  </div>
                ) : column.error ? (
                  <div className="flex-1 flex items-center justify-center p-3">
                    <span className="text-xs text-red-500">{column.error}</span>
                  </div>
                ) : column.entries.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center p-3">
                    <span className="text-xs text-gray-400">Empty folder</span>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto">
                    {column.entries.map((entry) => {
                      const isSelected = column.selectedEntry === entry.name;
                      const isDownloading = downloadingPath === entry.path;
                      return (
                        <div
                          key={entry.name}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleEntryClick(idx, entry)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleEntryClick(idx, entry); }}
                          className={`group/entry w-full text-left px-3 py-1.5 flex items-center gap-2 text-sm cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-500 text-white'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-[var(--text-primary)]'
                          }`}
                        >
                          {entry.type === 'directory' ? (
                            <svg className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-blue-500'}`} fill="currentColor" viewBox="0 0 20 20">
                              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                            </svg>
                          ) : (
                            <svg className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                          )}
                          <span className="truncate">{entry.name}</span>
                          {entry.type === 'directory' ? (
                            <>
                              {isDownloading ? (
                                <Spinner className="w-3.5 h-3.5 ml-auto shrink-0" />
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDownloadingPath(entry.path);
                                    downloadDirectory(entry.path)
                                      .catch(() => {})
                                      .finally(() => setDownloadingPath(null));
                                  }}
                                  className={`ml-auto shrink-0 opacity-0 group-hover/entry:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 ${isSelected ? 'text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
                                  title="Download as zip"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                </button>
                              )}
                              <svg className={`w-3 h-3 shrink-0 ${isSelected ? 'text-white' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </>
                          ) : (
                            isDownloading ? (
                              <Spinner className="w-3.5 h-3.5 ml-auto shrink-0" />
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDownloadingPath(entry.path);
                                  downloadFile(entry.path)
                                    .catch(() => {})
                                    .finally(() => setDownloadingPath(null));
                                }}
                                className={`ml-auto shrink-0 opacity-0 group-hover/entry:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 ${isSelected ? 'text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
                                title="Download file"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                              </button>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* File preview panel */}
        {showPreview && (
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <div className="px-4 py-2 border-b border-[var(--card-border)] bg-[var(--sidebar-bg)] flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{previewLabel}</span>
              <span className="text-xs text-gray-400 truncate ml-1">
                {selectedPath?.split('/').pop()}
              </span>
              <div className="flex items-center gap-2 ml-auto">
                {fileCategory === 'markdown' && (
                  <button
                    onClick={() => setShowRawMarkdown(!showRawMarkdown)}
                    className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                    title={showRawMarkdown ? 'Show rendered preview' : 'Show raw markdown'}
                  >
                    {showRawMarkdown ? 'Preview' : 'Raw'}
                  </button>
                )}
                {/* Download button */}
                {selectedPath && (
                  downloadingPath === selectedPath ? (
                    <Spinner className="w-4 h-4" />
                  ) : (
                    <button
                      onClick={() => {
                        setDownloadingPath(selectedPath);
                        downloadFile(selectedPath)
                          .catch(() => {})
                          .finally(() => setDownloadingPath(null));
                      }}
                      className="p-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                      title="Download file"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  )
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {renderPreviewContent()}
            </div>
          </div>
        )}
      </div>

      {/* Footer - only shown in select modes */}
      {mode === 'select-directory' && (
        <div className="px-4 py-3 border-t border-[var(--card-border)] bg-[var(--card-bg)] flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!canSelect}
            onClick={() => selectedPath && onSelect?.(selectedPath)}
          >
            Select Directory
          </Button>
        </div>
      )}
    </div>
  );
}
