/**
 * hourglass server API client
 */

import type { ServerConfig } from './servers';

// Extend Window interface for Electron
declare global {
  interface Window {
    electronAPI?: {
      getServerStatus: () => Promise<string>;
      restartServer: () => Promise<string>;
      stopServer: () => Promise<string>;
    };
  }
}

// Default fallback URL — empty string means "same origin" (works behind a reverse proxy)
const DEFAULT_API_BASE = typeof window !== 'undefined' && window.electronAPI
  ? 'http://localhost:7778'
  : (process.env.NEXT_PUBLIC_API_URL ?? '');

// Active server config (set by ServerContext)
let _activeServer: ServerConfig | null = null;

/**
 * Set the active server config. Called by ServerContext on server switch.
 */
export function setActiveServerConfig(config: ServerConfig | null): void {
  _activeServer = config;
}

/**
 * Get the current API base URL
 */
function getApiBase(): string {
  return _activeServer?.url || DEFAULT_API_BASE;
}

/**
 * Get the current auth key
 */
function getAuthKey(): string | null {
  return _activeServer?.authKey || null;
}

// Types
// Approval mode type
export type ApprovalMode = 'manual' | 'auto';

// Agent mode type - controls agent behavior (plan mode vs default)
export type AgentMode = 'default' | 'plan';

export type SessionStatus = 'triage' | 'in_progress' | 'completed' | 'failed' | 'approval' | 'done' | 'archived';

export interface Session {
  id: string;
  connectorType: string;
  workDir: string;
  sessionName?: string | null;
  status: SessionStatus;
  approvalMode: ApprovalMode; // 'manual' requires user approval, 'auto' auto-approves
  agentMode: AgentMode; // 'default' for normal operation, 'plan' for read-only planning
  agentSessionId?: string | null; // Agent's own session ID (e.g., Claude's UUID)
  personalityId?: string | null;
  projectId?: string | null;
  // Populated on GET /sessions/:id
  personality?: Personality | null;
  project?: Project | null;
  createdAt: string;
  updatedAt: string;
  isActive?: boolean;
  processes?: ExecutionProcess[];
}

export interface ExecutionProcess {
  id: string;
  sessionId: string;
  status: 'running' | 'completed' | 'failed';
  prompt: string;
  images?: ImageData[];
  exitCode: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ProcessLog {
  id: string;
  processId: string;
  logType: 'stdout' | 'stderr' | 'event';
  content: string;
  timestamp: string;
}

export interface ProcessLogsResponse {
  logs: ProcessLog[];
  total: number;
  offset: number;
  limit: number;
}

export interface Connector {
  name: string;
  displayName: string;
  status: 'available' | 'not_installed' | 'not_configured' | 'error';
  version?: string;
  path?: string;
  message?: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
}

export interface ConnectorsResponse {
  connectors: Connector[];
  total: number;
  available: number;
}

export interface SessionsResponse {
  sessions: Session[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface GetSessionsParams {
  status?: SessionStatus;
  limit?: number;
  offset?: number;
}

export interface CreateSessionRequest {
  connector: string;
  workDir: string;
  prompt: string;
  env?: Record<string, string>;
  approvalMode?: ApprovalMode;
  agentMode?: AgentMode;
  sessionName?: string;
  startImmediately?: boolean;
  images?: ImageData[];
  skillsDirectory?: string;
  personalityId?: string;
  projectId?: string;
}

export interface CreateSessionResponse {
  id: string;
  processId: string;
  connectorType: string;
  workDir: string;
  sessionName?: string | null;
  status: SessionStatus;
  approvalMode: ApprovalMode;
  createdAt: string;
}

export interface UpdateModeRequest {
  approvalMode: ApprovalMode;
}

export interface UpdateModeResponse {
  status: string;
  sessionId: string;
  approvalMode: ApprovalMode;
}

/**
 * Image data for messages with images
 */
export interface ImageData {
  /** Base64-encoded image data (without data URL prefix) */
  data: string;
  /** Image media type */
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

export interface FollowUpRequest {
  prompt: string;
  images?: ImageData[];
}

export interface ApprovalRequest {
  id: string;
  requestId: string;
  toolName: string;
  toolInput: unknown;
  toolUseId?: string;
  timestamp: number;
}

export interface ApprovalResponse {
  requestId: string;
  status: 'approved' | 'denied';
  reason?: string;
}

export interface CreateSessionWithApprovalsRequest extends CreateSessionRequest {
  enableApprovals?: boolean;
}

export interface UpdateSessionRequest {
  sessionName?: string;
}

export interface UpdateSessionStatusRequest {
  status: SessionStatus;
}

// Schedule type for scheduled tasks
export type ScheduleType = 'once' | 'cron';

// Scheduled task types
export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  connectorType: string;
  workDir: string;
  scheduleType: ScheduleType;
  cronExpression: string | null;
  nextRunAt: string | null;
  timezone: string;
  inheritContext: boolean;
  lastSessionId: string | null;
  lastAgentSessionId: string | null;
  agentMode: AgentMode;
  approvalMode: ApprovalMode;
  env: string | null;
  personalityId: string | null;
  projectId: string | null;
  enabled: boolean;
  executionCount: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledTasksResponse {
  tasks: ScheduledTask[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface GetScheduledTasksParams {
  enabled?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateScheduledTaskRequest {
  name?: string; // Optional - will be auto-generated from prompt if not provided
  prompt: string;
  connector: string;
  workDir: string;
  scheduleType: ScheduleType;
  cronExpression?: string;
  runAt?: string; // ISO datetime
  timezone?: string;
  inheritContext?: boolean;
  agentMode?: AgentMode;
  approvalMode?: ApprovalMode;
  env?: Record<string, string>;
  personalityId?: string;
  projectId?: string;
}

export interface UpdateScheduledTaskRequest {
  name?: string;
  prompt?: string;
  connector?: string;
  workDir?: string;
  scheduleType?: ScheduleType;
  cronExpression?: string;
  runAt?: string;
  timezone?: string;
  inheritContext?: boolean;
  agentMode?: AgentMode;
  approvalMode?: ApprovalMode;
  env?: Record<string, string>;
  enabled?: boolean;
  personalityId?: string | null;
  projectId?: string | null;
}

export interface ScheduledTaskHistoryResponse {
  taskId: string;
  executions: Session[];
  total: number;
}

export interface TriggerTaskResponse {
  message: string;
  result: {
    sessionId: string;
    processId: string;
    agentSessionId?: string;
    success: boolean;
    error?: string;
  };
}

// API Key types
export interface ApiKey {
  id: string;
  provider: string;
  apiKey: string; // Masked
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeysResponse {
  apiKeys: ApiKey[];
  total: number;
}

export interface SaveApiKeyRequest {
  provider: string;
  apiKey: string;
}

// Personality types
export interface Personality {
  id: string;
  name: string;
  readableId: string; // e.g. "@mark"
  instructions: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalitiesResponse {
  personalities: Personality[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface CreatePersonalityRequest {
  name: string;
  readableId: string;
  instructions: string;
}

export interface UpdatePersonalityRequest {
  name?: string;
  readableId?: string;
  instructions?: string;
}

// Project types
export type ProjectStatus = 'active' | 'archived';

export interface Project {
  id: string;
  name: string;
  projectSlug: string;
  workspacePath: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectWithDetails extends Project {
  sessionCount: number;
  agents: {
    personalityId: string | null;
    name: string;
    readableId: string | null;
    sessionCount: number;
  }[];
}

export interface ProjectsResponse {
  projects: Project[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface CreateProjectRequest {
  name: string;
  projectSlug: string;
}

export interface UpdateProjectRequest {
  name?: string;
  status?: ProjectStatus;
}

// API Functions
async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${getApiBase()}${endpoint}`;

  // Only set Content-Type for requests with a body
  const headers: Record<string, string> = {
    ...options?.headers as Record<string, string>,
  };
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  // Add auth header if we have a key
  const authKey = getAuthKey();
  if (authKey) {
    headers['Authorization'] = `Bearer ${authKey}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch from a specific server (used for validation before adding)
 */
export async function fetchFromServer<T>(
  serverUrl: string,
  authKey: string,
  endpoint: string
): Promise<T> {
  const url = `${serverUrl}${endpoint}`;
  const headers: Record<string, string> = {};
  if (authKey) {
    headers['Authorization'] = `Bearer ${authKey}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  return response.json();
}

// Health
export async function getHealth(): Promise<HealthResponse> {
  return fetchApi('/api/health');
}

export async function getConnectors(): Promise<ConnectorsResponse> {
  return fetchApi('/api/health/connectors');
}

// Sessions
export async function getSessions(params?: GetSessionsParams): Promise<SessionsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));
  const query = searchParams.toString();
  return fetchApi(`/api/sessions${query ? `?${query}` : ''}`);
}

export async function getSessionWorkDirs(): Promise<{ workDirs: string[] }> {
  return fetchApi('/api/sessions/work-dirs');
}

export async function getSession(id: string): Promise<Session> {
  return fetchApi(`/api/sessions/${id}`);
}

export async function createSession(
  data: CreateSessionRequest | CreateSessionWithApprovalsRequest
): Promise<CreateSessionResponse> {
  return fetchApi('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function sendFollowUp(
  sessionId: string,
  data: FollowUpRequest
): Promise<{ status: string; sessionId: string; processId?: string }> {
  return fetchApi(`/api/sessions/${sessionId}/follow-up`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function killSession(
  sessionId: string
): Promise<{ status: string; sessionId: string }> {
  return fetchApi(`/api/sessions/${sessionId}`, {
    method: 'DELETE',
  });
}

export async function interruptSession(
  sessionId: string
): Promise<{ status: string; sessionId: string }> {
  return fetchApi(`/api/sessions/${sessionId}/interrupt`, {
    method: 'POST',
  });
}

// Update session properties (name, etc.)
export async function updateSession(
  sessionId: string,
  data: UpdateSessionRequest
): Promise<{ status: string; sessionId: string; sessionName?: string }> {
  return fetchApi(`/api/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// Update session status
export async function updateSessionStatus(
  sessionId: string,
  data: UpdateSessionStatusRequest
): Promise<{ status: string; sessionId: string; newStatus: SessionStatus }> {
  return fetchApi(`/api/sessions/${sessionId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// Update session approval mode
export async function updateSessionMode(
  sessionId: string,
  data: UpdateModeRequest
): Promise<UpdateModeResponse> {
  return fetchApi(`/api/sessions/${sessionId}/mode`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// Processes
export async function getProcess(
  processId: string
): Promise<ExecutionProcess & { logs: ProcessLog[] }> {
  return fetchApi(`/api/processes/${processId}`);
}

export async function getProcessLogs(
  processId: string,
  options?: { type?: string; limit?: number; offset?: number }
): Promise<ProcessLogsResponse> {
  const params = new URLSearchParams();
  if (options?.type) params.set('type', options.type);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  const query = params.toString();
  return fetchApi(`/api/processes/${processId}/logs${query ? `?${query}` : ''}`);
}

// Approvals
export async function getPendingApprovals(
  sessionId: string
): Promise<{ approvals: ApprovalRequest[] }> {
  return fetchApi(`/api/sessions/${sessionId}/approvals`);
}

export async function respondToApproval(
  sessionId: string,
  response: ApprovalResponse
): Promise<{ status: string; requestId: string; response: string }> {
  return fetchApi(`/api/sessions/${sessionId}/approvals/respond`, {
    method: 'POST',
    body: JSON.stringify(response),
  });
}

// WebSocket URL helper (returns URL without auth — use getWebSocketProtocols for auth)
export function getWebSocketUrl(endpoint: string): string {
  const base = getApiBase();
  if (base && /^https?:\/\//.test(base)) {
    // Absolute URL — swap protocol
    const wsBase = base.replace(/^http/, 'ws');
    return `${wsBase}${endpoint}`;
  }
  // Relative base (same origin) — derive WebSocket URL from current page location
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}${base}${endpoint}`;
  }
  return `ws://localhost${base}${endpoint}`;
}

/**
 * Get WebSocket subprotocols for authentication.
 * The auth key is sent as a subprotocol "vibe-auth.<key>" to avoid exposing it in URLs.
 */
export function getWebSocketProtocols(): string[] {
  const authKey = getAuthKey();
  if (authKey) {
    return [`vibe-auth.${authKey}`];
  }
  return [];
}

// API Keys
export async function getApiKeys(): Promise<ApiKeysResponse> {
  return fetchApi('/api/settings/api-keys');
}

export async function checkApiKey(
  provider: string
): Promise<{ exists: boolean; provider: string; apiKey?: string }> {
  try {
    return await fetchApi(`/api/settings/api-keys/${provider}`);
  } catch {
    return { exists: false, provider };
  }
}

export async function saveApiKey(
  data: SaveApiKeyRequest
): Promise<{ status: string; id: string; provider: string; apiKey: string }> {
  return fetchApi('/api/settings/api-keys', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Filesystem browsing
export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
}

export interface ListDirectoryResponse {
  path: string;
  entries: FileEntry[];
}

export async function listDirectory(
  path: string,
  showHidden?: boolean
): Promise<ListDirectoryResponse> {
  const params = new URLSearchParams({ path });
  if (showHidden) params.set('showHidden', 'true');
  return fetchApi(`/api/filesystem/list?${params.toString()}`);
}

export interface ReadFileResponse {
  path: string;
  content: string;
}

export async function readFile(path: string): Promise<ReadFileResponse> {
  const params = new URLSearchParams({ path });
  return fetchApi(`/api/filesystem/read?${params.toString()}`);
}

export function getRawFileUrl(path: string): string {
  const params = new URLSearchParams({ path });
  return `${getApiBase()}/api/filesystem/raw?${params.toString()}`;
}

export async function fetchRawFileAsBlob(filePath: string): Promise<string> {
  const params = new URLSearchParams({ path: filePath });
  const url = `${getApiBase()}/api/filesystem/raw?${params.toString()}`;
  const headers: Record<string, string> = {};
  const authKey = getAuthKey();
  if (authKey) {
    headers['Authorization'] = `Bearer ${authKey}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function downloadDirectory(dirPath: string): Promise<void> {
  const params = new URLSearchParams({ path: dirPath });
  const url = `${getApiBase()}/api/filesystem/download?${params.toString()}`;
  const headers: Record<string, string> = {};
  const authKey = getAuthKey();
  if (authKey) {
    headers['Authorization'] = `Bearer ${authKey}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  const blob = await response.blob();

  // Extract filename from Content-Disposition header, fallback to 'download.zip'
  const disposition = response.headers.get('Content-Disposition');
  let filename = 'download.zip';
  if (disposition) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match) filename = match[1];
  }

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

export async function downloadFile(filePath: string): Promise<void> {
  const params = new URLSearchParams({ path: filePath });
  const url = `${getApiBase()}/api/filesystem/raw?${params.toString()}`;
  const headers: Record<string, string> = {};
  const authKey = getAuthKey();
  if (authKey) {
    headers['Authorization'] = `Bearer ${authKey}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  const blob = await response.blob();

  // Use the filename from the path
  const filename = filePath.split('/').pop() || 'download';

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

export async function deleteApiKey(
  provider: string
): Promise<{ status: string; provider: string }> {
  return fetchApi(`/api/settings/api-keys/${provider}`, {
    method: 'DELETE',
  });
}

// Git types and API functions

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
  oldPath?: string;
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

/**
 * Check if git is available on the server
 */
export async function checkGitAvailable(): Promise<GitAvailability> {
  return fetchApi('/api/git/available');
}

/**
 * Get git status for a directory
 */
export async function getGitStatus(path: string): Promise<GitStatus> {
  const params = new URLSearchParams({ path });
  return fetchApi(`/api/git/status?${params.toString()}`);
}

/**
 * Get diff for a specific file
 */
export async function getGitDiff(
  repoPath: string,
  filePath: string,
  staged?: boolean
): Promise<GitDiff> {
  const params = new URLSearchParams({ path: repoPath, file: filePath });
  if (staged) params.set('staged', 'true');
  return fetchApi(`/api/git/diff?${params.toString()}`);
}

// Scheduled Tasks API

/**
 * Get all scheduled tasks
 */
export async function getScheduledTasks(
  params?: GetScheduledTasksParams
): Promise<ScheduledTasksResponse> {
  const searchParams = new URLSearchParams();
  if (params?.enabled !== undefined) searchParams.set('enabled', String(params.enabled));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));
  const query = searchParams.toString();
  return fetchApi(`/api/scheduled-tasks${query ? `?${query}` : ''}`);
}

/**
 * Get a single scheduled task by ID
 */
export async function getScheduledTask(id: string): Promise<ScheduledTask> {
  return fetchApi(`/api/scheduled-tasks/${id}`);
}

/**
 * Get execution history for a scheduled task
 */
export async function getScheduledTaskHistory(
  id: string,
  limit?: number
): Promise<ScheduledTaskHistoryResponse> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  return fetchApi(`/api/scheduled-tasks/${id}/history${query ? `?${query}` : ''}`);
}

/**
 * Create a new scheduled task
 */
export async function createScheduledTask(
  data: CreateScheduledTaskRequest
): Promise<ScheduledTask> {
  return fetchApi('/api/scheduled-tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Update a scheduled task
 */
export async function updateScheduledTask(
  id: string,
  data: UpdateScheduledTaskRequest
): Promise<ScheduledTask> {
  return fetchApi(`/api/scheduled-tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Delete a scheduled task
 */
export async function deleteScheduledTask(id: string): Promise<void> {
  const url = `${getApiBase()}/api/scheduled-tasks/${id}`;
  const headers: Record<string, string> = {};
  const authKey = getAuthKey();
  if (authKey) {
    headers['Authorization'] = `Bearer ${authKey}`;
  }

  const response = await fetch(url, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `API error: ${response.status}`);
  }
  // DELETE responses typically have no body, so don't try to parse JSON
}

/**
 * Enable a scheduled task
 */
export async function enableScheduledTask(id: string): Promise<ScheduledTask> {
  return fetchApi(`/api/scheduled-tasks/${id}/enable`, {
    method: 'POST',
  });
}

/**
 * Disable a scheduled task
 */
export async function disableScheduledTask(id: string): Promise<ScheduledTask> {
  return fetchApi(`/api/scheduled-tasks/${id}/disable`, {
    method: 'POST',
  });
}

/**
 * Manually trigger a scheduled task to run now
 */
export async function triggerScheduledTask(id: string): Promise<TriggerTaskResponse> {
  return fetchApi(`/api/scheduled-tasks/${id}/trigger`, {
    method: 'POST',
  });
}

// Skills Settings API

/**
 * Skills configuration response
 */
export interface SkillsConfig {
  globalDirectory: string | null;
  defaultDirectory: string;
}

/**
 * Skills status response
 */
export interface SkillsStatus {
  configured: boolean;
  globalDirectory?: string;
  resolvedDirectory?: string;
  valid?: boolean;
  error?: string;
  skills?: {
    skills: string[];
  };
  defaultDirectory?: string;
}

/**
 * Get skills configuration
 */
export async function getSkillsConfig(): Promise<SkillsConfig> {
  return fetchApi('/api/settings/skills');
}

/**
 * Update skills configuration
 */
export async function updateSkillsConfig(
  globalDirectory: string | null
): Promise<{ status: string; globalDirectory: string | null }> {
  return fetchApi('/api/settings/skills', {
    method: 'PUT',
    body: JSON.stringify({ globalDirectory }),
  });
}

/**
 * Get skills status (validation and contents)
 */
export async function getSkillsStatus(): Promise<SkillsStatus> {
  return fetchApi('/api/settings/skills/status');
}

// Personalities API

export async function getPersonalities(params?: { limit?: number; offset?: number }): Promise<PersonalitiesResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));
  const query = searchParams.toString();
  return fetchApi(`/api/personalities${query ? `?${query}` : ''}`);
}

export async function getPersonality(id: string): Promise<Personality> {
  return fetchApi(`/api/personalities/${id}`);
}

export async function createPersonality(data: CreatePersonalityRequest): Promise<Personality> {
  return fetchApi('/api/personalities', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePersonality(id: string, data: UpdatePersonalityRequest): Promise<Personality> {
  return fetchApi(`/api/personalities/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deletePersonality(id: string): Promise<void> {
  const url = `${getApiBase()}/api/personalities/${id}`;
  const headers: Record<string, string> = {};
  const authKey = getAuthKey();
  if (authKey) {
    headers['Authorization'] = `Bearer ${authKey}`;
  }
  const response = await fetch(url, { method: 'DELETE', headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `API error: ${response.status}`);
  }
}

// Projects API

export async function getProjects(params?: { status?: ProjectStatus; limit?: number; offset?: number }): Promise<ProjectsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', String(params.status));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));
  const query = searchParams.toString();
  return fetchApi(`/api/projects${query ? `?${query}` : ''}`);
}

export async function getProject(id: string): Promise<ProjectWithDetails> {
  return fetchApi(`/api/projects/${id}`);
}

export async function createProject(data: CreateProjectRequest): Promise<Project> {
  return fetchApi('/api/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProject(id: string, data: UpdateProjectRequest): Promise<Project> {
  return fetchApi(`/api/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string): Promise<void> {
  const url = `${getApiBase()}/api/projects/${id}`;
  const headers: Record<string, string> = {};
  const authKey = getAuthKey();
  if (authKey) {
    headers['Authorization'] = `Bearer ${authKey}`;
  }
  const response = await fetch(url, { method: 'DELETE', headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `API error: ${response.status}`);
  }
}

export async function getProjectSessions(
  projectId: string,
  params?: { limit?: number; offset?: number }
): Promise<SessionsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));
  const query = searchParams.toString();
  return fetchApi(`/api/projects/${projectId}/sessions${query ? `?${query}` : ''}`);
}

// ─── Team Messages ───────────────────────────────────────────────────────────

export interface TeamMessage {
  sender: string;
  target: string;
  timestamp: string;
  content: string;
  date: string;
}

export interface TeamMessagesResponse {
  messages: TeamMessage[];
  dates: string[];
}

export interface PostTeamMessageRequest {
  sender: string;
  target: string;
  content: string;
}

export async function getProjectMessages(
  projectId: string,
  params?: { days?: number }
): Promise<TeamMessagesResponse> {
  const searchParams = new URLSearchParams();
  if (params?.days) searchParams.set('days', String(params.days));
  const query = searchParams.toString();
  return fetchApi(`/api/projects/${projectId}/messages${query ? `?${query}` : ''}`);
}

export async function postProjectMessage(
  projectId: string,
  data: PostTeamMessageRequest
): Promise<TeamMessage> {
  return fetchApi(`/api/projects/${projectId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
