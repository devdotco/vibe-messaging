'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Hash, Lock, Megaphone, Plus, ChevronDown, ChevronRight,
  Globe, ShieldCheck, Search, Bell, MessageSquarePlus,
  Bot, Settings, X, Pencil, Users,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { Channel, User } from '@/lib/db/schema/messaging';

export interface DmEntry {
  conversationId: string;
  userId: string;
  name: string;
  avatarUrl?: string | null;
  presence?: string;
  statusMessage?: string | null;
}

interface Props {
  channels: Channel[];
  dms: DmEntry[];
  currentUser: User;
  workspaceName?: string;
  onNewChannel?: () => void;
  unreadCounts?: Record<string, number>;
  notificationCount?: number;
  onOpenNotifications?: () => void;
}

const CHANNEL_ICONS = { public: Hash, private: Lock, announcement: Megaphone };

function RenameWorkspaceModal({ current, onClose, onSave }: { current: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(current);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim() === current) { onClose(); return; }
    setSaving(true);
    await fetch('/api/messaging/workspace', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    onSave(name.trim());
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '340px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>Rename workspace</h3>
        <form onSubmit={submit}>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Workspace name"
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px', background: 'var(--bg)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' }}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '7px 14px', border: '1px solid var(--border)', borderRadius: '6px', background: 'transparent', color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving || !name.trim()} style={{ padding: '7px 14px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer', opacity: saving || !name.trim() ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Sidebar({ channels, dms, currentUser, workspaceName: initialWorkspaceName, onNewChannel, unreadCounts = {}, notificationCount = 0, onOpenNotifications }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [dmsOpen, setDmsOpen] = useState(true);
  const [showNewDm, setShowNewDm] = useState(false);
  const [presenceMap, setPresenceMap] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState('');
  const [showStatusEdit, setShowStatusEdit] = useState(false);
  const [workspaceName, setWorkspaceName] = useState(initialWorkspaceName ?? 'My Workspace');
  const [showWsMenu, setShowWsMenu] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const wsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showWsMenu) return;
    const h = (e: MouseEvent) => { if (wsMenuRef.current && !wsMenuRef.current.contains(e.target as Node)) setShowWsMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showWsMenu]);

  // Live presence updates via CustomEvent from SidebarPresenceSync
  useEffect(() => {
    function onPresence(e: Event) {
      const { userId, status } = (e as CustomEvent<{ userId: string; status: string }>).detail;
      setPresenceMap((prev) => ({ ...prev, [userId]: status }));
    }
    window.addEventListener('vibe:presence', onPresence);
    return () => window.removeEventListener('vibe:presence', onPresence);
  }, []);

  // Initialise presence map from prop
  useEffect(() => {
    const init: Record<string, string> = {};
    for (const dm of dms) init[dm.userId] = dm.presence ?? 'offline';
    setPresenceMap(init);
  }, [dms]);

  const isAdmin =
    currentUser.role === 'PLATFORM_ADMIN' || currentUser.role === 'ENTITY_ADMIN' ||
    currentUser.isPlatformUser === true;

  const publicChannels = channels.filter((c) => c.type === 'public' || c.type === 'announcement');
  const privateChannels = channels.filter((c) => c.type === 'private');

  async function handleDmClick(dm: DmEntry) {
    router.push(`/dms/${dm.conversationId}`);
  }

  async function handleNewDm(userId: string) {
    const res = await fetch('/api/messaging/dms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantIds: [userId] }),
    });
    const convo = await res.json();
    setShowNewDm(false);
    router.push(`/dms/${convo.id}`);
  }

  async function saveStatus() {
    await fetch('/api/messaging/presence', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusMessage }),
    });
    setShowStatusEdit(false);
  }

  const QUICK_EMOJIS = ['🎯', '🏃', '🔴', '📵', '🤒', '🌴', '🚀', '🎉'];

  return (
    <aside
      style={{
        width: 260,
        minWidth: 260,
        background: 'var(--sidebar)',
        borderRight: '1px solid var(--sidebar-border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        color: 'var(--sidebar-text)',
      }}
    >
      {/* Workspace header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--sidebar-border)' }}
      >
        <div ref={wsMenuRef} className="relative">
          <button
            onClick={() => setShowWsMenu(v => !v)}
            className="flex items-center gap-1.5 font-bold text-sm hover:opacity-80 transition-opacity truncate max-w-[160px]"
          >
            <span className="truncate" style={{ color: 'var(--sidebar-text)' }}>
              {workspaceName}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </button>
          {showWsMenu && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.25)', width: '200px', overflow: 'hidden',
            }}>
              <div style={{ padding: '6px' }}>
                <button
                  onClick={() => { setShowWsMenu(false); setShowRenameModal(true); }}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm hover:bg-[var(--panel-hover)] transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Pencil className="h-3.5 w-3.5 opacity-60" />
                  Rename workspace
                </button>
                <Link
                  href="/admin/users"
                  onClick={() => setShowWsMenu(false)}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm hover:bg-[var(--panel-hover)] transition-colors"
                  style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                >
                  <Users className="h-3.5 w-3.5 opacity-60" />
                  Manage members
                </Link>
              </div>
            </div>
          )}
          {showRenameModal && (
            <RenameWorkspaceModal
              current={workspaceName}
              onClose={() => setShowRenameModal(false)}
              onSave={(name) => { setWorkspaceName(name); setShowRenameModal(false); }}
            />
          )}
        </div>
        <div className="flex items-center gap-1">
          {notificationCount > 0 && (
            <button
              onClick={onOpenNotifications}
              className="relative p-1 rounded hover:bg-[var(--sidebar-hover)] transition-colors"
              title="Notifications"
            >
              <Bell className="h-4 w-4" style={{ color: 'var(--sidebar-text-muted)' }} />
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[14px] text-[9px] font-bold rounded-full bg-[var(--accent)] text-white flex items-center justify-center px-1 leading-none">
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            </button>
          )}
          <button
            onClick={() => setShowNewDm(true)}
            className="p-1 rounded hover:bg-[var(--sidebar-hover)] transition-colors"
            title="New message"
          >
            <MessageSquarePlus className="h-4 w-4" style={{ color: 'var(--sidebar-text-muted)' }} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2" style={{ scrollbarWidth: 'thin' }}>
        {/* Search */}
        <Link
          href="/search"
          className="flex items-center gap-2 mx-2 px-3 py-1.5 rounded-lg text-sm transition-colors mb-1"
          style={{
            background: pathname === '/search' ? 'var(--sidebar-active)' : 'var(--sidebar-hover)',
            color: 'var(--sidebar-text)',
            opacity: 0.85,
          }}
        >
          <Search className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="text-[var(--sidebar-text-muted)] text-xs">Find a conversation…</span>
        </Link>

        {/* Channels section */}
        <SidebarSection
          label="Channels"
          open={channelsOpen}
          onToggle={() => setChannelsOpen((v) => !v)}
          onAdd={onNewChannel}
        >
          {publicChannels.map((c) => (
            <ChannelLink
              key={c.id}
              channel={c}
              active={pathname === `/channels/${c.id}`}
              unread={unreadCounts[c.id] ?? 0}
            />
          ))}
          {privateChannels.map((c) => (
            <ChannelLink
              key={c.id}
              channel={c}
              active={pathname === `/channels/${c.id}`}
              unread={unreadCounts[c.id] ?? 0}
            />
          ))}
          <Link
            href="/channels/browse"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg mx-1 text-xs transition-colors"
            style={{ color: 'var(--sidebar-text-muted)' }}
          >
            <Globe className="h-3.5 w-3.5 shrink-0" />
            <span>Browse all channels</span>
          </Link>
        </SidebarSection>

        {/* DMs section */}
        <SidebarSection
          label="Direct Messages"
          open={dmsOpen}
          onToggle={() => setDmsOpen((v) => !v)}
          onAdd={() => setShowNewDm(true)}
        >
          {/* Self DM */}
          <SidebarItem
            label={`${currentUser.name} (you)`}
            active={false}
            icon={
              <div className="relative shrink-0">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={currentUser.avatarUrl ?? ''} />
                  <AvatarFallback style={{ background: '#4f46e5', color: '#fff', fontSize: 9 }}>
                    {currentUser.name[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <PresenceDotInline status="online" />
              </div>
            }
            onClick={() => {}}
          />

          {dms.map((dm) => {
            const liveStatus = presenceMap[dm.userId] ?? dm.presence ?? 'offline';
            const active = pathname === `/dms/${dm.conversationId}`;
            return (
              <button
                key={dm.conversationId}
                onClick={() => handleDmClick(dm)}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg mx-1 text-sm transition-colors text-left"
                style={{
                  background: active ? 'var(--sidebar-active)' : 'transparent',
                  color: active ? '#fff' : 'var(--sidebar-text)',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <div className="relative shrink-0">
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={dm.avatarUrl ?? ''} />
                    <AvatarFallback style={{ background: '#4f46e5', color: '#fff', fontSize: 9 }}>
                      {dm.name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <PresenceDotInline status={liveStatus} />
                </div>
                <span className="truncate flex-1 text-xs">{dm.name}</span>
              </button>
            );
          })}
        </SidebarSection>

        {/* Apps section */}
        <div className="mb-1 mt-1">
          <div className="flex items-center px-3 py-1">
            <span
              className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: 'var(--sidebar-text-muted)' }}
            >
              Apps
            </span>
          </div>
          <SidebarItem
            label="Claude"
            active={false}
            icon={<Bot className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--ai)' }} />}
            onClick={() => {}}
          />
        </div>

        {/* Admin section */}
        {isAdmin && (
          <div className="mb-1 mt-2">
            <div className="flex items-center px-3 py-1">
              <span
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: 'var(--sidebar-text-muted)' }}
              >
                Admin
              </span>
            </div>
            {[
              { href: '/admin/users', label: 'Users', icon: ShieldCheck },
              { href: '/admin/channels', label: 'Channels', icon: Hash },
              { href: '/admin/usage', label: 'Claude Usage', icon: Bot },
              { href: '/admin/rbac', label: 'RBAC Policies', icon: ShieldCheck },
              { href: '/admin/airbyte', label: 'Airbyte', icon: Globe },
            ].map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg mx-1 text-xs transition-colors"
                style={{
                  background: pathname.startsWith(href) ? 'var(--sidebar-active)' : 'transparent',
                  color: pathname.startsWith(href) ? '#fff' : 'var(--sidebar-text)',
                  fontWeight: pathname.startsWith(href) ? 600 : 400,
                }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Current user footer */}
      <div
        className="p-3 flex items-center gap-2"
        style={{ borderTop: '1px solid var(--sidebar-border)' }}
      >
        <button
          className="relative shrink-0"
          onClick={() => setShowStatusEdit((v) => !v)}
          title="Set status"
        >
          <Avatar className="h-7 w-7">
            <AvatarImage src={currentUser.avatarUrl ?? ''} />
            <AvatarFallback style={{ background: '#4f46e5', color: '#fff', fontSize: 11 }}>
              {currentUser.name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <PresenceDotInline status="online" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate" style={{ color: 'var(--sidebar-text)' }}>
            {currentUser.name}
          </div>
          <div className="text-[10px] truncate" style={{ color: 'var(--sidebar-text-muted)' }}>
            {currentUser.email}
          </div>
        </div>
        <button
          onClick={onOpenNotifications}
          className="p-1 rounded hover:bg-[var(--sidebar-hover)] transition-colors"
        >
          <Bell className="h-3.5 w-3.5" style={{ color: 'var(--sidebar-text-muted)' }} />
        </button>
      </div>

      {/* Status edit popup */}
      {showStatusEdit && (
        <div
          className="absolute bottom-16 left-4 right-4 z-50 rounded-xl shadow-2xl border p-4"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Set status</span>
            <button onClick={() => setShowStatusEdit(false)}>
              <X className="h-4 w-4 text-[var(--text-muted)]" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1 mb-3">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setStatusMessage((s) => e + ' ' + s.replace(/^[\p{Emoji}]\s*/u, ''))}
                className="text-lg hover:scale-125 transition-transform"
              >
                {e}
              </button>
            ))}
          </div>
          <input
            type="text"
            maxLength={80}
            placeholder="What's your status?"
            value={statusMessage}
            onChange={(e) => setStatusMessage(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text-primary)] px-3 py-2 outline-none focus:border-[var(--accent)] mb-3"
            onKeyDown={(e) => e.key === 'Enter' && saveStatus()}
          />
          <div className="flex gap-2">
            <button
              onClick={saveStatus}
              className="flex-1 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm hover:bg-[var(--accent-hover)]"
            >
              Save
            </button>
            <button
              onClick={() => { setStatusMessage(''); setShowStatusEdit(false); }}
              className="py-1.5 px-3 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* New DM Modal */}
      {showNewDm && (
        <NewDmModal onClose={() => setShowNewDm(false)} onStart={handleNewDm} />
      )}
    </aside>
  );
}

/* ─── Sub-components ────────────────────────────────────────────────────── */

function SidebarSection({
  label, open, onToggle, onAdd, children,
}: {
  label: string; open: boolean; onToggle: () => void; onAdd?: () => void; children: React.ReactNode;
}) {
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between px-3 py-1">
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide transition-opacity hover:opacity-100"
          style={{ color: 'var(--sidebar-text-muted)', opacity: 0.8 }}
        >
          <Icon className="h-3 w-3" />
          {label}
        </button>
        {onAdd && (
          <button
            onClick={onAdd}
            className="p-0.5 rounded hover:bg-[var(--sidebar-hover)] transition-colors"
            style={{ color: 'var(--sidebar-text-muted)' }}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

function SidebarItem({
  label, active, icon, onClick, badge,
}: {
  label: string; active: boolean; icon: React.ReactNode; onClick: () => void; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg mx-1 text-xs transition-colors text-left"
      style={{
        background: active ? 'var(--sidebar-active)' : 'transparent',
        color: active ? '#fff' : 'var(--sidebar-text)',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
      <span className="truncate flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className="shrink-0 rounded-full text-[9px] font-bold px-1.5 py-0.5 min-w-[16px] text-center leading-none"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

function ChannelLink({ channel, active, unread }: { channel: Channel; active: boolean; unread: number }) {
  const Icon = CHANNEL_ICONS[channel.type as keyof typeof CHANNEL_ICONS] ?? Hash;
  const hasUnread = unread > 0;
  return (
    <Link
      href={`/channels/${channel.id}`}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg mx-1 text-xs transition-colors"
      style={{
        background: active ? 'var(--sidebar-active)' : 'transparent',
        color: active ? '#fff' : hasUnread ? '#fff' : 'var(--sidebar-text)',
        fontWeight: hasUnread && !active ? 700 : 400,
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate flex-1">{channel.name}</span>
      {hasUnread && !active && (
        <span
          className="shrink-0 rounded-full text-[9px] font-bold px-1.5 py-0.5 min-w-[16px] text-center leading-none"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}

function PresenceDotInline({ status }: { status: string }) {
  const color = status === 'online' ? 'var(--online)' : status === 'away' ? 'var(--away)' : 'transparent';
  return (
    <span
      className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2"
      style={{
        background: color,
        borderColor: 'var(--sidebar)',
        display: status === 'offline' ? 'none' : 'block',
      }}
    />
  );
}

/* ─── New DM Modal ──────────────────────────────────────────────────────── */

function NewDmModal({ onClose, onStart }: { onClose: () => void; onStart: (userId: string) => void }) {
  const [query, setQuery] = useState('');
  const [orgUsers, setOrgUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch('/api/messaging/users')
      .then((r) => r.json())
      .then((data: { user: User }[]) => {
        setOrgUsers(data.map((d) => d.user));
        setLoading(false);
      });
  }, []);

  const filtered = orgUsers.filter((u) =>
    u.name.toLowerCase().includes(query.toLowerCase()) ||
    u.email.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-2xl shadow-2xl border flex flex-col overflow-hidden"
        style={{ width: 440, maxHeight: '60vh', background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <Search className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search people…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="text-center py-8 text-sm text-[var(--text-muted)]">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-[var(--text-muted)]">No people found</div>
          ) : (
            filtered.slice(0, 20).map((u) => (
              <button
                key={u.id}
                onClick={() => onStart(u.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--panel-hover)] transition-colors text-left"
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={u.avatarUrl ?? ''} />
                  <AvatarFallback style={{ background: '#4f46e5', color: '#fff', fontSize: 12 }}>
                    {u.name[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--text-primary)] truncate">{u.name}</div>
                  <div className="text-xs text-[var(--text-muted)] truncate">{u.email}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
