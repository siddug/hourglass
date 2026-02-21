'use client';

import { useState, useEffect, useRef } from 'react';
import { useServer } from '@/contexts/ServerContext';
import { AddServerModal } from './AddServerModal';
import { fetchFromServer, type HealthResponse } from '@/lib/api';

export function ServerSwitcher() {
  const { servers, activeServer, switchServer } = useServer();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [serverStatuses, setServerStatuses] = useState<Record<string, boolean>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check server health on mount and periodically
  useEffect(() => {
    const checkHealth = async () => {
      const statuses: Record<string, boolean> = {};
      await Promise.all(
        servers.map(async (server) => {
          try {
            await fetchFromServer<HealthResponse>(server.url, server.authKey, '/api/health');
            statuses[server.id] = true;
          } catch {
            statuses[server.id] = false;
          }
        })
      );
      setServerStatuses(statuses);
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [servers]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (servers.length === 0) {
    return (
      <>
        <button
          onClick={() => setAddModalOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[var(--input-border)] hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm cursor-pointer text-gray-500"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Server
        </button>
        <AddServerModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--input-border)] hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm cursor-pointer"
        >
          {/* Status dot */}
          <span
            className={`flex-shrink-0 w-2 h-2 rounded-full ${
              activeServer && serverStatuses[activeServer.id] ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          {/* Server name */}
          <span className="flex-1 truncate text-left font-medium">
            {activeServer?.name || 'No Server'}
          </span>
          {/* Chevron */}
          <svg
            className={`w-4 h-4 flex-shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {dropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-lg z-50 overflow-hidden">
            {servers.map((server) => (
              <button
                key={server.id}
                onClick={() => {
                  switchServer(server.id);
                  setDropdownOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer ${
                  activeServer?.id === server.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span
                  className={`flex-shrink-0 w-2 h-2 rounded-full ${
                    serverStatuses[server.id] ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <span className="flex-1 truncate">{server.name}</span>
                {activeServer?.id === server.id && (
                  <svg className="w-4 h-4 flex-shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}

            <div className="border-t border-[var(--card-border)]">
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  setAddModalOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer text-gray-600 dark:text-gray-400"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Server
              </button>
            </div>
          </div>
        )}
      </div>

      <AddServerModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />
    </>
  );
}
