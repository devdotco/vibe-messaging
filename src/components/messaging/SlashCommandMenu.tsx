'use client';
import React, { useEffect, useRef, useState } from 'react';

export interface SlashCommand {
  name: string;
  description: string;
  args?: string;
}

const ALL_COMMANDS: SlashCommand[] = [
  { name: 'task', description: 'Create a task from this message', args: '[title]' },
  { name: 'here', description: 'Notify everyone currently online' },
  { name: 'channel', description: 'Notify everyone in this channel' },
  { name: 'invite', description: 'Add a user to this channel', args: '@username' },
  { name: 'leave', description: 'Leave this channel' },
  { name: 'topic', description: 'Set the channel topic', args: '[text]' },
  { name: 'mute', description: 'Toggle mute notifications for this channel' },
  { name: 'giphy', description: 'Insert a GIF', args: '[search]' },
];

interface Props {
  query: string;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

export function SlashCommandMenu({ query, onSelect, onClose }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = ALL_COMMANDS.filter((c) =>
    c.name.startsWith(query.toLowerCase()),
  );

  // Reset active index when filter changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (filtered.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSelect(filtered[activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, activeIndex, onSelect, onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-3 mb-1 w-72 bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden z-30"
    >
      <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)]">
        Commands
      </div>
      {filtered.map((cmd, i) => (
        <button
          key={cmd.name}
          className={`w-full flex items-start gap-3 px-3 py-2 text-sm text-left transition-colors ${
            i === activeIndex ? 'bg-[var(--panel-hover)]' : 'hover:bg-[var(--panel-hover)]'
          }`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(cmd); }}
          onMouseEnter={() => setActiveIndex(i)}
        >
          <span className="font-mono text-[var(--accent)] font-semibold shrink-0">
            /{cmd.name}
            {cmd.args && <span className="text-[var(--text-muted)] font-normal"> {cmd.args}</span>}
          </span>
          <span className="text-[var(--text-secondary)] text-xs leading-relaxed">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
}
