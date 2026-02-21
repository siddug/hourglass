import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { loadConfig, saveConfig } from '../../utils/config.js';
import { SkillsService } from '../../services/skills-service.js';

/**
 * Get the default skills directory path
 */
function getDefaultSkillsDirectory(): string {
  return join(homedir(), '.hourglass', 'skills');
}

/**
 * Request body schemas
 */
const updateSkillsConfigSchema = z.object({
  globalDirectory: z.string().min(1).nullable(),
});

/**
 * Skills settings routes
 */
export const skillsRoutes: FastifyPluginAsync = async (server) => {
  /**
   * GET /api/settings/skills
   * Get current skills configuration
   */
  server.get('/settings/skills', async (_request, reply) => {
    const config = loadConfig();

    return reply.send({
      globalDirectory: config.skills?.globalDirectory || null,
      defaultDirectory: getDefaultSkillsDirectory(),
    });
  });

  /**
   * PUT /api/settings/skills
   * Update skills configuration
   */
  server.put('/settings/skills', async (request, reply) => {
    const body = updateSkillsConfigSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    const { globalDirectory } = body.data;
    const config = loadConfig();

    // Update skills config
    config.skills = {
      globalDirectory: globalDirectory || undefined,
    };

    saveConfig(config);

    server.log.info({ globalDirectory }, 'Updated skills configuration');

    return reply.send({
      status: 'updated',
      globalDirectory,
    });
  });

  /**
   * GET /api/settings/skills/status
   * Check skills directory status and list contents
   */
  server.get('/settings/skills/status', async (_request, reply) => {
    const config = loadConfig();
    const dir = config.skills?.globalDirectory;

    if (!dir) {
      return reply.send({
        configured: false,
        defaultDirectory: getDefaultSkillsDirectory(),
      });
    }

    const skillsService = new SkillsService(dir);
    const validation = await skillsService.validate();

    if (!validation.valid) {
      return reply.send({
        configured: true,
        globalDirectory: dir,
        resolvedDirectory: skillsService.getGlobalDirectory(),
        valid: false,
        error: validation.error,
      });
    }

    const skills = await skillsService.listSkills();

    return reply.send({
      configured: true,
      globalDirectory: dir,
      resolvedDirectory: skillsService.getGlobalDirectory(),
      valid: true,
      skills,
    });
  });
};
