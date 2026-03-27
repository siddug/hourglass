'use client';

import { type ReactNode, useEffect } from 'react';
import { CommandPalette } from './CommandPalette';
import { CommandCenterProvider, useCommandCenter } from '@/contexts/CommandCenterContext';
import { useViewMode } from '@/contexts/ViewModeContext';
import { GlobalHeader } from './GlobalHeader';
import { Sidebar } from './Sidebar';
import { KanbanView } from './KanbanView';
import { SessionsListView } from './SessionsListView';
import { FilesView } from './FilesView';
import { SettingsContent } from './SettingsContent';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children: _children }: AppShellProps) {
  void _children;
  return (
    <CommandCenterProvider>
      <AppShellContent />
    </CommandCenterProvider>
  );
}

function AppShellContent() {
  const { viewMode } = useViewMode();
  const {
    paletteOpen,
    openPalette,
    closePalette,
    requestNewSession,
    requestCloseModalSession,
    isModalSessionOpen,
  } = useCommandCenter();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) {
        return;
      }

      const key = event.key.toLowerCase();
      const isPrimaryShortcut = event.metaKey || event.ctrlKey;

      if (isPrimaryShortcut && key === 'k') {
        event.preventDefault();
        openPalette();
        return;
      }

      if (isPrimaryShortcut && key === 'n') {
        event.preventDefault();
        requestNewSession();
        return;
      }

      if (event.key === 'Escape') {
        if (paletteOpen) {
          event.preventDefault();
          closePalette();
          return;
        }

        if (isModalSessionOpen) {
          event.preventDefault();
          requestCloseModalSession();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    closePalette,
    isModalSessionOpen,
    openPalette,
    paletteOpen,
    requestCloseModalSession,
    requestNewSession,
  ]);

  const renderView = () => {
    switch (viewMode) {
      case 'kanban':
        return <KanbanView />;
      case 'sessions':
        return <SessionsListView />;
      case 'files':
        return <FilesView />;
      case 'settings':
        return (
          <div className="p-6">
            <SettingsContent />
          </div>
        );
      default:
        return <KanbanView />;
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-hg-bg">
      <GlobalHeader />
      <Sidebar />
      <main className="ml-64 mt-14 h-[calc(100vh-3.5rem)] overflow-auto bg-hg-surface-dim">
        {renderView()}
      </main>
      {paletteOpen ? <CommandPalette /> : null}
    </div>
  );
}
