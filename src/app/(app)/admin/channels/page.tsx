import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { channels } from '@/lib/db/schema/messaging';
import { desc, sql } from 'drizzle-orm';
import { ChannelsAdminClient } from './channels-admin-client';

export default async function AdminChannelsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  if (!['PLATFORM_ADMIN', 'ENTITY_ADMIN'].includes(user.role)) redirect('/');

  const allChannels = await db
    .select({
      id: channels.id,
      name: channels.name,
      description: channels.description,
      type: channels.type,
      isArchived: channels.isArchived,
      isDefault: channels.isDefault,
      claudeEnabled: channels.claudeEnabled,
      orgId: channels.orgId,
      createdAt: channels.createdAt,
      memberCount: sql<number>`(
        SELECT COUNT(*) FROM channel_members
        WHERE channel_members.channel_id = ${channels.id}
      )`.mapWith(Number),
    })
    .from(channels)
    .orderBy(desc(channels.createdAt));

  return <ChannelsAdminClient initialChannels={allChannels} />;
}
