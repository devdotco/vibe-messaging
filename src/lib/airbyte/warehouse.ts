import { Pool } from 'pg';
import { db } from '@/lib/db';
import { claudeRolePolicies } from '@/lib/db/schema/messaging';
import { and, eq } from 'drizzle-orm';

const warehousePool = new Pool({ connectionString: process.env.DATABASE_URL });

export type DataDomain =
  | 'financial.transactions' | 'financial.reports' | 'financial.payroll'
  | 'financial.budgets' | 'financial.invoices'
  | 'deals.overview' | 'deals.documents' | 'deals.diligence' | 'deals.valuation'
  | 'hr.headcount' | 'hr.employee_records' | 'hr.compensation'
  | 'ops.orders' | 'ops.clients' | 'ops.inventory' | 'ops.work_orders'
  | 'projects.tasks' | 'projects.overview'
  | 'analytics.usage' | 'messages.history';

export async function getUserAllowedDomains(
  orgId: string,
  userRole: string,
): Promise<DataDomain[]> {
  let policies = await db
    .select()
    .from(claudeRolePolicies)
    .where(
      and(
        eq(claudeRolePolicies.orgId, orgId),
        eq(claudeRolePolicies.role, userRole),
        eq(claudeRolePolicies.allowed, true),
      ),
    );

  if (policies.length === 0) {
    policies = await db
      .select()
      .from(claudeRolePolicies)
      .where(
        and(
          eq(claudeRolePolicies.orgId, 'platform_default'),
          eq(claudeRolePolicies.role, userRole),
          eq(claudeRolePolicies.allowed, true),
        ),
      );
  }

  return policies.map((p) => p.dataDomain as DataDomain);
}

export async function queryWarehouseForContext(
  orgId: string,
  allowedDomains: DataDomain[],
  _userQuery: string,
): Promise<{ domain: DataDomain; data: Record<string, unknown>[]; summary: string }[]> {
  const results: { domain: DataDomain; data: Record<string, unknown>[]; summary: string }[] = [];

  if (allowedDomains.includes('financial.transactions')) {
    try {
      const { rows } = await warehousePool.query(
        `SELECT date, description, amount, category, account_name
         FROM fcfo_ai.transactions
         WHERE tenant_id = $1
           AND _airbyte_extracted_at > NOW() - INTERVAL '30 days'
         ORDER BY date DESC LIMIT 30`,
        [orgId],
      );
      if (rows.length > 0) {
        results.push({ domain: 'financial.transactions', data: rows, summary: `${rows.length} recent transactions` });
      }
    } catch { /* table may not exist in dev */ }
  }

  if (allowedDomains.includes('financial.reports')) {
    try {
      const { rows } = await warehousePool.query(
        `SELECT period_start, period_end, report_type, data
         FROM fcfo_ai.financial_reports
         WHERE tenant_id = $1
         ORDER BY period_end DESC LIMIT 5`,
        [orgId],
      );
      if (rows.length > 0) {
        results.push({ domain: 'financial.reports', data: rows, summary: `${rows.length} financial reports` });
      }
    } catch { /* table may not exist in dev */ }
  }

  if (allowedDomains.includes('projects.tasks')) {
    try {
      const { rows } = await warehousePool.query(
        `SELECT title, status, priority, due_date, assignee_id
         FROM app_dev_co.tasks
         WHERE org_id = $1
           AND status NOT IN ('completed', 'cancelled')
           AND (due_date IS NULL OR due_date > NOW() - INTERVAL '7 days')
         ORDER BY due_date ASC NULLS LAST LIMIT 25`,
        [orgId],
      );
      if (rows.length > 0) {
        results.push({ domain: 'projects.tasks', data: rows, summary: `${rows.length} active tasks` });
      }
    } catch { /* table may not exist in dev */ }
  }

  if (allowedDomains.includes('ops.clients')) {
    try {
      const { rows } = await warehousePool.query(
        `SELECT name, email, status, created_at
         FROM app_dev_co.clients
         WHERE org_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [orgId],
      );
      if (rows.length > 0) {
        results.push({ domain: 'ops.clients', data: rows, summary: `${rows.length} clients` });
      }
    } catch { /* table may not exist in dev */ }
  }

  if (allowedDomains.includes('deals.overview')) {
    try {
      const { rows } = await warehousePool.query(
        `SELECT name, stage, status, transaction_type, created_at
         FROM app_vdr_ai.deals
         WHERE tenant_id = $1 AND status != 'DELETED'
         ORDER BY created_at DESC LIMIT 15`,
        [orgId],
      );
      if (rows.length > 0) {
        results.push({ domain: 'deals.overview', data: rows, summary: `${rows.length} deals` });
      }
    } catch { /* table may not exist in dev */ }
  }

  return results;
}
