/**
 * Session name generator using LLM APIs
 * Generates concise session names from prompts
 * Supports multiple providers: Anthropic (Claude) and Mistral
 */

export type SessionNameProvider = 'anthropic' | 'mistral';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface MistralChoice {
  message: {
    content: string;
  };
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

const SYSTEM_PROMPT = `Generate a concise session title (3-6 words max) from the user prompt. Remove quotes and special characters. Only output the title.`;

/**
 * Generate a session name using Mistral API
 */
async function generateWithMistral(prompt: string, apiKey: string): Promise<string | null> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];

  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages,
        max_tokens: 50,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error(`Mistral API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json() as MistralResponse;
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error('Failed to generate session name with Mistral:', error);
    return null;
  }
}

/**
 * Generate a session name using Anthropic API
 */
async function generateWithAnthropic(prompt: string, apiKey: string): Promise<string | null> {
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
        max_tokens: 50,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`Anthropic API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json() as AnthropicResponse;
    const textBlock = data.content?.find(block => block.type === 'text');
    return textBlock?.text?.trim() || null;
  } catch (error) {
    console.error('Failed to generate session name with Anthropic:', error);
    return null;
  }
}

/**
 * Clean up the generated name - remove quotes and limit length
 */
function cleanSessionName(name: string): string {
  return name
    .replace(/^["']|["']$/g, '')
    .slice(0, 100);
}

/**
 * Generate a session name from a prompt using specified provider
 * @param prompt The user's prompt to generate a name from
 * @param apiKey The API key for the provider
 * @param provider The provider to use ('anthropic' or 'mistral')
 * @returns A concise session name or null if generation fails
 */
export async function generateSessionName(
  prompt: string,
  apiKey: string,
  provider: SessionNameProvider = 'mistral'
): Promise<string | null> {
  let generatedName: string | null = null;

  if (provider === 'anthropic') {
    generatedName = await generateWithAnthropic(prompt, apiKey);
  } else {
    generatedName = await generateWithMistral(prompt, apiKey);
  }

  if (!generatedName) {
    return null;
  }

  return cleanSessionName(generatedName);
}

/**
 * Try to generate a session name using available API keys
 * Tries Anthropic first, then falls back to Mistral
 * Retries each provider 3 times before giving up
 * @param prompt The user's prompt to generate a name from
 * @param apiKeys Object containing available API keys
 * @param maxRetries Maximum number of retries per provider (default: 3)
 * @returns A concise session name or null if generation fails
 */
export async function generateSessionNameWithFallback(
  prompt: string,
  apiKeys: { anthropic?: string; mistral?: string },
  maxRetries: number = 3
): Promise<string | null> {
  // Try Anthropic first (since Claude Code connector uses it)
  if (apiKeys.anthropic) {
    let attempt = 0;
    let lastError: unknown = null;
    
    while (attempt < maxRetries) {
      attempt++;
      try {
        const name = await generateSessionName(prompt, apiKeys.anthropic, 'anthropic');
        if (name) {
          return name;
        }
      } catch (error) {
        lastError = error;
        console.log(`Anthropic session name generation attempt ${attempt} failed, retrying...`);
        // Add a small delay between retries
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    if (lastError) {
      console.error(`Anthropic session name generation failed after ${maxRetries} attempts:`, lastError);
    }
  }

  // Fall back to Mistral
  if (apiKeys.mistral) {
    let attempt = 0;
    let lastError: unknown = null;
    
    while (attempt < maxRetries) {
      attempt++;
      try {
        const name = await generateSessionName(prompt, apiKeys.mistral, 'mistral');
        if (name) {
          return name;
        }
      } catch (error) {
        lastError = error;
        console.log(`Mistral session name generation attempt ${attempt} failed, retrying...`);
        // Add a small delay between retries
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    if (lastError) {
      console.error(`Mistral session name generation failed after ${maxRetries} attempts:`, lastError);
    }
  }

  return null;
}
