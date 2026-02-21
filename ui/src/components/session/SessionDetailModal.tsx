'use client';

import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui';
import { SessionDetailView } from './SessionDetailView';

interface SessionDetailModalProps {
  sessionId: string;
  open: boolean;
  onClose: () => void;
}

export function SessionDetailModal({ sessionId, open, onClose }: SessionDetailModalProps) {
  const router = useRouter();

  return (
    <Dialog open={open} onClose={onClose} className="max-w-[95vw] w-full" fullHeight>
      <SessionDetailView
        sessionId={sessionId}
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
