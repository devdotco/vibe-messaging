import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { channelMembers, channels, workspaces } from '@/lib/db/schema/messaging';

/**
 * Give an organisation somewhere to talk, and put this person in it.
 *
 * The hand-off used to mirror the USER and nothing else. No shell org ever got
 * a workspace row or a channel — every channel in production belonged to the
 * legacy `platform_default` org — so everyone arriving from app.erp.io landed
 * on an empty "Join a channel to get started" page, under a workspace called
 * "My Workspace", with no channel to join and no way to see one.
 *
 * Runs on every hand-off and is idempotent: the workspace and #general are
 * created once per org, and the person is added to the org's default channels
 * if they are not in them yet. The advisory lock stops two people from the same
 * new org arriving together and creating #general twice.
 *
 * The workspace name comes from the shell on creation only. After that it
 * belongs to this module, which renames it in place.
 */
export async function ensureOrgChat(orgId: string, orgName: string | undefined, userId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'chat-org:' + orgId}))`);

    const [workspace] = await tx.select().from(workspaces).where(eq(workspaces.orgId, orgId)).limit(1);
    const workspaceId =
      workspace?.id ??
      (
        await tx
          .insert(workspaces)
          .values({ orgId, name: orgName?.trim() || 'Workspace', slug: `org-${orgId}` })
          .onConflictDoNothing()
          .returning({ id: workspaces.id })
      )[0]?.id ??
      null;

    let defaults = await tx
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.orgId, orgId), eq(channels.isDefault, true), eq(channels.isArchived, false)));

    if (defaults.length === 0) {
      defaults = await tx
        .insert(channels)
        .values({
          orgId,
          workspaceId,
          name: 'general',
          description: 'Company-wide announcements and conversation',
          type: 'public',
          isDefault: true,
          createdBy: userId,
        })
        .returning({ id: channels.id });
    }

    const joined = await tx
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(and(eq(channelMembers.userId, userId), eq(channelMembers.orgId, orgId)));
    const have = new Set(joined.map((j) => j.channelId));
    const missing = defaults.filter((d) => !have.has(d.id));

    if (missing.length > 0) {
      await tx
        .insert(channelMembers)
        .values(missing.map((d) => ({ channelId: d.id, userId, orgId, role: 'member' })));
    }
  });
}
