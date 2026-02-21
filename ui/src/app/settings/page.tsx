'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();

  useEffect(() => {
    // Settings are now accessed via the modal in the global header
    router.replace('/');
  }, [router]);

  return null;
}
