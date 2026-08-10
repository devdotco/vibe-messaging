import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channels, channelMembers } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { validate, z } from '@/lib/validate';
import { eq, and } from 'drizzle-orm';

const ChannelSchema = z.object({
  name: z.string().min(1).max(80).regex(/^[a-z0-9-_]+$/, 'Lowercase letters, numbers, hyphens only'),
  description: z.string().max(500).optional(),
  type: z.enum(['public', 'private', 'announcement']).default('public'),
  claudeEnabled: z.boolean().optional(),
});

export async function GET() {
  const user = await requireUser();

  const memberships = await db
    .select({ channel: channels })
    .from(channelMembers)
    .innerJoin(channels, eq(channelMembers.channelId, channels.id))
    .where(
      and(
        eq(channelMembers.userId, user.id),
        eq(channels.orgId, user.orgId),
        eq(channels.isArchived, false),
      ),
    );

  return NextResponse.json(memberships.map((m) => m.channel));
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const parsed = validate(ChannelSchema, await req.json());
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  // Check if channel name already exists in this org
  const [existing] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.orgId, user.orgId), eq(channels.name, body.name)));

  if (existing) {
    return NextResponse.json({ error: `A channel named "${body.name}" already exists.` }, { status: 409 });
  }

  const [channel] = await db
    .insert(channels)
    .values({
      orgId: user.orgId,
      name: body.name,
      description: body.description,
      type: body.type,
      claudeEnabled: body.claudeEnabled ?? true,
      createdBy: user.id,
    })
    .returning();

  await db.insert(channelMembers).values({
    channelId: channel.id,
    userId: user.id,
    orgId: user.orgId,
    role: 'admin',
  });

  return NextResponse.json(channel, { status: 201 });
}
