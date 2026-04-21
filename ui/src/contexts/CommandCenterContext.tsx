'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  getSessions,
  getSessionWorkDirs,
  interruptSession,
  killSession,
  updateSessionStatus,
  type Session,
  type SessionStatus,
} from '@/lib/api';
import { useServer } from '@/contexts/ServerContext';
import { useViewMode, type ViewMode } from '@/contexts/ViewModeContext';

export type CommandSessionTab = 'agent' | 'files' | 'git' | 'workspace' | 'messages';

export interface OpenSessionTarget {
  sessionId: string;
  tab?: CommandSessionTab;
}

export interface NewSessionOptions {
  initialWorkDir?: string;
}

export interface ShowKanbanOptions {
  workDirFilter?: string;
}

interface SurfaceHandler {
  viewMode: ViewMode;
  openNewSession?: (options?: NewSessionOptions) => void;
  openSession?: (target: OpenSessionTarget) => void;
  showKanban?: (options?: ShowKanbanOptions) => void;
  closeModalSession?: () => void;
  refresh?: () => void | Promise<void>;
}

interface FocusedSessionHandler {
  session: Session;
  activeTab: CommandSessionTab;
  setActiveTab?: (tab: CommandSessionTab) => void;
  openRename?: () => void;
  refresh?: () => void | Promise<void>;
}

type PendingIntent =
  | { type: 'new-session'; targetView: ViewMode; options?: NewSessionOptions }
  | { type: 'open-session'; targetView: ViewMode; target: OpenSessionTarget }
  | { type: 'show-kanban'; targetView: 'kanban'; options?: ShowKanbanOptions }
  | null;

interface CommandCenterContextValue {
  paletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  requestNewSession: (options?: NewSessionOptions) => void;
  requestOpenSession: (target: OpenSessionTarget) => void;
  requestShowKanban: (options?: ShowKanbanOptions) => void;
  requestCloseModalSession: () => void;
  registerSurface: (surface: SurfaceHandler | null) => void;
  registerFocusedSession: (session: FocusedSessionHandler | null) => void;
  focusedSession: FocusedSessionHandler | null;
  commandSessions: Session[];
  commandSessionsLoading: boolean;
  commandWorkDirs: string[];
  commandWorkDirsLoading: boolean;
  refreshCommandSessions: (force?: boolean) => Promise<void>;
  refreshCommandWorkDirs: (force?: boolean) => Promise<void>;
  performSessionStatusChange: (sessionId: string, status: SessionStatus) => Promise<void>;
  performSessionInterrupt: (sessionId: string) => Promise<void>;
  performSessionKill: (sessionId: string) => Promise<void>;
  isModalSessionOpen: boolean;
}

const CommandCenterContext = createContext<CommandCenterContextValue | undefined>(undefined);

const SESSION_CACHE_MS = 15000;

export function CommandCenterProvider({ children }: { children: ReactNode }) {
  const { activeServer } = useServer();
  const { viewMode, setViewMode } = useViewMode();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [surface, setSurface] = useState<SurfaceHandler | null>(null);
  const [focusedSession, setFocusedSession] = useState<FocusedSessionHandler | null>(null);
  const [pendingIntent, setPendingIntent] = useState<PendingIntent>(null);
  const [commandSessions, setCommandSessions] = useState<Session[]>([]);
  const [commandSessionsLoading, setCommandSessionsLoading] = useState(false);
  const [commandWorkDirs, setCommandWorkDirs] = useState<string[]>([]);
  const [commandWorkDirsLoading, setCommandWorkDirsLoading] = useState(false);
  const [lastSessionFetchAt, setLastSessionFetchAt] = useState(0);
  const [lastWorkDirFetchAt, setLastWorkDirFetchAt] = useState(0);

  const activeServerId = activeServer?.id ?? 'default';
  const surfaceRef = useRef<SurfaceHandler | null>(null);
  const focusedSessionRef = useRef<FocusedSessionHandler | null>(null);

  useEffect(() => {
    surfaceRef.current = surface;
  }, [surface]);

  useEffect(() => {
    focusedSessionRef.current = focusedSession;
  }, [focusedSession]);

  useEffect(() => {
    setCommandSessions([]);
    setCommandWorkDirs([]);
    setLastSessionFetchAt(0);
    setLastWorkDirFetchAt(0);
  }, [activeServerId]);

  const refreshCommandSessions = useCallback(async (force = false) => {
    if (!force && commandSessionsLoading) {
      return;
    }

    const isFresh = Date.now() - lastSessionFetchAt < SESSION_CACHE_MS;
    if (!force && isFresh && commandSessions.length > 0) {
      return;
    }

    setCommandSessionsLoading(true);
    try {
      const response = await getSessions({ limit: 200, offset: 0 });
      const sortedSessions = [...response.sessions].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      setCommandSessions(sortedSessions);
      setLastSessionFetchAt(Date.now());
    } catch (error) {
      console.error('Failed to load command palette sessions:', error);
    } finally {
      setCommandSessionsLoading(false);
    }
  }, [commandSessions.length, commandSessionsLoading, lastSessionFetchAt]);

  const refreshCommandWorkDirs = useCallback(async (force = false) => {
    if (!force && commandWorkDirsLoading) {
      return;
    }

    const isFresh = Date.now() - lastWorkDirFetchAt < SESSION_CACHE_MS;
    if (!force && isFresh && commandWorkDirs.length > 0) {
      return;
    }

    setCommandWorkDirsLoading(true);
    try {
      const response = await getSessionWorkDirs();
      setCommandWorkDirs(response.workDirs.filter(Boolean));
      setLastWorkDirFetchAt(Date.now());
    } catch (error) {
      console.error('Failed to load command palette directories:', error);
    } finally {
      setCommandWorkDirsLoading(false);
    }
  }, [commandWorkDirs.length, commandWorkDirsLoading, lastWorkDirFetchAt]);

  const runSurfaceRefresh = useCallback(async (targetSessionId?: string) => {
    const currentSurface = surfaceRef.current;
    const currentFocusedSession = focusedSessionRef.current;

    if (currentSurface?.refresh) {
      await currentSurface.refresh();
    }

    if (targetSessionId && currentFocusedSession?.session.id === targetSessionId && currentFocusedSession.refresh) {
      await currentFocusedSession.refresh();
    }

    await refreshCommandSessions(true);
  }, [refreshCommandSessions]);

  const requestNewSession = useCallback((options?: NewSessionOptions) => {
    const currentSurface = surfaceRef.current;
    if (currentSurface?.openNewSession) {
      currentSurface.openNewSession(options);
      return;
    }

    setPendingIntent({ type: 'new-session', targetView: 'kanban', options });
    setViewMode('kanban');
  }, [setViewMode]);

  const requestOpenSession = useCallback((target: OpenSessionTarget) => {
    const currentSurface = surfaceRef.current;
    if (currentSurface?.openSession) {
      currentSurface.openSession(target);
      return;
    }

    const targetView: ViewMode = viewMode === 'kanban' ? 'kanban' : 'sessions';
    setPendingIntent({ type: 'open-session', targetView, target });
    setViewMode(targetView);
  }, [setViewMode, viewMode]);

  const requestShowKanban = useCallback((options?: ShowKanbanOptions) => {
    const currentSurface = surfaceRef.current;
    if (currentSurface?.viewMode === 'kanban' && currentSurface.showKanban) {
      currentSurface.showKanban(options);
      return;
    }

    setPendingIntent({ type: 'show-kanban', targetView: 'kanban', options });
    setViewMode('kanban');
  }, [setViewMode]);

  const requestCloseModalSession = useCallback(() => {
    surfaceRef.current?.closeModalSession?.();
  }, []);

  const registerSurface = useCallback((nextSurface: SurfaceHandler | null) => {
    setSurface(nextSurface);
  }, []);

  const registerFocusedSession = useCallback((nextSession: FocusedSessionHandler | null) => {
    setFocusedSession(nextSession);
  }, []);

  const openPalette = useCallback(() => {
    setPaletteOpen(true);
    void refreshCommandSessions(true);
    void refreshCommandWorkDirs(true);
  }, [refreshCommandSessions, refreshCommandWorkDirs]);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
  }, []);

  const performSessionStatusChange = useCallback(async (sessionId: string, status: SessionStatus) => {
    await updateSessionStatus(sessionId, { status });
    await runSurfaceRefresh(sessionId);
  }, [runSurfaceRefresh]);

  const performSessionInterrupt = useCallback(async (sessionId: string) => {
    await interruptSession(sessionId);
    await runSurfaceRefresh(sessionId);
  }, [runSurfaceRefresh]);

  const performSessionKill = useCallback(async (sessionId: string) => {
    await killSession(sessionId);
    await runSurfaceRefresh(sessionId);
  }, [runSurfaceRefresh]);

  useEffect(() => {
    if (!pendingIntent || !surface || pendingIntent.targetView !== surface.viewMode) {
      return;
    }

    if (pendingIntent.type === 'new-session' && surface.openNewSession) {
      surface.openNewSession(pendingIntent.options);
      setPendingIntent(null);
    }

    if (pendingIntent.type === 'open-session' && surface.openSession) {
      surface.openSession(pendingIntent.target);
      setPendingIntent(null);
    }

    if (pendingIntent.type === 'show-kanban' && surface.showKanban) {
      surface.showKanban(pendingIntent.options);
      setPendingIntent(null);
    }
  }, [pendingIntent, surface]);

  const value: CommandCenterContextValue = {
    paletteOpen,
    openPalette,
    closePalette,
    requestNewSession,
    requestOpenSession,
    requestShowKanban,
    requestCloseModalSession,
    registerSurface,
    registerFocusedSession,
    focusedSession,
    commandSessions,
    commandSessionsLoading,
    commandWorkDirs,
    commandWorkDirsLoading,
    refreshCommandSessions,
    refreshCommandWorkDirs,
    performSessionStatusChange,
    performSessionInterrupt,
    performSessionKill,
    isModalSessionOpen: Boolean(surface?.closeModalSession),
  };

  return (
    <CommandCenterContext.Provider value={value}>
      {children}
    </CommandCenterContext.Provider>
  );
}

export function useCommandCenter(): CommandCenterContextValue {
  const context = useContext(CommandCenterContext);
  if (!context) {
    throw new Error('useCommandCenter must be used within a CommandCenterProvider');
  }
  return context;
}
