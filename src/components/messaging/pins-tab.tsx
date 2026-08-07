'use client';
import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatTime } from '@/lib/utils';
import type { PinnedMessage } from '@/app/api/messaging/channels/[channelId]/pins/route';

interface Props {
  channelId: string;
  currentUserId: string;
}

export function PinsTab({ channelId, currentUserId }: Props) {
  const [pins, setPins] = useState<PinnedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [unpinning, setUnpinning] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetch(`/api/messaging/channels/${channelId}/pins`)
      .then((r) => r.json())
      .then((data: PinnedMessage[]) => setPins(data))
      .catch(() => setPins([]))
      .finally(() => setLoading(false));
  }, [channelId]);

  async function handleUnpin(messageId: string) {
    // Optimistic remove
    setPins((prev) => prev.filter((p) => p.id !== messageId));
    setUnpinning((prev) => new Set(prev).add(messageId));

    try {
      await fetch(`/api/messaging/channels/${channelId}/messages/${messageId}/pin`, {
        method: 'DELETE',
      });
    } catch {
      // If it fails, re-fetch to restore state
      fetch(`/api/messaging/channels/${channelId}/pins`)
        .then((r) => r.json())
        .then((data: PinnedMessage[]) => setPins(data))
        .catch(() => {});
    } finally {
      setUnpinning((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 text-sm text-[var(--text-muted)]">
        Loading pins…
      </div>
    );
  }

  if (pins.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 text-[var(--text-muted)] px-6 text-center">
        <span className="text-4xl">📌</span>
        <p className="text-sm font-medium">No pinned messages</p>
        <p className="text-xs">
          Pin important messages by clicking ··· on a message.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {pins.map((pin) => (
        <div
          key={pin.id}
          className="relative rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"
        >
          {/* Unpin button */}
          <button
            onClick={() => handleUnpin(pin.id)}
            disabled={unpinning.has(pin.id)}
            title="Unpin message"
            className="absolute top-3 right-3 text-[var(--text-muted)] hover:text-[var(--negative)] transition-colors disabled:opacity-40"
          >
            ✕
          </button>

          {/* Sender row */}
          <div className="flex items-center gap-2 mb-2 pr-6">
            <Avatar className="h-6 w-6 shrink-0">
              <AvatarImage src={pin.userAvatarUrl ?? ''} />
              <AvatarFallback className="text-xs" style={{ background: '#4f46e5', color: '#fff' }}>
                {pin.userName[0]?.toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-semibold text-[var(--text-primary)]">{pin.userName}</span>
            {pin.createdAt && (
              <span className="text-xs text-[var(--text-muted)]">{formatTime(pin.createdAt)}</span>
            )}
            {pin.pinnedAt && (
              <span className="text-xs text-[var(--text-muted)]">· pinned {formatTime(pin.pinnedAt)}</span>
            )}
          </div>

          {/* Content */}
          {pin.contentHtml ? (
            <div
              className="text-sm text-[var(--text-primary)] prose prose-sm max-w-none [&_p]:my-0.5 [&_a]:text-[var(--accent)] [&_code]:bg-[var(--panel-hover)] [&_code]:px-1 [&_code]:rounded"
              dangerouslySetInnerHTML={{ __html: pin.contentHtml }}
            />
          ) : (
            <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words">{pin.content}</p>
          )}
        </div>
      ))}
    </div>
  );
}
