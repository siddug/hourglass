import type { FastifyPluginAsync } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { eq, desc, sql } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { sessions, executionProcesses, processLogs, apiKeys, personalities, projects, type SessionStatus, type ApprovalMode, type AgentMode } from '../../db/schema.js';
import type { ApprovalRequest, ApprovalResponse, ApprovalStatus } from '../../acp/control-protocol.js';
import { generateSessionNameWithFallback } from '../../utils/session-name-generator.js';
import type { ApprovalServiceMode } from '../../acp/approval-service.js';
import { applyAgentModeToPrompt, applyFullPromptContext, type ProjectAgent } from '../../utils/prompt-utils.js';
import { loadConfig } from '../../utils/config.js';
import { SkillsService } from '../../services/skills-service.js';

/**
 * Expand ~ to home directory
 */
function expandTilde(path: string): string {
  if (path.startsWith('~/')) {
    return path.replace('~', homedir());
  }
  if (path === '~') {
    return homedir();
  }
  return path;
}

/**
 * Request body schemas
 */
const createSessionSchema = z.object({
  connector: z.string().min(1),
  workDir: z.string().min(1),
  prompt: z.string().min(1),
  env: z.record(z.string()).optional(),
  enableApprovals: z.boolean().optional(),
  approvalMode: z.enum(['manual', 'auto']).optional(),
  agentMode: z.enum(['default', 'plan']).optional(),
  sessionName: z.string().optional(),
  startImmediately: z.boolean().optional().default(true),
  skillsDirectory: z.string().optional(),
  personalityId: z.string().optional(),
  projectId: z.string().optional(),
});

const updateModeSchema = z.object({
  approvalMode: z.enum(['manual', 'auto']),
});

const updateSessionSchema = z.object({
  sessionName: z.string().optional(),
});

const updateSessionStatusSchema = z.object({
  status: z.enum(['triage', 'in_progress', 'completed', 'failed', 'approval', 'done', 'archived']),
});

const imageDataSchema = z.object({
  data: z.string().min(1),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
});

const followUpSchema = z.object({
  prompt: z.string().min(1),
  images: z.array(imageDataSchema).optional(),
});

const approvalResponseSchema = z.object({
  requestId: z.string().min(1),
  status: z.enum(['approved', 'denied']),
  reason: z.string().optional(),
});

// Track current process ID for each active session (for log routing)
const sessionProcessMap = new Map<string, { currentProcessId: string }>();

/**
 * Sessions routes
 */
/**
 * Resolve personality and project context for prompt injection
 */
function resolvePromptContext(db: any, personalityId?: string, projectId?: string) {
  let personality = undefined;
  let project = undefined;
  let projectAgents: ProjectAgent[] = [];

  if (personalityId) {
    personality = db.db
      .select()
      .from(personalities)
      .where(eq(personalities.id, personalityId))
      .get();
  }

  if (projectId) {
    project = db.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();

    if (project) {
      // Get unique personalities that have worked on this project
      const agentSessions = db.db
        .select({
          personalityId: sessions.personalityId,
          count: sql<number>`count(*)`,
        })
        .from(sessions)
        .where(eq(sessions.projectId, projectId))
        .groupBy(sessions.personalityId)
        .all();

      for (const agentSession of agentSessions) {
        if (agentSession.personalityId) {
          const p = db.db
            .select()
            .from(personalities)
            .where(eq(personalities.id, agentSession.personalityId))
            .get();
          if (p) {
            projectAgents.push({
              name: p.name,
              readableId: p.readableId,
              sessionCount: agentSession.count,
            });
          }
        }
      }
    }
  }

  return { personality, project, projectAgents };
}

export const sessionsRoutes: FastifyPluginAsync = async (server) => {
  const { db, registry, sessions: activeSessions } = server.state;

  /**
   * Try to auto-generate a session name using available API keys
   * Tries Anthropic first, then falls back to Mistral
   * Checks database first, then falls back to environment variables
   * Returns null if no API keys are available or generation fails
   * Retries each provider 3 times before giving up
   */
  async function tryGenerateSessionName(prompt: string): Promise<string | null> {
    try {
      // Fetch available API keys from database
      const anthropicKey = db.db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.provider, 'anthropic'))
        .get();

      const mistralKey = db.db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.provider, 'mistral'))
        .get();

      // Fall back to environment variables if database keys not found
      const anthropicApiKey = anthropicKey?.apiKey || process.env.ANTHROPIC_API_KEY;
      const mistralApiKey = mistralKey?.apiKey || process.env.MISTRAL_API_KEY;

      // Try to generate session name with retries
      const maxRetries = 3;
      const generatedName = await generateSessionNameWithFallback(prompt, {
        anthropic: anthropicApiKey,
        mistral: mistralApiKey,
      }, maxRetries);

      if (generatedName) {
        server.log.info({ maxRetries }, 'Successfully generated session name after retries');
      } else {
        server.log.warn({ maxRetries }, 'Failed to generate session name after all retries');
      }

      return generatedName;
    } catch (error) {
      server.log.error({ error }, 'Failed to auto-generate session name');
      return null;
    }
  }

  /**
   * GET /api/sessions
   * List sessions with optional filtering and pagination
   * Query params:
   *   - status: Filter by session status (triage, in_progress, completed, failed)
   *   - limit: Number of sessions to return (default: 20, max: 100)
   *   - offset: Number of sessions to skip (default: 0)
   */
  server.get('/sessions', async (request, reply) => {
    const query = request.query as {
      status?: SessionStatus;
      projectId?: string;
      limit?: string;
      offset?: string;
    };

    // Parse pagination params with defaults and limits
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const offset = parseInt(query.offset || '0', 10);

    // Build base query with optional status filter
    let baseQuery = db.db.select().from(sessions);
    let countQuery = db.db.select({ count: sql<number>`count(*)` }).from(sessions);

    if (query.status) {
      baseQuery = baseQuery.where(eq(sessions.status, query.status));
      countQuery = countQuery.where(eq(sessions.status, query.status));
    }

    if (query.projectId) {
      baseQuery = baseQuery.where(eq(sessions.projectId, query.projectId));
      countQuery = countQuery.where(eq(sessions.projectId, query.projectId));
    }

    // Get total count
    const countResult = countQuery.get();
    const total = countResult?.count ?? 0;

    // Apply sorting (newest first by updatedAt) and pagination
    const results = baseQuery
      .orderBy(desc(sessions.updatedAt))
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
   * GET /api/sessions/work-dirs
   * Get unique working directories from all sessions
   */
  server.get('/sessions/work-dirs', async (_request, reply) => {
    const results = db.db
      .selectDistinct({ workDir: sessions.workDir })
      .from(sessions)
      .orderBy(sessions.workDir)
      .all();

    const workDirs = results.map((r) => r.workDir).filter(Boolean);

    return reply.send({ workDirs });
  });

  /**
   * GET /api/sessions/:id
   * Get session details
   */
  server.get<{ Params: { id: string } }>('/sessions/:id', async (request, reply) => {
    const { id } = request.params;

    const session = db.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .get();

    if (!session) {
      return reply.status(404).send({
        error: 'Session not found',
      });
    }

    // Get execution processes for this session
    const processes = db.db
      .select()
      .from(executionProcesses)
      .where(eq(executionProcesses.sessionId, id))
      .all();

    // Check if session is active
    const isActive = activeSessions.has(id);

    // Resolve personality and project details
    let personality = null;
    let project = null;

    if (session.personalityId) {
      personality = db.db
        .select()
        .from(personalities)
        .where(eq(personalities.id, session.personalityId))
        .get() || null;
    }

    if (session.projectId) {
      project = db.db
        .select()
        .from(projects)
        .where(eq(projects.id, session.projectId))
        .get() || null;
    }

    return reply.send({
      ...session,
      isActive,
      processes,
      personality,
      project,
    });
  });

  /**
   * POST /api/sessions
   * Create a new session
   */
  server.post('/sessions', async (request, reply) => {
    const body = createSessionSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    const { connector: connectorName, workDir: rawWorkDir, prompt, env, enableApprovals, approvalMode: requestedApprovalMode, agentMode: requestedAgentMode, sessionName, startImmediately, personalityId, projectId } = body.data;
    const workDir = expandTilde(rawWorkDir);
    // Default to 'manual' mode, but if approvalMode is provided, use it
    const approvalMode: ApprovalMode = requestedApprovalMode ?? 'manual';
    // Default to 'default' agent mode, but if agentMode is provided, use it
    const agentMode: AgentMode = requestedAgentMode ?? 'default';

    // Resolve personality and project for prompt context
    const promptContext = resolvePromptContext(db, personalityId, projectId);

    // Get the connector
    const connector = registry.get(connectorName);
    if (!connector) {
      return reply.status(400).send({
        error: `Unknown connector: ${connectorName}`,
        available: registry.names(),
      });
    }

    // Validate working directory exists
    if (!existsSync(workDir)) {
      return reply.status(400).send({
        error: `Working directory does not exist: ${workDir}`,
      });
    }

    // Check availability
    const availability = await connector.checkAvailability();
    if (availability.status !== 'available') {
      return reply.status(503).send({
        error: `Connector ${connectorName} is not available`,
        status: availability.status,
        message: availability.message,
        setupInstructions: connector.getSetupInstructions(),
      });
    }

    // Create session ID
    const sessionId = nanoid();
    const now = new Date();

    // Auto-generate session name if not provided
    let finalSessionName = sessionName || null;
    if (!sessionName) {
      const generatedName = await tryGenerateSessionName(prompt);
      if (generatedName) {
        finalSessionName = generatedName;
        server.log.info({ sessionId, generatedName }, 'Auto-generated session name');
      }
    }

    // If startImmediately is false, create session in triage status and return early
    if (!startImmediately) {
      db.db.insert(sessions).values({
        id: sessionId,
        connectorType: connectorName,
        workDir,
        sessionName: finalSessionName,
        status: 'triage' as SessionStatus,
        approvalMode,
        agentMode,
        personalityId: personalityId || null,
        projectId: projectId || null,
        createdAt: now,
        updatedAt: now,
      }).run();

      // Create a pending execution process record to store the prompt
      const processId = nanoid();
      db.db.insert(executionProcesses).values({
        id: processId,
        sessionId,
        status: 'running', // Will be started later
        prompt,
        createdAt: now,
      }).run();

      return reply.status(201).send({
        id: sessionId,
        processId,
        connectorType: connectorName,
        workDir,
        sessionName: finalSessionName,
        status: 'triage',
        approvalMode,
        agentMode,
        personalityId: personalityId || null,
        projectId: projectId || null,
        createdAt: now.toISOString(),
      });
    }

    // Insert session record
    db.db.insert(sessions).values({
      id: sessionId,
      connectorType: connectorName,
      workDir,
      sessionName: finalSessionName,
      status: 'in_progress' as SessionStatus,
      approvalMode,
      agentMode,
      personalityId: personalityId || null,
      projectId: projectId || null,
      createdAt: now,
      updatedAt: now,
    }).run();

    try {
      // Apply full prompt context (personality + project + agent mode)
      const effectivePrompt = applyFullPromptContext(prompt, {
        agentMode,
        personality: promptContext.personality,
        project: promptContext.project,
        projectAgents: promptContext.projectAgents,
      });

      // Inject global skills before spawning
      const config = loadConfig();
      const skillsDir = body.data.skillsDirectory || config.skills?.globalDirectory;
      if (skillsDir) {
        const skillsService = new SkillsService(skillsDir);
        const validation = await skillsService.validate();
        if (validation.valid) {
          await skillsService.injectSkills(connectorName as 'claude' | 'vibe');
          server.log.info({ skillsDir, connector: connectorName }, 'Injected global skills');
        } else {
          server.log.warn({ skillsDir, error: validation.error }, 'Skills directory invalid, skipping injection');
        }
      }

      // Spawn the session
      server.log.info({ workDir, prompt: effectivePrompt, enableApprovals, approvalMode, agentMode }, 'Spawning session');
      const spawned = await connector.spawn({
        workDir,
        prompt: effectivePrompt,
        env,
        enableApprovals,
        approvalMode,
        agentMode,
        vibeXSessionId: sessionId, // Pass VibeX session ID for Vibe history tracking
      });
      server.log.info({ sessionId, processId: spawned.id }, 'Session spawned');

      // Set approval mode on the approval service
      if (spawned.approvalService) {
        spawned.approvalService.setMode(approvalMode);
        server.log.info({ sessionId, approvalMode }, 'Set approval mode');

        // Listen for approval requests to update session status
        spawned.approvalService.on('approvalRequest', (approvalRequest) => {
          spawned.events.emit('approvalRequest', approvalRequest);

          // Update session status to 'approval' when awaiting user approval
          db.db.update(sessions)
            .set({ status: 'approval' as SessionStatus, updatedAt: new Date() })
            .where(eq(sessions.id, sessionId))
            .run();
        });

        // Listen for approval responses to restore status to 'in_progress'
        spawned.approvalService.on('approvalResponse', () => {
          // Only restore if no more pending approvals
          if (!spawned.approvalService!.hasPending()) {
            db.db.update(sessions)
              .set({ status: 'in_progress' as SessionStatus, updatedAt: new Date() })
              .where(eq(sessions.id, sessionId))
              .run();
          }
        });
      }

      // Track the active session
      activeSessions.set(sessionId, spawned);

      // Create execution process record
      const processId = nanoid();
      db.db.insert(executionProcesses).values({
        id: processId,
        sessionId,
        status: 'running',
        prompt,
        createdAt: now,
      }).run();

      // Track current process ID for log routing (mutable so follow-ups work)
      const processState = { currentProcessId: processId };
      sessionProcessMap.set(sessionId, processState);

      // Check if agent session ID was already captured during spawn
      if (spawned.agentSessionId) {
        server.log.info({ sessionId, agentSessionId: spawned.agentSessionId }, 'Captured agent session ID from spawn');
        db.db.update(sessions)
          .set({ agentSessionId: spawned.agentSessionId, updatedAt: new Date() })
          .where(eq(sessions.id, sessionId))
          .run();
      }

      // Also subscribe to event for session IDs that arrive later
      spawned.events.on('sessionId', (agentSessId) => {
        server.log.info({ sessionId, agentSessionId: agentSessId }, 'Captured agent session ID from event');
        db.db.update(sessions)
          .set({ agentSessionId: agentSessId, updatedAt: new Date() })
          .where(eq(sessions.id, sessionId))
          .run();
      });

      // Listen for ACP events and persist them to the database
      // This includes toolCall, toolUpdate, message, done, etc.
      spawned.events.on('event', (event) => {
        const currentProcessId = processState.currentProcessId;

        // Persist ACP event to database
        try {
          db.db.insert(processLogs).values({
            id: nanoid(),
            processId: currentProcessId,
            logType: 'event',
            content: JSON.stringify(event),
            timestamp: new Date(),
          }).run();
        } catch {
          // Ignore persistence errors
        }

        // Handle task completion (done event) in interactive mode
        // This happens when Claude sends a 'result' message or when an error occurs
        if (event.type === 'done') {
          const isError = (event as any).reason === 'error' || (event as any).error;
          server.log.info({ sessionId, processId: currentProcessId, reason: (event as any).reason, error: isError }, 'Task completed (done event)');
          const completedAt = new Date();

          // Update process status based on whether it was an error
          db.db.update(executionProcesses)
            .set({
              status: isError ? 'failed' : 'completed',
              exitCode: isError ? 1 : 0,
              completedAt,
            })
            .where(eq(executionProcesses.id, currentProcessId))
            .run();

          // Update session status (completed allows follow-ups, failed indicates error)
          db.db.update(sessions)
            .set({ status: (isError ? 'failed' : 'completed') as SessionStatus, updatedAt: completedAt })
            .where(eq(sessions.id, sessionId))
            .run();

          // Signal to streaming clients that this task is finished
          // The MsgStore will be cleared on follow-up, so this is safe
          spawned.msgStore.pushFinished();

          // Note: We don't remove from activeSessions because the process is still alive
          // and can accept follow-up messages in interactive mode
        }
      });

      // Subscribe to MsgStore to persist logs to database
      // Uses processState.currentProcessId so follow-up logs go to the correct process
      const unsubscribeLogs = spawned.msgStore.subscribe((msg) => {
        try {
          // Map MsgStore types to database LogType
          let logType: 'stdout' | 'stderr' | 'event';
          let content: string;

          switch (msg.type) {
            case 'stdout':
              logType = 'stdout';
              content = msg.content;
              break;
            case 'stderr':
              logType = 'stderr';
              content = msg.content;
              break;
            case 'jsonPatch':
              logType = 'event';
              content = JSON.stringify({ type: 'jsonPatch', patch: msg.patch });
              break;
            case 'sessionId':
              logType = 'event';
              content = JSON.stringify({ type: 'sessionId', sessionId: msg.sessionId });
              break;
            case 'ready':
              logType = 'event';
              content = JSON.stringify({ type: 'ready' });
              break;
            case 'finished':
              logType = 'event';
              content = JSON.stringify({ type: 'finished' });
              break;
          }

          db.db.insert(processLogs).values({
            id: nanoid(),
            processId: processState.currentProcessId,
            logType,
            content,
            timestamp: new Date(),
          }).run();
        } catch {
          // Ignore persistence errors for now
        }
      });

      // Handle session exit
      spawned.waitForExit().then(({ code, signal }) => {
        // Unsubscribe from log persistence
        unsubscribeLogs();

        const completedAt = new Date();
        const currentProcessId = processState.currentProcessId;

        // Check current session status before updating
        // Don't change 'completed' to 'failed' just because the process was killed
        // (This happens during server shutdown when interactive mode keeps processes alive)
        const currentSession = db.db
          .select()
          .from(sessions)
          .where(eq(sessions.id, sessionId))
          .get();

        const currentStatus = currentSession?.status;
        const shouldPreserveStatus = currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'triage';

        // Determine new status based on exit code, unless we should preserve current status
        const newSessionStatus: SessionStatus = shouldPreserveStatus
          ? currentStatus as SessionStatus
          : (code === 0 ? 'completed' : 'failed');

        // Update session status (only if not preserving)
        if (!shouldPreserveStatus) {
          db.db.update(sessions)
            .set({ status: newSessionStatus, updatedAt: completedAt })
            .where(eq(sessions.id, sessionId))
            .run();
        }

        // Update process status - check current process status too
        const currentProcess = db.db
          .select()
          .from(executionProcesses)
          .where(eq(executionProcesses.id, currentProcessId))
          .get();

        const processAlreadyCompleted = currentProcess?.status === 'completed' || currentProcess?.status === 'failed';

        if (!processAlreadyCompleted) {
          db.db.update(executionProcesses)
            .set({
              status: code === 0 ? 'completed' : 'failed',
              exitCode: code,
              completedAt,
            })
            .where(eq(executionProcesses.id, currentProcessId))
            .run();
        }

        // Remove from active sessions and process map
        activeSessions.delete(sessionId);
        sessionProcessMap.delete(sessionId);

        server.log.info(`Session ${sessionId} exited with code ${code}, signal ${signal}`);
      });

      return reply.status(201).send({
        id: sessionId,
        processId,
        connectorType: connectorName,
        workDir,
        sessionName: finalSessionName,
        status: 'in_progress',
        approvalMode,
        agentMode,
        personalityId: personalityId || null,
        projectId: projectId || null,
        createdAt: now.toISOString(),
      });
    } catch (error) {
      // Update session status to failed
      db.db.update(sessions)
        .set({ status: 'failed' as SessionStatus, updatedAt: new Date() })
        .where(eq(sessions.id, sessionId))
        .run();

      return reply.status(500).send({
        error: 'Failed to spawn session',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/sessions/:id/follow-up
   * Send a follow-up message to an existing session
   */
  server.post<{ Params: { id: string } }>('/sessions/:id/follow-up', async (request, reply) => {
    const { id } = request.params;

    const body = followUpSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    const { prompt, images } = body.data;

    // Get the session
    const session = db.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .get();

    if (!session) {
      return reply.status(404).send({
        error: 'Session not found',
      });
    }

    // Check if session is active (process still running)
    const activeSession = activeSessions.get(id);
    if (activeSession) {
      // Send input to active session (interactive mode)
      try {
        // Create a new execution process record for this follow-up
        const newProcessId = nanoid();
        const now = new Date();

        db.db.insert(executionProcesses).values({
          id: newProcessId,
          sessionId: id,
          status: 'running',
          prompt,
          createdAt: now,
        }).run();

        // Update the process state so logs go to the new process
        // This updates the shared processState object that event handlers also reference
        const processStateFromMap = sessionProcessMap.get(id);
        if (processStateFromMap) {
          processStateFromMap.currentProcessId = newProcessId;
        } else {
          // This shouldn't happen if the session was properly spawned
          // If it does, logs from this follow-up will go to the wrong process
          server.log.error({ sessionId: id, newProcessId }, 'No processState found in sessionProcessMap for follow-up - this is a bug');
        }

        // Clear the MsgStore to prevent old logs from being streamed to the new process
        // This is critical for interactive mode where the process stays alive across follow-ups
        activeSession.msgStore.clear();

        // Update session status back to running
        db.db.update(sessions)
          .set({ status: 'in_progress' as SessionStatus, updatedAt: now })
          .where(eq(sessions.id, id))
          .run();

        // Send the input with images (the existing event listener will handle completion)
        activeSession.sendInput(prompt, images);

        return reply.send({
          status: 'sent',
          sessionId: id,
          processId: newProcessId,
        });
      } catch (error) {
        return reply.status(500).send({
          error: 'Failed to send input',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Session not active, spawn follow-up
    const connector = registry.get(session.connectorType);
    if (!connector) {
      return reply.status(500).send({
        error: `Connector ${session.connectorType} no longer available`,
      });
    }

    // Check if we have an agent session ID for resume
    if (!session.agentSessionId) {
      return reply.status(400).send({
        error: 'Cannot resume session: no agent session ID available',
        message: 'The original session may not have completed successfully or the agent did not provide a session ID',
      });
    }

    try {
      // Get the approval mode and agent mode from the session for follow-up
      const approvalMode = session.approvalMode as ApprovalMode;
      const agentMode = session.agentMode as AgentMode;

      // Apply agent mode to prompt (plan mode prepends planning instructions)
      const effectivePrompt = applyAgentModeToPrompt(prompt, agentMode);

      const spawned = await connector.spawnFollowUp({
        workDir: session.workDir,
        prompt: effectivePrompt,
        // agentSessionId is used for native --resume (both Claude and Vibe support this)
        sessionId: session.agentSessionId,
        vibeXSessionId: id,
        enableApprovals: true,
        approvalMode,
        agentMode,
      });

      // Set approval mode on the approval service
      if (spawned.approvalService) {
        spawned.approvalService.setMode(approvalMode);
        server.log.info({ sessionId: id, approvalMode }, 'Set approval mode for follow-up session');

        // Listen for approval requests to update session status
        spawned.approvalService.on('approvalRequest', (approvalRequest) => {
          spawned.events.emit('approvalRequest', approvalRequest);

          // Update session status to 'approval' when awaiting user approval
          db.db.update(sessions)
            .set({ status: 'approval' as SessionStatus, updatedAt: new Date() })
            .where(eq(sessions.id, id))
            .run();
        });

        // Listen for approval responses to restore status to 'in_progress'
        spawned.approvalService.on('approvalResponse', () => {
          // Only restore if no more pending approvals
          if (!spawned.approvalService!.hasPending()) {
            db.db.update(sessions)
              .set({ status: 'in_progress' as SessionStatus, updatedAt: new Date() })
              .where(eq(sessions.id, id))
              .run();
          }
        });
      }

      // Track the new active session
      activeSessions.set(id, spawned);

      // Create execution process record
      const processId = nanoid();
      const now = new Date();

      db.db.insert(executionProcesses).values({
        id: processId,
        sessionId: id,
        status: 'running',
        prompt,
        createdAt: now,
      }).run();

      // Track current process ID for log routing (mutable so follow-ups work)
      // This is needed so that when follow-up messages come in, events go to the right process
      const processState = { currentProcessId: processId };
      sessionProcessMap.set(id, processState);

      // Update session status
      db.db.update(sessions)
        .set({ status: 'in_progress' as SessionStatus, updatedAt: now })
        .where(eq(sessions.id, id))
        .run();

      // Listen for ACP events and persist them to the database
      spawned.events.on('event', (event) => {
        const currentProcessId = processState.currentProcessId;

        // Persist ACP event to database
        try {
          db.db.insert(processLogs).values({
            id: nanoid(),
            processId: currentProcessId,
            logType: 'event',
            content: JSON.stringify(event),
            timestamp: new Date(),
          }).run();
        } catch {
          // Ignore persistence errors
        }

        // Handle task completion (done event)
        if (event.type === 'done') {
          const completedAt = new Date();

          db.db.update(executionProcesses)
            .set({
              status: 'completed',
              exitCode: 0,
              completedAt,
            })
            .where(eq(executionProcesses.id, currentProcessId))
            .run();

          db.db.update(sessions)
            .set({ status: 'completed' as SessionStatus, updatedAt: completedAt })
            .where(eq(sessions.id, id))
            .run();

          // Signal to streaming clients that this task is finished
          spawned.msgStore.pushFinished();
        }
      });

      // Subscribe to MsgStore to persist logs to database
      const unsubscribeLogs = spawned.msgStore.subscribe((msg) => {
        try {
          // Map MsgStore types to database LogType
          let logType: 'stdout' | 'stderr' | 'event';
          let content: string;

          switch (msg.type) {
            case 'stdout':
              logType = 'stdout';
              content = msg.content;
              break;
            case 'stderr':
              logType = 'stderr';
              content = msg.content;
              break;
            case 'jsonPatch':
              logType = 'event';
              content = JSON.stringify({ type: 'jsonPatch', patch: msg.patch });
              break;
            case 'sessionId':
              logType = 'event';
              content = JSON.stringify({ type: 'sessionId', sessionId: msg.sessionId });
              break;
            case 'ready':
              logType = 'event';
              content = JSON.stringify({ type: 'ready' });
              break;
            case 'finished':
              logType = 'event';
              content = JSON.stringify({ type: 'finished' });
              break;
          }

          db.db.insert(processLogs).values({
            id: nanoid(),
            processId: processState.currentProcessId,
            logType,
            content,
            timestamp: new Date(),
          }).run();
        } catch {
          // Ignore persistence errors for now
        }
      });

      // Handle exit
      spawned.waitForExit().then(({ code }) => {
        // Unsubscribe from log persistence
        unsubscribeLogs();

        // Clean up processState from map
        sessionProcessMap.delete(id);

        const completedAt = new Date();
        const currentProcessId = processState.currentProcessId;

        // Check current session status before updating
        // Don't change 'completed' to 'failed' just because the process was killed
        const currentSession = db.db
          .select()
          .from(sessions)
          .where(eq(sessions.id, id))
          .get();

        const currentStatus = currentSession?.status;
        const shouldPreserveStatus = currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'triage';

        if (!shouldPreserveStatus) {
          const status: SessionStatus = code === 0 ? 'completed' : 'failed';
          db.db.update(sessions)
            .set({ status, updatedAt: completedAt })
            .where(eq(sessions.id, id))
            .run();
        }

        // Check current process status too
        const currentProcess = db.db
          .select()
          .from(executionProcesses)
          .where(eq(executionProcesses.id, currentProcessId))
          .get();

        const processAlreadyCompleted = currentProcess?.status === 'completed' || currentProcess?.status === 'failed';

        if (!processAlreadyCompleted) {
          db.db.update(executionProcesses)
            .set({
              status: code === 0 ? 'completed' : 'failed',
              exitCode: code,
              completedAt,
            })
            .where(eq(executionProcesses.id, currentProcessId))
            .run();
        }

        activeSessions.delete(id);
      });

      return reply.status(201).send({
        sessionId: id,
        processId,
        status: 'in_progress',
      });
    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to spawn follow-up',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * PATCH /api/sessions/:id
   * Update session properties (name, etc.)
   */
  server.patch<{ Params: { id: string } }>('/sessions/:id', async (request, reply) => {
    const { id } = request.params;

    const body = updateSessionSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    const session = db.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .get();

    if (!session) {
      return reply.status(404).send({
        error: 'Session not found',
      });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.data.sessionName !== undefined) {
      updates.sessionName = body.data.sessionName;
    }

    db.db.update(sessions)
      .set(updates)
      .where(eq(sessions.id, id))
      .run();

    return reply.send({
      status: 'updated',
      sessionId: id,
      ...body.data,
    });
  });

  /**
   * PATCH /api/sessions/:id/status
   * Update session status manually
   * Special handling for triage -> in_progress: spawns the agent
   */
  server.patch<{ Params: { id: string } }>('/sessions/:id/status', async (request, reply) => {
    const { id } = request.params;

    const body = updateSessionStatusSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    const { status: newStatus } = body.data;

    const session = db.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .get();

    if (!session) {
      return reply.status(404).send({
        error: 'Session not found',
      });
    }

    // Special handling: triage -> in_progress means we need to spawn the agent
    if (session.status === 'triage' && newStatus === 'in_progress') {
      // Get the pending execution process with the prompt
      const pendingProcess = db.db
        .select()
        .from(executionProcesses)
        .where(eq(executionProcesses.sessionId, id))
        .get();

      if (!pendingProcess) {
        return reply.status(400).send({
          error: 'No pending process found for triage session',
        });
      }

      const connector = registry.get(session.connectorType);
      if (!connector) {
        return reply.status(500).send({
          error: `Connector ${session.connectorType} no longer available`,
        });
      }

      try {
        const now = new Date();
        const approvalMode = session.approvalMode as ApprovalMode;
        const agentMode = session.agentMode as AgentMode;

        // Resolve personality and project context for prompt injection
        const triagePromptContext = resolvePromptContext(db, session.personalityId || undefined, session.projectId || undefined);

        // Apply full prompt context (personality + project + agent mode)
        const effectivePrompt = applyFullPromptContext(pendingProcess.prompt, {
          agentMode,
          personality: triagePromptContext.personality,
          project: triagePromptContext.project,
          projectAgents: triagePromptContext.projectAgents,
        });

        // Spawn the session
        server.log.info({ workDir: session.workDir, prompt: effectivePrompt, approvalMode, agentMode }, 'Spawning triage session');
        const spawned = await connector.spawn({
          workDir: session.workDir,
          prompt: effectivePrompt,
          enableApprovals: true,
          approvalMode,
          agentMode,
          vibeXSessionId: id, // Pass VibeX session ID for Vibe history tracking
        });
        server.log.info({ sessionId: id, processId: spawned.id }, 'Triage session spawned');

        // Set approval mode on the approval service
        if (spawned.approvalService) {
          spawned.approvalService.setMode(approvalMode);
        }

        // Track the active session
        activeSessions.set(id, spawned);

        // Track current process ID for log routing
        const processState = { currentProcessId: pendingProcess.id };
        sessionProcessMap.set(id, processState);

        // Update session status
        db.db.update(sessions)
          .set({ status: 'in_progress' as SessionStatus, updatedAt: now })
          .where(eq(sessions.id, id))
          .run();

        // Check if agent session ID was captured during spawn
        if (spawned.agentSessionId) {
          db.db.update(sessions)
            .set({ agentSessionId: spawned.agentSessionId, updatedAt: now })
            .where(eq(sessions.id, id))
            .run();
        }

        // Listen for ACP events and persist them to the database
        spawned.events.on('event', (event) => {
          const currentProcessId = processState.currentProcessId;

          try {
            db.db.insert(processLogs).values({
              id: nanoid(),
              processId: currentProcessId,
              logType: 'event',
              content: JSON.stringify(event),
              timestamp: new Date(),
            }).run();
          } catch (error) {
            server.log.error({ error, event }, 'Failed to persist ACP event');
          }

          // Handle task completion (done event) in interactive mode
          // This happens when Claude sends a 'result' message
          if (event.type === 'done') {
            server.log.info({ sessionId: id, processId: currentProcessId, reason: (event as any).reason }, 'Task completed (done event)');
            const completedAt = new Date();

            // Update process status to completed
            db.db.update(executionProcesses)
              .set({
                status: 'completed',
                exitCode: 0,
                completedAt,
              })
              .where(eq(executionProcesses.id, currentProcessId))
              .run();

            // Update session status to completed (allows follow-ups)
            db.db.update(sessions)
              .set({ status: 'completed' as SessionStatus, updatedAt: completedAt })
              .where(eq(sessions.id, id))
              .run();

            // Signal to streaming clients that this task is finished
            spawned.msgStore.pushFinished();

            // Note: We don't remove from activeSessions because the process is still alive
            // and can accept follow-up messages in interactive mode
          }
        });

        // Listen for session ID (if not already captured)
        spawned.events.on('sessionId', (agentSessionId) => {
          server.log.info({ sessionId: id, agentSessionId }, 'Captured agent session ID');
          db.db.update(sessions)
            .set({ agentSessionId, updatedAt: new Date() })
            .where(eq(sessions.id, id))
            .run();
        });

        // Listen for stdout/stderr
        spawned.events.on('stdout', (data) => {
          try {
            db.db.insert(processLogs).values({
              id: nanoid(),
              processId: processState.currentProcessId,
              logType: 'stdout',
              content: data,
              timestamp: new Date(),
            }).run();
          } catch (error) {
            server.log.error({ error }, 'Failed to persist stdout');
          }
        });

        spawned.events.on('stderr', (data) => {
          try {
            db.db.insert(processLogs).values({
              id: nanoid(),
              processId: processState.currentProcessId,
              logType: 'stderr',
              content: data,
              timestamp: new Date(),
            }).run();
          } catch (error) {
            server.log.error({ error }, 'Failed to persist stderr');
          }
        });

        // Listen for approval requests
        if (spawned.approvalService) {
          spawned.approvalService.on('approvalRequest', (approvalRequest) => {
            spawned.events.emit('approvalRequest', approvalRequest);

            // Update session status to 'approval' when awaiting user approval
            db.db.update(sessions)
              .set({ status: 'approval' as SessionStatus, updatedAt: new Date() })
              .where(eq(sessions.id, id))
              .run();
          });

          // Listen for approval responses to restore status to 'in_progress'
          spawned.approvalService.on('approvalResponse', () => {
            // Only restore if no more pending approvals
            if (!spawned.approvalService!.hasPending()) {
              db.db.update(sessions)
                .set({ status: 'in_progress' as SessionStatus, updatedAt: new Date() })
                .where(eq(sessions.id, id))
                .run();
            }
          });
        }

        // Listen for process exit
        spawned.events.on('exit', (code, signal) => {
          const completedAt = new Date();
          const currentProcessId = processState.currentProcessId;

          // Check current session status
          const currentSession = db.db
            .select()
            .from(sessions)
            .where(eq(sessions.id, id))
            .get();

          const currentStatus = currentSession?.status;
          const shouldPreserveStatus = currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'triage';

          const newSessionStatus: SessionStatus = shouldPreserveStatus
            ? currentStatus as SessionStatus
            : (code === 0 ? 'completed' : 'failed');

          if (!shouldPreserveStatus) {
            db.db.update(sessions)
              .set({ status: newSessionStatus, updatedAt: completedAt })
              .where(eq(sessions.id, id))
              .run();
          }

          // Update process status
          const currentProcess = db.db
            .select()
            .from(executionProcesses)
            .where(eq(executionProcesses.id, currentProcessId))
            .get();

          const processAlreadyCompleted = currentProcess?.status === 'completed' || currentProcess?.status === 'failed';

          if (!processAlreadyCompleted) {
            db.db.update(executionProcesses)
              .set({
                status: code === 0 ? 'completed' : 'failed',
                exitCode: code,
                completedAt,
              })
              .where(eq(executionProcesses.id, currentProcessId))
              .run();
          }

          activeSessions.delete(id);
          server.log.info(`Triage session ${id} exited with code ${code}, signal ${signal}`);
        });

        return reply.send({
          status: 'started',
          sessionId: id,
          processId: pendingProcess.id,
          newStatus: 'in_progress',
        });
      } catch (error) {
        db.db.update(sessions)
          .set({ status: 'failed' as SessionStatus, updatedAt: new Date() })
          .where(eq(sessions.id, id))
          .run();

        return reply.status(500).send({
          error: 'Failed to spawn session',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Regular status update (not triage -> in_progress)
    db.db.update(sessions)
      .set({ status: newStatus as SessionStatus, updatedAt: new Date() })
      .where(eq(sessions.id, id))
      .run();

    return reply.send({
      status: 'updated',
      sessionId: id,
      newStatus,
    });
  });

  /**
   * DELETE /api/sessions/:id
   * Kill/stop a session
   */
  server.delete<{ Params: { id: string } }>('/sessions/:id', async (request, reply) => {
    const { id } = request.params;

    // Check if session exists in DB first
    const session = db.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .get();

    if (!session) {
      return reply.status(404).send({
        error: 'Session not found',
      });
    }

    const activeSession = activeSessions.get(id);
    if (!activeSession) {
      // Session not active - update DB status if still showing as in_progress
      if (session.status === 'in_progress') {
        db.db.update(sessions)
          .set({ status: 'failed' as SessionStatus, updatedAt: new Date() })
          .where(eq(sessions.id, id))
          .run();

        // Also update any running processes for this session
        db.db.update(executionProcesses)
          .set({ status: 'failed', completedAt: new Date() })
          .where(eq(executionProcesses.sessionId, id))
          .run();

        return reply.send({
          status: 'failed',
          sessionId: id,
        });
      }

      return reply.send({
        status: 'already_stopped',
        sessionId: id,
      });
    }

    try {
      await activeSession.kill();

      // Update session status
      db.db.update(sessions)
        .set({ status: 'failed' as SessionStatus, updatedAt: new Date() })
        .where(eq(sessions.id, id))
        .run();

      // Update execution processes
      db.db.update(executionProcesses)
        .set({ status: 'failed', completedAt: new Date() })
        .where(eq(executionProcesses.sessionId, id))
        .run();

      activeSessions.delete(id);

      return reply.send({
        status: 'failed',
        sessionId: id,
      });
    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to kill session',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/sessions/:id/interrupt
   * Gracefully interrupt a session (stops current task but keeps process alive for follow-ups)
   */
  server.post<{ Params: { id: string } }>('/sessions/:id/interrupt', async (request, reply) => {
    const { id } = request.params;

    const activeSession = activeSessions.get(id);
    if (!activeSession) {
      return reply.status(404).send({
        error: 'No active session found',
      });
    }

    try {
      await activeSession.interrupt();

      const now = new Date();

      // Update current process status to completed (interrupted)
      const processState = sessionProcessMap.get(id);
      if (processState) {
        db.db.update(executionProcesses)
          .set({
            status: 'completed',
            exitCode: -1, // Use -1 to indicate interrupted
            completedAt: now,
          })
          .where(eq(executionProcesses.id, processState.currentProcessId))
          .run();
      }

      // Update session status to completed so follow-ups can be sent
      // Note: We keep the session in activeSessions since the process is still alive
      db.db.update(sessions)
        .set({ status: 'completed' as SessionStatus, updatedAt: now })
        .where(eq(sessions.id, id))
        .run();

      return reply.send({
        status: 'interrupted',
        sessionId: id,
      });
    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to interrupt session',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * PATCH /api/sessions/:id/mode
   * Update the approval mode for a session
   * - 'manual': Requires user approval for each tool call
   * - 'auto': Automatically approves all tool calls
   */
  server.patch<{ Params: { id: string } }>('/sessions/:id/mode', async (request, reply) => {
    const { id } = request.params;

    const body = updateModeSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    const { approvalMode: newMode } = body.data;

    // Check if session exists in DB
    const session = db.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .get();

    if (!session) {
      return reply.status(404).send({
        error: 'Session not found',
      });
    }

    // Update the database
    db.db.update(sessions)
      .set({ approvalMode: newMode as ApprovalMode, updatedAt: new Date() })
      .where(eq(sessions.id, id))
      .run();

    // If session is active, update the approval service mode
    const activeSession = activeSessions.get(id);
    if (activeSession?.approvalService) {
      activeSession.approvalService.setMode(newMode);
      server.log.info({ sessionId: id, newMode }, 'Updated approval mode for active session');
    }

    return reply.send({
      status: 'updated',
      sessionId: id,
      approvalMode: newMode,
    });
  });

  /**
   * GET /api/sessions/:id/approvals
   * Get pending approval requests for a session
   */
  server.get<{ Params: { id: string } }>('/sessions/:id/approvals', async (request, reply) => {
    const { id } = request.params;

    const activeSession = activeSessions.get(id);
    if (!activeSession) {
      return reply.status(404).send({
        error: 'No active session found',
      });
    }

    const approvalService = activeSession.approvalService;
    if (!approvalService) {
      return reply.send({
        approvals: [],
        message: 'Approval mode not enabled for this session',
      });
    }

    return reply.send({
      approvals: approvalService.getPendingApprovals(),
    });
  });

  /**
   * POST /api/sessions/:id/approvals/respond
   * Respond to an approval request
   */
  server.post<{ Params: { id: string } }>('/sessions/:id/approvals/respond', async (request, reply) => {
    const { id } = request.params;

    const body = approvalResponseSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    const { requestId, status, reason } = body.data;

    const activeSession = activeSessions.get(id);
    if (!activeSession) {
      return reply.status(404).send({
        error: 'No active session found',
      });
    }

    const approvalService = activeSession.approvalService;
    if (!approvalService) {
      return reply.status(400).send({
        error: 'Approval mode not enabled for this session',
      });
    }

    const handled = approvalService.handleResponse({
      requestId,
      status: status as ApprovalStatus,
      reason,
    });

    if (!handled) {
      return reply.status(404).send({
        error: 'Approval request not found or already handled',
      });
    }

    return reply.send({
      status: 'responded',
      requestId,
      response: status,
    });
  });

  /**
   * WebSocket: GET /api/sessions/:id/approvals/stream
   * Stream approval requests for a session in real-time
   */
  server.get<{ Params: { id: string } }>(
    '/sessions/:id/approvals/stream',
    { websocket: true } as any,
    async (connection: SocketStream, request: any) => {
      const { id } = request.params;
      const socket = connection.socket;

      const activeSession = activeSessions.get(id);

      if (!activeSession) {
        socket.send(JSON.stringify({ error: 'No active session found' }));
        socket.close();
        return;
      }

      const approvalService = activeSession.approvalService;
      if (!approvalService) {
        socket.send(JSON.stringify({ error: 'Approval mode not enabled for this session' }));
        socket.close();
        return;
      }

      // Send any pending approvals first
      const pending = approvalService.getPendingApprovals();
      for (const approval of pending) {
        socket.send(JSON.stringify({
          type: 'approvalRequest',
          data: approval,
        }));
      }

      // Subscribe to new approval requests
      const handleApprovalRequest = (req: ApprovalRequest) => {
        try {
          socket.send(JSON.stringify({
            type: 'approvalRequest',
            data: req,
          }));
        } catch {
          // Socket closed
        }
      };

      const handleApprovalResponse = (resp: ApprovalResponse) => {
        try {
          socket.send(JSON.stringify({
            type: 'approvalResponse',
            data: resp,
          }));
        } catch {
          // Socket closed
        }
      };

      approvalService.on('approvalRequest', handleApprovalRequest);
      approvalService.on('approvalResponse', handleApprovalResponse);

      // Handle incoming messages (approval responses from client)
      socket.on('message', (data: Buffer | string) => {
        try {
          const message = JSON.parse(typeof data === 'string' ? data : data.toString());
          if (message.type === 'approvalResponse') {
            const { requestId, status, reason } = message.data;
            approvalService.handleResponse({
              requestId,
              status,
              reason,
            });
          }
        } catch {
          // Invalid message format, ignore
        }
      });

      // Handle socket close
      socket.on('close', () => {
        approvalService.off('approvalRequest', handleApprovalRequest);
        approvalService.off('approvalResponse', handleApprovalResponse);
      });

      socket.on('error', () => {
        approvalService.off('approvalRequest', handleApprovalRequest);
        approvalService.off('approvalResponse', handleApprovalResponse);
      });

      // Handle session exit
      activeSession.events.on('exit', () => {
        socket.send(JSON.stringify({ type: 'sessionEnded' }));
        socket.close();
      });
    }
  );
};
