'use client';

import { useTheme } from '@/contexts/ThemeContext';
import { useViewMode, type ViewMode } from '@/contexts/ViewModeContext';
import { useServer } from '@/contexts/ServerContext';
import { useCommandCenter } from '@/contexts/CommandCenterContext';

const NAV_TABS: { id: ViewMode; label: string }[] = [
  { id: 'kanban', label: 'Kanban' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'files', label: 'Files' },
  { id: 'settings', label: 'Settings' },
];

export function GlobalHeader() {
  const { theme, toggleTheme } = useTheme();
  const { viewMode, setViewMode } = useViewMode();
  const { activeServer } = useServer();
  const { openPalette } = useCommandCenter();

  return (
    <header className="fixed top-0 z-50 w-full h-14 flex items-center justify-between px-6 bg-hg-header-bg border-b border-hg-outline-variant/20">
      {/* Left: Brand + Nav */}
      <div className="flex items-center gap-8">
        <span className="text-lg font-bold tracking-tight text-hg-primary select-none">
          Hourglass
        </span>

        <nav className="hidden md:flex items-center gap-6">
          {NAV_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              className={`relative text-sm font-medium pb-0.5 transition-colors cursor-pointer ${
                viewMode === tab.id
                  ? 'text-hg-primary'
                  : 'text-hg-on-surface-variant hover:text-hg-on-surface'
              }`}
            >
              {tab.label}
              {viewMode === tab.id && (
                <span className="absolute left-0 right-0 -bottom-[13px] h-[2px] bg-hg-primary rounded-full" />
              )}
            </button>
          ))}
        </nav>

        <button
          onClick={openPalette}
          className="hidden lg:flex items-center gap-3 min-w-[280px] rounded-xl border border-hg-outline-variant/25 bg-hg-surface-container-low px-3 py-2 text-left text-sm text-hg-on-surface-variant transition-colors hover:border-hg-primary/30 hover:bg-hg-surface-container cursor-pointer"
          title="Search actions and sessions"
        >
          <svg className="w-4 h-4 shrink-0 text-hg-on-surface-variant/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="flex-1 truncate">Search actions and sessions...</span>
          <span className="inline-flex items-center gap-1 rounded-md border border-hg-outline-variant/30 bg-hg-surface-container px-2 py-0.5 text-[11px] font-medium text-hg-on-surface-variant">
            <span className="hidden xl:inline">Cmd</span>
            <span className="xl:hidden">⌘</span>
            <span>K</span>
          </span>
        </button>
      </div>

      {/* Right: Server badge, theme toggle, avatar */}
      <div className="flex items-center gap-3">
        {/* Server connection badge */}
        {activeServer && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-hg-surface-container text-xs font-mono text-hg-on-surface-variant">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="truncate max-w-[160px]">{activeServer.name}</span>
          </div>
        )}

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-hg-on-surface-variant hover:text-hg-on-surface hover:bg-hg-surface-container transition-colors cursor-pointer"
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          )}
        </button>

        {/* User Avatar */}
        <div className="w-8 h-8 rounded-full bg-hg-primary/20 border border-hg-primary/30 flex items-center justify-center">
          <svg className="w-4 h-4 text-hg-primary" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        </div>
      </div>
    </header>
  );
}
