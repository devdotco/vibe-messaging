import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { claudeUsageLog } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { eq, and, gte, sum, count, sql } from 'drizzle-orm';

export async function GET() {
  const user = await requireUser();

  if (!['PLATFORM_ADMIN', 'ENTITY_ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [todayStats] = await db
    .select({
      tokens: sum(sql`${claudeUsageLog.inputTokens} + ${claudeUsageLog.outputTokens}`),
      cost: sum(claudeUsageLog.costUsd),
      calls: count(),
    })
    .from(claudeUsageLog)
    .where(and(eq(claudeUsageLog.orgId, user.orgId), gte(claudeUsageLog.createdAt, today)));

  const [monthStats] = await db
    .select({
      tokens: sum(sql`${claudeUsageLog.inputTokens} + ${claudeUsageLog.outputTokens}`),
      cost: sum(claudeUsageLog.costUsd),
      calls: count(),
    })
    .from(claudeUsageLog)
    .where(and(eq(claudeUsageLog.orgId, user.orgId), gte(claudeUsageLog.createdAt, monthStart)));

  const recentLogs = await db
    .select()
    .from(claudeUsageLog)
    .where(eq(claudeUsageLog.orgId, user.orgId))
    .orderBy(sql`${claudeUsageLog.createdAt} desc`)
    .limit(100);

  return NextResponse.json({ today: todayStats, month: monthStats, recentLogs });
}
