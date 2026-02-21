# Hourglass Server Quick Start Guide

This guide helps you get started with the Hourglass Server API quickly.

## Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/hourglass.git
cd hourglass/server

# Install dependencies
npm install

# Start the server
npm run dev
```

## Basic Usage

### 1. Check Server Health

```bash
curl http://localhost:3000/api/health
```

### 2. Create a Session

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "connector": "claude",
    "workDir": "~/projects",
    "prompt": "Write a hello world program in Python",
    "enableApprovals": false
  }'
```

### 3. Stream Process Logs

```javascript
// Using JavaScript with WebSocket
const socket = new WebSocket('ws://localhost:3000/api/processes/YOUR_PROCESS_ID/stream');

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log(message.type, ':', message.content);
};

socket.onclose = () => {
  console.log('Stream ended');
};
```

## Common Workflows

### Simple Task Execution

```bash
# 1. Create session
SESSION_ID=$(curl -s -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"connector":"claude","workDir":"~/projects","prompt":"Write a Python script to list files"}' | jq -r '.id')

# 2. Get process ID
PROCESS_ID=$(curl -s http://localhost:3000/api/sessions/$SESSION_ID | jq -r '.processes[0].id')

# 3. Stream logs
# (Use WebSocket as shown above)

# 4. Check status
curl http://localhost:3000/api/sessions/$SESSION_ID
```

### Interactive Session with Follow-ups

```bash
# 1. Create session
SESSION_ID=$(curl -s -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"connector":"claude","workDir":"~/projects","prompt":"Write a Python script"}' | jq -r '.id')

# 2. Send follow-up
curl -X POST http://localhost:3000/api/sessions/$SESSION_ID/follow-up \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Now add error handling to the script"}'

# 3. Interrupt when done
curl -X POST http://localhost:3000/api/sessions/$SESSION_ID/interrupt

# 4. Send another follow-up
curl -X POST http://localhost:3000/api/sessions/$SESSION_ID/follow-up \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Add logging to the script"}'
```

### Approval Workflow

```bash
# 1. Create session with approvals enabled
SESSION_ID=$(curl -s -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"connector":"claude","workDir":"~/projects","prompt":"Write a script that deletes files","enableApprovals":true}' | jq -r '.id')

# 2. Check for approvals
curl http://localhost:3000/api/sessions/$SESSION_ID/approvals

# 3. Approve a request (if needed)
REQUEST_ID="your-request-id"
curl -X POST http://localhost:3000/api/sessions/$SESSION_ID/approvals/respond \
  -H "Content-Type: application/json" \
  -d '{"requestId":"'$REQUEST_ID'","status":"approved","reason":"Safe to proceed"}'

# 4. Stream approvals in real-time
# Use WebSocket: ws://localhost:3000/api/sessions/$SESSION_ID/approvals/stream
```

## Troubleshooting

### Check Connector Availability

```bash
curl http://localhost:3000/api/health/connectors
```

### Check Database Health

```bash
curl http://localhost:3000/api/health/db
```

### Debug Process Issues

```bash
# Get process details
PROCESS_ID="your-process-id"
curl http://localhost:3000/api/processes/$PROCESS_ID

# Check debug info
curl http://localhost:3000/api/processes/$PROCESS_ID/debug

# Get full logs
curl http://localhost:3000/api/processes/$PROCESS_ID/logs
```

## Configuration

Create a `.env` file:

```env
DATABASE_URL=./hourglass.db
PORT=3000

# Connector-specific configuration
CLAUDE_API_KEY=your-api-key
```

## Available Connectors

- **Claude**: Anthropic's Claude AI
- **Vibe**: Internal vibe protocol connector

## Environment Variables

- `DATABASE_URL`: Database connection string (default: `./hourglass.db`)
- `PORT`: Server port (default: `3000`)
- `NODE_ENV`: Environment (development/production)
- `CLAUDE_API_KEY`: Required for Claude connector

## Development

```bash
# Run in development mode
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run database migrations
npm run migrate
```

## API Documentation

For complete API documentation, see [API_DOCUMENTATION.md](API_DOCUMENTATION.md)