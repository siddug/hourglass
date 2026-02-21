# Hourglass

AI agent orchestration platform. Manage multiple coding agents (Claude, Vibe) through a unified interface with session management, real-time streaming, and task scheduling.

## Structure

```
hourglass/
├── server/   # Fastify backend — WebSocket, ACP, SQLite
├── ui/       # Next.js frontend — Kanban, sessions, files
```

## Quick Start

```bash
# Install all dependencies
npm install

# Copy and configure environment variables
cp .env.example .env

# Start both server and UI in development mode
npm run dev
```

- **UI**: http://localhost:7777
- **Server**: http://localhost:7778

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start server + UI in dev mode |
| `npm run dev:server` | Start only the server |
| `npm run dev:ui` | Start only the UI |
| `npm run build` | Build both packages |
| `npm run start` | Start production server |
| `npm run test` | Run server tests |
| `npm run db:push` | Push database schema |

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `7778` |
| `HOST` | Server host | `localhost` |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `MISTRAL_API_KEY` | Mistral API key | — |

## License

MIT
