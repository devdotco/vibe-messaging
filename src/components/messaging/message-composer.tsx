'use client';
import React, { useRef, useState, useCallback } from 'react';
import { Send, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/db/schema/messaging';

interface Props {
  onSend: (content: string, parentMessageId?: string) => Promise<void>;
  placeholder?: string;
  orgUsers?: User[];
  parentMessageId?: string;
  disabled?: boolean;
}

export function MessageComposer({ onSend, placeholder = 'Message...', orgUsers = [], parentMessageId, disabled }: Props) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const claudeSuggestion = { id: 'claude', name: 'Claude', role: 'AI' };

  const mentionCandidates = [
    claudeSuggestion,
    ...orgUsers.filter((u) => u.name.toLowerCase().includes(mentionQuery.toLowerCase())),
  ];

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') setShowMentions(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setContent(val);

    // Detect @mention
    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }

    // Auto-resize
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    }
  }

  function insertMention(name: string) {
    const cursor = textareaRef.current?.selectionStart ?? content.length;
    const textBeforeCursor = content.slice(0, cursor);
    const withoutPartial = textBeforeCursor.replace(/@\w*$/, `@${name} `);
    setContent(withoutPartial + content.slice(cursor));
    setShowMentions(false);
    textareaRef.current?.focus();
  }

  async function handleSend() {
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed, parentMessageId);
      setContent('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative border-t border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      {/* Mention dropdown */}
      {showMentions && mentionCandidates.length > 0 && (
        <div className="absolute bottom-full left-3 mb-1 w-56 bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden z-20">
          {mentionCandidates.slice(0, 8).map((u) => (
            <button
              key={u.id}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--panel-hover)] text-left"
              onMouseDown={(e) => { e.preventDefault(); insertMention(u.name); }}
            >
              {u.id === 'claude' ? (
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: 'linear-gradient(135deg, #6d4be0, #9370f8)' }}>C</span>
              ) : (
                <span className="w-6 h-6 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center text-xs font-bold">
                  {u.name[0]?.toUpperCase()}
                </span>
              )}
              <span className="text-[var(--text-primary)]">{u.name}</span>
              {u.id === 'claude' && <span className="text-[10px] text-[var(--ai)] ml-auto font-semibold">AI</span>}
            </button>
          ))}
        </div>
      )}

      <div className={cn('flex items-end gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2', disabled && 'opacity-50')}>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || sending}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none leading-relaxed min-h-[22px]"
        />
        <div className="flex items-center gap-1 pb-0.5">
          <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <Paperclip className="h-4 w-4" />
          </button>
          <Button size="icon" onClick={handleSend} disabled={!content.trim() || sending} className="h-7 w-7">
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
