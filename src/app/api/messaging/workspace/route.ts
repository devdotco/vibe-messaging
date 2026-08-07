import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { workspaces } from '@/lib/db/schema/messaging';
import { getCurrentUser } from '@/lib/auth/session';
import { eq } from 'drizzle-orm';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.orgId, user.orgId)).limit(1);
  return NextResponse.json({ workspace: ws ?? null });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const [existing] = await db.select().from(workspaces).where(eq(workspaces.orgId, user.orgId)).limit(1);
  if (existing) {
    const [updated] = await db.update(workspaces)
      .set({ name: name.trim(), updatedAt: new Date() })
      .where(eq(workspaces.id, existing.id))
      .returning();
    return NextResponse.json({ workspace: updated });
  } else {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const [created] = await db.insert(workspaces)
      .values({ orgId: user.orgId, name: name.trim(), slug: `${slug}-${Date.now()}` })
      .returning();
    return NextResponse.json({ workspace: created });
  }
}
