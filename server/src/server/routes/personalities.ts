import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { personalities, sessions, scheduledTasks } from '../../db/schema.js';

/**
 * Validate readable_id format: must start with @, followed by lowercase alphanumeric, hyphens, or underscores
 */
const READABLE_ID_REGEX = /^@[a-z0-9][a-z0-9_-]*$/;
const RESERVED_IDS = ['@owner', '@all'];

const createPersonalitySchema = z.object({
  name: z.string().min(1).max(100),
  readableId: z.string()
    .min(2)
    .max(30)
    .regex(READABLE_ID_REGEX, 'Must start with @ followed by lowercase letters, numbers, hyphens, or underscores')
    .refine((id) => !RESERVED_IDS.includes(id), `Cannot use reserved IDs: ${RESERVED_IDS.join(', ')}`),
  instructions: z.string().min(1),
});

const updatePersonalitySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  readableId: z.string()
    .min(2)
    .max(30)
    .regex(READABLE_ID_REGEX, 'Must start with @ followed by lowercase letters, numbers, hyphens, or underscores')
    .refine((id) => !RESERVED_IDS.includes(id), `Cannot use reserved IDs: ${RESERVED_IDS.join(', ')}`)
    .optional(),
  instructions: z.string().min(1).optional(),
});

/**
 * Personalities routes - CRUD for agent personas
 */
export const personalitiesRoutes: FastifyPluginAsync = async (server) => {
  const { db } = server.state;

  /**
   * GET /api/personalities
   * List all personalities
   */
  server.get('/personalities', async (request, reply) => {
    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(parseInt(query.limit || '50', 10), 100);
    const offset = parseInt(query.offset || '0', 10);

    const countResult = db.db
      .select({ count: sql<number>`count(*)` })
      .from(personalities)
      .get();
    const total = countResult?.count ?? 0;

    const results = db.db
      .select()
      .from(personalities)
      .orderBy(desc(personalities.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    return reply.send({
      personalities: results,
      total,
      limit,
      offset,
      hasMore: offset + results.length < total,
    });
  });

  /**
   * GET /api/personalities/:id
   * Get a personality by ID
   */
  server.get<{ Params: { id: string } }>('/personalities/:id', async (request, reply) => {
    const { id } = request.params;

    const personality = db.db
      .select()
      .from(personalities)
      .where(eq(personalities.id, id))
      .get();

    if (!personality) {
      return reply.status(404).send({ error: 'Personality not found' });
    }

    return reply.send(personality);
  });

  /**
   * POST /api/personalities
   * Create a new personality
   */
  server.post('/personalities', async (request, reply) => {
    const body = createPersonalitySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    const { name, readableId, instructions } = body.data;

    // Check uniqueness of readableId
    const existing = db.db
      .select()
      .from(personalities)
      .where(eq(personalities.readableId, readableId))
      .get();

    if (existing) {
      return reply.status(409).send({
        error: `Personality with readable ID "${readableId}" already exists`,
      });
    }

    const id = nanoid();
    const now = new Date();

    db.db.insert(personalities).values({
      id,
      name,
      readableId,
      instructions,
      createdAt: now,
      updatedAt: now,
    }).run();

    const created = db.db.select().from(personalities).where(eq(personalities.id, id)).get();
    return reply.status(201).send(created);
  });

  /**
   * PUT /api/personalities/:id
   * Update a personality
   */
  server.put<{ Params: { id: string } }>('/personalities/:id', async (request, reply) => {
    const { id } = request.params;

    const body = updatePersonalitySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    const existing = db.db
      .select()
      .from(personalities)
      .where(eq(personalities.id, id))
      .get();

    if (!existing) {
      return reply.status(404).send({ error: 'Personality not found' });
    }

    // If readableId is being changed, check uniqueness
    if (body.data.readableId && body.data.readableId !== existing.readableId) {
      const conflict = db.db
        .select()
        .from(personalities)
        .where(eq(personalities.readableId, body.data.readableId))
        .get();

      if (conflict) {
        return reply.status(409).send({
          error: `Personality with readable ID "${body.data.readableId}" already exists`,
        });
      }
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.data.name !== undefined) updates.name = body.data.name;
    if (body.data.readableId !== undefined) updates.readableId = body.data.readableId;
    if (body.data.instructions !== undefined) updates.instructions = body.data.instructions;

    db.db.update(personalities)
      .set(updates)
      .where(eq(personalities.id, id))
      .run();

    const updated = db.db.select().from(personalities).where(eq(personalities.id, id)).get();
    return reply.send(updated);
  });

  /**
   * DELETE /api/personalities/:id
   * Delete a personality (fails if referenced by active sessions)
   */
  server.delete<{ Params: { id: string } }>('/personalities/:id', async (request, reply) => {
    const { id } = request.params;

    const existing = db.db
      .select()
      .from(personalities)
      .where(eq(personalities.id, id))
      .get();

    if (!existing) {
      return reply.status(404).send({ error: 'Personality not found' });
    }

    // Check if any active sessions reference this personality
    const activeSessions = db.db
      .select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(eq(sessions.personalityId, id))
      .get();

    if (activeSessions && activeSessions.count > 0) {
      return reply.status(409).send({
        error: `Cannot delete personality: ${activeSessions.count} session(s) reference it`,
      });
    }

    // Check if any scheduled tasks reference this personality
    const activeTasks = db.db
      .select({ count: sql<number>`count(*)` })
      .from(scheduledTasks)
      .where(eq(scheduledTasks.personalityId, id))
      .get();

    if (activeTasks && activeTasks.count > 0) {
      return reply.status(409).send({
        error: `Cannot delete personality: ${activeTasks.count} scheduled task(s) reference it`,
      });
    }

    db.db.delete(personalities)
      .where(eq(personalities.id, id))
      .run();

    return reply.status(204).send();
  });
};
