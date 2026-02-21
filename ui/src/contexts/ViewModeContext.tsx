'use client';

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

export type ViewMode = 'kanban' | 'sessions' | 'files';

interface ViewModeContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

interface ViewModeProviderProps {
  children: ReactNode;
}

const STORAGE_KEY = 'hourglass-view-mode';

export function ViewModeProvider({ children }: ViewModeProviderProps) {
  const [viewMode, setViewModeState] = useState<ViewMode>('kanban');
  const [isHydrated, setIsHydrated] = useState(false);

  // Load saved view mode from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ViewMode | null;
    if (saved && ['kanban', 'sessions', 'files'].includes(saved)) {
      setViewModeState(saved);
    }
    setIsHydrated(true);
  }, []);

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  };

  // Avoid hydration mismatch by not rendering until hydrated
  if (!isHydrated) {
    return null;
  }

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode(): ViewModeContextType {
  const context = useContext(ViewModeContext);
  if (context === undefined) {
    throw new Error('useViewMode must be used within a ViewModeProvider');
  }
  return context;
}
