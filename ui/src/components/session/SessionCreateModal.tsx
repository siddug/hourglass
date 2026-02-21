'use client';

import { Dialog } from '@/components/ui';
import { SessionCreateForm } from './SessionCreateForm';

interface SessionCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (sessionId?: string) => void;
  onScheduledTaskCreated?: () => void;
}

export function SessionCreateModal({ open, onClose, onCreated, onScheduledTaskCreated }: SessionCreateModalProps) {
  return (
    <Dialog open={open} onClose={onClose} title="New Session" className="max-w-4xl w-full" fullHeight>
      <SessionCreateForm
        showCancelButton
        showSaveToTriageButton
        showScheduleButton
        onCancel={onClose}
        onSessionCreated={(sessionId) => {
          // Close the modal first to ensure immediate UI feedback
          onClose();
          // Then refresh the list/board and pass the sessionId
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
