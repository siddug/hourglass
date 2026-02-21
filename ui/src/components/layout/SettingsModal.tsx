'use client';

import { Dialog } from '@/components/ui';
import { SettingsContent } from './SettingsContent';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Settings" className="max-w-5xl w-full max-h-[90vh]">
      <SettingsContent />
    </Dialog>
  );
}
