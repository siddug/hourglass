'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  type ServerConfig,
  type ParsedConnectionConfig,
  getServers,
  addServer as addServerToStorage,
  removeServer as removeServerFromStorage,
  getActiveServerId,
  setActiveServerId,
  getActiveServer,
} from '@/lib/servers';
import { setActiveServerConfig } from '@/lib/api';

interface ServerContextValue {
  servers: ServerConfig[];
  activeServer: ServerConfig | null;
  addServer: (parsed: ParsedConnectionConfig) => ServerConfig;
  removeServer: (id: string) => void;
  switchServer: (id: string) => void;
  refreshServers: () => void;
}

const ServerContext = createContext<ServerContextValue | null>(null);

export function ServerProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [activeServer, setActiveServer] = useState<ServerConfig | null>(null);

  // Initialize from localStorage
  useEffect(() => {
    const saved = getServers();
    setServers(saved);

    const active = getActiveServer();
    setActiveServer(active);

    // Sync API client with active server
    if (active) {
      setActiveServerConfig(active);
    }
  }, []);

  const refreshServers = useCallback(() => {
    const saved = getServers();
    setServers(saved);
    const active = getActiveServer();
    setActiveServer(active);
    if (active) {
      setActiveServerConfig(active);
    }
  }, []);

  const handleAddServer = useCallback((parsed: ParsedConnectionConfig) => {
    const config = addServerToStorage(parsed);
    const saved = getServers();
    setServers(saved);

    // If this is the first server, make it active
    if (saved.length === 1 || !getActiveServerId()) {
      setActiveServerId(config.id);
      setActiveServer(config);
      setActiveServerConfig(config);
    }

    return config;
  }, []);

  const handleRemoveServer = useCallback((id: string) => {
    removeServerFromStorage(id);
    const saved = getServers();
    setServers(saved);

    // If the removed server was active, switch to first available
    if (activeServer?.id === id) {
      const next = saved[0] || null;
      setActiveServer(next);
      if (next) {
        setActiveServerId(next.id);
        setActiveServerConfig(next);
      } else {
        setActiveServerConfig(null);
      }
      router.push('/');
    }
  }, [activeServer, router]);

  const handleSwitchServer = useCallback((id: string) => {
    const server = getServers().find((s) => s.id === id);
    if (!server) return;

    setActiveServerId(id);
    setActiveServer(server);
    setActiveServerConfig(server);

    // Navigate home to avoid stale session IDs
    router.push('/');
  }, [router]);

  return (
    <ServerContext.Provider
      value={{
        servers,
        activeServer,
        addServer: handleAddServer,
        removeServer: handleRemoveServer,
        switchServer: handleSwitchServer,
        refreshServers,
      }}
    >
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  const context = useContext(ServerContext);
  if (!context) {
    throw new Error('useServer must be used within a ServerProvider');
  }
  return context;
}
