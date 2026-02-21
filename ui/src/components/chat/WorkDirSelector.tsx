'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui';
import { FileExplorer } from '@/components/chat/FileExplorer';

interface WorkDirSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function WorkDirSelector({ value, onChange }: WorkDirSelectorProps) {
  const [showExplorer, setShowExplorer] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="/path/to/working/directory"
            className="w-full pl-9 pr-10 py-2 text-sm rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => setShowExplorer(true)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Browse filesystem"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
            </svg>
          </button>
        </div>
      </div>

      <Dialog
        open={showExplorer}
        onClose={() => setShowExplorer(false)}
        title="Select Working Directory"
        className="max-w-3xl"
      >
        <FileExplorer
          initialPath={value || '~'}
          mode="select-directory"
          onSelect={(path) => {
            onChange(path);
            setShowExplorer(false);
          }}
          onCancel={() => setShowExplorer(false)}
        />
      </Dialog>
    </>
  );
}
