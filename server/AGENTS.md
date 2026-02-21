# AGENTS.md - hourglass/server

## Project Overview

**hourglass** is a backend server that enables communication with AI coding agents via the **ACP (Agent Communication Protocol)**. It serves as a bridge between frontend applications (like the Hourglass UI) and multiple AI agent implementations (Claude Code, Mistral Vibe), providing session management, task scheduling, approval workflows, and real-time streaming capabilities.

### Counterpart Repository

The frontend UI for this server is located at `../ui`.

## Architecture

### Core Components

```
src/
├── acp/                    # Agent Communication Protocol implementation
│   ├── types.ts           # ACP event types and definitions
│   ├── harness.ts         # Process spawning and lifecycle management
│   ├── control-protocol.ts # Control message format (for Claude)
│   ├── approval-service.ts # Interactive approval workflow
│   ├── vibe-protocol-peer.ts # Vibe JSON-RPC protocol implementation
│   ├── protocol-peer.ts    # Base protocol peer
│   └── session-manager.ts  # Session lifecycle tracking
│
├── bin/
│   └── server.ts          # CLI entry point with server initialization
│
├── connectors/            # Agent connector implementations
│   ├── base.ts           # BaseConnector interface and utilities
│   ├── registry.ts       # Connector registry for managing available agents
│   ├── claude.ts         # Claude Code connector
│   └── vibe.ts           # Mistral Vibe connector
│
├── db/                    # Database layer (SQLite + Drizzle ORM)
│   ├── schema.ts         # Database schema definitions
│   ├── migrations/       # Drizzle migrations
│   └── index.ts          # Database initialization
│
├── server/               # HTTP server implementation (Fastify)
│   ├── index.ts         # Server setup and configuration
│   └── routes/          # API endpoints
│       ├── sessions.ts        # Session management endpoints
│       ├── processes.ts       # Process execution endpoints
│       ├── scheduled-tasks.ts # Scheduled task endpoints
│       ├── health.ts         # Health check endpoints
│       ├── config.ts         # Server configuration endpoints
│       ├── api-keys.ts       # API key management
│       ├── filesystem.ts     # Filesystem operations
│       ├── git.ts           # Git operations
│       └── skills.ts        # Skills injection endpoints
│
├── scheduler/            # Task scheduling service
│   ├── scheduler-service.ts # Cron + queue-based scheduler
│   ├── types.ts             # Scheduler type definitions
│   └── index.ts             # Scheduler exports
│
├── services/            # Business logic services
│   └── skills-service.ts # Skills injection and management
│
├── streaming/           # Stream utilities
│   ├── msg-store.ts    # In-memory message storage
│   ├── event-emitter.ts # Typed event emitter
│   └── patches.ts      # JSON Patch utilities for streaming
│
└── utils/              # Utility functions
    ├── config.ts       # Configuration management
    ├── logger.ts       # Logging setup
    ├── paths.ts        # Path resolution utilities
    ├── prompt-utils.ts # Prompt transformation utilities
    ├── git.ts          # Git command execution
    └── session-name-generator.ts # LLM-based session naming
```

## Key Technologies

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.7+
- **HTTP Server**: Fastify 4.28 (with WebSocket support)
- **Database**: SQLite with Drizzle ORM 0.36
- **Task Queue**: better-queue with SQLite persistence
- **Streaming**: JSON Patch for incremental updates
- **Build**: tsup for compilation

## Database Schema

### Sessions
Stores AI agent sessions with status, approval mode, agent mode, and connector type.

### ExecutionProcesses
Individual agent execution runs within a session, tracking status and exit codes.

### ProcessLogs
Stdout, stderr, and ACP event logs for each process.

### ScheduledTasks
Task definitions with cron expressions, timezone, and context inheritance configuration.

### ApiKeys
External service credentials (Anthropic, Mistral, etc.).

## API Structure

### Authentication
Bearer token in Authorization header or WebSocket subprotocol `vibe-auth.<key>`.

### Key Endpoints

- **Sessions**: CRUD operations, follow-up messages, approval handling, interruption
- **Processes**: Log streaming via WebSocket, process details
- **Scheduled Tasks**: CRUD operations, manual triggering
- **Health**: Server health, connector availability, database connectivity
- **Settings**: API keys, skills management

## Agent Connectors

### Claude Connector
Spawns Claude Code CLI via npx with ACP communication. Supports print mode (one-way) and interactive mode (bidirectional with approval flow).

### Vibe Connector
Spawns Mistral Vibe CLI with JSON-RPC protocol. Supports conversation history tracking and auto-approve mode.

## Key Patterns

### Multi-Connector Architecture
Factory/Registry pattern for managing different AI agents with a unified interface.

### Approval Workflow
- **Manual Mode**: Requires explicit API approval before tool execution
- **Auto Mode**: Tool calls automatically approved

### Task Scheduling
- node-cron for scheduling (cron expressions, one-time schedules)
- better-queue for execution (concurrency control, retries, persistence)
- Context inheritance between executions

### Streaming
- WebSocket real-time log streaming
- JSON Patch for efficient incremental updates
- In-memory message store

## Configuration

Configuration file: `~/.config/hourglass/config.json`

```json
{
  "server": {
    "name": "My Hourglass Server",
    "authKey": "hex-string",
    "url": "http://localhost:7778"
  }
}
```

## Environment Variables

```
PORT=7778                          # Server port
HOST=localhost                     # Bind address
DATABASE_URL=./hourglass.db       # SQLite path
NODE_ENV=production/development   # Environment mode
ANTHROPIC_API_KEY=...             # Claude credentials
MISTRAL_API_KEY=...               # Vibe credentials
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run production build
npm start
```
