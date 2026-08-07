import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { airbyteConnections } from '@/lib/db/schema/messaging';
import { eq } from 'drizzle-orm';
import { formatDistanceToNow } from 'date-fns';

export default async function AirbytePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  if (!['PLATFORM_ADMIN', 'ENTITY_ADMIN'].includes(user.role) && !user.isPlatformUser) redirect('/');

  const connections = await db
    .select()
    .from(airbyteConnections)
    .where(eq(airbyteConnections.orgId, user.orgId));

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Airbyte Connections</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Data sync connections for Claude&apos;s warehouse context</p>
        </div>
        <a
          href={process.env.NEXT_PUBLIC_AIRBYTE_URL ?? 'https://cloud.airbyte.com'}
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
        >
          Configure in Airbyte
        </a>
      </div>

      {connections.length === 0 ? (
        <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-8 text-center">
          <div className="text-4xl mb-4">🔌</div>
          <h3 className="font-semibold text-[var(--text-primary)] mb-2">No connections yet</h3>
          <p className="text-sm text-[var(--text-muted)] max-w-sm mx-auto">
            Airbyte data sync connections will appear here once configured. Connect your data warehouse to give Claude access to your organization data.
          </p>
        </div>
      ) : (
        <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <span className="text-sm font-semibold text-[var(--text-primary)]">{connections.length} connection{connections.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {connections.map((conn) => (
              <div key={conn.id} className="px-4 py-3 flex items-center gap-4">
                <div
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: conn.syncStatus === 'succeeded' ? 'var(--online)' : conn.syncStatus === 'failed' ? 'var(--negative)' : 'var(--away)' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--text-primary)] truncate">{conn.displayName}</div>
                  <div className="text-xs text-[var(--text-muted)] truncate">
                    {conn.sourceType} → {conn.warehouseSchema}
                    {conn.dataDomains && conn.dataDomains.length > 0 && (
                      <> · domains: {conn.dataDomains.join(', ')}</>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-xs font-medium capitalize ${
                    conn.syncStatus === 'succeeded' ? 'text-[var(--positive)]' :
                    conn.syncStatus === 'failed' ? 'text-[var(--negative)]' :
                    'text-[var(--text-muted)]'
                  }`}>
                    {conn.syncStatus ?? 'unknown'}
                  </div>
                  {conn.lastSyncedAt && (
                    <div className="text-[10px] text-[var(--text-muted)]">
                      {formatDistanceToNow(new Date(conn.lastSyncedAt), { addSuffix: true })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
