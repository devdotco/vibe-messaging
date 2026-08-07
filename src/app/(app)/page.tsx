import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { channels, channelMembers } from '@/lib/db/schema/messaging';
import { eq, and } from 'drizzle-orm';

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const [first] = await db
    .select({ channel: channels })
    .from(channelMembers)
    .innerJoin(channels, eq(channelMembers.channelId, channels.id))
    .where(and(eq(channelMembers.userId, user.id), eq(channels.isDefault, true)))
    .limit(1);

  if (first) redirect(`/channels/${first.channel.id}`);

  const [any] = await db
    .select({ channel: channels })
    .from(channelMembers)
    .innerJoin(channels, eq(channelMembers.channelId, channels.id))
    .where(eq(channelMembers.userId, user.id))
    .limit(1);

  if (any) redirect(`/channels/${any.channel.id}`);

  return (
    <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
      <p>Join a channel to get started.</p>
    </div>
  );
}
