import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  channels, channelMembers, users, dmConversations,
  userPresence, messages, workspaces, notifications,
} from '@/lib/db/schema/messaging';
import { eq, and, gt, isNull, sql, desc } from 'drizzle-orm';
import { ChatRail, type DmEntry } from '@/components/layout/sidebar';
import { PresenceUpdater } from '@/components/messaging/presence-updater';
import { SidebarPresenceSync } from '@/components/messaging/sidebar-presence-sync';
import { AppShell, AgentDock } from "@erp-ui";
import { AppLayoutClient } from './layout-client';
import { loadShellNav } from "@erp-ui/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    /*
     * The fast path, repeated HERE because middleware cannot cover the bare
     * mount.
     *
     * Next does not run middleware for the basePath root, so a request to
     * `app.erp.io/chat` never reaches `proxy.ts` — and the bare mount is
     * exactly what the suite's app switcher links to. The proxy's fast path
     * therefore never fired on a module switch, and somebody already signed in
     * to erp.io was shown this module's own magic-link form. `/chat/channels`
     * was always fine, which is what made it look intermittent.
     *
     * Sign-in here is a magic link rather than a pure hand-off, so the form
     * still stands for anyone with no suite session — people invited straight
     * to a channel. This only skips it for somebody the shell already knows.
     */
    const shellSession = (await cookies()).get('__vibe_session')?.value;
    if (shellSession) {
      const shell = (process.env.NEXT_PUBLIC_SHELL_URL ?? 'https://app.erp.io').replace(/\/$/, '');
      redirect(`${shell}/api/shell/auth/module-token?aud=messaging&next=%2F`);
    }
    redirect('/sign-in');
  }

  const memberships = await db
    .select({ channel: channels, lastReadAt: channelMembers.lastReadAt })
    .from(channelMembers)
    .innerJoin(channels, eq(channelMembers.channelId, channels.id))
    .where(and(eq(channelMembers.userId, user.id), eq(channels.isArchived, false)));

  const userChannels = memberships.map((m) => m.channel);

  // Compute unread counts
  const unreadCounts: Record<string, number> = {};
  for (const membership of memberships) {
    const channelId = membership.channel.id;
    const lastReadAt = membership.lastReadAt;

    const conditions = [
      eq(messages.channelId, channelId),
      eq(messages.orgId, user.orgId),
      isNull(messages.parentMessageId),
      isNull(messages.deletedAt),
    ];
    if (lastReadAt) {
      conditions.push(gt(messages.createdAt, lastReadAt));
    }

    const [row] = await db
      .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(messages)
      .where(and(...conditions));

    unreadCounts[channelId] = row?.count ?? 0;
  }

  // DM conversations — include conversation ID so sidebar can navigate directly
  const convos = await db
    .select()
    .from(dmConversations)
    .where(and(eq(dmConversations.orgId, user.orgId), sql`${user.id} = ANY(${dmConversations.participantIds})`))
    .orderBy(desc(dmConversations.createdAt));

  const otherUserMap: Record<string, string> = {};
  for (const c of convos) {
    const otherId = (c.participantIds ?? []).find((id) => id !== user.id);
    if (otherId) otherUserMap[otherId] = c.id;
  }

  const uniqueOtherIds = Object.keys(otherUserMap);

  const otherUsers = uniqueOtherIds.length > 0
    ? await db.select({ user: users, presence: userPresence })
        .from(users)
        .leftJoin(userPresence, eq(userPresence.userId, users.id))
        .where(sql`${users.id} = ANY(${uniqueOtherIds})`)
    : [];

  const dmList: DmEntry[] = otherUsers.map(({ user: u, presence }) => ({
    conversationId: otherUserMap[u.id] ?? '',
    userId: u.id,
    name: u.name,
    avatarUrl: u.avatarUrl,
    presence: presence?.status ?? 'offline',
    statusMessage: presence?.statusMessage,
  }));

  // Workspace name
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.orgId, user.orgId))
    .limit(1);

  const workspaceName = workspace?.name ?? 'My Workspace';

  // Unread notification count
  const [notifRow] = await db
    .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));

  const notificationCount = notifRow?.count ?? 0;

  // White-label chrome and entitlement, both from the shell in one call.

  // Best-effort: brandVars(null) draws the erp.io defaults.

  const { brand, modules } = await loadShellNav();


  return (
    <AppShell
      brand={brand}
      moduleLabel="Chat"
      rail={<ChatRail brand={brand} modules={modules} />}
      sidebar={
        <AppLayoutClient
          channels={userChannels}
          dms={dmList}
          currentUser={user}
          workspaceName={workspaceName}
          unreadCounts={unreadCounts}
          notificationCount={notificationCount}
        />
      }
    >
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        <PresenceUpdater />
        <SidebarPresenceSync orgId={user.orgId} />
        {children}
      </main>
      {/* The assistant. Inside the frame so it is present on every page of
          this module rather than remembered per page. */}
      <AgentDock moduleKey="messaging" />
    </AppShell>
  );
}
