'use client';

import { FileExplorer } from '@/components/chat/FileExplorer';

export function FilesView() {
  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[var(--bg)] h-full">
      <FileExplorer initialPath="~" mode="browse" />
    </div>
  );
}
