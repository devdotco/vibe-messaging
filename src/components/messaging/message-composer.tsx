'use client';
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/db/schema/messaging';

interface AttachmentPreview {
  name: string;
  size: number;
  url: string;
}

interface Props {
  onSend: (content: string, parentMessageId?: string) => Promise<void>;
  placeholder?: string;
  orgUsers?: User[];
  parentMessageId?: string;
  disabled?: boolean;
  channelId?: string;
  typingUsers?: { userId: string; name: string }[];
}

export function MessageComposer({
  onSend,
  placeholder = 'Message...',
  orgUsers = [],
  parentMessageId,
  disabled,
  channelId,
  typingUsers = [],
}: Props) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const claudeSuggestion = { id: 'claude', name: 'Claude', role: 'AI' };

  const mentionCandidates = [
    claudeSuggestion,
    ...orgUsers.filter((u) => u.name.toLowerCase().includes(mentionQuery.toLowerCase())),
  ];

  // Cleanup typing timer on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  const sendTyping = useCallback(async (typing: boolean) => {
    if (!channelId) return;
    try {
      await fetch(`/api/messaging/channels/${channelId}/typing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typing }),
      });
    } catch {
      // best-effort
    }
  }, [channelId]);

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

    // Typing indicator logic (debounced, only when channelId is set)
    if (channelId) {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        sendTyping(true);
      }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        isTypingRef.current = false;
        sendTyping(false);
      }, 3000);
    }

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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !channelId) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/messaging/channels/${channelId}/attachments`, { method: 'POST', body: fd });
    if (res.ok) {
      const data = await res.json();
      setAttachments((prev) => [...prev, { name: data.filename, size: data.size, url: data.url }]);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSend() {
    const trimmed = content.trim();
    if ((!trimmed && attachments.length === 0) || sending) return;

    // Stop typing indicator immediately on send
    if (channelId && isTypingRef.current) {
      isTypingRef.current = false;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      sendTyping(false);
    }

    setSending(true);
    try {
      const attachmentText = attachments.map((a) => `[${a.name}](${a.url})`).join(' ');
      const fullContent = [trimmed, attachmentText].filter(Boolean).join('\n');
      await onSend(fullContent, parentMessageId);
      setContent('');
      setAttachments([]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } finally {
      setSending(false);
    }
  }

  // Format typing indicator text
  const typingText = typingUsers.length === 0
    ? null
    : typingUsers.length === 1
    ? `${typingUsers[0].name} is typing...`
    : typingUsers.length === 2
    ? `${typingUsers[0].name} and ${typingUsers[1].name} are typing...`
    : 'Several people are typing...';

  return (
    <div className="relative border-t border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      {/* Typing indicator */}
      {typingText && (
        <div className="pb-1 text-xs text-[var(--text-muted)] italic">{typingText}</div>
      )}

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

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 px-1">
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs bg-[var(--panel-hover)] border border-[var(--border)] rounded-lg px-2 py-1">
              <Paperclip className="h-3 w-3 text-[var(--text-muted)]" />
              <span className="truncate max-w-[120px] text-[var(--text-secondary)]">{a.name}</span>
              <span className="text-[var(--text-muted)]">{(a.size / 1024).toFixed(1)}KB</span>
              <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}>
                <X className="h-3 w-3 text-[var(--text-muted)] hover:text-[var(--negative)]" />
              </button>
            </div>
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
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !channelId}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
            title="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <Button size="icon" onClick={handleSend} disabled={(!content.trim() && attachments.length === 0) || sending} className="h-7 w-7">
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
