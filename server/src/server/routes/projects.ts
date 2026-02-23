import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { projects, sessions, personalities, scheduledTasks } from '../../db/schema.js';
import { initializeProjectWorkspace, getProjectWorkspacePath } from '../../services/project-workspace.js';

/**
 * Validate project slug: lowercase alphanumeric, hyphens, underscores
 */
const SLUG_REGEX = /^[a-z0-9][a-z0-9_-]*$/;

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  projectSlug: z.string()
    .min(2)
    .max(50)
    .regex(SLUG_REGEX, 'Must be lowercase letters, numbers, hyphens, or underscores'),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'archived']).optional(),
});

/**
 * Projects routes - CRUD for shared project workspaces
 */
export const projectsRoutes: FastifyPluginAsync = async (server) => {
  const { db } = server.state;

  /**
   * GET /api/projects
   * List all projects
   */
  server.get('/projects', async (request, reply) => {
    const query = request.query as { status?: string; limit?: string; offset?: string };
    const limit = Math.min(parseInt(query.limit || '50', 10), 100);
    const offset = parseInt(query.offset || '0', 10);

    let baseQuery = db.db.select().from(projects);
    let countQuery = db.db.select({ count: sql<number>`count(*)` }).from(projects);

    if (query.status === 'active' || query.status === 'archived') {
      baseQuery = baseQuery.where(eq(projects.status, query.status));
      countQuery = countQuery.where(eq(projects.status, query.status));
    }

    const countResult = countQuery.get();
    const total = countResult?.count ?? 0;

    const results = baseQuery
      .orderBy(desc(projects.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    return reply.send({
      projects: results,
      total,
      limit,
      offset,
      hasMore: offset + results.length < total,
    });
  });

  /**
   * GET /api/projects/:id
   * Get project details including workspace path and session count
   */
  server.get<{ Params: { id: string } }>('/projects/:id', async (request, reply) => {
    const { id } = request.params;

    const project = db.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get();

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    // Get session count and agent breakdown
    const sessionCount = db.db
      .select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(eq(sessions.projectId, id))
      .get();

    // Get unique personalities that have worked on this project
    const agentSessions = db.db
      .select({
        personalityId: sessions.personalityId,
        count: sql<number>`count(*)`,
      })
      .from(sessions)
      .where(eq(sessions.projectId, id))
      .groupBy(sessions.personalityId)
      .all();

    // Resolve personality names
    const agents = [];
    for (const agentSession of agentSessions) {
      if (agentSession.personalityId) {
        const personality = db.db
          .select()
          .from(personalities)
          .where(eq(personalities.id, agentSession.personalityId))
          .get();
        if (personality) {
          agents.push({
            personalityId: personality.id,
            name: personality.name,
            readableId: personality.readableId,
            sessionCount: agentSession.count,
          });
        }
      } else {
        agents.push({
          personalityId: null,
          name: 'Unassigned',
          readableId: null,
          sessionCount: agentSession.count,
        });
      }
    }

    return reply.send({
      ...project,
      sessionCount: sessionCount?.count ?? 0,
      agents,
    });
  });

  /**
   * POST /api/projects
   * Create a new project and initialize its workspace folder
   */
  server.post('/projects', async (request, reply) => {
    const body = createProjectSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    const { name, projectSlug } = body.data;

    // Check uniqueness of slug
    const existing = db.db
      .select()
      .from(projects)
      .where(eq(projects.projectSlug, projectSlug))
      .get();

    if (existing) {
      return reply.status(409).send({
        error: `Project with slug "${projectSlug}" already exists`,
      });
    }

    // Initialize workspace folder structure
    const workspacePath = initializeProjectWorkspace(projectSlug);

    const id = nanoid();
    const now = new Date();

    db.db.insert(projects).values({
      id,
      name,
      projectSlug,
      workspacePath,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }).run();

    const created = db.db.select().from(projects).where(eq(projects.id, id)).get();

    server.log.info({ projectId: id, slug: projectSlug, workspacePath }, 'Created project with workspace');

    return reply.status(201).send(created);
  });

  /**
   * PUT /api/projects/:id
   * Update a project (name, status)
   */
  server.put<{ Params: { id: string } }>('/projects/:id', async (request, reply) => {
    const { id } = request.params;

    const body = updateProjectSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    const existing = db.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get();

    if (!existing) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.data.name !== undefined) updates.name = body.data.name;
    if (body.data.status !== undefined) updates.status = body.data.status;

    db.db.update(projects)
      .set(updates)
      .where(eq(projects.id, id))
      .run();

    const updated = db.db.select().from(projects).where(eq(projects.id, id)).get();
    return reply.send(updated);
  });

  /**
   * DELETE /api/projects/:id
   * Archive a project (soft delete — keeps workspace files)
   */
  server.delete<{ Params: { id: string } }>('/projects/:id', async (request, reply) => {
    const { id } = request.params;

    const existing = db.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get();

    if (!existing) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    // Soft delete: archive the project
    db.db.update(projects)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(projects.id, id))
      .run();

    return reply.status(204).send();
  });

  /**
   * GET /api/projects/:id/sessions
   * List all sessions belonging to a project
   */
  server.get<{ Params: { id: string } }>('/projects/:id/sessions', async (request, reply) => {
    const { id } = request.params;
    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const offset = parseInt(query.offset || '0', 10);

    const project = db.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get();

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const countResult = db.db
      .select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(eq(sessions.projectId, id))
      .get();
    const total = countResult?.count ?? 0;

    const results = db.db
      .select()
      .from(sessions)
      .where(eq(sessions.projectId, id))
      .orderBy(desc(sessions.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    return reply.send({
      sessions: results,
      total,
      limit,
      offset,
      hasMore: offset + results.length < total,
    });
  });

  /**
   * GET /api/projects/:id/files
   * Browse the project workspace directory
   * Delegates to the existing filesystem browse logic
   */
  server.get<{ Params: { id: string } }>('/projects/:id/files', async (request, reply) => {
    const { id } = request.params;
    const query = request.query as { path?: string };

    const project = db.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get();

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    // Redirect to filesystem browse with the workspace path
    const browsePath = query.path
      ? `${project.workspacePath}/${query.path}`
      : project.workspacePath;

    // Validate the resolved path stays within the project workspace
    const { resolve } = await import('node:path');
    const normalizedBrowsePath = resolve(browsePath);
    if (!normalizedBrowsePath.startsWith(project.workspacePath)) {
      return reply.status(403).send({ error: 'Access denied: path is outside project workspace' });
    }

    return reply.redirect(`/api/filesystem/browse?path=${encodeURIComponent(normalizedBrowsePath)}`);
  });

  // ─── Team Messages ─────────────────────────────────────────────────────────

  const postMessageSchema = z.object({
    sender: z.string().min(1).max(100), // e.g. "@mark" or "user"
    target: z.string().min(1).max(100), // e.g. "@mark", "@all"
    content: z.string().min(1).max(10000),
  });

  /**
   * Helper: parse a messages.md file into structured message objects.
   * Format: ### @sender → @target [2026-02-07T12:00:00Z]
   */
  function parseMessagesFile(content: string): Array<{
    sender: string;
    target: string;
    timestamp: string;
    content: string;
  }> {
    const messages: Array<{
      sender: string;
      target: string;
      timestamp: string;
      content: string;
    }> = [];

    const lines = content.split('\n');
    const headerPattern = /^#{1,3}\s+(.+?)\s*→\s*(.+?)\s*\[(.+?)\]\s*$/;

    let i = 0;
    while (i < lines.length) {
      const match = lines[i].match(headerPattern);
      if (!match) {
        i++;
        continue;
      }

      const sender = match[1].trim();
      const target = match[2].trim();
      let timestamp = match[3].trim();

      // Normalize timestamp: extract HH:MM from ISO strings
      const isoMatch = timestamp.match(/T(\d{2}:\d{2})/);
      if (isoMatch) {
        timestamp = isoMatch[1];
      }

      // Collect content lines until the next header or end
      i++;
      const contentLines: string[] = [];
      while (i < lines.length) {
        if (lines[i].match(headerPattern)) break;
        if (lines[i].match(/^#\s+Team Messages/)) { i++; continue; }
        contentLines.push(lines[i]);
        i++;
      }

      const messageContent = contentLines.join('\n').trim();
      if (messageContent) {
        messages.push({ sender, target, timestamp, content: messageContent });
      }
    }

    return messages;
  }

  /**
   * GET /api/projects/:id/messages
   * Get team messages for a project, optionally filtered by date range.
   * Returns messages from all dates, most recent first.
   */
  server.get<{ Params: { id: string } }>('/projects/:id/messages', async (request, reply) => {
    const { id } = request.params;
    const query = request.query as { days?: string };
    const days = Math.min(parseInt(query.days || '30', 10), 365);

    const project = db.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get();

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const messagesDir = join(project.workspacePath, 'team-messages');
    if (!existsSync(messagesDir)) {
      return reply.send({ messages: [], dates: [] });
    }

    // List date directories, sorted descending
    const dateDirs = readdirSync(messagesDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
      .map(d => d.name)
      .sort()
      .reverse();

    // Filter to last N days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const relevantDates = dateDirs.filter(d => d >= cutoffStr);

    const allMessages: Array<{
      sender: string;
      target: string;
      timestamp: string;
      content: string;
      date: string;
    }> = [];

    for (const date of relevantDates) {
      const messagesFile = join(messagesDir, date, 'messages.md');
      if (!existsSync(messagesFile)) continue;

      const fileContent = readFileSync(messagesFile, 'utf-8');
      const parsed = parseMessagesFile(fileContent);
      for (const msg of parsed) {
        allMessages.push({ ...msg, date });
      }
    }

    return reply.send({
      messages: allMessages,
      dates: relevantDates,
    });
  });

  /**
   * POST /api/projects/:id/messages
   * Post a new team message. Appends to today's messages.md file.
   */
  server.post<{ Params: { id: string } }>('/projects/:id/messages', async (request, reply) => {
    const { id } = request.params;

    const body = postMessageSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    const project = db.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get();

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const { sender, target, content } = body.data;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toISOString().slice(11, 19) + 'Z'; // HH:MM:SSZ

    const dateDirPath = join(project.workspacePath, 'team-messages', dateStr);
    mkdirSync(dateDirPath, { recursive: true });

    const messagesFile = join(dateDirPath, 'messages.md');
    const messageBlock = `\n### ${sender} → ${target} [${dateStr}T${timeStr}]\n${content}\n`;

    if (existsSync(messagesFile)) {
      const existing = readFileSync(messagesFile, 'utf-8');
      writeFileSync(messagesFile, existing + messageBlock, 'utf-8');
    } else {
      writeFileSync(messagesFile, `# Team Messages — ${dateStr}\n${messageBlock}`, 'utf-8');
    }

    return reply.status(201).send({
      sender,
      target,
      content,
      timestamp: now.toISOString().slice(11, 16),
      date: dateStr,
    });
  });
};
