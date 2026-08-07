'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Hash, Lock, Megaphone, Users } from 'lucide-react';

interface BrowseChannel {
  id: string;
  name: string;
  description: string | null;
  type: string;
  isDefault: boolean | null;
  createdAt: Date | null;
  memberCount: number;
}

interface Props {
  channels: BrowseChannel[];
}

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  public: Hash,
  private: Lock,
  announcement: Megaphone,
};

export function BrowseChannelsClient({ channels }: Props) {
  const router = useRouter();
  const [joining, setJoining] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [channelList, setChannelList] = useState(channels);

  async function handleJoin(channelId: string) {
    setJoining(channelId);
    try {
      const res = await fetch(`/api/messaging/channels/${channelId}/join`, { method: 'POST' });
      if (res.ok) {
        router.push(`/channels/${channelId}`);
      }
    } finally {
      setJoining(null);
    }
  }

  function handleChannelCreated(id: string) {
    router.push(`/channels/${id}`);
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Browse Channels</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Discover and join channels in your workspace</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          Create Channel
        </button>
      </div>

      {channelList.length === 0 ? (
        <div className="py-12 text-center text-[var(--text-muted)] text-sm">
          No additional channels to join. You are already a member of all available channels.
        </div>
      ) : (
        <div className="grid gap-3">
          {channelList.map((ch) => {
            const Icon = CHANNEL_ICONS[ch.type] ?? Hash;
            return (
              <div
                key={ch.id}
                className="flex items-center gap-4 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-4 hover:bg-[var(--panel-hover)] transition-colors"
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--accent-subtle)' }}
                >
                  <Icon className="h-5 w-5 text-[var(--accent)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text-primary)] text-sm">#{ch.name}</span>
                    <span className="text-[10px] text-[var(--text-muted)] capitalize px-1.5 py-0.5 rounded border border-[var(--border)]">
                      {ch.type}
                    </span>
                  </div>
                  {ch.description && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{ch.description}</p>
                  )}
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-[var(--text-muted)]">
                    <Users className="h-3 w-3" />
                    <span>{ch.memberCount} {ch.memberCount === 1 ? 'member' : 'members'}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleJoin(ch.id)}
                  disabled={joining === ch.id}
                  className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {joining === ch.id ? 'Joining...' : 'Join'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateChannelModal
          onClose={() => setShowCreate(false)}
          onCreated={handleChannelCreated}
        />
      )}
    </div>
  );
}

function CreateChannelModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (channelId: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('public');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setLoading(true);
    setError('');

    const res = await fetch('/api/messaging/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description || undefined, type }),
    });

    setLoading(false);

    if (res.ok) {
      const ch = await res.json() as { id: string };
      onCreated(ch.id);
    } else {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? 'Failed to create channel.');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl border border-[var(--border)] shadow-2xl w-full max-w-md p-6"
        style={{ background: 'var(--bg-elevated)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-[var(--text-primary)]">Create Channel</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--text-muted)]">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="channel-name"
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--text-muted)]">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--text-muted)]">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-sm outline-none cursor-pointer"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="announcement">Announcement</option>
            </select>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--panel-hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {loading ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
