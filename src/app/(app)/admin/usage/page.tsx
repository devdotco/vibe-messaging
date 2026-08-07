import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { claudeUsageLog } from '@/lib/db/schema/messaging';
import { eq, gte, and, desc, sum, count, sql } from 'drizzle-orm';
import { formatCost } from '@/lib/utils';

export default async function UsageDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  if (!['PLATFORM_ADMIN', 'ENTITY_ADMIN'].includes(user.role)) redirect('/');

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // Scoped to the current org
  const [todayStats] = await db
    .select({ tokens: sum(sql`${claudeUsageLog.inputTokens} + ${claudeUsageLog.outputTokens}`), cost: sum(claudeUsageLog.costUsd), calls: count() })
    .from(claudeUsageLog)
    .where(and(eq(claudeUsageLog.orgId, user.orgId), gte(claudeUsageLog.createdAt, today)));

  const [monthStats] = await db
    .select({ tokens: sum(sql`${claudeUsageLog.inputTokens} + ${claudeUsageLog.outputTokens}`), cost: sum(claudeUsageLog.costUsd), calls: count() })
    .from(claudeUsageLog)
    .where(and(eq(claudeUsageLog.orgId, user.orgId), gte(claudeUsageLog.createdAt, monthStart)));

  const recentLogs = await db.select().from(claudeUsageLog).where(eq(claudeUsageLog.orgId, user.orgId)).orderBy(desc(claudeUsageLog.createdAt)).limit(50);

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-lg font-bold text-[var(--text-primary)] mb-6">Claude Usage Dashboard</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Tokens Today', value: Number(todayStats.tokens ?? 0).toLocaleString() },
          { label: 'Cost Today', value: formatCost(Number(todayStats.cost ?? 0)) },
          { label: 'Calls This Month', value: Number(monthStats.calls ?? 0).toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-xs text-[var(--text-muted)] mb-1">{label}</div>
            <div className="text-2xl font-bold text-[var(--text-primary)] font-mono">{value}</div>
          </div>
        ))}
      </div>

      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Recent Calls</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--text-muted)] text-left border-b border-[var(--border)]">
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2">Tokens</th>
                <th className="px-4 py-2">Cost</th>
                <th className="px-4 py-2">Domains</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.map((log) => (
                <tr key={log.id} className="border-b border-[var(--border)] hover:bg-[var(--panel-hover)]">
                  <td className="px-4 py-2 font-mono text-[var(--text-muted)]">{log.createdAt?.toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono">{(log.inputTokens + log.outputTokens).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono">{formatCost(Number(log.costUsd))}</td>
                  <td className="px-4 py-2 text-[var(--text-muted)]">{log.domainsAccessed?.join(', ') ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
