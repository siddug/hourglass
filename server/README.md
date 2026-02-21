# Hourglass Server

A server implementation for the Hourglass protocol.

## Description

This is a TypeScript-based server that implements the Hourglass protocol for communication and coordination.

## Features

- WebSocket-based communication
- Session management
- Process coordination
- Database integration with Drizzle ORM
- Health monitoring endpoints

## Installation

```bash
npm install
```

## Configuration

The server uses environment variables for configuration. Create a `.env` file or set the following variables:

```
DATABASE_URL=./hourglass.db
PORT=3000
```

## Running the Server

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## Project Structure

```
src/
├── acp/                  # Approval Control Protocol
├── bin/                  # Entry points
├── connectors/           # Connector implementations
├── db/                   # Database schema and migrations
├── server/               # Server implementation
│   ├── routes/           # HTTP routes
│   └── websocket/        # WebSocket handlers
├── streaming/            # Streaming utilities
└── utils/                # Utility functions
```

## Dependencies

- TypeScript
- Drizzle ORM
- Fastify (for HTTP server)
- WebSocket implementation

## Scripts

- `npm run dev`: Run in development mode
- `npm run build`: Build for production
- `npm start`: Start the production server
- `npm run migrate`: Run database migrations

## License

MIT