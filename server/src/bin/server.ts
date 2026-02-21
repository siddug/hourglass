#!/usr/bin/env node
/**
 * hourglass CLI entry point
 *
 * Starts the hourglass server with default configuration and Claude connector.
 */

import { randomBytes } from 'node:crypto';
import { VibeServer, ClaudeConnector, VibeConnector } from '../index.js';
import { loadConfig, saveConfig, getConfigPath } from '../utils/config.js';

const PORT = parseInt(process.env.PORT || '7778', 10);
const HOST = process.env.HOST || 'localhost';

async function main() {
  console.log('Starting hourglass...');

  // Load or initialize config with auth key
  const config = loadConfig();
  if (!config.server.authKey) {
    config.server.authKey = randomBytes(32).toString('hex');
    saveConfig(config);
    console.log(`Generated new auth key and saved to ${getConfigPath()}`);
  }

  const serverName = config.server.name;
  const authKey = config.server.authKey;
  const serverUrl = config.server.url || `http://${HOST}:${PORT}`;

  const server = new VibeServer({
    port: PORT,
    host: HOST,
    dbPath: './hourglass.db',
    logging: true,
    serverName,
    authKey,
    publicUrl: serverUrl,
  });

  // Register connectors
  const claude = new ClaudeConnector({
    dangerouslySkipPermissions: false,
  });

  const vibe = new VibeConnector({
    autoApprove: false,
  });

  // We need to start the server first to access the registry
  await server.listen();

  // Register connectors after server starts
  if (server.registry) {
    server.registry.register(claude);
    server.registry.register(vibe);
    console.log('Registered connectors:', server.registry.names());
  }

  // Generate connection config string for UI
  const configData = JSON.stringify({
    name: serverName,
    url: serverUrl,
    authKey,
  });
  const configString = `vibe://${Buffer.from(configData).toString('base64')}`;

  console.log(`
╔════════════════════════════════════════════════════════════╗
║                    hourglass started                         ║
╠════════════════════════════════════════════════════════════╣
║  Server:     http://${HOST}:${PORT.toString().padEnd(4)}                           ║
║  Name:       ${serverName.padEnd(43)}║
║  Health:     http://${HOST}:${PORT}/api/health                 ║
║  Connectors: http://${HOST}:${PORT}/api/health/connectors      ║
╚════════════════════════════════════════════════════════════╝

Auth Key: ${authKey}

Connection Config (paste this into Hourglass UI to add this server):
${configString}

Available endpoints:
  GET  /api/config              - Server info (public)
  GET  /api/health              - Health check
  GET  /api/health/connectors   - Check connector availability
  GET  /api/sessions            - List sessions
  POST /api/sessions            - Create session
  GET  /api/sessions/:id        - Get session details
  POST /api/sessions/:id/follow-up - Send follow-up
  DELETE /api/sessions/:id      - Kill session
  GET  /api/processes/:id/stream (WS) - Stream logs

Press Ctrl+C to stop.
  `);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
