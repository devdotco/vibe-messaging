'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MessageList } from '@/components/messaging/message-list';
import { MessageComposer } from '@/components/messaging/message-composer';
import { getPusherClient } from '@/lib/pusher/client';
import type { DmMessage, User } from '@/lib/db/schema/messaging';

export default function DmPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [orgId, setOrgId] = useState('');

  useEffect(() => {
    fetch('/api/messaging/users/me').then(r => r.json()).then((me: User) => {
      setOrgId(me.orgId);
    });
    fetch(`/api/messaging/dms/${conversationId}/messages`)
      .then((r) => r.json())
      .then(setMessages);
    fetch('/api/messaging/users')
      .then((r) => r.json())
      .then((data: { user: User }[]) => {
        const map = Object.fromEntries(data.map(({ user }) => [user.id, user]));
        setUsers(map);
      });
  }, [conversationId]);

  useEffect(() => {
    if (!orgId) return;
    const pusher = getPusherClient();
    const ch = `org-${orgId}-dm-${conversationId}`;
    const sub = pusher.subscribe(ch);
    sub.bind('dm.new', ({ message }: { message: DmMessage }) => {
      setMessages((prev) => [...prev, message]);
    });
    return () => { sub.unbind_all(); pusher.unsubscribe(ch); };
  }, [conversationId, orgId]);

  async function handleSend(content: string) {
    await fetch(`/api/messaging/dms/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ height: 56, background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
        <span className="font-semibold text-sm text-[var(--text-primary)]">Direct Message</span>
      </div>
      <MessageList
        messages={messages as unknown as import('@/lib/db/schema/messaging').Message[]}
        users={users}
        onReact={async () => {}}
        onReply={() => {}}
      />
      <MessageComposer onSend={handleSend} placeholder="Message..." orgUsers={Object.values(users)} />
    </div>
  );
}
