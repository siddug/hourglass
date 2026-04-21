'use client';

import { useMemo, useState } from 'react';
import { Dialog, Dropdown } from '@/components/ui';
import { FileExplorer } from '@/components/chat/FileExplorer';

interface WorkDirSelectorProps {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  variant?: 'input' | 'dropdown';
}

const BROWSE_OPTION_VALUE = '__select-directory__';

function FolderIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

function BrowseIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2zm3-6 3 3 5-5" />
    </svg>
  );
}

export function WorkDirSelector({
  value,
  onChange,
  options,
  variant = 'input',
}: WorkDirSelectorProps) {
  const [showExplorer, setShowExplorer] = useState(false);
  const showDropdown = variant === 'dropdown';

  const dropdownOptions = useMemo(() => {
    if (!showDropdown) return [];

    const uniqueOptions = Array.from(new Set((options || []).filter(Boolean)));
    if (value && !uniqueOptions.includes(value)) {
      uniqueOptions.unshift(value);
    }

    return [
      ...uniqueOptions.map((path) => ({
        value: path,
        label: path,
        icon: <FolderIcon />,
      })),
      {
        value: BROWSE_OPTION_VALUE,
        label: 'Select Directory...',
        icon: <BrowseIcon />,
      },
    ];
  }, [options, showDropdown, value]);

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          {showDropdown ? (
            <Dropdown
              value={value}
              onChange={(nextValue) => {
                if (nextValue === BROWSE_OPTION_VALUE) {
                  setShowExplorer(true);
                  return;
                }
                onChange(nextValue);
              }}
              options={dropdownOptions}
              placeholder="Select working directory..."
              className="w-full"
            />
          ) : (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <FolderIcon />
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
          )}
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
