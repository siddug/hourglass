# Hourglass Server Documentation

Welcome to the Hourglass Server documentation!

## Getting Started

- **[Quick Start Guide](QUICK_START.md)** - Get up and running quickly with common use cases
- **[API Documentation](API_DOCUMENTATION.md)** - Complete API reference

## API Overview

The Hourglass Server provides a RESTful API with WebSocket support for real-time streaming. All endpoints are prefixed with `/api`.

### Key Features

- **Session Management**: Create and manage AI sessions
- **Process Tracking**: Monitor execution processes and logs
- **Approval System**: Human-in-the-loop approval workflows
- **Real-time Streaming**: WebSocket-based streaming of logs and events
- **Connector Architecture**: Pluggable AI service connectors

### Main Endpoint Categories

1. **Health Endpoints**: `/api/health/*` - Server and component health checks
2. **Session Management**: `/api/sessions/*` - Session lifecycle management
3. **Process Management**: `/api/processes/*` - Execution process tracking
4. **WebSocket Endpoints**: Real-time streaming endpoints

## Documentation Structure

```
docs/
├── README.md                # This file
├── QUICK_START.md           # Quick start guide with examples
└── API_DOCUMENTATION.md     # Complete API reference
```

## Additional Resources

- **[Main README](../README.md)** - Project overview and setup instructions
- **[Source Code](../src/)** - Browse the implementation
- **[Database Schema](../src/db/schema.ts)** - Database structure

## Support

For issues or questions, please refer to the main README or open an issue in the repository.

## License

This project is licensed under the MIT License. See the [LICENSE](../LICENSE) file for details.