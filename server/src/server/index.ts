import Fastify, { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import websocket from '@fastify/websocket';
import { initDatabase, type DatabaseInstance } from '../db/index.js';
import { ConnectorRegistry, createConnectorRegistry } from '../connectors/registry.js';
import type { BaseConnector, SpawnedSession } from '../connectors/base.js';
import { SchedulerService } from '../scheduler/index.js';
import { healthRoutes } from './routes/health.js';
import { sessionsRoutes } from './routes/sessions.js';
import { processesRoutes } from './routes/processes.js';
import { apiKeysRoutes } from './routes/api-keys.js';
import { configRoutes } from './routes/config.js';
import { scheduledTasksRoutes } from './routes/scheduled-tasks.js';
import filesystemRoutes from './routes/filesystem.js';
import gitRoutes from './routes/git.js';
import { skillsRoutes } from './routes/skills.js';
import { personalitiesRoutes } from './routes/personalities.js';
import { projectsRoutes } from './routes/projects.js';

/**
 * Server configuration options
 */
export interface ServerConfig {
  /** Port to listen on (default: 3000) */
  port?: number;

  /** Host to bind to (default: localhost) */
  host?: string;

  /** Database file path (default: ./hourglass.db) */
  dbPath?: string;

  /** Enable request logging (default: true in dev) */
  logging?: boolean;

  /** Enable CORS (default: true) */
  cors?: boolean;

  /** Server display name */
  serverName?: string;

  /** Authentication key for API access */
  authKey?: string;

  /** Public-facing URL (e.g. https://vibe.example.com). If not set, derived from host:port. */
  publicUrl?: string;
}

/**
 * Server state accessible to routes
 */
export interface ServerState {
  db: DatabaseInstance;
  registry: ConnectorRegistry;
  sessions: Map<string, SpawnedSession>;
  scheduler: SchedulerService;
  serverName: string;
  authKey: string;
  publicUrl: string;
}

/**
 * Extend Fastify with our server state
 */
declare module 'fastify' {
  interface FastifyInstance {
    state: ServerState;
  }
}

/**
 * Create and configure the Fastify server
 */
export async function createServer(config: ServerConfig = {}): Promise<FastifyInstance> {
  const {
    port = 3000,
    host = 'localhost',
    dbPath = './hourglass.db',
    logging = process.env.NODE_ENV !== 'production',
    cors = true,
    serverName = 'My Hourglass Server',
    authKey = '',
    publicUrl,
  } = config;

  const resolvedPublicUrl = publicUrl || `http://${host}:${port}`;

  // Create Fastify instance
  const server = Fastify({
    logger: logging
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        }
      : false,
  });

  // Initialize database
  const db = initDatabase({ dbPath });

  // Create connector registry
  const registry = createConnectorRegistry();

  // Create sessions map for tracking active sessions
  const sessions = new Map<string, SpawnedSession>();

  // Create scheduler service
  const scheduler = new SchedulerService({
    db,
    registry,
    activeSessions: sessions,
    logger: server.log,
  });

  // Decorate server with state
  server.decorate('state', {
    db,
    registry,
    sessions,
    scheduler,
    serverName,
    authKey,
    publicUrl: resolvedPublicUrl,
  } satisfies ServerState);

  // Register WebSocket support
  await server.register(websocket);

  // CORS handling — restrict to the configured public URL origin
  if (cors) {
    const allowedOrigin = new URL(resolvedPublicUrl).origin;
    server.addHook('onRequest', async (request, reply) => {
      reply.header('Access-Control-Allow-Origin', allowedOrigin);
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (request.method === 'OPTIONS') {
        return reply.status(204).send();
      }
    });
  }

  // Auth middleware
  if (authKey) {
    server.addHook('onRequest', async (request, reply) => {
      // Skip auth for CORS preflight
      if (request.method === 'OPTIONS') return;

      // Skip auth for public config endpoint
      if (request.url === '/api/config') return;

      // Check Authorization header first
      const authHeader = request.headers.authorization;
      let token: string | undefined;

      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      } else if (request.headers.upgrade === 'websocket') {
        // For WebSocket upgrades: auth key sent as a subprotocol "vibe-auth.<key>"
        // This avoids exposing the key in the URL query string
        const protocols = request.headers['sec-websocket-protocol'];
        if (protocols) {
          const protocolList = protocols.split(',').map((p: string) => p.trim());
          const authProtocol = protocolList.find((p: string) => p.startsWith('vibe-auth.'));
          if (authProtocol) {
            token = authProtocol.slice('vibe-auth.'.length);
          }
        }
      }

      if (token !== authKey) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or missing auth key' });
      }
    });
  }

  // Register routes
  await server.register(configRoutes, { prefix: '/api' });
  await server.register(healthRoutes, { prefix: '/api' });
  await server.register(sessionsRoutes, { prefix: '/api' });
  await server.register(processesRoutes, { prefix: '/api' });
  await server.register(apiKeysRoutes, { prefix: '/api' });
  await server.register(scheduledTasksRoutes(scheduler), { prefix: '/api' });
  await server.register(filesystemRoutes, { prefix: '/api' });
  await server.register(gitRoutes, { prefix: '/api' });
  await server.register(skillsRoutes, { prefix: '/api' });
  await server.register(personalitiesRoutes, { prefix: '/api' });
  await server.register(projectsRoutes, { prefix: '/api' });

  // Initialize scheduler after routes are registered
  await scheduler.initialize();

  // Graceful shutdown
  const shutdown = async () => {
    server.log.info('Shutting down server...');

    // Shutdown scheduler first
    await scheduler.shutdown();

    // Kill all active sessions
    for (const [id, session] of sessions) {
      try {
        await session.kill();
        server.log.info(`Killed session ${id}`);
      } catch (error) {
        server.log.error(`Error killing session ${id}: ${error}`);
      }
    }

    // Close database
    db.close();

    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

/**
 * Start the server and listen for connections
 */
export async function startServer(
  config: ServerConfig = {}
): Promise<FastifyInstance> {
  const server = await createServer(config);

  const port = config.port || 3000;
  const host = config.host || 'localhost';

  await server.listen({ port, host });

  server.log.info(`Hourglass listening on http://${host}:${port}`);

  return server;
}

/**
 * VibeServer class - Main entry point for the server
 */
export class VibeServer {
  private server: FastifyInstance | null = null;
  private config: ServerConfig;

  constructor(config: ServerConfig = {}) {
    this.config = config;
  }

  /**
   * Register a connector
   */
  registerConnector(name: string, connector: BaseConnector): this {
    if (this.server) {
      this.server.state.registry.register(connector);
    }
    return this;
  }

  /**
   * Get the connector registry
   */
  get registry(): ConnectorRegistry | null {
    return this.server?.state.registry || null;
  }

  /**
   * Get the database instance
   */
  get db(): DatabaseInstance | null {
    return this.server?.state.db || null;
  }

  /**
   * Start the server
   */
  async listen(): Promise<void> {
    this.server = await startServer(this.config);
  }

  /**
   * Stop the server
   */
  async close(): Promise<void> {
    if (this.server) {
      await this.server.close();
      this.server = null;
    }
  }

  /**
   * Get the underlying Fastify instance
   */
  get fastify(): FastifyInstance | null {
    return this.server;
  }
}

/**
 * Create a new VibeServer instance
 */
export function createVibeServer(config: ServerConfig = {}): VibeServer {
  return new VibeServer(config);
}
