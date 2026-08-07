'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { ChannelHeader } from '@/components/messaging/channel-header';
import { MessageList } from '@/components/messaging/message-list';
import { MessageComposer } from '@/components/messaging/message-composer';
import { getPusherClient } from '@/lib/pusher/client';
import type { Channel, Message, User } from '@/lib/db/schema/messaging';

interface Props {
  channel: Channel;
  initialMessages: Message[];
  usersMap: Record<string, User>;
  currentUser: User;
  memberCount: number;
}

interface TypingUser {
  userId: string;
  name: string;
}

export function ChannelView({ channel, initialMessages, usersMap, currentUser, memberCount }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [streamingId, setStreamingId] = useState<string | undefined>();
  const [streamingContent, setStreamingContent] = useState('');
  const [threadMessage, setThreadMessage] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  // Pusher real-time subscription
  useEffect(() => {
    const pusher = getPusherClient();
    const channelName = `org-${currentUser.orgId}-channel-${channel.id}`;
    const sub = pusher.subscribe(channelName);

    sub.bind('message.new', ({ message }: { message: Message }) => {
      setMessages((prev) => [...prev, message]);
    });

    sub.bind('message.updated', ({ messageId, content }: { messageId: string; content: string }) => {
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, content } : m));
    });

    sub.bind('message.deleted', ({ messageId }: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    });

    sub.bind('claude.thinking', ({ messageId }: { messageId: string }) => {
      setStreamingId(messageId);
      setStreamingContent('');
      setMessages((prev) => {
        if (prev.find((m) => m.id === messageId)) return prev;
        return [...prev, {
          id: messageId, channelId: channel.id, orgId: currentUser.orgId,
          userId: process.env.NEXT_PUBLIC_CLAUDE_BOT_USER_ID ?? 'claude',
          content: '...', isAiResponse: true, aiModel: 'claude-sonnet-4-5',
          createdAt: new Date(),
        } as Message];
      });
    });

    sub.bind('claude.chunk', ({ messageId, chunk }: { messageId: string; chunk: string }) => {
      if (messageId === streamingId || true) {
        setStreamingContent((prev) => prev + chunk);
      }
    });

    sub.bind('claude.complete', ({ messageId, content }: { messageId: string; content: string }) => {
      setStreamingId(undefined);
      setStreamingContent('');
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, content, metadata: { streaming: false } } : m));
    });

    sub.bind('typing.update', ({ userId, name, typing }: { userId: string; name: string; typing: boolean }) => {
      // Don't show typing indicator for the current user
      if (userId === currentUser.id) return;
      setTypingUsers((prev) => {
        if (typing) {
          if (prev.find((u) => u.userId === userId)) return prev;
          return [...prev, { userId, name }];
        } else {
          return prev.filter((u) => u.userId !== userId);
        }
      });
    });

    return () => {
      sub.unbind_all();
      pusher.unsubscribe(channelName);
    };
  }, [channel.id, currentUser.orgId, currentUser.id]);

  const handleSend = useCallback(async (content: string, parentMessageId?: string) => {
    await fetch(`/api/messaging/channels/${channel.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, parentMessageId }),
    });
  }, [channel.id]);

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    await fetch(`/api/messaging/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    });
  }, []);

  const handleDelete = useCallback(async (messageId: string) => {
    await fetch(`/api/messaging/messages/${messageId}`, { method: 'DELETE' });
  }, []);

  const topLevelMessages = messages.filter((m) => !m.parentMessageId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ChannelHeader channel={channel} memberCount={memberCount} />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <MessageList
            messages={topLevelMessages}
            users={usersMap}
            streamingMessageId={streamingId}
            streamingContent={streamingContent}
            onReact={handleReact}
            onReply={(msg) => setThreadMessage(msg)}
            onDelete={handleDelete}
          />
          <MessageComposer
            onSend={handleSend}
            placeholder={`Message #${channel.name}`}
            orgUsers={Object.values(usersMap)}
            channelId={channel.id}
            typingUsers={typingUsers}
          />
        </div>

        {/* Thread panel */}
        {threadMessage && (
          <ThreadPanel
            message={threadMessage}
            users={usersMap}
            channelId={channel.id}
            currentUser={currentUser}
            onClose={() => setThreadMessage(null)}
          />
        )}
      </div>
    </div>
  );
}

function ThreadPanel({ message, users, channelId, currentUser, onClose }: {
  message: Message; users: Record<string, User>; channelId: string; currentUser: User; onClose: () => void;
}) {
  const [replies, setReplies] = useState<Message[]>([]);

  useEffect(() => {
    fetch(`/api/messaging/messages/${message.id}/thread`)
      .then((r) => r.json())
      .then(setReplies);
  }, [message.id]);

  useEffect(() => {
    const pusher = getPusherClient();
    const ch = `org-${currentUser.orgId}-channel-${channelId}`;
    const sub = pusher.subscribe(ch);
    sub.bind('message.new', (data: { message: Message }) => {
      if (data.message.parentMessageId === message.id) {
        setReplies((prev) => [...prev, data.message]);
      }
    });
    return () => { sub.unbind_all(); };
  }, [channelId, message.id, currentUser.orgId]);

  async function handleSend(content: string) {
    await fetch(`/api/messaging/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, parentMessageId: message.id }),
    });
  }

  return (
    <div style={{ width: 380, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg-elevated)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <span className="font-semibold text-sm">Thread</span>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <MessageList
          messages={[message, ...replies]}
          users={users}
          onReact={async () => {}}
          onReply={() => {}}
        />
      </div>
      <MessageComposer onSend={handleSend} placeholder="Reply in thread..." orgUsers={Object.values(users)} parentMessageId={message.id} />
    </div>
  );
}
