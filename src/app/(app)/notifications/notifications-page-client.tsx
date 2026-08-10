'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, MessageSquare, AtSign } from 'lucide-react';
import type { Notification } from '@/lib/db/schema/messaging';

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  mention: AtSign,
  reply: MessageSquare,
  channel_invite: Bell,
};

function timeAgo(date: Date | null): string {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/messaging/notifications')
      .then((r) => r.json())
      .then((data) => { setNotifications(data); setLoading(false); });
  }, []);

  async function markAllRead() {
    await fetch('/api/messaging/notifications', { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }

  function handleNavigate(n: Notification) {
    if (!n.isRead) {
      fetch('/api/messaging/notifications', { method: 'PATCH' });
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, isRead: true } : x));
    }
    if (n.channelId) router.push(`/channels/${n.channelId}`);
  }

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-[var(--text-muted)]" />
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Notifications</h1>
          {unread > 0 && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-white min-w-[18px] text-center">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 text-xs text-[var(--accent)] hover:underline"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        )}
      </div>

      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-[var(--text-muted)] text-sm">Loading…</div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--text-muted)]">
            <Bell className="h-8 w-8 opacity-30" />
            <p className="text-sm">You&apos;re all caught up!</p>
          </div>
        ) : (
          notifications.map((n) => {
            const Icon = TYPE_ICONS[n.type] ?? Bell;
            return (
              <button
                key={n.id}
                onClick={() => handleNavigate(n)}
                className={`w-full flex items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--panel-hover)] border-b border-[var(--border)] last:border-b-0 ${
                  !n.isRead ? 'bg-[var(--accent-subtle)]' : ''
                }`}
              >
                <div className={`mt-0.5 shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                  !n.isRead ? 'bg-[var(--accent)] text-white' : 'bg-[var(--panel-hover)] text-[var(--text-muted)]'
                }`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--text-primary)] font-medium capitalize">
                    {n.type.replace(/_/g, ' ')}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">{timeAgo(n.createdAt)}</div>
                </div>
                {!n.isRead && (
                  <span className="mt-2 h-2 w-2 rounded-full bg-[var(--accent)] shrink-0" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
