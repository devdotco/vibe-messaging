'use client';
import { Hash, Lock, Megaphone, Settings, Bot, Search, Users } from 'lucide-react';
import type { Channel } from '@/lib/db/schema/messaging';
import type { ReactNode } from 'react';

const TYPE_ICONS = {
  public: Hash,
  private: Lock,
  announcement: Megaphone,
};

type Tab = 'messages' | 'files' | 'pins';
const TABS: { id: Tab; label: string }[] = [
  { id: 'messages', label: 'Messages' },
  { id: 'files', label: 'Files' },
  { id: 'pins', label: 'Pins' },
];

interface Props {
  channel: Channel;
  memberCount?: number;
  onSettings?: () => void;
  activeTab?: Tab;
  onTabChange?: (tab: Tab) => void;
  extraActions?: ReactNode;
}

export function ChannelHeader({ channel, memberCount, onSettings, activeTab = 'messages', onTabChange, extraActions }: Props) {
  const Icon = TYPE_ICONS[channel.type as keyof typeof TYPE_ICONS] ?? Hash;

  return (
    <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
      {/* Main header row */}
      <div className="flex items-center justify-between px-5" style={{ height: 56 }}>
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
          <span className="font-bold text-[18px] text-[var(--text-primary)]">{channel.name}</span>
          {channel.description && (
            <>
              <span className="text-[var(--border-strong)] font-light">|</span>
              <span className="text-sm text-[var(--text-muted)] truncate max-w-xs">{channel.description}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {memberCount !== undefined && (
            <button className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-2 py-1 rounded-lg hover:bg-[var(--panel-hover)]">
              <Users className="h-3.5 w-3.5" />
              <span>{memberCount}</span>
            </button>
          )}
          <div
            className="flex items-center gap-1 text-xs rounded-md px-2 py-1"
            style={{
              background: channel.claudeEnabled ? 'var(--ai-subtle)' : 'var(--panel-hover)',
              color: channel.claudeEnabled ? 'var(--ai)' : 'var(--text-muted)',
            }}
          >
            <Bot className="h-3 w-3" />
            {channel.claudeEnabled ? 'Claude on' : 'Claude off'}
          </div>
          <button
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-hover)] transition-colors"
            title="Search in channel"
          >
            <Search className="h-4 w-4" />
          </button>
          {/* Sound toggle (SoundManager or similar) injected here */}
          {extraActions}
          <button
            onClick={onSettings}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--panel-hover)] transition-colors"
            title="Channel settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center px-5 gap-0 border-t border-[var(--border)]">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange?.(tab.id)}
              className="px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px"
              style={{
                borderColor: isActive ? 'var(--accent)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
