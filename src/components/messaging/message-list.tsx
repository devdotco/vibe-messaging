'use client';
import React, { useEffect, useRef, useCallback } from 'react';
import { MessageItem, type MessageWithReactions } from './message-item';
import { MessageSkeleton } from '@/components/ui/Skeleton';
import type { User } from '@/lib/db/schema/messaging';

interface Props {
  messages: MessageWithReactions[];
  users: Record<string, User>;
  currentUserId?: string;
  channelId?: string;
  streamingMessageId?: string;
  streamingContent?: string;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (message: MessageWithReactions) => void;
  onEdit?: (message: MessageWithReactions) => void;
  onDelete?: (messageId: string) => void;
  onCreateTask?: (message: MessageWithReactions) => void;
  onPinToggle?: (messageId: string, isPinned: boolean) => void;
  onForward?: (message: MessageWithReactions) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
}

export function MessageList({ messages, users, currentUserId, channelId, streamingMessageId, streamingContent, onReact, onReply, onEdit, onDelete, onCreateTask, onPinToggle, onForward, onLoadMore, hasMore, loading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Scroll to top detection for load more
  const handleScroll = useCallback(() => {
    if (!containerRef.current || !onLoadMore || !hasMore) return;
    if (containerRef.current.scrollTop < 80) {
      onLoadMore();
    }
  }, [onLoadMore, hasMore]);

  // Group messages: consecutive from same user within 5min
  const grouped = groupMessages(messages);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto py-4" style={{ scrollbarWidth: 'thin' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <MessageSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto py-4"
      style={{ scrollbarWidth: 'thin' }}
    >
      {hasMore && (
        <div className="text-center py-2">
          <button onClick={onLoadMore} className="text-xs text-[var(--accent)] hover:underline">Load older messages</button>
        </div>
      )}

      {grouped.map((group, gi) => (
        <React.Fragment key={group[0].id}>
          {/* Date separator */}
          {gi > 0 && isDifferentDay(group[0].createdAt, grouped[gi - 1][0].createdAt) && (
            <DateSeparator date={group[0].createdAt} />
          )}
          {group.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              user={users[msg.userId]}
              currentUserId={currentUserId}
              channelId={channelId}
              onReact={onReact}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onCreateTask={onCreateTask}
              onPinToggle={onPinToggle}
              onForward={onForward}
              isStreaming={msg.id === streamingMessageId}
              streamContent={msg.id === streamingMessageId ? streamingContent : undefined}
            />
          ))}
        </React.Fragment>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function groupMessages(messages: MessageWithReactions[]): MessageWithReactions[][] {
  const groups: MessageWithReactions[][] = [];
  let current: MessageWithReactions[] = [];

  for (const msg of messages) {
    if (current.length === 0) {
      current.push(msg);
      continue;
    }
    const prev = current[current.length - 1];
    const sameUser = prev.userId === msg.userId;
    const within5min = msg.createdAt && prev.createdAt &&
      new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
    if (sameUser && within5min) {
      current.push(msg);
    } else {
      groups.push(current);
      current = [msg];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function isDifferentDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return da.toDateString() !== db.toDateString();
}

function DateSeparator({ date }: { date: Date | null }) {
  if (!date) return null;
  const d = new Date(date);
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <div className="flex items-center gap-3 my-4 px-4">
      <div className="flex-1 h-px bg-[var(--border)]" />
      <span className="text-xs text-[var(--text-muted)] font-medium">{label}</span>
      <div className="flex-1 h-px bg-[var(--border)]" />
    </div>
  );
}
