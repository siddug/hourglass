# AGENTS.md - hourglass/ui

## Project Overview

**Hourglass (hourglass/ui)** is an AI Agent Session Manager web frontend built with Next.js. It provides a user interface for managing and monitoring AI agent sessions powered by the hourglass server backend. The application enables users to:

- Create and manage AI agent sessions with various LLM connectors (Claude, Mistral, etc.)
- Monitor real-time agent execution with live logs and approval workflows
- View sessions in list view (sidebar) or Kanban board view
- Schedule and trigger automated agent tasks
- Manage server connections, API keys, and skills configuration
- Support manual and auto-approval modes for agent actions

### Counterpart Repository

The backend server for this UI is located at `../server`.

## Architecture

### Directory Structure

```
/src
├── /app                          # Next.js app router pages
│   ├── page.tsx                  # Home - session creation
│   ├── layout.tsx                # Root layout with providers
│   ├── /session/[id]/page.tsx    # Session detail view
│   ├── /settings/page.tsx        # Settings page
│   ├── /kanban/page.tsx          # Kanban board view
│   ├── /kanban/[id]/page.tsx     # Kanban session detail modal
│   ├── /kanban/new/page.tsx      # Kanban create session modal
│   └── globals.css               # Global styles with Tailwind/CSS variables
├── /components                   # Reusable React components
│   ├── /layout                   # Main layout components
│   ├── /session                  # Session-related components
│   ├── /chat                     # Chat/input components
│   ├── /scheduled                # Scheduled task components
│   └── ui.tsx                    # Shared UI component library
├── /contexts                     # React context providers
│   ├── ServerContext.tsx         # Multi-server management
│   ├── ThemeContext.tsx          # Light/dark theme toggle
│   ├── ViewModeContext.tsx       # Sidebar vs Kanban view
│   └── SidebarContext.tsx        # Sidebar collapse state
├── /hooks                        # Custom React hooks
│   ├── useLogStream.ts           # WebSocket for process logs
│   ├── useApprovalStream.ts      # WebSocket for approvals
│   ├── usePaginatedSessions.ts   # Kanban column pagination
│   └── useScheduledTasks.ts      # Scheduled tasks management
└── /lib                          # Utility functions and API client
    ├── api.ts                    # Complete hourglass server API client
    └── servers.ts                # Server config management
```

## Key Technologies

- **Framework**: Next.js 16.1.1 with App Router
- **UI Library**: React 19.2.3
- **Styling**: Tailwind CSS 4 with CSS custom properties for theming
- **State Management**: React Context API + localStorage
- **Real-time Communication**: WebSocket API for streaming logs and approvals
- **Language**: TypeScript 5
- **Build**: Next.js standalone output (supports Electron bundling)

## Main Components

### Page Components
- **Home Page** (`/`) - Session creation form
- **Session Detail** (`/session/[id]`) - Full session view with agent conversation
- **Settings** (`/settings`) - API keys, skills config, server management
- **Kanban Board** (`/kanban`) - Column-based session management

### Layout Components
- **AppShell** - Main layout wrapper with sidebar toggle
- **Sidebar** - Session list, navigation, theme/view mode toggles
- **KanbanView** - Multi-column Kanban board with scheduled tasks
- **ServerSwitcher** - Dropdown to switch between connected servers

### Session Components
- **SessionCreateForm** - Full form with connector selection, work directory, modes
- **SessionDetailView** - Real-time logs, approval handling, conversation history

## State Management

### Context Providers
```tsx
<ServerProvider>      // Multi-server configuration
  <ThemeProvider>     // Light/dark mode
    <ViewModeProvider>  // Sidebar vs Kanban view
      <SidebarProvider>  // Sidebar collapse state
        <AppShell>{children}</AppShell>
      </SidebarProvider>
    </ViewModeProvider>
  </ThemeProvider>
</ServerProvider>
```

### Persistence
- Server configurations stored in localStorage
- Theme preference persisted to localStorage
- Sidebar collapse state persisted to localStorage

## Backend Connection

### API Configuration
- Default URL: `http://localhost:7778` (configurable via `NEXT_PUBLIC_API_URL`)
- Multi-server support with server switching capability

### Authentication
- Bearer token in Authorization header
- WebSocket auth via subprotocol: `vibe-auth.<token>`

### Key API Endpoints Used
- Sessions: CRUD, follow-up, approval handling
- Processes: Log streaming via WebSocket
- Scheduled Tasks: CRUD, enable/disable, manual trigger
- Settings: API keys, skills configuration
- Filesystem/Git: Directory browsing, git status

## Routing

```
/                    → Home (SessionCreateForm)
/session/[id]       → Session detail (sidebar view)
/settings           → Settings page
/kanban             → Kanban board
/kanban/[id]        → Kanban with selected session modal
/kanban/new         → Kanban with create session modal
```

## Styling Patterns

- CSS custom properties for theming (`--bg-primary`, `--card-bg`, etc.)
- Dark mode via `[data-theme="dark"]` selector
- Tailwind utility classes with @apply for component styles
- Responsive design with mobile-first approach

## Key Patterns

### Real-time Streaming
- WebSocket connections for live log streaming
- Approval request notifications via WebSocket
- Polling fallback for session updates (5-second intervals)

### Multi-Server Support
- Server configurations stored in localStorage
- Active server tracked in context
- API client updates when server switches

### Modal-based Kanban
- URL history management with `pushState` for modals
- Session detail and creation as modal overlays

## Development

```bash
# Install dependencies
npm install

# Run in development mode (port 7777)
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## Environment Variables

```
NEXT_PUBLIC_API_URL=http://localhost:7778  # Backend server URL
```
