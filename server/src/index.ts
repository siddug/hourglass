/**
 * hourglass
 *
 * Backend server for connecting to AI coding agents via ACP (Agent Communication Protocol).
 * Implements connectors to different ACPs and streams functionality to frontend services.
 *
 * @example
 * ```typescript
 * import { VibeServer, ClaudeConnector, VibeConnector } from '@hourglass/server';
 *
 * const server = new VibeServer({ port: 3000 });
 * server.registerConnector('claude', new ClaudeConnector());
 * server.registerConnector('vibe', new VibeConnector());
 * await server.listen();
 * ```
 */

// ============================================================================
// Server
// ============================================================================
export {
  VibeServer,
  createVibeServer,
  createServer,
  startServer,
  type ServerConfig,
  type ServerState,
} from './server/index.js';

// ============================================================================
// Database
// ============================================================================
export {
  initDatabase,
  createInMemoryDatabase,
  type DatabaseConfig,
  type DatabaseInstance,
  // Schema types
  sessions,
  executionProcesses,
  processLogs,
  type Session,
  type NewSession,
  type ExecutionProcess,
  type NewExecutionProcess,
  type ProcessLog,
  type NewProcessLog,
  type SessionStatus,
  type ExecutionProcessStatus,
  type LogType,
} from './db/index.js';

// ============================================================================
// ACP (Agent Communication Protocol)
// ============================================================================
export {
  // Types
  type AcpEvent,
  type AcpEventType,
  type AcpEventBase,
  type ContentBlock,
  type TextContentBlock,
  type ImageContentBlock,
  type ToolCall,
  type ToolCallUpdate,
  type Plan,
  type PlanItem,
  type AvailableCommand,
  type CommandArg,
  type ApprovalStatus,
  type RequestPermissionRequest,
  type ApprovalResponse,
  type SessionModeId,
  // Event types
  type UserEvent,
  type SessionStartEvent,
  type MessageEvent,
  type ThoughtEvent,
  type ToolCallEvent,
  type ToolUpdateEvent,
  type PlanEvent,
  type AvailableCommandsEvent,
  type CurrentModeEvent,
  type RequestPermissionEvent,
  type ApprovalResponseEvent,
  type ErrorEvent,
  type DoneEvent,
  type OtherEvent,
  // Functions
  parseAcpLine,
  serializeAcpEvent,
  isEventType,
} from './acp/types.js';

export {
  AcpHarness,
  createHarness,
  type SpawnOptions as HarnessSpawnOptions,
  type SpawnedProcess,
  type HarnessEvents,
} from './acp/harness.js';

export {
  AcpClient,
  createAcpClient,
  autoApproveService,
  autoDenyService,
  createManualApprovalService,
  type ApprovalService as AcpApprovalService,
  type AcpClientEvents,
} from './acp/client.js';

export {
  SessionManager,
  createSessionManager,
  type SessionInfo,
} from './acp/session-manager.js';

export {
  ApprovalService,
  createApprovalService,
} from './acp/approval-service.js';

export {
  ProtocolPeer,
  createProtocolPeer,
  type ProtocolPeerOptions,
  type ProtocolPeerEvents,
} from './acp/protocol-peer.js';

export {
  // Control Protocol Types
  type CLIMessage,
  type ControlRequestMessage,
  type ControlResponseMessage,
  type ControlRequestType,
  type ControlResponseType,
  type CanUseToolRequest,
  type HookCallbackRequest,
  type PermissionResult,
  type PermissionAllow,
  type PermissionDeny,
  type PermissionUpdate,
  type PermissionUpdateType,
  type PermissionUpdateDestination,
  type PermissionMode,
  type SDKControlRequest,
  type SDKControlRequestType,
  type UserMessage,
  type HookCallbackResponse,
  type ApprovalRequest,
  type ApprovalResponse as ControlApprovalResponse,
  // Utility Functions
  createSDKControlRequest,
  createControlResponse,
  createErrorResponse,
  createUserMessage,
  parseControlMessage,
} from './acp/control-protocol.js';

// ============================================================================
// Connectors
// ============================================================================
export {
  type BaseConnector,
  type ConnectorConfig,
  type SpawnOptions,
  type SpawnedSession,
  type AvailabilityInfo,
  type AvailabilityStatus,
  type McpConfig,
  type McpServerConfig,
  type SessionEvents,
  AbstractConnector,
  commandExists,
  getCommandVersion,
  npxExists,
} from './connectors/base.js';

export {
  ClaudeConnector,
  createClaudeConnector,
  type ClaudeConnectorConfig,
} from './connectors/claude.js';

export {
  VibeConnector,
  createVibeConnector,
  type VibeConnectorConfig,
} from './connectors/vibe.js';

export {
  ConnectorRegistry,
  createConnectorRegistry,
  defaultRegistry,
} from './connectors/registry.js';

// ============================================================================
// Streaming
// ============================================================================
export {
  MsgStore,
  createMsgStore,
  type LogMsg,
  type LogMsgType,
} from './streaming/msg-store.js';

export {
  addOp,
  removeOp,
  replaceOp,
  moveOp,
  copyOp,
  testOp,
  escapePathSegment,
  buildPath,
  ConversationPatch,
  SessionPatch,
  ProcessPatch,
} from './streaming/patches.js';

export {
  TypedEventEmitter,
  createDeferred,
  timeout,
  withTimeout,
} from './streaming/event-emitter.js';

// ============================================================================
// Utils
// ============================================================================
export { createLogger, logger } from './utils/logger.js';

export {
  loadConfig,
  saveConfig,
  mergeConfig,
  getConfigPath,
  defaultConfig,
  type Config,
} from './utils/config.js';

export {
  getDataDir,
  ensureDir,
  getSessionsDir,
  getDatabasePath,
  resolvePath,
  expandHome,
  normalizePath,
} from './utils/paths.js';

// ============================================================================
// Re-export common types
// ============================================================================
export type { Operation } from 'fast-json-patch';
