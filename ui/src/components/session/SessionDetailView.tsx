'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSession,
  getProcess,
  sendFollowUp,
  killSession,
  interruptSession,
  updateSessionMode,
  updateSession,
  updateSessionStatus,
  getPersonalities,
  getProjectMessages,
  postProjectMessage,
  type Session,
  type ExecutionProcess,
  type ProcessLog,
  type ApprovalRequest,
  type ApprovalMode,
  type SessionStatus,
  type ImageData,
  type Personality,
  type TeamMessage,
} from '@/lib/api';
import { useLogStream, type LogMessage } from '@/hooks/useLogStream';
import { useApprovalStream } from '@/hooks/useApprovalStream';
import { usePaginatedSessions } from '@/hooks/usePaginatedSessions';
import ReactMarkdown from 'react-markdown';
import {
  Button,
  Card,
  StatusBadge,
  ProviderBadge,
  AILogo,
  UserAvatar,
  Spinner,
  Input,
  Dropdown,
  IconButton,
  Dialog,
} from '@/components/ui';
import { FileExplorer } from '@/components/chat/FileExplorer';
import { GitExplorer } from '@/components/chat/GitExplorer';

type SessionTab = 'agent' | 'files' | 'git' | 'workspace' | 'messages';

interface ConversationTurn {
  process: ExecutionProcess;
  logs: ProcessLog[];
  isLoading: boolean;
}

interface SessionDetailViewProps {
  sessionId: string;
  onNavigateHome?: () => void;
  showCloseButton?: boolean;
  onClose?: () => void;
  compact?: boolean;
}

export function SessionDetailView({
  sessionId,
  onNavigateHome,
  showCloseButton,
  onClose,
  compact = false,
}: SessionDetailViewProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followUpPrompt, setFollowUpPrompt] = useState('');
  const [followUpImages, setFollowUpImages] = useState<ImageData[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [conversationTurns, setConversationTurns] = useState<ConversationTurn[]>([]);
  const [activeTab, setActiveTab] = useState<SessionTab>('agent');

  // Session name editing
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);

  // Auto-scroll refs
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // Track which processes we've fetched logs for
  const fetchedProcessesRef = useRef<Set<string>>(new Set());

  // Textarea auto-resize ref
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get the latest running process for live streaming
  const runningProcess = session?.processes?.find((p) => p.status === 'running');

  // Stream live logs for running process
  const { logs: liveLogs, isConnected, connectedProcessId } = useLogStream(runningProcess?.id || null);

  // Stream approval requests (when in_progress or waiting for approval)
  const {
    pendingApprovals,
    respond: respondToApproval,
  } = useApprovalStream(session?.status === 'in_progress' || session?.status === 'approval' ? sessionId : null);

  const fetchSession = useCallback(async () => {
    try {
      setError(null);
      const data = await getSession(sessionId);
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch session');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Initial fetch
  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Poll when session is in_progress
  useEffect(() => {
    if (session?.status !== 'in_progress') return;

    const interval = setInterval(fetchSession, 5000);
    return () => clearInterval(interval);
  }, [session?.status, fetchSession]);

  // Fetch historical logs for completed processes
  useEffect(() => {
    if (!session?.processes) return;

    const fetchLogsForProcess = async (process: ExecutionProcess) => {
      if (fetchedProcessesRef.current.has(process.id) || process.status === 'running') {
        return;
      }

      fetchedProcessesRef.current.add(process.id);

      setConversationTurns((prev) => {
        const existing = prev.find((t) => t.process.id === process.id);
        if (existing) return prev;
        return [...prev, { process, logs: [], isLoading: true }];
      });

      try {
        const data = await getProcess(process.id);
        setConversationTurns((prev) =>
          prev.map((turn) =>
            turn.process.id === process.id
              ? { ...turn, logs: data.logs || [], isLoading: false }
              : turn
          )
        );
      } catch (err) {
        console.error('Failed to fetch logs for process', process.id, err);
        setConversationTurns((prev) =>
          prev.map((turn) =>
            turn.process.id === process.id ? { ...turn, isLoading: false } : turn
          )
        );
      }
    };

    for (const process of session.processes) {
      if (process.status !== 'running') {
        fetchLogsForProcess(process);
      }
    }

    if (runningProcess) {
      setConversationTurns((prev) => {
        const existing = prev.find((t) => t.process.id === runningProcess.id);
        if (existing) {
          return prev.map((t) =>
            t.process.id === runningProcess.id ? { ...t, process: runningProcess } : t
          );
        }
        return [...prev, { process: runningProcess, logs: [], isLoading: false }];
      });
    }
  }, [session?.processes, runningProcess]);

  // Update running process in turns when status changes
  useEffect(() => {
    if (!session?.processes) return;

    setConversationTurns((prev) =>
      prev.map((turn) => {
        const updatedProcess = session.processes?.find((p) => p.id === turn.process.id);
        if (updatedProcess && updatedProcess.status !== turn.process.status) {
          return { ...turn, process: updatedProcess };
        }
        return turn;
      })
    );
  }, [session?.processes]);

  // Auto-scroll when new content arrives
  useEffect(() => {
    if (!userScrolledUp && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [liveLogs.length, conversationTurns, pendingApprovals, userScrolledUp]);

  // Scroll to approval when it appears
  useEffect(() => {
    if (pendingApprovals.length > 0 && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [pendingApprovals.length]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Calculate line height (approximately 20px per line)
      const lineHeight = 20;
      const maxLines = 7;
      const maxHeight = lineHeight * maxLines;
      // Set height to scrollHeight but cap at maxLines
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  }, [followUpPrompt]);

  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setUserScrolledUp(!isNearBottom);
    }
  };

  const handleFollowUp = async () => {
    if (!followUpPrompt.trim() && followUpImages.length === 0) return;

    setSubmitting(true);
    try {
      await sendFollowUp(sessionId, {
        prompt: followUpPrompt,
        images: followUpImages.length > 0 ? followUpImages : undefined,
      });
      setFollowUpPrompt('');
      setFollowUpImages([]);
      fetchedProcessesRef.current.clear();
      setConversationTurns([]);
      fetchSession();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send follow-up');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // On mobile/touch devices, Enter inserts newline (send via button only)
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
      e.preventDefault();
      if (!submitting && (followUpPrompt.trim() || followUpImages.length > 0)) {
        handleFollowUp();
      }
    }
  };

  const handleKill = async () => {
    if (!confirm('Are you sure you want to kill this session?')) return;
    try {
      await killSession(sessionId);
      fetchSession();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to kill session');
    }
  };

  const handleToggleMode = async () => {
    if (!session) return;
    const newMode: ApprovalMode = session.approvalMode === 'manual' ? 'auto' : 'manual';
    try {
      await updateSessionMode(sessionId, { approvalMode: newMode });
      setSession({ ...session, approvalMode: newMode });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update approval mode');
    }
  };

  const handleInterrupt = async () => {
    try {
      await interruptSession(sessionId);
      fetchSession();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to interrupt session');
    }
  };

  const handleSaveName = async () => {
    if (!session) return;
    try {
      await updateSession(sessionId, { sessionName: nameInput });
      setSession({ ...session, sessionName: nameInput });
      setEditingName(false);
      setShowNameModal(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update session name');
    }
  };

  // Use paginated sessions hook for smart refresh
  const { smartRefresh } = usePaginatedSessions();

  const handleToggleStatus = async (newStatus: SessionStatus) => {
    if (!session) return;
    try {
      await updateSessionStatus(sessionId, { status: newStatus });
      setSession({ ...session, status: newStatus });
      // Trigger smart refresh to update Kanban view immediately
      await smartRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update session status');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner className="h-8 w-8 text-blue-400" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="p-8 text-center max-w-md">
          <p className="text-red-500 dark:text-red-400 mb-4">{error || 'Session not found'}</p>
          <Button onClick={onNavigateHome}>
            Go Home
          </Button>
        </Card>
      </div>
    );
  }

  const isRunning = session.status === 'in_progress';
  const canFollowUp = !isRunning && (session.status === 'completed' || session.status === 'failed' || session.status === 'done') && session.agentSessionId;

  // Sort turns by creation time
  const sortedTurns = [...conversationTurns].sort(
    (a, b) => new Date(a.process.createdAt).getTime() - new Date(b.process.createdAt).getTime()
  );

  const maxWidthClass = 'max-w-full';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Sticky Header */}
      <header className="flex-shrink-0 bg-[var(--card-bg)] border-b border-[var(--card-border)] sticky top-0 z-10">
        <div className={`${maxWidthClass} mx-auto px-4 py-3 overflow-hidden`}>
          <div className="flex items-center justify-between overflow-hidden w-full">
            <div className="flex overflow-hidden gap-3 mr-8">

              {/* Desktop: Inline editing, Mobile: Modal */}
              {editingName ? (
                <div className="hidden md:flex items-center gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Session name..."
                    className="w-48 px-1 py-0.5 text-lg font-semibold bg-transparent border-none outline-none focus:ring-0"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleSaveName}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancel</Button>
                </div>
              ) : null}

              {/* Show session name when not editing (desktop) or always (mobile) */}
              <div className={`flex gap-1 shrink-1 overflow-x-hidden ${editingName ? 'md:hidden' : ''}`}>
                <div className='truncate'>
                  <span className="text-lg font-semibold truncate overflow-hidden">
                    {session.sessionName || 'Session'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setNameInput(session.sessionName || '');
                    // On mobile, show modal; on desktop, show inline
                    if (window.innerWidth < 768) {
                      setShowNameModal(true);
                    } else {
                      setEditingName(true);
                    }
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
                  title="Edit session name"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 grow-1 justify-end mr-2">

              {/* Session Status - Dropdown for completed/failed/done/archived, Badge otherwise */}
              {(session.status === 'completed' || session.status === 'failed' || session.status === 'done' || session.status === 'archived') ? (
                <Dropdown
                  value={session.status}
                  onChange={(newStatus) => handleToggleStatus(newStatus as SessionStatus)}
                  options={[
                    { value: 'completed', label: 'Agent Completed' },
                    { value: 'failed', label: 'Agent Failed' },
                    { value: 'done', label: 'Done' },
                    { value: 'archived', label: 'Archived' }
                  ]}
                  size="sm"
                />
              ) : (
                <StatusBadge status={session.status} />
              )}
            </div>
            {showCloseButton && onClose && (
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mr-0 ml-4 cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
          </div>
          {/* Working Directory and Session ID */}
          <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="font-mono truncate">{session.workDir}</span>
              {session.personality && (
                <span className="ml-2 text-gray-500 dark:text-gray-400 font-medium">
                  {session.personality.readableId}
                </span>
              )}
              {session.project && (
                <span className="ml-2 text-gray-500 dark:text-gray-400 font-medium">
                  {session.project.name}
                </span>
              )}
            </div>
            <span className="font-mono text-gray-400 ml-4" title={`Session ID: ${session.id}`}>
              {session.id.slice(0, 8)}
            </span>
          </div>
        </div>
      </header>



      {/* Tab Bar */}
      <div className="flex-shrink-0 border-b border-[var(--card-border)] bg-[var(--card-bg)]">
        <div className={`${maxWidthClass} mx-auto px-4`}>
          <div className="flex gap-0">
            {(['agent', 'files', 'git', ...(session.project ? ['messages' as const, 'workspace' as const] : [])] as const).map((tab) => {
              const labels: Record<string, string> = {
                agent: 'Agent',
                files: 'Files',
                git: 'Git',
                messages: 'Messages',
                workspace: 'Workspace',
              };
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                  }`}
                >
                  {labels[tab] || tab}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'agent' ? (
        <>
          {/* Messages Area (Scrollable) */}
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto"
          >
            <div className={`${maxWidthClass} mx-auto px-4 py-6 space-y-6`}>
              {sortedTurns.length === 0 && (
                <div className="text-center text-gray-500 py-12">
                  <p>No messages yet</p>
                </div>
              )}

              {sortedTurns.map((turn, index) => {
                const isCurrentProcess = turn.process.id === runningProcess?.id;
                const logsMatchProcess = connectedProcessId === turn.process.id;
                const shouldShowLiveLogs = isCurrentProcess && logsMatchProcess;

                return (
                  <ConversationTurnView
                    key={turn.process.id}
                    turn={turn}
                    turnNumber={index + 1}
                    liveLogs={shouldShowLiveLogs ? liveLogs : []}
                    isLive={isCurrentProcess}
                    isConnected={isConnected && logsMatchProcess}
                    connectorType={session.connectorType}
                  />
                );
              })}

              {/* Inline Approval Requests - only show in manual mode */}
              {pendingApprovals.length > 0 && session.approvalMode === 'manual' && (
                <div id="inline-approvals" className="space-y-3 p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] animate-pulse-slow">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-primary)] font-medium text-sm">
                      Action Required: {pendingApprovals.length} Pending Approval{pendingApprovals.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  {pendingApprovals.map((approval) => (
                    <InlineApprovalCard
                      key={approval.requestId}
                      approval={approval}
                      onApprove={() => respondToApproval(approval.requestId, 'approved')}
                      onDeny={() => respondToApproval(approval.requestId, 'denied', 'User denied')}
                    />
                  ))}
                </div>
              )}

              {/* Scroll anchor */}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </>
      ) : activeTab === 'files' ? (
        /* Files Tab */
        <div className="flex-1 overflow-hidden flex flex-col">
          <FileExplorer
            initialPath={session.workDir}
            mode="browse"
          />
        </div>
      ) : activeTab === 'git' ? (
        /* Git Tab */
        <div className="flex-1 overflow-hidden flex flex-col">
          <GitExplorer
            initialPath={session.workDir}
            sessionId={sessionId}
            onSendComments={async (message) => {
              setSubmitting(true);
              try {
                await sendFollowUp(sessionId, { prompt: message });
                fetchedProcessesRef.current.clear();
                setConversationTurns([]);
                fetchSession();
                setActiveTab('agent');
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Failed to send review comments');
              } finally {
                setSubmitting(false);
              }
            }}
          />
        </div>
      ) : activeTab === 'messages' && session.project ? (
        /* Messages Tab */
        <TeamMessagesTab
          projectId={session.project.id}
          currentPersonality={session.personality || undefined}
        />
      ) : activeTab === 'workspace' && session.project ? (
        /* Workspace Tab */
        <div className="flex-1 overflow-hidden flex flex-col">
          <FileExplorer
            initialPath={session.project.workspacePath}
            mode="browse"
          />
        </div>
      ) : null}

      {/* Sticky Input Area - only show on Agent tab */}
      {activeTab === 'agent' && <div className="flex-shrink-0 border-t border-[var(--card-border)] bg-[var(--card-bg)] sticky bottom-0">
        <div className={`${maxWidthClass} mx-auto px-4 py-4`}>
          {/* Image Previews */}
          {followUpImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {followUpImages.map((image, index) => (
                <div key={index} className="relative group">
                  <img
                    src={`data:${image.mediaType};base64,${image.data}`}
                    alt={`Attached image ${index + 1}`}
                    className="h-16 w-16 object-cover rounded-lg border border-[var(--input-border)]"
                  />
                  <button
                    type="button"
                    onClick={() => setFollowUpImages(images => images.filter((_, i) => i !== index))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Remove image"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={followUpPrompt}
              onChange={(e) => setFollowUpPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={async (e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'));
                if (imageItems.length === 0) return;
                e.preventDefault();
                const newImages: ImageData[] = [];
                for (const item of imageItems) {
                  const file = item.getAsFile();
                  if (file && file.size <= 20 * 1024 * 1024) {
                    const result = await new Promise<string | null>((resolve) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result as string);
                      reader.onerror = () => resolve(null);
                      reader.readAsDataURL(file);
                    });
                    if (result) {
                      const base64Data = result.split(',')[1];
                      if (base64Data) {
                        newImages.push({
                          data: base64Data,
                          mediaType: file.type as ImageData['mediaType'],
                        });
                      }
                    }
                  }
                }
                if (newImages.length > 0) {
                  setFollowUpImages(prev => [...prev, ...newImages]);
                }
              }}
              placeholder={
                isRunning
                  ? "Agent is working..."
                  : canFollowUp
                    ? "Send a follow-up message... (Enter to send, Shift+Enter for new line, paste images)"
                    : (session.status === 'completed' || session.status === 'failed') && !session.agentSessionId
                      ? "Cannot send follow-ups: no session ID captured"
                      : `Session ${session.status}`
              }
              rows={1}
              disabled={isRunning || !canFollowUp || submitting}
              className="w-full px-4 py-3 text-sm rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] focus:outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed overflow-y-auto"
              style={{ minHeight: '44px', maxHeight: '140px' }}
            />
          </div>
          {/* Hidden file input for image upload */}
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            onChange={async (e) => {
              const files = e.target.files;
              if (!files) return;
              const newImages: ImageData[] = [];
              for (const file of Array.from(files)) {
                if (file.size <= 20 * 1024 * 1024 && file.type.startsWith('image/')) {
                  const result = await new Promise<string | null>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(file);
                  });
                  if (result) {
                    const base64Data = result.split(',')[1];
                    if (base64Data) {
                      newImages.push({
                        data: base64Data,
                        mediaType: file.type as ImageData['mediaType'],
                      });
                    }
                  }
                }
              }
              if (newImages.length > 0) {
                setFollowUpImages(prev => [...prev, ...newImages]);
              }
              e.target.value = '';
            }}
            className="hidden"
            id="image-upload-input"
          />
          {/* Action Bar - below textarea */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              {/* Approval Mode Toggle */}
              <button
                onClick={handleToggleMode}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${session.approvalMode === 'auto'
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                title={session.approvalMode === 'auto'
                  ? 'All tool calls are being auto-approved. Click to switch to manual mode.'
                  : 'Click to switch to auto-approve mode'}
              >
                {session.approvalMode === 'auto' ? 'Auto approve' : 'Manual'}
              </button>
            </div>
            <div className="flex items-center gap-1">
              {/* Image Upload Button */}
              <IconButton
                onClick={() => document.getElementById('image-upload-input')?.click()}
                disabled={isRunning || !canFollowUp || submitting}
                title="Attach images"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </IconButton>
              {/* Interrupt Button (pause icon) */}
              <IconButton
                onClick={handleInterrupt}
                disabled={!isRunning}
                variant="warning"
                title="Interrupt"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              </IconButton>
              {/* Kill Button (X icon) */}
              <IconButton
                onClick={handleKill}
                disabled={!isRunning}
                variant="danger"
                title="Kill"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </IconButton>
              {/* Play / Send Button — shows spinner when agent is working */}
              <IconButton
                onClick={handleFollowUp}
                disabled={isRunning || !canFollowUp || submitting || (!followUpPrompt.trim() && followUpImages.length === 0)}
                variant="primary"
                title={isRunning ? 'Agent is working...' : 'Send'}
              >
                {isRunning || submitting ? (
                  <Spinner className="w-5 h-5" />
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </IconButton>
            </div>
          </div>
        </div>
      </div>}

      {/* Session Name Edit Modal - Mobile Only */}
      <Dialog
        open={showNameModal}
        onClose={() => {
          setShowNameModal(false);
          setNameInput(session?.sessionName || '');
        }}
        title="Edit Session Name"
        className="max-w-md"
      >
        <div className="p-4 space-y-4">
          <Input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Session name..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSaveName();
              }
            }}
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={() => {
                setShowNameModal(false);
                setNameInput(session?.sessionName || '');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveName}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// ─── Team Messages Tab ──────────────────────────────────────────────────────

function TeamMessagesTab({
  projectId,
  currentPersonality,
}: {
  projectId: string;
  currentPersonality?: Personality;
}) {
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sender, setSender] = useState(currentPersonality?.readableId || '@owner');
  const [target, setTarget] = useState('@all');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const [messagesRes, personalitiesRes] = await Promise.all([
        getProjectMessages(projectId, { days: 30 }),
        getPersonalities({ limit: 100 }),
      ]);
      setMessages(messagesRes.messages);
      setPersonalities(personalitiesRes.personalities);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Auto-scroll on initial load and new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [messageText]);

  const handleSend = async () => {
    if (!messageText.trim()) return;
    setSending(true);
    try {
      await postProjectMessage(projectId, {
        sender,
        target,
        content: messageText.trim(),
      });
      setMessageText('');
      await fetchMessages();
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sending && messageText.trim()) {
        handleSend();
      }
    }
  };

  // Group messages by date
  const messagesByDate = messages.reduce<Record<string, TeamMessage[]>>((acc, msg) => {
    if (!acc[msg.date]) acc[msg.date] = [];
    acc[msg.date].push(msg);
    return acc;
  }, {});

  // Sort dates ascending for chronological display
  const sortedDates = Object.keys(messagesByDate).sort();

  // Build sender options: @owner + all personalities
  const senderOptions = [
    '@owner',
    ...personalities.map(p => p.readableId),
  ];

  // Build target options: @all + all personalities
  const targetOptions = [
    '@all',
    ...personalities.map(p => p.readableId),
  ];

  const getAvatarColor = (sender: string) => {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
      'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500',
    ];
    let hash = 0;
    for (let i = 0; i < sender.length; i++) {
      hash = sender.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const getInitial = (sender: string) => {
    const name = sender.startsWith('@') ? sender.slice(1) : sender;
    return name.charAt(0).toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner className="h-6 w-6 text-blue-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Messages stream */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 py-16">
            <svg className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs mt-1">Start the conversation by sending a message below.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedDates.map((date) => (
              <div key={date}>
                {/* Date separator */}
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                  <span className="text-xs text-gray-400 font-medium px-2">
                    {formatMessageDate(date)}
                  </span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                </div>

                {/* Messages for this date */}
                <div className="space-y-3">
                  {messagesByDate[date].map((msg, idx) => {
                    const isCurrentUser = msg.sender === sender || msg.sender === '@owner' || msg.sender === 'user';

                    return (
                      <div key={`${date}-${idx}`} className="flex gap-3 group">
                        {/* Avatar */}
                        <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-medium ${getAvatarColor(msg.sender)}`}>
                          {getInitial(msg.sender)}
                        </div>

                        {/* Message content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className={`text-sm font-semibold ${isCurrentUser ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'}`}>
                              {msg.sender}
                            </span>
                            <span className="text-xs text-gray-400">
                              → {msg.target}
                            </span>
                            <span className="text-xs text-gray-400">
                              {msg.timestamp}
                            </span>
                          </div>
                          <div className="mt-1 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="flex-shrink-0 border-t border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Dropdown
            value={sender}
            onChange={setSender}
            options={senderOptions.map(s => ({ value: s, label: s }))}
            size="sm"
          />
          <span className="text-xs text-gray-500">→</span>
          <Dropdown
            value={target}
            onChange={setTarget}
            options={targetOptions.map(t => ({ value: t, label: t }))}
            size="sm"
          />
        </div>
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
            rows={1}
            disabled={sending}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:opacity-50"
            style={{ minHeight: '38px', maxHeight: '120px' }}
          />
          <Button
            onClick={handleSend}
            disabled={sending || !messageText.trim()}
            size="sm"
          >
            {sending ? <Spinner className="w-4 h-4" /> : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatMessageDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateStr === today.toISOString().slice(0, 10)) return 'Today';
  if (dateStr === yesterday.toISOString().slice(0, 10)) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// Inline Approval Card Component
function InlineApprovalCard({
  approval,
  onApprove,
  onDeny,
}: {
  approval: ApprovalRequest;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const inputStr = typeof approval.toolInput === 'string'
    ? approval.toolInput
    : JSON.stringify(approval.toolInput ?? {}, null, 2) ?? '{}';

  const getSummary = () => {
    if (typeof approval.toolInput === 'object' && approval.toolInput !== null) {
      const input = approval.toolInput as Record<string, unknown>;
      if (input.command) return `Command: ${String(input.command).slice(0, 50)}...`;
      if (input.file_path) return `File: ${String(input.file_path)}`;
      if (input.path) return `Path: ${String(input.path)}`;
      if (input.query) return `Query: ${String(input.query).slice(0, 50)}...`;
    }
    if (!inputStr) return 'No input';
    return inputStr.slice(0, 60) + (inputStr.length > 60 ? '...' : '');
  };

  return (
    <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--card-border)] overflow-hidden shadow-sm">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-gray-500 dark:text-gray-400 text-lg">🔧</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{approval.toolName}</div>
            {!isExpanded && (
              <div className="text-xs text-gray-500 truncate">{getSummary()}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Hide' : 'Show'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onDeny}
          >
            Deny
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onApprove}
          >
            Approve
          </Button>
        </div>
      </div>
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900/50">
          <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
            {inputStr}
          </pre>
        </div>
      )}
    </div>
  );
}

// Helper function to get display name for connector
function getConnectorDisplayName(connectorType: string): string {
  const connectorNames: Record<string, string> = {
    claude: 'Claude',
    vibe: 'Mistral Vibe',
    mistral: 'Mistral',
  };
  return connectorNames[connectorType.toLowerCase()] || connectorType;
}

// Helper to ensure content is always a string
function ensureString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value
      .map((item) => ensureString(item))
      .join('');
  }
  if (typeof value === 'object') {
    if ('text' in value) return ensureString((value as { text: unknown }).text);
    return JSON.stringify(value);
  }
  return String(value);
}

// Parse a log content string to extract meaningful message
interface ParsedMessage {
  type: 'assistant' | 'user' | 'tool_call' | 'tool_result' | 'system' | 'result' | 'thinking' | 'raw';
  content: string;
  toolName?: string;
  toolId?: string;
  cost?: number;
  isError?: boolean;
}

function parseLogContent(content: string): ParsedMessage[] {
  try {
    const data = JSON.parse(content);

    // Mistral Vibe JSON-RPC format
    if (data.jsonrpc === '2.0' && data.method === 'session/update') {
      const update = data.params?.update;
      if (!update) return [{ type: 'raw', content: '' }];

      switch (update.sessionUpdate) {
        case 'agent_message_chunk':
          if (update.content?.type === 'text' && update.content?.text) {
            return [{ type: 'assistant', content: ensureString(update.content.text) }];
          }
          return [{ type: 'raw', content: '' }];

        case 'tool_call': {
          let toolContent = '';
          if (update.rawInput) {
            try {
              const input = JSON.parse(update.rawInput);
              const parts: string[] = [];
              if (input.pattern) parts.push(`pattern: "${input.pattern}"`);
              if (input.path) parts.push(`path: "${input.path}"`);
              if (input.command) parts.push(`command: "${input.command}"`);
              if (input.file_path) parts.push(`file: "${input.file_path}"`);
              if (input.content) parts.push(`content: "${String(input.content).slice(0, 100)}${String(input.content).length > 100 ? '...' : ''}"`);
              toolContent = parts.length > 0 ? parts.join(', ') : JSON.stringify(input);
            } catch {
              toolContent = update.rawInput;
            }
          }
          return [{
            type: 'tool_call',
            content: toolContent,
            toolName: update.title || update.kind || 'tool',
            toolId: update.toolCallId,
          }];
        }

        case 'tool_call_update':
          let resultText = '';
          if (update.content && Array.isArray(update.content)) {
            for (const item of update.content) {
              if (item.content?.type === 'text') {
                resultText += ensureString(item.content.text);
              }
            }
          }
          if (!resultText && update.rawOutput) {
            try {
              const rawOut = JSON.parse(update.rawOutput);
              resultText = rawOut.matches || rawOut.content || update.rawOutput;
            } catch {
              resultText = update.rawOutput;
            }
          }
          return [{
            type: 'tool_result',
            content: ensureString(resultText) || 'Completed',
            toolId: update.toolCallId,
            isError: update.status === 'error',
          }];

        default:
          return [{ type: 'raw', content: '' }];
      }
    }

    // Vibe JSON-RPC result
    if (data.jsonrpc === '2.0' && data.result?.stopReason) {
      return [{
        type: 'result',
        content: `Completed (${data.result.stopReason})`,
      }];
    }

    if (data.jsonrpc === '2.0') {
      return [{ type: 'raw', content: '' }];
    }

    // vibe-server processed events
    if (data.type === 'toolUpdate') {
      if (data.status === 'completed' && data.content) {
        return [{
          type: 'tool_result',
          content: ensureString(data.content),
          toolId: data.id,
          isError: data.isError || false,
        }];
      }
      return [{ type: 'raw', content: '' }];
    }

    if (data.type === 'terminalOutput' && data.output) {
      return [{
        type: 'tool_result',
        content: ensureString(data.output),
        toolId: data.toolCallId,
        isError: false,
      }];
    }

    // Handle done event (emitted by vibe-server when session completes)
    // - Vibe uses `stopReason` (e.g., "end_turn") and may include `result` with actual response
    // - Claude uses `reason` which contains the actual result text
    if (data.type === 'done') {
      // Prefer `result` field (Vibe accumulated message), then `reason` (Claude result)
      const actualResult = data.result;
      const reasonContent = data.reason || data.stopReason;

      // If we have actual result content, display that
      if (actualResult && typeof actualResult === 'string' && actualResult.trim()) {
        return [{
          type: 'result',
          content: actualResult,
        }];
      }

      // Otherwise check if reason looks like actual content (not just a status)
      const isActualContent = reasonContent &&
        typeof reasonContent === 'string' &&
        reasonContent !== 'completed' &&
        !['end_turn', 'stop', 'max_tokens', 'tool_use'].includes(reasonContent);

      return [{
        type: 'result',
        content: isActualContent ? reasonContent : `Completed${reasonContent ? ` (${reasonContent})` : ''}`,
      }];
    }

    // Vibe streaming format (vibe -p --output streaming)
    // Format: {"role": "assistant|user|tool|system", "content": "...", "tool_calls": [...]}
    if (data.role) {
      switch (data.role) {
        case 'system':
          // Skip system prompt lines
          return [{ type: 'raw', content: '' }];

        case 'user':
          return [{ type: 'user', content: ensureString(data.content) }];

        case 'assistant': {
          const messages: ParsedMessage[] = [];

          // Handle tool calls
          if (data.tool_calls && Array.isArray(data.tool_calls)) {
            for (const tc of data.tool_calls) {
              let toolContent = '';
              try {
                const args = typeof tc.function?.arguments === 'string'
                  ? JSON.parse(tc.function.arguments)
                  : tc.function?.arguments || {};
                const parts: string[] = [];
                if (args.command) parts.push(`command: "${args.command}"`);
                if (args.pattern) parts.push(`pattern: "${args.pattern}"`);
                if (args.path) parts.push(`path: "${args.path}"`);
                if (args.file_path) parts.push(`file: "${args.file_path}"`);
                if (args.content) parts.push(`content: "${String(args.content).slice(0, 100)}${String(args.content).length > 100 ? '...' : ''}"`);
                toolContent = parts.length > 0 ? parts.join(', ') : JSON.stringify(args, null, 2);
              } catch {
                toolContent = tc.function?.arguments || '';
              }
              messages.push({
                type: 'tool_call',
                content: toolContent,
                toolName: tc.function?.name || 'tool',
                toolId: tc.id,
              });
            }
          }

          // Handle text content
          if (data.content && typeof data.content === 'string' && data.content.trim()) {
            messages.push({ type: 'assistant', content: ensureString(data.content) });
          }

          return messages.length > 0 ? messages : [{ type: 'raw', content: '' }];
        }

        case 'tool':
          return [{
            type: 'tool_result',
            content: ensureString(data.content) || 'Completed',
            toolId: data.tool_call_id,
            isError: false,
          }];

        default:
          return [{ type: 'raw', content: '' }];
      }
    }

    // Claude Code format
    if (data.type === 'assistant' && data.message?.content) {
      const messages: ParsedMessage[] = [];

      for (const block of data.message.content) {
        if (block.type === 'text' && block.text) {
          messages.push({ type: 'assistant', content: ensureString(block.text) });
        }
        if (block.type === 'tool_use') {
          messages.push({
            type: 'tool_call',
            content: JSON.stringify(block.input, null, 2),
            toolName: block.name,
            toolId: block.id,
          });
        }
      }

      return messages.length > 0 ? messages : [{ type: 'raw', content: '' }];
    }

    if (data.type === 'user' && data.message?.content) {
      const messages: ParsedMessage[] = [];

      for (const block of data.message.content) {
        if (block.type === 'text' && block.text) {
          messages.push({
            type: 'user',
            content: ensureString(block.text),
          });
        }
        if (block.type === 'tool_result') {
          const output = ensureString(
            data.tool_use_result?.stdout ||
            data.tool_use_result?.content ||
            block.content
          );
          const stderr = ensureString(data.tool_use_result?.stderr);

          messages.push({
            type: 'tool_result',
            content: output,
            toolId: block.tool_use_id,
            isError: block.is_error || false,
          });

          if (stderr) {
            messages.push({
              type: 'tool_result',
              content: stderr,
              toolId: block.tool_use_id,
              isError: true,
            });
          }
        }
      }

      return messages.length > 0 ? messages : [{ type: 'raw', content: '' }];
    }

    if (data.type === 'result') {
      return [{
        type: 'result',
        content: ensureString(data.result) || 'Task completed',
        cost: data.total_cost_usd,
      }];
    }

    if (data.type === 'system' && data.subtype === 'init') {
      return [{
        type: 'system',
        content: `Session started (model: ${data.model}, tools: ${data.tools?.length || 0})`,
      }];
    }

    if (data.type === 'stream_event') {
      return [{ type: 'raw', content: '' }];
    }

    return [{ type: 'raw', content: content }];
  } catch {
    return [{ type: 'raw', content: content }];
  }
}

interface ParsedLogsResult {
  logs: { raw: LogMessage | ProcessLog; parsed: ParsedMessage; logType: string }[];
  finalResult: ParsedMessage | null;
}

function parseLogs(
  logs: (LogMessage | ProcessLog)[]
): ParsedLogsResult {
  const parsed = logs
    .flatMap((log) => {
      const content = 'content' in log ? log.content : (log as LogMessage).content || '';
      const logType = 'logType' in log ? log.logType : (log as LogMessage).type;
      const parsedMessages = parseLogContent(content || '');
      return parsedMessages.map((p) => ({ raw: log, parsed: p, logType: logType || 'stdout' }));
    })
    .filter((log) => log.parsed.content !== '');

  // Merge consecutive assistant messages
  const merged: typeof parsed = [];
  for (const item of parsed) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.parsed.type === 'assistant' &&
      item.parsed.type === 'assistant'
    ) {
      last.parsed.content += item.parsed.content;
    } else {
      merged.push(item);
    }
  }

  // Deduplicate tool_result entries
  const toolResultsByToolId = new Map<string, typeof merged[0]>();
  const deduped: typeof merged = [];

  for (const item of merged) {
    if (item.parsed.type === 'tool_result' && item.parsed.toolId) {
      const existing = toolResultsByToolId.get(item.parsed.toolId);
      if (!existing) {
        toolResultsByToolId.set(item.parsed.toolId, item);
        deduped.push(item);
      } else if (
        item.parsed.content &&
        item.parsed.content !== 'Completed' &&
        (existing.parsed.content === 'Completed' || !existing.parsed.content)
      ) {
        const idx = deduped.indexOf(existing);
        if (idx !== -1) {
          deduped[idx] = item;
        }
        toolResultsByToolId.set(item.parsed.toolId, item);
      }
    } else {
      deduped.push(item);
    }
  }

  // Extract the final result and remove duplicates
  // Keep only the most informative result (prefer ones with actual content over "Completed (stopReason)")
  let finalResult: ParsedMessage | null = null;
  const logsWithoutResult: typeof deduped = [];

  for (const item of deduped) {
    if (item.parsed.type === 'result') {
      // Prefer results with actual content over generic "Completed" messages
      if (!finalResult) {
        finalResult = item.parsed;
      } else if (
        item.parsed.content &&
        !item.parsed.content.startsWith('Completed (') &&
        (finalResult.content.startsWith('Completed (') || !finalResult.content)
      ) {
        finalResult = item.parsed;
      } else if (item.parsed.cost && !finalResult.cost) {
        // Merge cost information if available
        finalResult = Object.assign({}, finalResult, { cost: item.parsed.cost });
      }
    } else {
      logsWithoutResult.push(item);
    }
  }

  return { logs: logsWithoutResult, finalResult };
}

// Conversation Turn Component
function ConversationTurnView({
  turn,
  turnNumber,
  liveLogs,
  isLive,
  isConnected,
  connectorType,
}: {
  turn: ConversationTurn;
  turnNumber: number;
  liveLogs: LogMessage[];
  isLive: boolean;
  isConnected: boolean;
  connectorType: string;
}) {
  const { process, logs, isLoading } = turn;
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);

  // Check if prompt has more than 10 lines
  const promptLines = process.prompt.split('\n');
  const isPromptLong = promptLines.length > 10;
  const truncatedPrompt = isPromptLong && !isPromptExpanded
    ? promptLines.slice(0, 10).join('\n')
    : process.prompt;

  const displayLogs = isLive ? liveLogs : logs;
  const { logs: parsedLogs, finalResult } = parseLogs(displayLogs);

  useEffect(() => {
    if (isLive && autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [liveLogs, isLive, autoScroll]);

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  };

  const hasToolCalls = parsedLogs.some(log => log.parsed.type === 'tool_call' || log.parsed.type === 'tool_result');

  return (
    <div className="space-y-3">
      {/* User Message (Prompt) */}
      <div className="flex gap-3">
        <UserAvatar />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">You</span>
            <span className="text-xs text-gray-500">Turn {turnNumber}</span>
          </div>
          <div className="rounded-lg p-3 bg-gray-100 dark:bg-gray-800">
            <p className="whitespace-pre-wrap text-sm">{truncatedPrompt}</p>
            {isPromptLong && (
              <div className="flex justify-end mt-1">
                <button
                  onClick={() => setIsPromptExpanded(!isPromptExpanded)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {isPromptExpanded ? 'Show less' : 'Read more'}
                </button>
              </div>
            )}
            {/* Image attachments */}
            {process.images && process.images.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {process.images.map((image, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={`data:${image.mediaType};base64,${image.data}`}
                      alt={`Attached image ${index + 1}`}
                      className="h-24 w-24 object-cover rounded-lg border border-blue-200 dark:border-blue-700"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assistant Response */}
      <div className="flex gap-3">
        <AILogo provider={connectorType} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">{getConnectorDisplayName(connectorType)}</span>
            <StatusBadge status={process.status} />
            {isLive && isConnected && (
              <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-pulse" />
                Streaming
              </span>
            )}
          </div>

          {/* Collapsible Tool Calls / Details Section */}
          {hasToolCalls && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-3">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full px-4 py-2 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  {parsedLogs.filter(l => l.parsed.type === 'tool_call').length} tool call(s)
                </span>
                <svg
                  className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isExpanded && (
                <>
                  {isLoading ? (
                    <div className="p-4 flex items-center justify-center border-t border-gray-200 dark:border-gray-700">
                      <Spinner className="h-5 w-5 text-gray-400" />
                    </div>
                  ) : (
                    <div
                      ref={containerRef}
                      onScroll={handleScroll}
                      className="max-h-96 overflow-y-auto p-4 font-mono text-sm space-y-2 border-t border-gray-200 dark:border-gray-700"
                    >
                      {parsedLogs.map((log, index) => (
                        <ParsedLogLine key={index} log={log} />
                      ))}
                    </div>
                  )}
                </>
              )}
              {process.exitCode !== null && (
                <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2 text-xs text-gray-500 flex justify-between">
                  <span>Exit code: {process.exitCode}</span>
                  {process.completedAt && (
                    <span>Completed: {new Date(process.completedAt).toLocaleString()}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Non-tool logs (assistant text) when no tool calls */}
          {!hasToolCalls && parsedLogs.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-3">
              {isLoading ? (
                <div className="p-4 flex items-center justify-center">
                  <Spinner className="h-5 w-5 text-gray-400" />
                </div>
              ) : (
                <div
                  ref={containerRef}
                  onScroll={handleScroll}
                  className="max-h-96 overflow-y-auto p-4 font-mono text-sm space-y-2"
                >
                  {parsedLogs.map((log, index) => (
                    <ParsedLogLine key={index} log={log} />
                  ))}
                </div>
              )}
              {process.exitCode !== null && (
                <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2 text-xs text-gray-500 flex justify-between">
                  <span>Exit code: {process.exitCode}</span>
                  {process.completedAt && (
                    <span>Completed: {new Date(process.completedAt).toLocaleString()}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Loading state when no logs yet */}
          {isLoading && parsedLogs.length === 0 && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-3">
              <div className="p-4 flex items-center justify-center">
                <Spinner className="h-5 w-5 text-gray-400" />
              </div>
            </div>
          )}

          {/* Waiting state */}
          {!isLoading && parsedLogs.length === 0 && !finalResult && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-3">
              <div className="p-4 text-gray-500 text-sm">
                {isLive ? 'Waiting for response...' : 'No logs available'}
              </div>
            </div>
          )}

          {/* Final Result - Displayed prominently outside the collapsed section */}
          {finalResult && !isLive && (
            <div className="pt-2">
              {finalResult.cost && (
                <div className="flex justify-end mb-1">
                  <span className="text-xs text-gray-500">
                    Cost: ${finalResult.cost.toFixed(4)}
                  </span>
                </div>
              )}
              <div className="text-[var(--text-primary)] prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{ensureString(finalResult.content)}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Parsed Log Line Component
function ParsedLogLine({
  log,
}: {
  log: { raw: LogMessage | ProcessLog; parsed: ParsedMessage; logType: string };
}) {
  const { parsed, logType } = log;
  const content = ensureString(parsed.content);

  if (!content) return null;

  switch (parsed.type) {
    case 'assistant':
      return (
        <div className="text-[var(--text-primary)] whitespace-pre-wrap text-sm">
          {content}
        </div>
      );

    case 'user':
      return (
        <div className="border-l-2 border-gray-300 dark:border-gray-600 pl-3 my-2 p-2 rounded-r">
          <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">You</div>
          <div className="text-[var(--text-primary)] whitespace-pre-wrap text-sm">{content}</div>
        </div>
      );

    case 'tool_call':
      return (
        <div className="border-l-2 border-gray-300 dark:border-gray-600 pl-3 my-2">
          <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">{parsed.toolName}</div>
          <pre className="text-gray-700 dark:text-gray-300 text-xs overflow-x-auto">{content}</pre>
        </div>
      );

    case 'tool_result':
      return (
        <div className={`border-l-2 ${parsed.isError ? 'border-red-400 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'} pl-3 my-1`}>
          <div className={`text-xs mb-1 ${parsed.isError ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
            {parsed.isError ? 'Error' : 'Output'}
          </div>
          <pre className={`text-xs overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto ${parsed.isError ? 'text-red-600 dark:text-red-300' : 'text-gray-600 dark:text-gray-400'}`}>
            {content}
          </pre>
        </div>
      );

    case 'result':
      return null;

    case 'system':
      return (
        <div className="text-gray-500 dark:text-gray-400 text-xs">
          {content}
        </div>
      );

    case 'thinking':
      return (
        <div className="text-gray-400 dark:text-gray-500 text-xs italic">
          {content}
        </div>
      );

    default:
      if (logType === 'stderr') {
        return (
          <div className="text-red-500 dark:text-red-400 whitespace-pre-wrap break-all text-xs">
            {content}
          </div>
        );
      }
      return null;
  }
}
