'use client';

import { type ReactNode } from 'react';
import { useViewMode } from '@/contexts/ViewModeContext';
import { GlobalHeader } from './GlobalHeader';
import { KanbanView } from './KanbanView';
import { SessionsListView } from './SessionsListView';
import { FilesView } from './FilesView';

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
      default:
        return <KanbanView />;
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <GlobalHeader />
      <main className="flex-1 overflow-hidden">
        {renderView()}
      </main>
    </div>
  );
}
