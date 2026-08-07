'use client';
import { Hash, Lock, Megaphone, Settings, Bot } from 'lucide-react';
import type { Channel } from '@/lib/db/schema/messaging';

interface Props {
  channel: Channel;
  memberCount?: number;
  onSettings?: () => void;
}

const TYPE_ICONS = {
  public: Hash,
  private: Lock,
  announcement: Megaphone,
};

export function ChannelHeader({ channel, memberCount, onSettings }: Props) {
  const Icon = TYPE_ICONS[channel.type as keyof typeof TYPE_ICONS] ?? Hash;

  return (
    <div
      className="flex items-center justify-between px-4"
      style={{
        height: 56,
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--text-muted)]" />
        <span className="font-semibold text-sm text-[var(--text-primary)]">{channel.name}</span>
        {channel.description && (
          <>
            <span className="text-[var(--border-strong)]">·</span>
            <span className="text-sm text-[var(--text-muted)] truncate max-w-xs">{channel.description}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {memberCount !== undefined && (
          <span className="text-xs text-[var(--text-muted)]">{memberCount} members</span>
        )}
        <div
          className="flex items-center gap-1 text-xs rounded-md px-2 py-1"
          style={{
            background: channel.claudeEnabled ? 'var(--ai-subtle)' : 'var(--panel-hover)',
            color: channel.claudeEnabled ? 'var(--ai)' : 'var(--text-muted)',
          }}
        >
          <Bot className="h-3 w-3" />
          {channel.claudeEnabled ? 'Claude enabled' : 'Claude disabled'}
        </div>
        {onSettings && (
          <button onClick={onSettings} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
