/**
 * Prompt utilities for agent modes, personalities, and project context
 *
 * Agent modes (like 'plan') are implemented via prompt prepending rather than
 * special flags or permission modes. This ensures consistent behavior across
 * all connectors (Claude, Vibe, etc.)
 */

import type { Personality, Project } from '../db/schema.js';

/**
 * Plan mode instruction that gets prepended to the user's prompt.
 * Encourages the agent to plan thoroughly and confirm before implementing.
 */
const PLAN_MODE_INSTRUCTION = `IMPORTANT: Plan thoroughly and confirm your plan with the user before implementing any changes. Focus on analysis and planning first. Do not make any file modifications until the plan is approved.

---

`;

/**
 * Prepends agent mode instructions to a prompt based on the agent mode.
 *
 * @param prompt - The original user prompt
 * @param agentMode - The agent mode ('default' | 'plan')
 * @returns The prompt with any necessary mode instructions prepended
 */
export function applyAgentModeToPrompt(prompt: string, agentMode?: 'default' | 'plan'): string {
  if (agentMode === 'plan') {
    return PLAN_MODE_INSTRUCTION + prompt;
  }
  return prompt;
}

/**
 * Agent mode instruction definitions.
 * In future, this could support more modes with custom prompts.
 */
export const AGENT_MODE_INSTRUCTIONS: Record<string, string> = {
  plan: PLAN_MODE_INSTRUCTION,
};

/**
 * Build personality instructions to prepend to the prompt
 */
export function buildPersonalityPreamble(personality: Personality): string {
  return `## Your Identity
You are **${personality.name}** (${personality.readableId}).
${personality.instructions}

When writing to project workspace files, always identify yourself as ${personality.readableId}.

---

`;
}

/**
 * Info about agents who have worked on the project
 */
export interface ProjectAgent {
  name: string;
  readableId: string;
  sessionCount: number;
}

/**
 * Build project workspace instructions to prepend to the prompt
 */
export function buildProjectPreamble(
  project: Project,
  agents: ProjectAgent[],
  personalityReadableId?: string,
): string {
  const today = new Date().toISOString().split('T')[0];
  const yourId = personalityReadableId || '@owner';

  let preamble = `## Project: ${project.name}
You are working as part of a team on this project.

### Your Project Workspace
Location: \`${project.workspacePath}\`

`;

  // List agents who have worked on this project
  if (agents.length > 0) {
    preamble += `### Agents who have worked on this project so far\n`;
    for (const agent of agents) {
      preamble += `- ${agent.readableId} (${agent.name}) — ${agent.sessionCount} session${agent.sessionCount !== 1 ? 's' : ''}\n`;
    }
    preamble += '\n';
  }

  preamble += `### Workspace Organization

**Daily Work Log** (\`daily-work/${today}/${yourId}.md\`)
At the end of your work, create or update your daily work log summarizing:
- What you accomplished
- Key decisions made
- Blockers or issues encountered
- Relevant file paths or references

**Team Messages** (\`team-messages/${today}/messages.md\`)
- Check \`read-cursors.json\` for your last read timestamp under your ID (\`${yourId}\`)
- Read message files from that date forward, find messages newer than your timestamp
- After reading, update your entry in \`read-cursors.json\` to the current ISO timestamp
- To leave messages for other agents, append to today's file using timestamps so others can track what's new
- Suggested format: \`### ${yourId} → @target [ISO-timestamp]\` followed by your message
- Use \`@owner\` for the project owner, \`@all\` for everyone

**Project Management** (\`project-management/\`)
- \`pending_todos.md\` — Check for tasks assigned to you. Update status as you work.
- \`completed_todos.md\` — Move completed tasks here when done.

**Artifacts** (\`artifacts/\`)
Save any reusable outputs here (reports, generated content, data files, configs).
Other agents can read from this folder.

### Your Workflow
1. Start by checking \`read-cursors.json\` for your last read timestamp
2. Read \`team-messages/\` for messages since your last read — update your cursor after reading
3. Check \`project-management/pending_todos.md\` for tasks assigned to you
4. Do your work
5. Update your daily work log at \`daily-work/${today}/${yourId}.md\`
6. If you have messages for other agents, append to \`team-messages/${today}/messages.md\`
7. Update \`project-management/pending_todos.md\` and \`completed_todos.md\` as needed

---

`;

  return preamble;
}

/**
 * Apply all prompt preambles (agent mode, personality, project context) to a prompt.
 * Order: personality → project context → agent mode → user prompt
 */
export function applyFullPromptContext(
  prompt: string,
  options: {
    agentMode?: 'default' | 'plan';
    personality?: Personality;
    project?: Project;
    projectAgents?: ProjectAgent[];
  },
): string {
  let preamble = '';

  // Personality first (who you are)
  if (options.personality) {
    preamble += buildPersonalityPreamble(options.personality);
  }

  // Project context (where you're working)
  if (options.project) {
    const personalityReadableId = options.personality?.readableId;
    preamble += buildProjectPreamble(
      options.project,
      options.projectAgents || [],
      personalityReadableId,
    );
  }

  // Agent mode (plan mode)
  if (options.agentMode === 'plan') {
    preamble += PLAN_MODE_INSTRUCTION;
  }

  return preamble + prompt;
}
