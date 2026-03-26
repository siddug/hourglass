'use client';

import { type ReactNode } from 'react';
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

export function AppShell({ children }: AppShellProps) {
  const { viewMode } = useViewMode();

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
    </div>
  );
}
