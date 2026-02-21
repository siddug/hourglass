# Hourglass Server API Documentation

This document provides comprehensive API documentation for the Hourglass Server.

## Base URL

All API endpoints are prefixed with `/api`:

```
http://localhost:3000/api
```

## Authentication

Currently, the API does not require authentication. All endpoints are publicly accessible.

## Response Format

All responses follow a consistent JSON format:

### Success Response
```json
{
  "data": {},
  "status": "success",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Response
```json
{
  "error": "Description of the error",
  "status": "error",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Health Endpoints

### GET `/api/health`

**Description**: Basic health check endpoint

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 1234.56
}
```

### GET `/api/health/connectors`

**Description**: Check availability of all registered connectors

**Response**:
```json
{
  "connectors": [
    {
      "name": "claude",
      "displayName": "Claude Connector",
      "status": "available",
      "message": "Ready"
    }
  ],
  "total": 1,
  "available": 1
}
```

### GET `/api/health/db`

**Description**: Check database health

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Session Management

### GET `/api/sessions`

**Description**: List all sessions

**Response**:
```json
{
  "sessions": [
    {
      "id": "abc123",
      "connectorType": "claude",
      "workDir": "/path/to/workdir",
      "status": "running",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "agentSessionId": "agent-abc123"
    }
  ],
  "total": 1
}
```

### GET `/api/sessions/:id`

**Description**: Get session details

**Parameters**:
- `id` (path): Session ID

**Response**:
```json
{
  "id": "abc123",
  "connectorType": "claude",
  "workDir": "/path/to/workdir",
  "status": "running",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "agentSessionId": "agent-abc123",
  "isActive": true,
  "processes": [
    {
      "id": "proc-abc123",
      "sessionId": "abc123",
      "status": "running",
      "prompt": "User prompt here",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "completedAt": null,
      "exitCode": null
    }
  ]
}
```

### POST `/api/sessions`

**Description**: Create a new session

**Request Body**:
```json
{
  "connector": "claude",
  "workDir": "/path/to/workdir",
  "prompt": "User prompt here",
  "env": {
    "KEY": "value"
  },
  "enableApprovals": true
}
```

**Response**:
```json
{
  "id": "abc123",
  "processId": "proc-abc123",
  "connectorType": "claude",
  "workDir": "/path/to/workdir",
  "status": "running",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### POST `/api/sessions/:id/follow-up`

**Description**: Send a follow-up message to an existing session

**Parameters**:
- `id` (path): Session ID

**Request Body**:
```json
{
  "prompt": "Follow-up prompt here"
}
```

**Response**:
```json
{
  "status": "sent",
  "sessionId": "abc123",
  "processId": "proc-xyz789"
}
```

### DELETE `/api/sessions/:id`

**Description**: Kill/stop a session

**Parameters**:
- `id` (path): Session ID

**Response**:
```json
{
  "status": "killed",
  "sessionId": "abc123"
}
```

### POST `/api/sessions/:id/interrupt`

**Description**: Gracefully interrupt a session (stops current task but keeps process alive for follow-ups)

**Parameters**:
- `id` (path): Session ID

**Response**:
```json
{
  "status": "interrupted",
  "sessionId": "abc123"
}
```

## Approval System

### GET `/api/sessions/:id/approvals`

**Description**: Get pending approval requests for a session

**Parameters**:
- `id` (path): Session ID

**Response**:
```json
{
  "approvals": [
    {
      "requestId": "req-abc123",
      "type": "tool_call",
      "toolName": "execute_command",
      "toolInput": {
        "command": "ls -la"
      },
      "status": "pending",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### POST `/api/sessions/:id/approvals/respond`

**Description**: Respond to an approval request

**Parameters**:
- `id` (path): Session ID

**Request Body**:
```json
{
  "requestId": "req-abc123",
  "status": "approved",
  "reason": "Looks safe to execute"
}
```

**Response**:
```json
{
  "status": "responded",
  "requestId": "req-abc123",
  "response": "approved"
}
```

## Process Management

### GET `/api/processes`

**Description**: List all execution processes

**Query Parameters**:
- `sessionId` (optional): Filter by session ID
- `status` (optional): Filter by status

**Response**:
```json
{
  "processes": [
    {
      "id": "proc-abc123",
      "sessionId": "abc123",
      "status": "running",
      "prompt": "User prompt here",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "completedAt": null,
      "exitCode": null
    }
  ],
  "total": 1
}
```

### GET `/api/processes/:id`

**Description**: Get execution process details

**Parameters**:
- `id` (path): Process ID

**Response**:
```json
{
  "id": "proc-abc123",
  "sessionId": "abc123",
  "status": "running",
  "prompt": "User prompt here",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "completedAt": null,
  "exitCode": null,
  "logs": [
    {
      "id": "log-abc123",
      "processId": "proc-abc123",
      "logType": "stdout",
      "content": "Log content here",
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### GET `/api/processes/:id/logs`

**Description**: Get logs for an execution process

**Parameters**:
- `id` (path): Process ID

**Query Parameters**:
- `type` (optional): Filter by log type (stdout, stderr, event)
- `limit` (optional): Limit number of logs (default: 1000)
- `offset` (optional): Pagination offset (default: 0)

**Response**:
```json
{
  "logs": [
    {
      "id": "log-abc123",
      "processId": "proc-abc123",
      "logType": "stdout",
      "content": "Log content here",
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total": 1,
  "offset": 0,
  "limit": 1000
}
```

### GET `/api/processes/:id/debug`

**Description**: Debug endpoint to check MsgStore status

**Parameters**:
- `id` (path): Process ID

**Response**:
```json
{
  "processId": "proc-abc123",
  "sessionId": "abc123",
  "isActive": true,
  "historySize": 100,
  "historyBytes": 1024,
  "isFinished": false,
  "recentLogs": []
}
```

## WebSocket Endpoints

### `/api/sessions/:id/approvals/stream`

**Description**: Stream approval requests for a session in real-time

**Parameters**:
- `id` (path): Session ID

**Messages**:
- `approvalRequest`: New approval request
- `approvalResponse`: Approval response
- `sessionEnded`: Session has ended

### `/api/sessions/:id/events`

**Description**: Stream ACP events for a session in real-time

**Parameters**:
- `id` (path): Session ID

**Messages**:
- Various ACP event types (toolCall, toolUpdate, message, done, etc.)

### `/api/processes/:id/stream`

**Description**: Stream logs for an execution process in real-time

**Parameters**:
- `id` (path): Process ID

**Messages**:
```json
{
  "type": "stdout|stderr|event",
  "content": "Log content",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Error Codes

### HTTP Status Codes

- `200 OK`: Request successful
- `201 Created`: Resource created successfully
- `204 No Content`: Request successful, no content returned
- `400 Bad Request`: Invalid request parameters or body
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Connector not available

### Common Error Responses

**Invalid Request Body**:
```json
{
  "error": "Invalid request body",
  "details": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": ["connector"],
      "message": "Required"
    }
  ]
}
```

**Resource Not Found**:
```json
{
  "error": "Session not found"
}
```

**Connector Unavailable**:
```json
{
  "error": "Connector claude is not available",
  "status": "unavailable",
  "message": "Configuration required",
  "setupInstructions": "Set CLAUDE_API_KEY environment variable"
}
```

## Examples

### Creating a Session

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "connector": "claude",
    "workDir": "/path/to/workdir",
    "prompt": "Write a hello world program in Python",
    "enableApprovals": true
  }'
```

### Getting Session Details

```bash
curl http://localhost:3000/api/sessions/abc123
```

### Streaming Process Logs (WebSocket)

```javascript
const socket = new WebSocket('ws://localhost:3000/api/processes/proc-abc123/stream');

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log(message.type, message.content);
};

socket.onclose = () => {
  console.log('Stream ended');
};
```

## API Client Libraries

While no official client libraries exist yet, you can use any HTTP client or WebSocket library to interact with the API.

### JavaScript Example

```javascript
import axios from 'axios';
import WebSocket from 'ws';

// Create session
const response = await axios.post('http://localhost:3000/api/sessions', {
  connector: 'claude',
  workDir: '/path/to/workdir',
  prompt: 'Write a hello world program'
});

// Stream logs
const socket = new WebSocket(`ws://localhost:3000/api/processes/${response.data.processId}/stream`);

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log(message);
};
```

## Rate Limiting

Currently, there is no rate limiting implemented. This may be added in future versions.

## Versioning

The API is currently at version 1.0. All endpoints are considered stable.

## Changelog

- **1.0.0**: Initial API release with session management, process tracking, and approval system

## Support

For issues or questions, please refer to the main README or open an issue in the repository.