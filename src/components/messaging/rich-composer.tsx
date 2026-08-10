'use client';
import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  Bold, Italic, Code, Link2, List, ListOrdered, Strikethrough,
  Send, Paperclip, AtSign, Smile, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/db/schema/messaging';

interface AttachmentPreview { name: string; size: number; url: string; fileType: string; }

export interface AttachmentMeta { url: string; filename: string; fileType: string; size: number; }

interface Props {
  onSend: (content: string, parentMessageId?: string, attachments?: AttachmentMeta[]) => Promise<void>;
  placeholder?: string;
  orgUsers?: User[];
  parentMessageId?: string;
  disabled?: boolean;
  channelId?: string;
  typingUsers?: { userId: string; name: string }[];
}

const TOOLBAR_EMOJIS = ['😀','😂','❤️','👍','🎉','🚀','🤔','👀','🔥','✅','⚡','🎯','💡','🙏','🎊','😎'];

function serializeToMarkdown(el: HTMLElement): string {
  let result = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as HTMLElement).tagName.toLowerCase();
      const inner = serializeToMarkdown(node as HTMLElement);
      switch (tag) {
        case 'b': case 'strong': result += `**${inner}**`; break;
        case 'i': case 'em': result += `*${inner}*`; break;
        case 's': result += `~~${inner}~~`; break;
        case 'code': result += `\`${inner}\``; break;
        case 'br': result += '\n'; break;
        case 'div': result += '\n' + inner; break;
        case 'li': result += `- ${inner}\n`; break;
        case 'ul': case 'ol': result += inner; break;
        default: result += inner; break;
      }
    }
  }
  return result;
}

export function RichComposer({
  onSend, placeholder = 'Message…', orgUsers = [], parentMessageId, disabled, channelId, typingUsers = [],
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const sendTypingSignal = useCallback(async (typing: boolean) => {
    if (!channelId) return;
    fetch(`/api/messaging/channels/${channelId}/typing`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ typing }),
    }).catch(() => {});
  }, [channelId]);

  function getTextBeforeCursor(): string {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return '';
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(editorRef.current!);
    range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
    return range.toString();
  }

  function handleInput() {
    const content = editorRef.current?.innerText ?? '';
    setIsEmpty(content.trim() === '');

    // Typing indicator
    if (channelId) {
      if (!isTypingRef.current) { isTypingRef.current = true; sendTypingSignal(true); }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => { isTypingRef.current = false; sendTypingSignal(false); }, 3000);
    }

    // @mention detection
    const before = getTextBeforeCursor();
    const atMatch = before.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionStart(before.length - atMatch[0].length);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  }

  function execCmd(cmd: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  }

  function wrapSelection(before: string, after: string) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const selected = range.toString();
    const wrapped = document.createTextNode(before + selected + after);
    range.deleteContents();
    range.insertNode(wrapped);
    editorRef.current?.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const toolbarButtons = [
    { icon: Bold, title: 'Bold (Cmd+B)', action: () => wrapSelection('**', '**') },
    { icon: Italic, title: 'Italic (Cmd+I)', action: () => wrapSelection('*', '*') },
    { icon: Strikethrough, title: 'Strikethrough', action: () => wrapSelection('~~', '~~') },
    { icon: Code, title: 'Inline code', action: () => wrapSelection('`', '`') },
    { icon: Link2, title: 'Link', action: () => { const url = prompt('URL:'); if (url) wrapSelection('[', `](${url})`); } },
    { icon: List, title: 'Bullet list', action: () => { execCmd('insertUnorderedList'); } },
    { icon: ListOrdered, title: 'Ordered list', action: () => { execCmd('insertOrderedList'); } },
  ];

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !showMentions) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      setShowMentions(false);
      setShowEmoji(false);
    }
    // Bold/italic shortcuts
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); wrapSelection('**', '**'); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); wrapSelection('*', '*'); }
  }

  function insertMention(name: string) {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const textBefore = getTextBeforeCursor();
      const atIdx = textBefore.lastIndexOf('@');
      if (atIdx >= 0) {
        const charsToDelete = textBefore.length - atIdx;
        for (let i = 0; i < charsToDelete; i++) {
          document.execCommand('delete', false);
        }
      }
      // Insert as bold so it shows highlighted in editor and serializes to **@Name**
      document.execCommand('insertHTML', false, `<strong>@${name}</strong>&nbsp;`);
    }
    setShowMentions(false);
  }

  function insertEmoji(emoji: string) {
    editorRef.current?.focus();
    execCmd('insertText', emoji);
    setShowEmoji(false);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !channelId) return;
    setUploading(true);
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/messaging/channels/${channelId}/attachments`, { method: 'POST', body: fd });
      if (res.ok) {
        const data = await res.json();
        setAttachments((prev) => [...prev, { name: data.filename, size: data.size, url: data.url, fileType: data.fileType }]);
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSend() {
    const el = editorRef.current;
    if (!el || sending) return;
    const rawText = el.innerText.trim();
    if (!rawText && attachments.length === 0) return;

    const mdContent = serializeToMarkdown(el).trim();

    if (channelId && isTypingRef.current) {
      isTypingRef.current = false;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      sendTypingSignal(false);
    }

    const attachmentMeta: AttachmentMeta[] = attachments.map((a) => ({
      url: a.url, filename: a.name, fileType: a.fileType, size: a.size,
    }));

    setSending(true);
    try {
      await onSend(mdContent, parentMessageId, attachmentMeta.length > 0 ? attachmentMeta : undefined);
      el.innerHTML = '';
      setIsEmpty(true);
      setAttachments([]);
    } finally {
      setSending(false);
    }
  }

  const mentionCandidates = [
    { id: 'claude', name: 'Claude', role: 'AI' } as User & { role: string },
    ...orgUsers.filter((u) => u.name.toLowerCase().includes(mentionQuery.toLowerCase())),
  ];

  const typingText = typingUsers.length === 0
    ? null
    : typingUsers.length === 1
    ? `${typingUsers[0].name} is typing…`
    : 'Several people are typing…';

  return (
    <div className="relative border-t border-[var(--border)] bg-[var(--bg-elevated)]">
      {typingText && (
        <div className="px-4 pt-1.5 pb-0 text-xs text-[var(--text-muted)] italic">{typingText}</div>
      )}

      <div className={cn('mx-3 my-2 rounded-xl border bg-[var(--bg)] transition-colors', disabled ? 'opacity-50' : 'border-[var(--border)] focus-within:border-[var(--accent)]')}>
        {/* Formatting toolbar — row 1 */}
        <div className="flex items-center gap-0.5 px-2 pt-2 pb-1 border-b border-[var(--border)]">
          {toolbarButtons.map(({ icon: Icon, title, action }) => (
            <button
              key={title}
              title={title}
              onMouseDown={(e) => { e.preventDefault(); action(); }}
              className="p-1.5 rounded hover:bg-[var(--panel-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-2">
            {attachments.map((a, i) => {
              const isImage = a.fileType.startsWith('image/');
              return (
                <span key={i} className="relative flex items-center gap-1 text-xs bg-[var(--panel-hover)] border border-[var(--border)] rounded-lg overflow-hidden">
                  {isImage ? (
                    <img src={a.url} alt={a.name} className="h-14 w-14 object-cover" />
                  ) : (
                    <span className="flex items-center gap-1 px-2 py-1">
                      <Paperclip className="h-3 w-3 text-[var(--text-muted)] shrink-0" />
                      <span className="truncate max-w-[100px] text-[var(--text-secondary)]">{a.name}</span>
                    </span>
                  )}
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute top-0.5 right-0.5 bg-[var(--bg)] rounded-full p-0.5 shadow"
                  >
                    <X className="h-3 w-3 text-[var(--text-muted)]" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Editable area */}
        <div className="relative px-3 py-2">
          {isEmpty && (
            <div className="absolute inset-0 px-3 py-2 text-sm text-[var(--text-muted)] pointer-events-none select-none">{placeholder}</div>
          )}
          <div
            ref={editorRef}
            contentEditable={!disabled && !sending}
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            className="min-h-[44px] max-h-[200px] overflow-y-auto text-sm text-[var(--text-primary)] outline-none leading-relaxed"
            style={{ wordBreak: 'break-word' }}
          />
        </div>

        {/* Mention dropdown */}
        {showMentions && mentionCandidates.length > 0 && (
          <div className="absolute bottom-full left-3 mb-1 w-56 bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden z-20">
            {mentionCandidates.slice(0, 8).map((u) => (
              <button
                key={u.id}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--panel-hover)] text-left"
                onMouseDown={(e) => { e.preventDefault(); insertMention(u.name); }}
              >
                <span
                  className="h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ background: u.id === 'claude' ? 'linear-gradient(135deg, #6d4be0, #9370f8)' : '#4f46e5' }}
                >
                  {u.name[0]?.toUpperCase()}
                </span>
                <span className="flex-1 text-[var(--text-primary)]">{u.name}</span>
                {u.id === 'claude' && <span className="text-[10px] text-[var(--ai)] font-semibold">AI</span>}
              </button>
            ))}
          </div>
        )}

        {/* Emoji picker */}
        {showEmoji && (
          <div className="absolute bottom-full right-0 mb-1 bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-lg p-2 z-20 w-52">
            <div className="grid grid-cols-8 gap-0.5">
              {TOOLBAR_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => insertEmoji(emoji)}
                  className="text-lg hover:scale-125 transition-transform p-0.5 rounded hover:bg-[var(--panel-hover)]"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action row — row 2 */}
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <div className="flex items-center gap-0.5">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !channelId}
              title="Attach file"
              className="p-1.5 rounded hover:bg-[var(--panel-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { setShowEmoji((v) => !v); setShowMentions(false); }}
              title="Emoji"
              className="p-1.5 rounded hover:bg-[var(--panel-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <Smile className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { insertEmoji('@'); editorRef.current?.focus(); }}
              title="Mention"
              className="p-1.5 rounded hover:bg-[var(--panel-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <AtSign className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={handleSend}
            disabled={disabled || sending || (isEmpty && attachments.length === 0)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
