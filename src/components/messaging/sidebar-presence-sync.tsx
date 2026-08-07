'use client';
import { useEffect } from 'react';
import { getPusherClient } from '@/lib/pusher/client';

interface PresenceEvent {
  userId: string;
  status: string;
  statusMessage?: string | null;
}

/**
 * SidebarPresenceSync — subscribes to the org-level Pusher channel
 * and dispatches a CustomEvent so the sidebar can update online dots
 * without a page reload.
 */
export function SidebarPresenceSync({ orgId }: { orgId: string }) {
  useEffect(() => {
    const pusher = getPusherClient();
    const ch = pusher.subscribe(`org-${orgId}`);

    ch.bind('user.presence', (data: PresenceEvent) => {
      window.dispatchEvent(new CustomEvent('vibe:presence', { detail: data }));
    });

    return () => {
      ch.unbind_all();
      pusher.unsubscribe(`org-${orgId}`);
    };
  }, [orgId]);

  return null;
}
