'use client';
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ClaudeAvatar, ClaudeAiBadge } from './claude-avatar';
import { formatTime, formatCost, cn } from '@/lib/utils';
import type { Message, User } from '@/lib/db/schema/messaging';
import type { ReactionGroup } from '@/app/api/messaging/channels/[channelId]/messages/route';

export interface MessageWithReactions extends Message {
  reactions?: ReactionGroup[];
}

interface Props {
  message: MessageWithReactions;
  user?: User;
  currentUserId?: string;
  channelId?: string;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (message: MessageWithReactions) => void;
  onEdit?: (message: MessageWithReactions) => void;
  onDelete?: (messageId: string) => void;
  onCreateTask?: (message: MessageWithReactions) => void;
  onPinToggle?: (messageId: string, isPinned: boolean) => void;
  isStreaming?: boolean;
  streamContent?: string;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🚀', '👀'];

export function MessageItem({ message, user, currentUserId, channelId, onReact, onReply, onEdit, onDelete, onCreateTask, onPinToggle, isStreaming, streamContent }: Props) {
  const [hovering, setHovering] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [saving, setSaving] = useState(false);
  const [pinning, setPinning] = useState(false);

  const isAI = message.isAiResponse;
  const content = isStreaming ? (streamContent ?? '...') : message.content;
  const isPinned = message.isPinned ?? false;

  async function handleSaveEdit() {
    if (!editContent.trim() || saving) return;
    setSaving(true);
    try {
      await fetch(`/api/messaging/messages/${message.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleEditClick() {
    setEditContent(message.content);
    setIsEditing(true);
    if (onEdit) onEdit(message);
  }

  async function handleRemoveReaction(emoji: string) {
    await fetch(`/api/messaging/messages/${message.id}/reactions/${encodeURIComponent(emoji)}`, { method: 'DELETE' });
  }

  async function handlePinToggle() {
    if (!channelId || pinning) return;
    setPinning(true);
    try {
      const method = isPinned ? 'DELETE' : 'POST';
      await fetch(`/api/messaging/channels/${channelId}/messages/${message.id}/pin`, { method });
      onPinToggle?.(message.id, !isPinned);
    } finally {
      setPinning(false);
    }
  }

  const reactions = message.reactions ?? [];

  // Deterministic avatar color from userId
  function userColor(id?: string) {
    if (!id) return '#4f46e5';
    const colors = ['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777'];
    let h = 0;
    for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  }

  return (
    <div
      className={cn('group relative flex gap-3 py-1.5 px-4 rounded-lg transition-colors', isAI && 'bg-[var(--ai-subtle)]', hovering && !isAI && 'bg-[var(--panel-hover)]')}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Avatar */}
      <div className="mt-0.5 shrink-0">
        {isAI ? (
          <ClaudeAvatar size={32} />
        ) : (
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.avatarUrl ?? ''} />
            <AvatarFallback style={{ background: userColor(user?.id), color: '#fff', fontSize: 12 }}>
              {user?.name?.[0]?.toUpperCase() ?? '?'}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="font-semibold text-sm text-[var(--text-primary)]">
            {isAI ? 'Claude' : (user?.name ?? 'Unknown')}
          </span>
          {isAI && <ClaudeAiBadge />}
          <span className="text-xs text-[var(--text-muted)]" title={message.createdAt?.toString()}>
            {message.createdAt ? formatTime(message.createdAt) : ''}
          </span>
          {message.editedAt && <span className="text-xs text-[var(--text-muted)]">(edited)</span>}
          {isPinned && <span className="text-xs" title="Pinned message">📌</span>}
        </div>

        {/* Content — inline edit mode */}
        {isEditing ? (
          <div className="mt-1">
            <textarea
              className="w-full rounded-lg border border-[var(--accent)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)] px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-[var(--accent)]"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                if (e.key === 'Escape') setIsEditing(false);
              }}
            />
            <div className="flex gap-2 mt-1.5">
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="text-xs bg-[var(--accent)] text-white px-3 py-1 rounded-md hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : isAI ? (
          <div className="prose prose-sm max-w-none text-[var(--text-primary)] [&_p]:my-1 [&_pre]:bg-[var(--panel-hover)] [&_pre]:p-2 [&_pre]:rounded [&_code]:text-xs">
            {isStreaming && !streamContent ? (
              <StreamingDots />
            ) : (
              <ReactMarkdown>{content}</ReactMarkdown>
            )}
          </div>
        ) : message.contentHtml ? (
          <div
            className="text-sm text-[var(--text-primary)] prose prose-sm max-w-none [&_p]:my-0.5 [&_a]:text-[var(--accent)] [&_code]:bg-[var(--panel-hover)] [&_code]:px-1 [&_code]:rounded"
            dangerouslySetInnerHTML={{ __html: message.contentHtml }}
          />
        ) : (
          <div className="text-sm text-[var(--text-primary)] prose prose-sm max-w-none [&_p]:my-0.5 [&_p]:leading-relaxed [&_strong]:font-semibold [&_code]:bg-[var(--panel-hover)] [&_code]:px-1 [&_code]:rounded [&_a]:text-[var(--accent)] whitespace-pre-wrap break-words">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}

        {/* AI metadata */}
        {isAI && !isStreaming && message.aiTokensUsed && (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs text-[var(--text-muted)] font-mono">
              {message.aiTokensUsed.toLocaleString()} tokens · {message.aiCostUsd ? formatCost(Number(message.aiCostUsd)) : '$0.00'}
            </span>
          </div>
        )}

        {/* Thread count */}
        {(message.threadReplyCount ?? 0) > 0 && (
          <button
            onClick={() => onReply(message)}
            className="mt-1 text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
          >
            ↩ {message.threadReplyCount} {message.threadReplyCount === 1 ? 'reply' : 'replies'}
            {message.threadLastReplyAt && (
              <span className="text-[var(--text-muted)]">· Last reply {formatTime(message.threadLastReplyAt)}</span>
            )}
          </button>
        )}

        {/* Reactions */}
        {reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {reactions.map((r) => {
              const iMine = currentUserId ? r.userIds.includes(currentUserId) : false;
              return (
                <button
                  key={r.emoji}
                  onClick={() => iMine ? handleRemoveReaction(r.emoji) : onReact(message.id, r.emoji)}
                  className={cn(
                    'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors',
                    iMine
                      ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent)]'
                      : 'bg-[var(--panel-hover)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]',
                  )}
                  title={`${r.userIds.length} ${r.userIds.length === 1 ? 'person' : 'people'} reacted`}
                >
                  <span>{r.emoji}</span>
                  <span className="font-medium">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Hover actions */}
      {hovering && !isEditing && (
        <div className="absolute right-4 top-1 flex items-center gap-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-1 py-0.5 shadow-sm z-10">
          {QUICK_REACTIONS.map((emoji) => (
            <button key={emoji} onClick={() => onReact(message.id, emoji)} className="text-base hover:scale-125 transition-transform px-0.5">
              {emoji}
            </button>
          ))}
          <div className="w-px h-4 bg-[var(--border)] mx-0.5" />
          <button onClick={() => onReply(message)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1" title="Reply in thread">↩</button>
          {channelId && !isAI && (
            <button
              onClick={handlePinToggle}
              disabled={pinning}
              className={cn(
                'text-xs px-1 transition-colors disabled:opacity-50',
                isPinned
                  ? 'text-[var(--accent)] hover:text-[var(--text-muted)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--accent)]',
              )}
              title={isPinned ? 'Unpin message' : 'Pin message'}
            >
              📌
            </button>
          )}
          {onCreateTask && (
            <button onClick={() => onCreateTask(message)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1">Task</button>
          )}
          {onEdit && !isAI && (
            <button onClick={handleEditClick} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1">Edit</button>
          )}
          {onDelete && !isAI && (
            <button onClick={() => onDelete(message.id)} className="text-xs text-[var(--negative)] hover:opacity-80 px-1">Delete</button>
          )}
        </div>
      )}
    </div>
  );
}

function StreamingDots() {
  return (
    <span className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--ai)] animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
