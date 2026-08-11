'use client';
import React, { useState, useTransition } from 'react';

const ROLES = [
  'PLATFORM_ADMIN',
  'ENTITY_ADMIN',
  'FINANCE',
  'HR_ADMIN',
  'PROJECT_MANAGER',
  'SALES',
  'ANALYST',
  'TEAM_MEMBER',
  'VIEWER',
  'GUEST',
] as const;

type Role = typeof ROLES[number];

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  orgId: string;
  createdAt: Date | null;
}

interface Props {
  initialUsers: AdminUser[];
  currentUserId: string;
}

export function UsersAdminClient({ initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [showInvite, setShowInvite] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleRoleChange(userId: string, role: string) {
    const res = await fetch(`/api/messaging/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      const updated: AdminUser = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: updated.role } : u)));
    }
  }

  async function handleStatusToggle(userId: string, currentStatus: string) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const res = await fetch(`/api/messaging/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u)));
    }
  }

  async function handleDelete(userId: string) {
    const res = await fetch(`/api/messaging/admin/users/${userId}`, { method: 'DELETE' });
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    }
    setConfirmDeleteId(null);
  }

  function handleUserCreated(newUser: AdminUser) {
    startTransition(() => {
      setUsers((prev) => [newUser, ...prev]);
    });
    setShowInvite(false);
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">Users</h1>
        <button
          onClick={() => setShowInvite(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          Invite User
        </button>
      </div>

      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--text-muted)] text-left border-b border-[var(--border)] text-xs">
                <th className="px-4 py-3">Name / Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--border)] hover:bg-[var(--panel-hover)]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--text-primary)]">{u.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      className="text-xs rounded-md px-2 py-1 border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] outline-none cursor-pointer"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleStatusToggle(u.id, u.status)}
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ${
                        u.status === 'active'
                          ? 'bg-teal-500/20 text-teal-400'
                          : 'bg-[var(--border)] text-[var(--text-muted)]'
                      }`}
                    >
                      {u.status === 'active' ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)] font-mono">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.id !== currentUserId && (
                      <button
                        onClick={() => setConfirmDeleteId(u.id)}
                        className="text-xs text-red-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-muted)] text-sm">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showInvite && (
        <InviteModal onClose={() => setShowInvite(false)} onCreated={handleUserCreated} />
      )}

      {confirmDeleteId && (() => {
        const target = users.find(u => u.id === confirmDeleteId);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmDeleteId(null); }}
          >
            <div
              className="rounded-xl border border-[var(--border)] shadow-2xl w-full max-w-sm p-6"
              style={{ background: 'var(--bg-elevated)' }}
            >
              <h2 className="font-bold text-[var(--text-primary)] mb-2">Delete user?</h2>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                <strong>{target?.name}</strong> ({target?.email}) will be permanently removed along with their sessions and channel memberships. This cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--panel-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(confirmDeleteId)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
                >
                  Delete user
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function InviteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (user: AdminUser) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('TEAM_MEMBER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) { setError('Name and email are required.'); return; }
    setLoading(true);
    setError('');

    const res = await fetch('/api/messaging/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role, orgId: 'platform_default' }),
    });

    setLoading(false);

    if (res.ok) {
      const newUser: AdminUser = await res.json();
      setSuccess(true);
      setTimeout(() => onCreated(newUser), 800);
    } else {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? 'Failed to create user.');
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
          <h2 className="font-bold text-[var(--text-primary)]">Invite User</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none">✕</button>
        </div>

        {success ? (
          <div className="py-4 text-center text-teal-400 text-sm font-medium">User created successfully!</div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--text-muted)]">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--text-muted)]">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[var(--text-muted)]">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-sm outline-none focus:border-[var(--accent)] cursor-pointer"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
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
                {loading ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
