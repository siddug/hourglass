/**
 * Project icon generator using LLM APIs
 * Generates a single emoji icon that represents a project based on its name/slug
 * Follows the same provider pattern as session-name-generator.ts
 */

const SYSTEM_PROMPT = `You are an emoji selector. Given a project name, respond with exactly ONE emoji that best represents the project's domain or purpose. Only output the single emoji character, nothing else. Examples:
- "marketing-q1" → 📣
- "backend-api" → ⚙️
- "mobile-app" → 📱
- "data-pipeline" → 🔄
- "design-system" → 🎨
- "security-audit" → 🔒
- "ml-training" → 🧠
- "docs-site" → 📚`;

interface MistralChoice {
  message: { content: string };
}

interface MistralResponse {
  choices: MistralChoice[];
}

interface AnthropicContentBlock {
  type: 'text';
  text: string;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
}

async function generateIconWithMistral(projectName: string, apiKey: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: projectName },
        ],
        max_tokens: 10,
        temperature: 0.3,
      }),
    });

    if (!response.ok) return null;
    const data = await response.json() as MistralResponse;
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

async function generateIconWithAnthropic(projectName: string, apiKey: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 10,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: projectName }],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json() as AnthropicResponse;
    const textBlock = data.content?.find(block => block.type === 'text');
    return textBlock?.text?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Clean the generated icon - ensure it's a single emoji
 */
function cleanIcon(raw: string): string | null {
  // Extract first emoji from the response
  const emojiMatch = raw.match(/\p{Emoji_Presentation}|\p{Emoji}\uFE0F/u);
  return emojiMatch ? emojiMatch[0] : null;
}

/**
 * Generate a project icon emoji using available LLM APIs
 * Tries Mistral first, falls back to Anthropic
 */
export async function generateProjectIcon(
  projectName: string,
  apiKeys: { anthropic?: string; mistral?: string },
): Promise<string | null> {
  // Try Mistral first
  if (apiKeys.mistral) {
    const raw = await generateIconWithMistral(projectName, apiKeys.mistral);
    if (raw) {
      const icon = cleanIcon(raw);
      if (icon) return icon;
    }
  }

  // Fall back to Anthropic
  if (apiKeys.anthropic) {
    const raw = await generateIconWithAnthropic(projectName, apiKeys.anthropic);
    if (raw) {
      const icon = cleanIcon(raw);
      if (icon) return icon;
    }
  }

  return null;
}
