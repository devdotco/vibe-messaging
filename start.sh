#!/bin/sh
set -e

echo "[startup] Running migrations..."
# Convert drizzle SQL (remove statement-breakpoint markers) and apply
sed 's/--> statement-breakpoint/;/g' db/migrations/0000_init.sql | \
  psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=0 2>&1 | \
  grep -v "^psql\|already exists\|duplicate" || true
sed 's/--> statement-breakpoint/;/g' db/migrations/0001_messages_mention_cols.sql | \
  psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=0 2>&1 | \
  grep -v "^psql\|already exists\|duplicate" || true
echo "[startup] Migrations done."

echo "[startup] Adding pin columns if missing..."
psql "$DATABASE_URL" <<'PIN_SQL'
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_by uuid;
PIN_SQL
echo "[startup] Pin columns done."

echo "[startup] Adding email source column if missing..."
psql "$DATABASE_URL" <<'SOURCE_SQL'
ALTER TABLE messages ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';
SOURCE_SQL
echo "[startup] Email source column done."

echo "[startup] Deduplicating channels..."
psql "$DATABASE_URL" <<'DEDUP'
-- Keep only the earliest channel per (org_id, name), delete the rest
DELETE FROM channels
WHERE id NOT IN (
  SELECT DISTINCT ON (org_id, name) id
  FROM channels
  ORDER BY org_id, name, created_at ASC
);
DEDUP

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

-- Default channels (idempotent — skip if name already exists for org)
DO $$
DECLARE
  ch_id uuid;
  ch_name text;
  ch_type text;
  ch_default boolean;
BEGIN
  FOREACH ch_name, ch_type, ch_default IN ARRAY
    ARRAY[ARRAY['general','public','true'], ARRAY['announcements','announcement','false'], ARRAY['random','public','false']]
  LOOP
    SELECT id INTO ch_id FROM channels WHERE org_id='platform_default' AND name=ch_name LIMIT 1;
    IF ch_id IS NULL THEN
      INSERT INTO channels (org_id, name, type, is_default, claude_enabled)
      VALUES ('platform_default', ch_name, ch_type, ch_default::boolean, true)
      RETURNING id INTO ch_id;
    END IF;
    INSERT INTO channel_members (channel_id, user_id, org_id, role)
    VALUES (ch_id, :'bot_id', 'platform_default', 'member')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

SQL
echo "[startup] Seed done."

echo "[startup] Starting Next.js..."
exec node server.js
