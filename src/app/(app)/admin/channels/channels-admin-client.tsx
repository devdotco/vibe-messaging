'use client';
import React, { useState } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';

const CHANNEL_TYPES = ['public', 'private', 'announcement'] as const;
type ChannelType = typeof CHANNEL_TYPES[number];

interface AdminChannel {
  id: string;
  name: string;
  description: string | null;
  type: string;
  isArchived: boolean | null;
  isDefault: boolean | null;
  claudeEnabled: boolean | null;
  orgId: string;
  createdAt: Date | null;
  memberCount: number;
}

interface Props {
  initialChannels: AdminChannel[];
}

export function ChannelsAdminClient({ initialChannels }: Props) {
  const [channelList, setChannelList] = useState<AdminChannel[]>(initialChannels);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  async function handleClaudeToggle(channelId: string, current: boolean | null) {
    const claudeEnabled = !current;
    const res = await fetch(`/api/messaging/admin/channels/${channelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claudeEnabled }),
    });
    if (res.ok) {
      setChannelList((prev) =>
        prev.map((c) => (c.id === channelId ? { ...c, claudeEnabled } : c)),
      );
    }
  }

  function startEdit(ch: AdminChannel) {
    setEditingId(ch.id);
    setEditName(ch.name);
    setEditDescription(ch.description ?? '');
  }

  async function saveEdit(channelId: string) {
    const res = await fetch(`/api/messaging/admin/channels/${channelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, description: editDescription || null }),
    });
    if (res.ok) {
      setChannelList((prev) =>
        prev.map((c) =>
          c.id === channelId ? { ...c, name: editName, description: editDescription || null } : c,
        ),
      );
      setEditingId(null);
    }
  }

  async function handleDelete(channelId: string) {
    const res = await fetch(`/api/messaging/admin/channels/${channelId}`, { method: 'DELETE' });
    if (res.ok) {
      setChannelList((prev) =>
        prev.map((c) => (c.id === channelId ? { ...c, isArchived: true } : c)),
      );
      setDeleteConfirmId(null);
    }
  }

  function handleChannelCreated(ch: AdminChannel) {
    setChannelList((prev) => [ch, ...prev]);
    setShowCreate(false);
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">Channels</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          Create Channel
        </button>
      </div>

      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--text-muted)] text-left border-b border-[var(--border)] text-xs">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3">Claude</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {channelList.map((ch) => (
                <tr key={ch.id} className={`border-b border-[var(--border)] hover:bg-[var(--panel-hover)] ${ch.isArchived ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    {editingId === ch.id ? (
                      <div className="flex flex-col gap-1">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-sm outline-none focus:border-[var(--accent)]"
                        />
                        <input
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="Description"
                          className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] text-xs outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium text-[var(--text-primary)]">#{ch.name}</div>
                        {ch.description && (
                          <div className="text-xs text-[var(--text-muted)] truncate max-w-[200px]">{ch.description}</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{ch.type}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{ch.memberCount}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleClaudeToggle(ch.id, ch.claudeEnabled)}
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ${
                        ch.claudeEnabled
                          ? 'bg-teal-500/20 text-teal-400'
                          : 'bg-[var(--border)] text-[var(--text-muted)]'
                      }`}
                      disabled={!!ch.isArchived}
                    >
                      {ch.claudeEnabled ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      ch.isArchived
                        ? 'bg-[var(--border)] text-[var(--text-muted)]'
                        : 'bg-teal-500/20 text-teal-400'
                    }`}>
                      {ch.isArchived ? 'Archived' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)] font-mono">
                    {ch.createdAt ? new Date(ch.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === ch.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => saveEdit(ch.id)}
                          className="text-teal-400 hover:text-teal-300 transition-colors"
                          title="Save"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                          title="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        {!ch.isArchived && (
                          <>
                            <button
                              onClick={() => startEdit(ch)}
                              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            {deleteConfirmId === ch.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDelete(ch.id)}
                                  className="text-xs text-red-400 hover:text-red-300 font-medium"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="text-xs text-[var(--text-muted)]"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(ch.id)}
                                className="text-[var(--text-muted)] hover:text-red-400 transition-colors"
                                title="Archive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {channelList.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)] text-sm">
                    No channels found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateChannelModal onClose={() => setShowCreate(false)} onCreated={handleChannelCreated} />
      )}
    </div>
  );
}

function CreateChannelModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (ch: AdminChannel) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ChannelType>('public');
  const [claudeEnabled, setClaudeEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setLoading(true);
    setError('');

    const res = await fetch('/api/messaging/admin/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description || undefined, type, claudeEnabled }),
    });

    setLoading(false);

    if (res.ok) {
      const ch: AdminChannel = await res.json();
      onCreated(ch);
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
              onChange={(e) => setType(e.target.value as ChannelType)}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-sm outline-none focus:border-[var(--accent)] cursor-pointer"
            >
              {CHANNEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-[var(--text-muted)]">Claude enabled</label>
            <button
              type="button"
              onClick={() => setClaudeEnabled((v) => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors ${claudeEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${claudeEnabled ? 'translate-x-4' : 'translate-x-0'}`}
              />
            </button>
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
