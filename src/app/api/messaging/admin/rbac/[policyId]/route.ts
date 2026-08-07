import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { claudeRolePolicies } from '@/lib/db/schema/messaging';
import { getCurrentUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

function isAdminUser(role: string, isPlatformUser: boolean | null | undefined) {
  return role === 'PLATFORM_ADMIN' || role === 'ENTITY_ADMIN' || isPlatformUser === true;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ policyId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!isAdminUser(user.role, user.isPlatformUser)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { policyId } = await params;
  const { allowed } = await req.json();

  const [updated] = await db
    .update(claudeRolePolicies)
    .set({ allowed })
    .where(and(eq(claudeRolePolicies.id, policyId), eq(claudeRolePolicies.orgId, user.orgId)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ policyId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!isAdminUser(user.role, user.isPlatformUser)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { policyId } = await params;

  await db
    .delete(claudeRolePolicies)
    .where(and(eq(claudeRolePolicies.id, policyId), eq(claudeRolePolicies.orgId, user.orgId)));

  return new NextResponse(null, { status: 204 });
}
