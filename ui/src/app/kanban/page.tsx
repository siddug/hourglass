'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useViewMode } from '@/contexts/ViewModeContext';

export default function KanbanPage() {
  const router = useRouter();
  const { setViewMode } = useViewMode();

  useEffect(() => {
    // Set view mode to kanban and redirect to main page
    setViewMode('kanban');
    router.replace('/');
  }, [router, setViewMode]);

  return null;
}
