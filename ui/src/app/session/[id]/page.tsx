'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useViewMode } from '@/contexts/ViewModeContext';

export default function SessionDetailPage() {
  const router = useRouter();
  const { setViewMode } = useViewMode();

  useEffect(() => {
    // Sessions are now viewed within the Sessions view
    setViewMode('sessions');
    router.replace('/');
  }, [router, setViewMode]);

  return null;
}
