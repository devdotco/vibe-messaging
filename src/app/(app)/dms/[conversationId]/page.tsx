'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MessageList } from '@/components/messaging/message-list';
import { RichComposer } from '@/components/messaging/rich-composer';
import { getPusherClient } from '@/lib/pusher/client';
import { playMessageSound } from '@/lib/sounds';
import type { MessageWithReactions } from '@/components/messaging/message-item';
import type { User } from '@/lib/db/schema/messaging';

export default function DmPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [messages, setMessages] = useState<MessageWithReactions[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [orgId, setOrgId] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [otherUser, setOtherUser] = useState<User | null>(null);

  useEffect(() => {
    fetch('/api/messaging/users/me').then((r) => r.json()).then((me: User) => {
      setOrgId(me.orgId);
      setCurrentUserId(me.id);
    });

    fetch(`/api/messaging/dms/${conversationId}/messages`)
      .then((r) => r.json())
      .then((data: MessageWithReactions[]) => setMessages(data.map((m) => ({ ...m, reactions: m.reactions ?? [] }))));

    fetch('/api/messaging/users')
      .then((r) => r.json())
      .then((data: { user: User }[]) => {
        const map = Object.fromEntries(data.map(({ user }) => [user.id, user]));
        setUsers(map);
      });
  }, [conversationId]);

  // Set other user once we have users and currentUserId
  useEffect(() => {
    if (!currentUserId || Object.keys(users).length === 0) return;
    const other = Object.values(users).find((u) => u.id !== currentUserId);
    if (other) setOtherUser(other);
  }, [users, currentUserId]);

  useEffect(() => {
    if (!orgId) return;
    const pusher = getPusherClient();
    const ch = `org-${orgId}-dm-${conversationId}`;
    const sub = pusher.subscribe(ch);
    sub.bind('dm.new', ({ message }: { message: MessageWithReactions }) => {
      setMessages((prev) => [...prev, { ...message, reactions: message.reactions ?? [] }]);

      // Play sound for incoming DMs (not our own)
      if (message.userId !== currentUserId) {
        const soundEnabled = localStorage.getItem('vibe:sounds') !== 'false';
        if (soundEnabled) playMessageSound();
      }
    });
    return () => { sub.unbind_all(); pusher.unsubscribe(ch); };
  }, [conversationId, orgId, currentUserId]);

  async function handleSend(content: string) {
    await fetch(`/api/messaging/dms/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        className="flex items-center px-5"
        style={{ height: 56, background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}
      >
        {otherUser ? (
          <div className="flex items-center gap-2">
            <div
              className="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ background: '#2563eb' }}
            >
              {otherUser.name[0]?.toUpperCase()}
            </div>
            <div>
              <div className="font-bold text-[18px] text-[var(--text-primary)] leading-none">{otherUser.name}</div>
              <div className="text-xs text-[var(--text-muted)]">{otherUser.email}</div>
            </div>
          </div>
        ) : (
          <span className="font-semibold text-sm text-[var(--text-primary)]">Direct Message</span>
        )}
      </div>
      <MessageList
        messages={messages}
        users={users}
        currentUserId={currentUserId}
        onReact={async () => {}}
        onReply={() => {}}
      />
      <RichComposer
        onSend={handleSend}
        placeholder={`Message ${otherUser?.name ?? '…'}`}
        orgUsers={Object.values(users)}
      />
    </div>
  );
}
