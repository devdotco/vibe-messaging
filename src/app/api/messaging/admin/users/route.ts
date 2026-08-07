import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, channels, channelMembers } from '@/lib/db/schema/messaging';
import { getCurrentUser } from '@/lib/auth/session';
import { eq, desc } from 'drizzle-orm';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!['PLATFORM_ADMIN', 'ENTITY_ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      orgId: users.orgId,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return NextResponse.json(allUsers);
}

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!['PLATFORM_ADMIN', 'ENTITY_ADMIN'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, role, orgId } = body as { name: string; email: string; role: string; orgId?: string };

  if (!name || !email || !role) {
    return NextResponse.json({ error: 'name, email and role are required' }, { status: 400 });
  }

  const resolvedOrgId = orgId ?? 'platform_default';

  const [newUser] = await db
    .insert(users)
    .values({ name, email, role, orgId: resolvedOrgId, status: 'active' })
    .returning();

  // Auto-join all default channels for this org
  const defaultChannels = await db
    .select()
    .from(channels)
    .where(eq(channels.isDefault, true));

  for (const ch of defaultChannels) {
    await db.insert(channelMembers).values({
      channelId: ch.id,
      userId: newUser.id,
      orgId: resolvedOrgId,
      role: 'member',
    }).onConflictDoNothing();
  }

  // Send invite email
  try {
    const magicLink = `https://chat.vb.co/api/auth/magic?secret=${process.env.BYPASS_SECRET}&email=${encodeURIComponent(email)}`;
    await resend.emails.send({
      from: 'ViBe <noreply@dev.co>',
      to: email,
      subject: `You've been invited to ViBe Messaging`,
      html: `<p>Hi ${name},</p><p>You've been invited to join ViBe Messaging.</p><p><a href="${magicLink}" style="background:#2f5cff;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Accept Invite &amp; Sign In</a></p><p>Or copy this link: ${magicLink}</p>`,
    });
  } catch (err) {
    console.error('Failed to send invite email:', err);
    // Non-fatal — user was still created
  }

  return NextResponse.json(newUser, { status: 201 });
}
