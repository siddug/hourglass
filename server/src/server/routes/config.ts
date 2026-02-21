import type { FastifyPluginAsync } from 'fastify';

/**
 * Server config routes
 */
export const configRoutes: FastifyPluginAsync = async (server) => {
  /**
   * GET /api/config
   * Public endpoint - returns server name only (no auth required)
   */
  server.get('/config', async (_request, reply) => {
    return reply.send({
      name: server.state.serverName,
    });
  });

  /**
   * GET /api/config/connection
   * Authenticated endpoint - returns connection config as base64 string for sharing
   */
  server.get('/config/connection', async (_request, reply) => {
    const configData = {
      name: server.state.serverName,
      url: server.state.publicUrl,
      authKey: server.state.authKey,
    };

    const configString = Buffer.from(JSON.stringify(configData)).toString('base64');

    return reply.send({
      configString: `vibe://${configString}`,
      name: configData.name,
      url: configData.url,
    });
  });
};
