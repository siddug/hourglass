import type { FastifyPluginAsync } from 'fastify';

/**
 * Health check routes
 */
export const healthRoutes: FastifyPluginAsync = async (server) => {
  /**
   * GET /api/health
   * Basic health check endpoint
   */
  server.get('/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  /**
   * GET /api/health/connectors
   * Check availability of all registered connectors
   */
  server.get('/health/connectors', async (_request, reply) => {
    const { registry } = server.state;
    const availability = await registry.checkAllAvailability();

    const connectors = Array.from(availability.entries()).map(([name, info]) => ({
      name,
      displayName: registry.get(name)?.displayName || name,
      ...info,
    }));

    return reply.send({
      connectors,
      total: connectors.length,
      available: connectors.filter((c) => c.status === 'available').length,
    });
  });

  /**
   * GET /api/health/db
   * Check database health
   */
  server.get('/health/db', async (_request, reply) => {
    const { db } = server.state;

    try {
      // Simple query to check database connectivity
      const result = db.sqlite.prepare('SELECT 1 as ok').get() as { ok: number };

      return reply.send({
        status: result.ok === 1 ? 'ok' : 'error',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return reply.status(500).send({
        status: 'error',
        message: error instanceof Error ? error.message : 'Database error',
      });
    }
  });
};
