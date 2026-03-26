'use client';

import { Dialog } from '@/components/ui';
import { SessionCreateForm } from './SessionCreateForm';

interface SessionCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (sessionId?: string) => void;
  onScheduledTaskCreated?: () => void;
  initialWorkDir?: string;
}

export function SessionCreateModal({ open, onClose, onCreated, onScheduledTaskCreated, initialWorkDir }: SessionCreateModalProps) {
  return (
    <Dialog open={open} onClose={onClose} className="max-w-[95vw] w-full" fullHeight>
      <SessionCreateForm
        showCancelButton
        showSaveToTriageButton
        showScheduleButton
        onCancel={onClose}
        initialWorkDir={initialWorkDir}
        onSessionCreated={(sessionId) => {
          onClose();
          onCreated(sessionId);
        }}
        onScheduledTaskCreated={() => {
          onClose();
          onScheduledTaskCreated?.();
        }}
      />
    </Dialog>
  );
}
