/**
 * Multi-server configuration management
 * Handles server configs stored in localStorage
 */

export interface ServerConfig {
  id: string;
  name: string;
  url: string;
  authKey: string;
  addedAt: number;
}

export interface ParsedConnectionConfig {
  name: string;
  url: string;
  authKey: string;
}

const SERVERS_KEY = 'hourglass-servers';
const ACTIVE_SERVER_KEY = 'vibe-active-server';

/**
 * Parse a vibe:// connection config string from the server
 */
export function parseConfigString(configString: string): ParsedConnectionConfig {
  let base64 = configString;
  if (base64.startsWith('vibe://')) {
    base64 = base64.slice(7);
  }

  try {
    const json = atob(base64);
    const parsed = JSON.parse(json);

    if (!parsed.name || !parsed.url || !parsed.authKey) {
      throw new Error('Invalid config: missing required fields (name, url, authKey)');
    }

    return {
      name: parsed.name,
      url: parsed.url.replace(/\/$/, ''), // Remove trailing slash
      authKey: parsed.authKey,
    };
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error('Invalid config string: could not decode');
    }
    throw e;
  }
}

/**
 * Encode a server config into a vibe:// connection string
 */
export function encodeConfigString(config: ServerConfig): string {
  const data = JSON.stringify({
    name: config.name,
    url: config.url,
    authKey: config.authKey,
  });
  return `vibe://${btoa(data)}`;
}

/**
 * Generate a simple unique ID
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

/**
 * Get all saved servers from localStorage
 */
export function getServers(): ServerConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SERVERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save servers to localStorage
 */
function saveServers(servers: ServerConfig[]): void {
  localStorage.setItem(SERVERS_KEY, JSON.stringify(servers));
}

/**
 * Add a server config
 */
export function addServer(parsed: ParsedConnectionConfig): ServerConfig {
  const servers = getServers();

  // Check for duplicate URL
  const existing = servers.find((s) => s.url === parsed.url);
  if (existing) {
    // Update existing server
    existing.name = parsed.name;
    existing.authKey = parsed.authKey;
    saveServers(servers);
    return existing;
  }

  const config: ServerConfig = {
    id: generateId(),
    name: parsed.name,
    url: parsed.url,
    authKey: parsed.authKey,
    addedAt: Date.now(),
  };

  servers.push(config);
  saveServers(servers);
  return config;
}

/**
 * Remove a server config
 */
export function removeServer(id: string): void {
  const servers = getServers().filter((s) => s.id !== id);
  saveServers(servers);

  // Clear active server if it was removed
  if (getActiveServerId() === id) {
    clearActiveServerId();
  }
}

/**
 * Get the active server ID from localStorage
 */
export function getActiveServerId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_SERVER_KEY);
}

/**
 * Set the active server ID
 */
export function setActiveServerId(id: string): void {
  localStorage.setItem(ACTIVE_SERVER_KEY, id);
}

/**
 * Clear the active server ID
 */
export function clearActiveServerId(): void {
  localStorage.removeItem(ACTIVE_SERVER_KEY);
}

/**
 * Get the active server config
 */
export function getActiveServer(): ServerConfig | null {
  const servers = getServers();
  const activeId = getActiveServerId();
  if (!activeId) return servers[0] || null;
  return servers.find((s) => s.id === activeId) || servers[0] || null;
}
