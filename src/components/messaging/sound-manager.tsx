'use client';
import { useEffect, useState } from 'react';
import { getPusherClient } from '@/lib/pusher/client';
import { playMessageSound, playMentionSound } from '@/lib/sounds';
import type { MessageWithReactions } from './message-item';

interface Props {
  channelId: string;
  currentUserId: string;
  orgId: string;
  currentUserName?: string;
}

export function SoundManager({ channelId, currentUserId, orgId, currentUserName }: Props) {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('vibe:sounds') !== 'false';
  });

  useEffect(() => {
    const pusher = getPusherClient();
    const channelName = `org-${orgId}-channel-${channelId}`;
    const sub = pusher.subscribe(channelName);

    sub.bind('message.new', ({ message }: { message: MessageWithReactions }) => {
      // Re-read from localStorage so the closure always sees the latest value
      const enabled = localStorage.getItem('vibe:sounds') !== 'false';
      if (!enabled) return;
      if (message.userId === currentUserId) return;

      // Check for mention: either in mentions array or @name in content
      const mentionedByArray = Array.isArray(message.mentions) && message.mentions.includes(currentUserId);
      const mentionedByName = currentUserName
        ? message.content.toLowerCase().includes(`@${currentUserName.toLowerCase()}`)
        : false;

      if (mentionedByArray || mentionedByName) {
        playMentionSound();
      } else {
        playMessageSound();
      }
    });

    return () => {
      sub.unbind_all();
      pusher.unsubscribe(channelName);
    };
  }, [channelId, currentUserId, orgId, currentUserName]);

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('vibe:sounds', next ? 'true' : 'false');
  }

  return (
    <button
      onClick={toggleSound}
      title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-hover)] transition-colors text-base leading-none"
    >
      {soundEnabled ? '🔔' : '🔕'}
    </button>
  );
}
