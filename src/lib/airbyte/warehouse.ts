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

const DOMAIN_NO_DATA_MESSAGES: Partial<Record<DataDomain, string>> = {
  'financial.payroll': 'No payroll data configured for this org yet.',
  'financial.budgets': 'No budget data configured for this org yet.',
  'financial.invoices': 'No invoice data configured for this org yet.',
  'deals.documents': 'No deal documents configured for this org yet.',
  'deals.diligence': 'No diligence data configured for this org yet.',
  'deals.valuation': 'No valuation data configured for this org yet.',
  'hr.headcount': 'No headcount data configured for this org yet.',
  'hr.employee_records': 'No employee records configured for this org yet.',
  'hr.compensation': 'No compensation data configured for this org yet.',
  'ops.orders': 'No orders data configured for this org yet.',
  'ops.inventory': 'No inventory data configured for this org yet.',
  'ops.work_orders': 'No work orders data configured for this org yet.',
  'projects.overview': 'No project overview data configured for this org yet.',
  'analytics.usage': 'No analytics data configured for this org yet.',
  'messages.history': 'Message history access is provided directly via channel context.',
};

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

  // Helper: add a structured stub for domains with no live query
  function addStub(domain: DataDomain) {
    if (allowedDomains.includes(domain)) {
      const message = DOMAIN_NO_DATA_MESSAGES[domain] ?? `No data configured for ${domain}.`;
      results.push({
        domain,
        data: [],
        summary: message,
      });
    }
  }

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
      } else {
        addStub('financial.transactions');
      }
    } catch { addStub('financial.transactions'); }
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
      } else {
        addStub('financial.reports');
      }
    } catch { addStub('financial.reports'); }
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
      } else {
        addStub('projects.tasks');
      }
    } catch { addStub('projects.tasks'); }
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
      } else {
        addStub('ops.clients');
      }
    } catch { addStub('ops.clients'); }
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
      } else {
        addStub('deals.overview');
      }
    } catch { addStub('deals.overview'); }
  }

  // Structured stubs for domains without live queries
  (
    [
      'financial.payroll', 'financial.budgets', 'financial.invoices',
      'deals.documents', 'deals.diligence', 'deals.valuation',
      'hr.headcount', 'hr.employee_records', 'hr.compensation',
      'ops.orders', 'ops.inventory', 'ops.work_orders',
      'projects.overview', 'analytics.usage', 'messages.history',
    ] as DataDomain[]
  ).forEach(addStub);

  return results;
}
