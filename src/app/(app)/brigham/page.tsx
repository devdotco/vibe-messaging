'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { MessageList } from '@/components/messaging/message-list';
import { RichComposer } from '@/components/messaging/rich-composer';
import { getPusherClient } from '@/lib/pusher/client';
import { userChannel } from '@/lib/pusher/channels';
import { apiFetch } from '@/lib/base-path';
import { BRIGHAM_EVENT, BRIGHAM_USER_ID, type BrighamRow } from '@/lib/brigham/thread';
import type { MessageWithReactions } from '@/components/messaging/message-item';
import type { User } from '@/lib/db/schema/messaging';

/**
 * The person's private thread with Brigham. Questions go to Brigham as them
 * (same agent, tools and history as app.erp.io/brigham); answers, late answers
 * and updates arrive on their own user channel.
 */

const BRIGHAM: User = {
  id: BRIGHAM_USER_ID, orgId: '', email: 'b@brigham.ai', name: 'Brigham', avatarUrl: null,
  role: 'TEAM_MEMBER', status: 'active', isPlatformUser: true, personalEmail: null, createdAt: null,
};

function toMessage(r: BrighamRow): MessageWithReactions {
  const fromBrigham = r.role !== 'user';
  const link = fromBrigham && r.url ? `\n\n[${r.status === 'working' ? 'Watch it in Brigham' : 'Open in Brigham'}](${r.url})` : '';
  return {
    id: r.id, channelId: '', orgId: r.orgId,
    userId: fromBrigham ? BRIGHAM_USER_ID : r.userId,
    content: (r.role === 'update' ? '🔔 ' : '') + r.content + link,
    isAiResponse: fromBrigham,
    createdAt: r.createdAt ? new Date(r.createdAt) : null,
    metadata: null, reactions: [],
  } as unknown as MessageWithReactions;
}

export default function BrighamPage() {
  const [rows, setRows] = useState<BrighamRow[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiFetch('/api/messaging/brigham').then((r) => r.json()).then((data: BrighamRow[]) => {
      if (Array.isArray(data)) setRows(data);
    });
  }, []);

  useEffect(() => {
    apiFetch('/api/messaging/users/me').then((r) => r.json()).then((u: User) => setMe(u));
    load();
  }, [load]);

  useEffect(() => {
    if (!me) return;
    const pusher = getPusherClient();
    const ch = userChannel(me.orgId, me.id);
    const sub = pusher.subscribe(ch);
    sub.bind(BRIGHAM_EVENT, (p: { message?: BrighamRow; refetch?: boolean }) => {
      if (p.message) {
        const m = p.message;
        setRows((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      } else load();
    });
    // Our own user channel is also used by other events; unbind only ours.
    return () => { sub.unbind(BRIGHAM_EVENT); };
  }, [me, load]);

  async function handleSend(content: string) {
    setError('');
    const res = await apiFetch('/api/messaging/brigham', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.trim() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Could not send that to Brigham.');
      return;
    }
    const row = (await res.json()) as BrighamRow;
    setRows((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev, row]));
  }

  const thinking = rows.length > 0 && rows[rows.length - 1].role === 'user';
  const users = me ? { [me.id]: me, [BRIGHAM_USER_ID]: BRIGHAM } : { [BRIGHAM_USER_ID]: BRIGHAM };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="flex items-center px-5" style={{ height: 56, background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: '#111827' }}>B</div>
          <div>
            <div className="font-bold text-[18px] text-[var(--text-primary)] leading-none">Brigham</div>
            <div className="text-xs text-[var(--text-muted)]">Private to you. Brigham answers with your own access.</div>
          </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-6 text-center text-sm text-[var(--text-muted)]">
          Ask Brigham anything you would ask at app.erp.io/brigham: your pipeline, your inbox, your calendar, estate health.
        </div>
      ) : (
        <MessageList messages={rows.map(toMessage)} users={users} currentUserId={me?.id ?? ''} onReact={async () => {}} onReply={() => {}} />
      )}
      {(thinking || error) && (
        <div className="px-5 py-1 text-xs" style={{ color: error ? 'var(--danger, #b91c1c)' : 'var(--text-muted)' }}>
          {error || 'Brigham is working on it…'}
        </div>
      )}
      <RichComposer onSend={handleSend} placeholder="Message Brigham" orgUsers={[]} />
    </div>
  );
}
