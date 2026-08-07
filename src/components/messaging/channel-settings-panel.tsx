'use client';
import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, Link2 } from 'lucide-react';
import type { Channel, ChannelMember, User, ChannelProjectLink } from '@/lib/db/schema/messaging';

interface Props {
  channel: Channel;
  currentUser: User;
  onClose: () => void;
  onUpdated?: (updated: Channel) => void;
}

type Tab = 'general' | 'members' | 'projects';

export function ChannelSettingsPanel({ channel, currentUser, onClose, onUpdated }: Props) {
  const [tab, setTab] = useState<Tab>('general');
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? '');
  const [claudeEnabled, setClaudeEnabled] = useState(channel.claudeEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<{ member: ChannelMember; user: User }[]>([]);
  const [projects, setProjects] = useState<ChannelProjectLink[]>([]);
  const [newProjectId, setNewProjectId] = useState('');
  const [addingMemberId, setAddingMemberId] = useState('');
  const [orgUsers, setOrgUsers] = useState<User[]>([]);

  const isAdmin =
    currentUser.role === 'PLATFORM_ADMIN' || currentUser.role === 'ENTITY_ADMIN';

  useEffect(() => {
    if (tab === 'members') {
      fetch(`/api/messaging/channels/${channel.id}/members`)
        .then((r) => r.json())
        .then(setMembers);
      fetch('/api/messaging/users')
        .then((r) => r.json())
        .then((data: { user: User }[]) => setOrgUsers(data.map((d) => d.user)));
    } else if (tab === 'projects') {
      fetch(`/api/messaging/channels/${channel.id}/projects`)
        .then((r) => r.json())
        .then(setProjects);
    }
  }, [tab, channel.id]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/messaging/channels/${channel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, claudeEnabled }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdated?.(updated);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!confirm(`Archive #${channel.name}? Messages will still be readable.`)) return;
    await fetch(`/api/messaging/channels/${channel.id}`, { method: 'DELETE' });
    onClose();
    window.location.href = '/';
  }

  async function handleAddMember() {
    if (!addingMemberId) return;
    await fetch(`/api/messaging/channels/${channel.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: addingMemberId }),
    });
    const res = await fetch(`/api/messaging/channels/${channel.id}/members`);
    setMembers(await res.json());
    setAddingMemberId('');
  }

  async function handleLinkProject() {
    if (!newProjectId.trim()) return;
    await fetch(`/api/messaging/channels/${channel.id}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: newProjectId.trim() }),
    });
    const res = await fetch(`/api/messaging/channels/${channel.id}/projects`);
    setProjects(await res.json());
    setNewProjectId('');
  }

  async function handleUnlinkProject(projectId: string) {
    await fetch(`/api/messaging/channels/${channel.id}/projects`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    setProjects((p) => p.filter((l) => l.projectId !== projectId));
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'members', label: 'Members' },
    { key: 'projects', label: 'Linked Projects' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col"
        style={{ width: 520, maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="font-bold text-base text-[var(--text-primary)]">Channel Settings</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)] px-6">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === key
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'general' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                  Channel Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text-primary)] px-3 py-2 outline-none focus:border-[var(--accent)] disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!isAdmin}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text-primary)] px-3 py-2 outline-none focus:border-[var(--accent)] resize-none disabled:opacity-50"
                />
              </div>
              <div className="flex items-center justify-between py-2 border-t border-[var(--border)]">
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">Claude AI</div>
                  <div className="text-xs text-[var(--text-muted)]">Allow @claude mentions in this channel</div>
                </div>
                <button
                  onClick={() => isAdmin && setClaudeEnabled((v) => !v)}
                  disabled={!isAdmin}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${claudeEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'} disabled:opacity-50`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${claudeEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-[var(--border)]">
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">Channel Type</div>
                  <div className="text-xs text-[var(--text-muted)] capitalize">{channel.type}</div>
                </div>
              </div>
              {isAdmin && (
                <div className="pt-2 border-t border-[var(--border)]">
                  <button
                    onClick={handleArchive}
                    className="text-sm text-[var(--negative)] hover:opacity-80 flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Archive channel
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'members' && (
            <div className="space-y-4">
              {isAdmin && (
                <div className="flex gap-2">
                  <select
                    value={addingMemberId}
                    onChange={(e) => setAddingMemberId(e.target.value)}
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text-primary)] px-3 py-2 outline-none"
                  >
                    <option value="">Select a user to add…</option>
                    {orgUsers
                      .filter((u) => !members.find((m) => m.user.id === u.id))
                      .map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                  </select>
                  <button
                    onClick={handleAddMember}
                    disabled={!addingMemberId}
                    className="px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-sm disabled:opacity-50 hover:bg-[var(--accent-hover)]"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="space-y-1">
                {members.map(({ member, user: u }) => (
                  <div key={member.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[var(--panel-hover)]">
                    <div className="h-7 w-7 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center text-xs font-bold text-[var(--accent)]">
                      {u.name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--text-primary)] truncate">{u.name}</div>
                      <div className="text-xs text-[var(--text-muted)] truncate">{u.email}</div>
                    </div>
                    <span className="text-xs text-[var(--text-muted)] capitalize">{member.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'projects' && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--text-muted)]">
                Linked PM projects will receive task event notifications in this channel.
              </p>
              {isAdmin && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="PM project ID or URL…"
                    value={newProjectId}
                    onChange={(e) => setNewProjectId(e.target.value)}
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text-primary)] px-3 py-2 outline-none focus:border-[var(--accent)]"
                    onKeyDown={(e) => e.key === 'Enter' && handleLinkProject()}
                  />
                  <button
                    onClick={handleLinkProject}
                    disabled={!newProjectId.trim()}
                    className="px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-sm disabled:opacity-50 hover:bg-[var(--accent-hover)] flex items-center gap-1"
                  >
                    <Link2 className="h-4 w-4" /> Link
                  </button>
                </div>
              )}
              {projects.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-muted)] text-sm">No linked projects yet.</div>
              ) : (
                <div className="space-y-2">
                  {projects.map((link) => (
                    <div key={link.id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[var(--panel-hover)]">
                      <Link2 className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                      <span className="flex-1 text-sm text-[var(--text-primary)] font-mono truncate">{link.projectId}</span>
                      {isAdmin && (
                        <button
                          onClick={() => handleUnlinkProject(link.projectId)}
                          className="text-[var(--negative)] hover:opacity-80"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {tab === 'general' && isAdmin && (
          <div className="px-6 py-4 border-t border-[var(--border)] flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
