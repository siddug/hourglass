import type { FastifyPluginAsync } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import { eq } from 'drizzle-orm';
import { executionProcesses, processLogs } from '../../db/schema.js';

/**
 * Execution processes routes
 */
export const processesRoutes: FastifyPluginAsync = async (server) => {
  const { db, sessions: activeSessions } = server.state;

  /**
   * GET /api/processes
   * List all execution processes
   */
  server.get('/processes', async (request, reply) => {
    const query = request.query as { sessionId?: string; status?: string };

    let allProcesses = db.db.select().from(executionProcesses);

    if (query.sessionId) {
      allProcesses = allProcesses.where(eq(executionProcesses.sessionId, query.sessionId)) as typeof allProcesses;
    }

    const results = allProcesses.all();

    return reply.send({
      processes: results,
      total: results.length,
    });
  });

  /**
   * GET /api/processes/:id
   * Get execution process details
   */
  server.get<{ Params: { id: string } }>('/processes/:id', async (request, reply) => {
    const { id } = request.params;

    const process = db.db
      .select()
      .from(executionProcesses)
      .where(eq(executionProcesses.id, id))
      .get();

    if (!process) {
      return reply.status(404).send({
        error: 'Process not found',
      });
    }

    // Get logs for this process
    const logs = db.db
      .select()
      .from(processLogs)
      .where(eq(processLogs.processId, id))
      .all();

    return reply.send({
      ...process,
      logs,
    });
  });

  /**
   * GET /api/processes/:id/logs
   * Get logs for an execution process
   */
  server.get<{ Params: { id: string } }>('/processes/:id/logs', async (request, reply) => {
    const { id } = request.params;
    const query = request.query as { type?: string; limit?: string; offset?: string };

    const process = db.db
      .select()
      .from(executionProcesses)
      .where(eq(executionProcesses.id, id))
      .get();

    if (!process) {
      return reply.status(404).send({
        error: 'Process not found',
      });
    }

    let logsQuery = db.db
      .select()
      .from(processLogs)
      .where(eq(processLogs.processId, id));

    const logs = logsQuery.all();

    // Filter by type if specified
    let filtered = logs;
    if (query.type) {
      filtered = logs.filter((log) => log.logType === query.type);
    }

    // Apply pagination
    const offset = parseInt(query.offset || '0', 10);
    const limit = parseInt(query.limit || '1000', 10);
    const paginated = filtered.slice(offset, offset + limit);

    return reply.send({
      logs: paginated,
      total: filtered.length,
      offset,
      limit,
    });
  });

  /**
   * GET /api/processes/:id/debug
   * Debug endpoint to check MsgStore status
   */
  server.get<{ Params: { id: string } }>('/processes/:id/debug', async (request, reply) => {
    const { id } = request.params;

    const process = db.db
      .select()
      .from(executionProcesses)
      .where(eq(executionProcesses.id, id))
      .get();

    if (!process) {
      return reply.status(404).send({ error: 'Process not found' });
    }

    const activeSession = activeSessions.get(process.sessionId);

    if (!activeSession) {
      return reply.send({
        processId: id,
        sessionId: process.sessionId,
        isActive: false,
        message: 'No active session found',
      });
    }

    const msgStore = activeSession.msgStore;

    return reply.send({
      processId: id,
      sessionId: process.sessionId,
      isActive: true,
      historySize: msgStore.historySize,
      historyBytes: msgStore.historyBytes,
      isFinished: msgStore.hasFinished(),
      recentLogs: msgStore.getHistory().slice(-10),
    });
  });

  /**
   * WebSocket: GET /api/processes/:id/stream
   * Stream logs for an execution process in real-time
   */
  server.get<{ Params: { id: string } }>(
    '/processes/:id/stream',
    { websocket: true },
    async (connection: SocketStream, request) => {
      const { id } = request.params;
      const socket = connection.socket;

      // Find the process
      const process = db.db
        .select()
        .from(executionProcesses)
        .where(eq(executionProcesses.id, id))
        .get();

      if (!process) {
        socket.send(JSON.stringify({ error: 'Process not found' }));
        socket.close();
        return;
      }

      // Find the active session for this process
      const activeSession = activeSessions.get(process.sessionId);

      if (!activeSession) {
        // No active session, send stored logs and close
        const logs = db.db
          .select()
          .from(processLogs)
          .where(eq(processLogs.processId, id))
          .all();

        for (const log of logs) {
          socket.send(JSON.stringify({
            type: log.logType,
            content: log.content,
            timestamp: log.timestamp,
          }));
        }

        socket.send(JSON.stringify({ type: 'finished' }));
        socket.close();
        return;
      }

      // Stream from active session's MsgStore
      const msgStore = activeSession.msgStore;

      // Send history first
      for (const msg of msgStore.getHistory()) {
        socket.send(JSON.stringify(msg));
      }

      // Subscribe to new messages
      const unsubscribe = msgStore.subscribe((msg) => {
        try {
          socket.send(JSON.stringify(msg));

          if (msg.type === 'finished') {
            socket.close();
          }
        } catch {
          // Socket closed
          unsubscribe();
        }
      });

      // Handle socket close
      socket.on('close', () => {
        unsubscribe();
      });

      socket.on('error', () => {
        unsubscribe();
      });
    }
  );

  /**
   * WebSocket: GET /api/sessions/:id/events
   * Stream ACP events for a session in real-time
   */
  server.get<{ Params: { id: string } }>(
    '/sessions/:id/events',
    { websocket: true },
    async (connection: SocketStream, request) => {
      const { id } = request.params;
      const socket = connection.socket;

      const activeSession = activeSessions.get(id);

      if (!activeSession) {
        socket.send(JSON.stringify({ error: 'No active session found' }));
        socket.close();
        return;
      }

      // Subscribe to ACP events
      const eventHandler = (event: unknown) => {
        try {
          socket.send(JSON.stringify(event));
        } catch {
          // Socket closed
        }
      };

      const exitHandler = () => {
        socket.send(JSON.stringify({ type: 'done', reason: 'session_exit' }));
        socket.close();
      };

      activeSession.events.on('event', eventHandler);
      activeSession.events.on('exit', exitHandler);

      // Handle socket close
      socket.on('close', () => {
        activeSession.events.off('event', eventHandler);
        activeSession.events.off('exit', exitHandler);
      });

      socket.on('error', () => {
        activeSession.events.off('event', eventHandler);
        activeSession.events.off('exit', exitHandler);
      });
    }
  );
};
