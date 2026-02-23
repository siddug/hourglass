import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { apiKeys } from '../../db/schema.js';

/**
 * Mask an API key for display (show first 4 and last 4 characters)
 */
function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return '****';
  }
  return `${key.slice(0, 4)}${'*'.repeat(key.length - 8)}${key.slice(-4)}`;
}

/**
 * Request body schemas
 */
const createApiKeySchema = z.object({
  provider: z.string().min(1),
  apiKey: z.string().min(1),
});

/**
 * API Keys routes
 */
export const apiKeysRoutes: FastifyPluginAsync = async (server) => {
  const { db } = server.state;

  /**
   * GET /api/settings/api-keys
   * List all API keys (masked)
   */
  server.get('/settings/api-keys', async (_request, reply) => {
    const keys = db.db.select().from(apiKeys).all();

    return reply.send({
      apiKeys: keys.map((key) => ({
        id: key.id,
        provider: key.provider,
        apiKey: maskApiKey(key.apiKey),
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
      })),
      total: keys.length,
    });
  });

  /**
   * GET /api/settings/api-keys/:provider
   * Check if an API key exists for a provider
   */
  server.get<{ Params: { provider: string } }>('/settings/api-keys/:provider', async (request, reply) => {
    const { provider } = request.params;

    const key = db.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.provider, provider))
      .get();

    if (!key) {
      return reply.status(404).send({
        exists: false,
        provider,
      });
    }

    return reply.send({
      exists: true,
      provider,
      id: key.id,
      apiKey: maskApiKey(key.apiKey),
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    });
  });

  /**
   * POST /api/settings/api-keys
   * Create or update an API key
   */
  server.post('/settings/api-keys', async (request, reply) => {
    const body = createApiKeySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    const { provider, apiKey } = body.data;
    const now = new Date();

    // Check if key exists for this provider
    const existingKey = db.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.provider, provider))
      .get();

    if (existingKey) {
      // Update existing key
      db.db.update(apiKeys)
        .set({ apiKey, updatedAt: now })
        .where(eq(apiKeys.provider, provider))
        .run();

      return reply.send({
        status: 'updated',
        id: existingKey.id,
        provider,
        apiKey: maskApiKey(apiKey),
      });
    }

    // Create new key
    const id = nanoid();
    db.db.insert(apiKeys).values({
      id,
      provider,
      apiKey,
      createdAt: now,
      updatedAt: now,
    }).run();

    return reply.status(201).send({
      status: 'created',
      id,
      provider,
      apiKey: maskApiKey(apiKey),
    });
  });

  /**
   * DELETE /api/settings/api-keys/:provider
   * Delete an API key
   */
  server.delete<{ Params: { provider: string } }>('/settings/api-keys/:provider', async (request, reply) => {
    const { provider } = request.params;

    const key = db.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.provider, provider))
      .get();

    if (!key) {
      return reply.status(404).send({
        error: 'API key not found',
        provider,
      });
    }

    db.db.delete(apiKeys)
      .where(eq(apiKeys.provider, provider))
      .run();

    return reply.send({
      status: 'deleted',
      provider,
    });
  });

};
