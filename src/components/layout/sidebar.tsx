'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Hash, Lock, Megaphone, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PresenceDot } from '@/components/messaging/presence-dot';
import { cn } from '@/lib/utils';
import type { Channel, User } from '@/lib/db/schema/messaging';

interface Props {
  channels: Channel[];
  dms: { userId: string; name: string; avatarUrl?: string | null; presence?: string }[];
  currentUser: User;
  onNewChannel?: () => void;
}

const CHANNEL_ICONS = { public: Hash, private: Lock, announcement: Megaphone };

export function Sidebar({ channels, dms, currentUser, onNewChannel }: Props) {
  const pathname = usePathname();
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [dmsOpen, setDmsOpen] = useState(true);

  const publicChannels = channels.filter((c) => c.type === 'public');
  const privateChannels = channels.filter((c) => c.type === 'private');

  return (
    <aside
      style={{
        width: 260,
        minWidth: 260,
        background: 'var(--sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Workspace name */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <span className="font-bold text-sm text-[var(--text-primary)] truncate">ViBe</span>
      </div>

      <div className="flex-1 overflow-y-auto py-2" style={{ scrollbarWidth: 'thin' }}>
        {/* Channels section */}
        <SidebarSection
          label="Channels"
          open={channelsOpen}
          onToggle={() => setChannelsOpen((v) => !v)}
          onAdd={onNewChannel}
        >
          {publicChannels.map((c) => (
            <ChannelLink key={c.id} channel={c} active={pathname === `/channels/${c.id}`} />
          ))}
          {privateChannels.map((c) => (
            <ChannelLink key={c.id} channel={c} active={pathname === `/channels/${c.id}`} />
          ))}
        </SidebarSection>

        {/* DMs section */}
        <SidebarSection label="Direct Messages" open={dmsOpen} onToggle={() => setDmsOpen((v) => !v)}>
          {dms.map((dm) => (
            <Link
              key={dm.userId}
              href={`/dms/${dm.userId}`}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg mx-1 text-sm transition-colors',
                pathname === `/dms/${dm.userId}`
                  ? 'bg-[var(--sidebar-active)] text-[var(--accent)] font-medium'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--panel-hover)]',
              )}
            >
              <div className="relative shrink-0">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={dm.avatarUrl ?? ''} />
                  <AvatarFallback className="text-[9px]">{dm.name[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <PresenceDot
                  status={dm.presence ?? 'offline'}
                  className="absolute -bottom-0.5 -right-0.5 ring-1 ring-[var(--sidebar)]"
                />
              </div>
              <span className="truncate">{dm.name}</span>
            </Link>
          ))}
        </SidebarSection>
      </div>

      {/* Current user footer */}
      <div className="border-t border-[var(--border)] p-3 flex items-center gap-2">
        <div className="relative shrink-0">
          <Avatar className="h-7 w-7">
            <AvatarImage src={currentUser.avatarUrl ?? ''} />
            <AvatarFallback className="text-xs">{currentUser.name[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <PresenceDot status="online" className="absolute -bottom-0.5 -right-0.5 ring-1 ring-[var(--sidebar)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-[var(--text-primary)] truncate">{currentUser.name}</div>
          <div className="text-[10px] text-[var(--text-muted)] truncate">{currentUser.email}</div>
        </div>
      </div>
    </aside>
  );
}

function SidebarSection({ label, open, onToggle, onAdd, children }: {
  label: string; open: boolean; onToggle: () => void; onAdd?: () => void; children: React.ReactNode;
}) {
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between px-3 py-1">
        <button onClick={onToggle} className="flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] uppercase tracking-wide transition-colors">
          <Icon className="h-3 w-3" />
          {label}
        </button>
        {onAdd && (
          <button onClick={onAdd} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

function ChannelLink({ channel, active }: { channel: Channel; active: boolean }) {
  const Icon = CHANNEL_ICONS[channel.type as keyof typeof CHANNEL_ICONS] ?? Hash;
  return (
    <Link
      href={`/channels/${channel.id}`}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg mx-1 text-sm transition-colors',
        active
          ? 'bg-[var(--sidebar-active)] text-[var(--accent)] font-medium'
          : 'text-[var(--text-secondary)] hover:bg-[var(--panel-hover)]',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{channel.name}</span>
    </Link>
  );
}
