'use client';

import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui';
import { SessionDetailView } from './SessionDetailView';
import type { CommandSessionTab } from '@/contexts/CommandCenterContext';

interface SessionDetailModalProps {
  sessionId: string;
  initialTab?: CommandSessionTab;
  open: boolean;
  onClose: () => void;
}

export function SessionDetailModal({ sessionId, initialTab, open, onClose }: SessionDetailModalProps) {
  const router = useRouter();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="max-w-[95vw] w-full dark:border-hg-primary/40"
      fullHeight
    >
      <SessionDetailView
        sessionId={sessionId}
        initialTab={initialTab}
        compact
        showCloseButton
        onClose={onClose}
        onNavigateHome={() => {
          onClose();
          router.push('/');
        }}
      />
    </Dialog>
  );
}
