'use client';
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ClaudeAvatar, ClaudeAiBadge } from './claude-avatar';
import { formatTime, formatCost, cn } from '@/lib/utils';
import type { Message, User } from '@/lib/db/schema/messaging';

interface Props {
  message: Message;
  user?: User;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (messageId: string) => void;
  onCreateTask?: (message: Message) => void;
  isStreaming?: boolean;
  streamContent?: string;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🚀', '👀'];

export function MessageItem({ message, user, onReact, onReply, onEdit, onDelete, onCreateTask, isStreaming, streamContent }: Props) {
  const [hovering, setHovering] = useState(false);
  const isAI = message.isAiResponse;
  const content = isStreaming ? (streamContent ?? '...') : message.content;

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
            <AvatarFallback>{user?.name?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
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
        </div>

        {/* Content */}
        {isAI ? (
          <div className="prose prose-sm max-w-none text-[var(--text-primary)] [&_p]:my-1 [&_pre]:bg-[var(--panel-hover)] [&_pre]:p-2 [&_pre]:rounded [&_code]:text-xs">
            {isStreaming && !streamContent ? (
              <StreamingDots />
            ) : (
              <ReactMarkdown>{content}</ReactMarkdown>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words">{content}</p>
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
            className="mt-1 text-xs text-[var(--accent)] hover:underline"
          >
            {message.threadReplyCount} {message.threadReplyCount === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>

      {/* Hover actions */}
      {hovering && (
        <div className="absolute right-4 top-1 flex items-center gap-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-1 py-0.5 shadow-sm z-10">
          {QUICK_REACTIONS.map((emoji) => (
            <button key={emoji} onClick={() => onReact(message.id, emoji)} className="text-base hover:scale-125 transition-transform px-0.5">
              {emoji}
            </button>
          ))}
          <div className="w-px h-4 bg-[var(--border)] mx-0.5" />
          <button onClick={() => onReply(message)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1">Reply</button>
          {onCreateTask && (
            <button onClick={() => onCreateTask(message)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1">Task</button>
          )}
          {onEdit && !isAI && (
            <button onClick={() => onEdit(message)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1">Edit</button>
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
