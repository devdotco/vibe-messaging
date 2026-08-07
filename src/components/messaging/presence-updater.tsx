'use client';
import { useEffect } from 'react';

async function postPresence(status: 'online' | 'away' | 'offline') {
  try {
    await fetch('/api/messaging/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  } catch {
    // best-effort — ignore errors
  }
}

export function PresenceUpdater() {
  useEffect(() => {
    postPresence('online');

    function handleFocus() { postPresence('online'); }
    function handleBlur() { postPresence('away'); }
    function handleBeforeUnload() { postPresence('offline'); }

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return null;
}
