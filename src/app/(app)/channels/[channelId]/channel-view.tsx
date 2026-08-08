'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { ChannelHeader } from '@/components/messaging/channel-header';
import { MessageList } from '@/components/messaging/message-list';
import { RichComposer } from '@/components/messaging/rich-composer';
import { ChannelSettingsPanel } from '@/components/messaging/channel-settings-panel';
import { SoundManager } from '@/components/messaging/sound-manager';
import { FilesTab } from '@/components/messaging/files-tab';
import { PinsTab } from '@/components/messaging/pins-tab';
import { getPusherClient } from '@/lib/pusher/client';
import type { Channel, User } from '@/lib/db/schema/messaging';
import type { MessageWithReactions } from '@/components/messaging/message-item';

type Tab = 'messages' | 'files' | 'pins';

interface Props {
  channel: Channel;
  initialMessages: MessageWithReactions[];
  usersMap: Record<string, User>;
  currentUser: User;
  memberCount: number;
}

interface TypingUser {
  userId: string;
  name: string;
}

const PM_URL = process.env.NEXT_PUBLIC_PM_URL ?? 'https://pm.vb.co';

export function ChannelView({ channel: initialChannel, initialMessages, usersMap, currentUser, memberCount }: Props) {
  const [channel, setChannel] = useState(initialChannel);
  const [messages, setMessages] = useState<MessageWithReactions[]>(initialMessages);
  const [streamingId, setStreamingId] = useState<string | undefined>();
  const [streamingContent, setStreamingContent] = useState('');
  const [threadMessage, setThreadMessage] = useState<MessageWithReactions | null>(null);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [hasMore, setHasMore] = useState(initialMessages.length >= 50);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [taskMessageContent, setTaskMessageContent] = useState('');
  const [linkedProjects, setLinkedProjects] = useState<{ projectId: string }[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('messages');

  // Pusher real-time subscription
  useEffect(() => {
    const pusher = getPusherClient();
    const channelName = `org-${currentUser.orgId}-channel-${channel.id}`;
    const sub = pusher.subscribe(channelName);

    sub.bind('message.new', ({ message }: { message: MessageWithReactions }) => {
      if (message.parentMessageId) return; // thread replies stay out of main list
      setMessages((prev) => {
        if (prev.find((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    });

    // Update parent's reply count when a thread reply is posted
    sub.bind('thread.reply', ({ parentId, threadReplyCount, threadLastReplyAt }: { parentId: string; threadReplyCount: number; threadLastReplyAt: string }) => {
      setMessages((prev) => prev.map((m) => m.id === parentId ? { ...m, threadReplyCount, threadLastReplyAt: new Date(threadLastReplyAt) } : m));
    });

    sub.bind('message.updated', ({ messageId, content }: { messageId: string; content: string }) => {
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, content } : m));
    });

    sub.bind('message.deleted', ({ messageId }: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    });

    sub.bind('message.pinned', ({ messageId }: { messageId: string }) => {
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, isPinned: true } : m));
    });

    sub.bind('message.unpinned', ({ messageId }: { messageId: string }) => {
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, isPinned: false, pinnedAt: null, pinnedBy: null } : m));
    });

    sub.bind('message.reaction', ({ messageId, emoji, userId, action }: { messageId: string; emoji: string; userId: string; action: 'add' | 'remove' }) => {
      setMessages((prev) => prev.map((m) => {
        if (m.id !== messageId) return m;
        const existing = m.reactions ?? [];
        if (action === 'add') {
          const idx = existing.findIndex((r) => r.emoji === emoji);
          if (idx >= 0) {
            const updated = [...existing];
            updated[idx] = { ...updated[idx], count: updated[idx].count + 1, userIds: [...updated[idx].userIds, userId] };
            return { ...m, reactions: updated };
          }
          return { ...m, reactions: [...existing, { emoji, count: 1, userIds: [userId] }] };
        } else {
          const idx = existing.findIndex((r) => r.emoji === emoji);
          if (idx < 0) return m;
          const updated = [...existing];
          const r = updated[idx];
          if (r.count <= 1) {
            updated.splice(idx, 1);
          } else {
            updated[idx] = { ...r, count: r.count - 1, userIds: r.userIds.filter((id) => id !== userId) };
          }
          return { ...m, reactions: updated };
        }
      }));
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
          createdAt: new Date(), reactions: [],
          contentHtml: null, aiTokensUsed: null, aiCostUsd: null,
          parentMessageId: null, threadReplyCount: 0, threadLastReplyAt: null,
          mentions: null, hasClaudeMention: false,
          isPinned: false, pinnedAt: null, pinnedBy: null,
          editedAt: null, deletedAt: null, metadata: null, source: 'app',
        } as MessageWithReactions];
      });
    });

    sub.bind('claude.chunk', (_: { messageId: string; chunk: string }) => {
      setStreamingContent((prev) => prev + _.chunk);
    });

    sub.bind('claude.complete', ({ messageId, content }: { messageId: string; content: string }) => {
      setStreamingId(undefined);
      setStreamingContent('');
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, content, metadata: { streaming: false } } : m));
    });

    sub.bind('typing.update', ({ userId, name, typing }: { userId: string; name: string; typing: boolean }) => {
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

  const handleEdit = useCallback((_message: MessageWithReactions) => {
    // inline edit handled inside MessageItem — this is just a no-op placeholder to show the Edit button
  }, []);

  const handlePinToggle = useCallback((messageId: string, isPinned: boolean) => {
    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, isPinned } : m));
  }, []);

  const handleCreateTask = useCallback(async (message: MessageWithReactions) => {
    setTaskMessageContent(message.content);
    // Fetch linked projects for this channel
    const res = await fetch(`/api/messaging/channels/${channel.id}/projects`);
    const links = await res.json();
    setLinkedProjects(links);
    setShowCreateTask(true);
  }, [channel.id]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const oldest = messages[0];
    if (!oldest) { setLoadingMore(false); return; }
    const res = await fetch(`/api/messaging/channels/${channel.id}/messages?before=${encodeURIComponent(new Date(oldest.createdAt!).toISOString())}&limit=50`);
    const data = await res.json();
    const older: MessageWithReactions[] = data.messages ?? [];
    setMessages((prev) => [...older, ...prev]);
    setHasMore(data.hasMore ?? false);
    setLoadingMore(false);
  }, [channel.id, messages, loadingMore, hasMore]);

  const topLevelMessages = messages.filter((m) => !m.parentMessageId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ChannelHeader
        channel={channel}
        memberCount={memberCount}
        onSettings={() => setShowSettings(true)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        extraActions={
          <SoundManager
            channelId={channel.id}
            currentUserId={currentUser.id}
            orgId={currentUser.orgId}
            currentUserName={currentUser.name}
          />
        }
      />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {activeTab === 'messages' && (
            <>
              <MessageList
                messages={topLevelMessages}
                users={usersMap}
                currentUserId={currentUser.id}
                channelId={channel.id}
                streamingMessageId={streamingId}
                streamingContent={streamingContent}
                onReact={handleReact}
                onReply={(msg) => setThreadMessage(msg)}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onCreateTask={handleCreateTask}
                onPinToggle={handlePinToggle}
                onLoadMore={handleLoadMore}
                hasMore={hasMore}
              />
              <RichComposer
                onSend={handleSend}
                placeholder={`Message #${channel.name}`}
                orgUsers={Object.values(usersMap)}
                channelId={channel.id}
                typingUsers={typingUsers}
              />
            </>
          )}

          {activeTab === 'files' && (
            <FilesTab channelId={channel.id} />
          )}

          {activeTab === 'pins' && (
            <PinsTab channelId={channel.id} currentUserId={currentUser.id} />
          )}
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

      {/* Channel settings panel */}
      {showSettings && (
        <ChannelSettingsPanel
          channel={channel}
          currentUser={currentUser}
          onClose={() => setShowSettings(false)}
          onUpdated={(updated) => setChannel(updated)}
        />
      )}

      {/* Create Task modal */}
      {showCreateTask && (
        <CreateTaskModal
          content={taskMessageContent}
          channelId={channel.id}
          linkedProjects={linkedProjects}
          currentUser={currentUser}
          onClose={() => setShowCreateTask(false)}
        />
      )}
    </div>
  );
}

/* ─── Thread Panel ────────────────────────────────────────────────────── */

function ThreadPanel({ message, users, channelId, currentUser, onClose }: {
  message: MessageWithReactions; users: Record<string, User>; channelId: string; currentUser: User; onClose: () => void;
}) {
  const [replies, setReplies] = useState<MessageWithReactions[]>([]);

  useEffect(() => {
    fetch(`/api/messaging/messages/${message.id}/thread`)
      .then((r) => r.json())
      .then((data: MessageWithReactions[]) => setReplies(data.map((m) => ({ ...m, reactions: m.reactions ?? [] }))));
  }, [message.id]);

  useEffect(() => {
    const pusher = getPusherClient();
    const ch = `org-${currentUser.orgId}-channel-${channelId}`;
    const sub = pusher.subscribe(ch);
    sub.bind('message.new', (data: { message: MessageWithReactions }) => {
      if (data.message.parentMessageId === message.id) {
        setReplies((prev) => [...prev, { ...data.message, reactions: data.message.reactions ?? [] }]);
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
          currentUserId={currentUser.id}
          onReact={async () => {}}
          onReply={() => {}}
        />
      </div>
      <RichComposer onSend={handleSend} placeholder="Reply in thread..." orgUsers={Object.values(users)} parentMessageId={message.id} />
    </div>
  );
}

/* ─── Create Task Modal ────────────────────────────────────────────────── */

function CreateTaskModal({ content, channelId, linkedProjects, currentUser, onClose }: {
  content: string; channelId: string; linkedProjects: { projectId: string }[]; currentUser: User; onClose: () => void;
}) {
  const [title, setTitle] = useState(content.slice(0, 120));
  const [selectedProject, setSelectedProject] = useState(linkedProjects[0]?.projectId ?? '');
  const [sending, setSending] = useState(false);

  async function handleCreate() {
    if (!title.trim()) return;
    setSending(true);
    try {
      if (selectedProject) {
        // POST to vibe-pm webhook
        const body = JSON.stringify({
          event: 'create_task',
          payload: {
            projectId: selectedProject,
            title: title.trim(),
            creatorEmail: currentUser.email,
          },
        });
        await fetch(`${PM_URL}/api/pm/webhooks/messaging`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        }).catch(() => {
          // If PM isn't available, fall back to deep-link
        });
      }
      // Always open PM with pre-filled title
      window.open(`${PM_URL}/tasks/new?title=${encodeURIComponent(title)}`, '_blank');
      onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-2xl shadow-2xl border flex flex-col"
        style={{ width: 440, background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
      >
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h2 className="font-bold text-base text-[var(--text-primary)]">Create Task from Message</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Task Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text-primary)] px-3 py-2 outline-none focus:border-[var(--accent)]"
            />
          </div>
          {linkedProjects.length > 0 ? (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Project</label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text-primary)] px-3 py-2 outline-none"
              >
                {linkedProjects.map((p) => (
                  <option key={p.projectId} value={p.projectId}>{p.projectId}</option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)] bg-[var(--panel-hover)] rounded-lg px-3 py-2">
              No projects linked to this channel. Link a project in Channel Settings → Linked Projects to send tasks directly. You&apos;ll be redirected to ViBe PM.
            </p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-[var(--border)] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || sending}
            className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {sending ? 'Creating…' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
