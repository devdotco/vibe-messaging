import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { claudeRolePolicies } from '@/lib/db/schema/messaging';
import { getCurrentUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

function isAdminUser(role: string, isPlatformUser: boolean | null | undefined) {
  return role === 'PLATFORM_ADMIN' || role === 'ENTITY_ADMIN' || isPlatformUser === true;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!isAdminUser(user.role, user.isPlatformUser)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const policies = await db
    .select()
    .from(claudeRolePolicies)
    .where(eq(claudeRolePolicies.orgId, user.orgId));

  return NextResponse.json(policies);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!isAdminUser(user.role, user.isPlatformUser)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { role, dataDomain, allowed } = await req.json();
  if (!role || !dataDomain) {
    return NextResponse.json({ error: 'role and dataDomain are required' }, { status: 400 });
  }

  const [policy] = await db
    .insert(claudeRolePolicies)
    .values({ orgId: user.orgId, role, dataDomain, allowed: allowed ?? false })
    .onConflictDoUpdate({
      target: [claudeRolePolicies.orgId, claudeRolePolicies.role, claudeRolePolicies.dataDomain],
      set: { allowed: allowed ?? false },
    })
    .returning();

  return NextResponse.json(policy, { status: 201 });
}
