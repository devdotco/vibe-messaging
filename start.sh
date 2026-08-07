#!/bin/sh
set -e

echo "[startup] Running migrations..."
# Convert drizzle SQL (remove statement-breakpoint markers) and apply
sed 's/--> statement-breakpoint/;/g' db/migrations/0000_init.sql | \
  psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=0 2>&1 | \
  grep -v "^psql\|already exists\|duplicate" || true
echo "[startup] Migrations done."

echo "[startup] Seeding Claude bot + RBAC policies..."
psql "$DATABASE_URL" -v bot_id="$CLAUDE_BOT_USER_ID" <<'SQL'
-- Claude bot user
INSERT INTO users (id, org_id, email, name, status, role, is_platform_user)
VALUES (:'bot_id', 'platform_default', 'claude@vibe.ai', 'Claude', 'active', 'PLATFORM_ADMIN', true)
ON CONFLICT (id) DO NOTHING;

-- RBAC policies
INSERT INTO claude_role_policies (org_id, role, data_domain, allowed) VALUES
('platform_default','PLATFORM_ADMIN','financial.transactions',true),
('platform_default','PLATFORM_ADMIN','financial.reports',true),
('platform_default','PLATFORM_ADMIN','financial.payroll',true),
('platform_default','PLATFORM_ADMIN','financial.budgets',true),
('platform_default','PLATFORM_ADMIN','financial.invoices',true),
('platform_default','PLATFORM_ADMIN','deals.overview',true),
('platform_default','PLATFORM_ADMIN','deals.documents',true),
('platform_default','PLATFORM_ADMIN','deals.diligence',true),
('platform_default','PLATFORM_ADMIN','deals.valuation',true),
('platform_default','PLATFORM_ADMIN','hr.headcount',true),
('platform_default','PLATFORM_ADMIN','hr.employee_records',true),
('platform_default','PLATFORM_ADMIN','hr.compensation',true),
('platform_default','PLATFORM_ADMIN','ops.orders',true),
('platform_default','PLATFORM_ADMIN','ops.clients',true),
('platform_default','PLATFORM_ADMIN','ops.inventory',true),
('platform_default','PLATFORM_ADMIN','ops.work_orders',true),
('platform_default','PLATFORM_ADMIN','projects.tasks',true),
('platform_default','PLATFORM_ADMIN','projects.overview',true),
('platform_default','PLATFORM_ADMIN','analytics.usage',true),
('platform_default','PLATFORM_ADMIN','messages.history',true),
('platform_default','ENTITY_ADMIN','financial.transactions',true),
('platform_default','ENTITY_ADMIN','financial.reports',true),
('platform_default','ENTITY_ADMIN','financial.budgets',true),
('platform_default','ENTITY_ADMIN','financial.invoices',true),
('platform_default','ENTITY_ADMIN','deals.overview',true),
('platform_default','ENTITY_ADMIN','hr.headcount',true),
('platform_default','ENTITY_ADMIN','ops.orders',true),
('platform_default','ENTITY_ADMIN','ops.clients',true),
('platform_default','ENTITY_ADMIN','ops.inventory',true),
('platform_default','ENTITY_ADMIN','ops.work_orders',true),
('platform_default','ENTITY_ADMIN','projects.tasks',true),
('platform_default','ENTITY_ADMIN','projects.overview',true),
('platform_default','FINANCE','financial.transactions',true),
('platform_default','FINANCE','financial.reports',true),
('platform_default','FINANCE','financial.payroll',true),
('platform_default','FINANCE','financial.budgets',true),
('platform_default','FINANCE','financial.invoices',true),
('platform_default','FINANCE','ops.orders',true),
('platform_default','HR_ADMIN','hr.headcount',true),
('platform_default','HR_ADMIN','hr.employee_records',true),
('platform_default','HR_ADMIN','hr.compensation',true),
('platform_default','HR_ADMIN','financial.payroll',true),
('platform_default','PROJECT_MANAGER','projects.tasks',true),
('platform_default','PROJECT_MANAGER','projects.overview',true),
('platform_default','PROJECT_MANAGER','ops.work_orders',true),
('platform_default','PROJECT_MANAGER','hr.headcount',true),
('platform_default','SALES','deals.overview',true),
('platform_default','SALES','ops.orders',true),
('platform_default','SALES','ops.clients',true),
('platform_default','ANALYST','deals.overview',true),
('platform_default','ANALYST','deals.documents',true),
('platform_default','ANALYST','financial.reports',true),
('platform_default','ANALYST','projects.overview',true),
('platform_default','TEAM_MEMBER','projects.tasks',true),
('platform_default','TEAM_MEMBER','ops.work_orders',true),
('platform_default','TEAM_MEMBER','messages.history',true),
('platform_default','VIEWER','messages.history',true),
('platform_default','GUEST','messages.history',true)
ON CONFLICT (org_id, role, data_domain) DO NOTHING;

-- Default channels
WITH ins AS (
  INSERT INTO channels (org_id, name, type, is_default, claude_enabled)
  VALUES
    ('platform_default','general','public',true,true),
    ('platform_default','announcements','announcement',false,true),
    ('platform_default','random','public',false,true)
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO channel_members (channel_id, user_id, org_id, role)
SELECT id, :'bot_id', 'platform_default', 'member' FROM ins
ON CONFLICT DO NOTHING;

SQL
echo "[startup] Seed done."

echo "[startup] Starting Next.js..."
exec node server.js
