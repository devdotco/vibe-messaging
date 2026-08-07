import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/lib/db/schema/messaging';
import { eq, and } from 'drizzle-orm';

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, { schema });

const CLAUDE_BOT_USER_ID = process.env.CLAUDE_BOT_USER_ID!;
const ORG_ID = 'platform_default';

const ROLE_POLICIES: { role: string; domains: string[] }[] = [
  {
    role: 'PLATFORM_ADMIN',
    domains: [
      'financial.transactions', 'financial.reports', 'financial.payroll', 'financial.budgets', 'financial.invoices',
      'deals.overview', 'deals.documents', 'deals.diligence', 'deals.valuation',
      'hr.headcount', 'hr.employee_records', 'hr.compensation',
      'ops.orders', 'ops.clients', 'ops.inventory', 'ops.work_orders',
      'projects.tasks', 'projects.overview', 'analytics.usage', 'messages.history',
    ],
  },
  {
    role: 'ENTITY_ADMIN',
    domains: [
      'financial.transactions', 'financial.reports', 'financial.budgets', 'financial.invoices',
      'deals.overview', 'hr.headcount',
      'ops.orders', 'ops.clients', 'ops.inventory', 'ops.work_orders',
      'projects.tasks', 'projects.overview',
    ],
  },
  {
    role: 'FINANCE',
    domains: [
      'financial.transactions', 'financial.reports', 'financial.payroll', 'financial.budgets', 'financial.invoices',
      'ops.orders',
    ],
  },
  {
    role: 'HR_ADMIN',
    domains: ['hr.headcount', 'hr.employee_records', 'hr.compensation', 'financial.payroll'],
  },
  {
    role: 'PROJECT_MANAGER',
    domains: ['projects.tasks', 'projects.overview', 'ops.work_orders', 'hr.headcount'],
  },
  {
    role: 'SALES',
    domains: ['deals.overview', 'ops.orders', 'ops.clients'],
  },
  {
    role: 'ANALYST',
    domains: ['deals.overview', 'deals.documents', 'financial.reports', 'projects.overview'],
  },
  {
    role: 'TEAM_MEMBER',
    domains: ['projects.tasks', 'ops.work_orders', 'messages.history'],
  },
  {
    role: 'VIEWER',
    domains: ['messages.history'],
  },
  {
    role: 'GUEST',
    domains: ['messages.history'],
  },
];

async function seed() {
  console.log('🌱 Seeding...');

  // 1. Claude bot user
  if (!CLAUDE_BOT_USER_ID) throw new Error('CLAUDE_BOT_USER_ID env var required');

  await db.insert(schema.users).values({
    id: CLAUDE_BOT_USER_ID,
    orgId: ORG_ID,
    email: 'claude@vibe.ai',
    name: 'Claude',
    status: 'active',
    role: 'PLATFORM_ADMIN',
    isPlatformUser: true,
  }).onConflictDoNothing();

  console.log('✅ Claude bot user seeded');

  // 2. RBAC policies
  for (const { role, domains } of ROLE_POLICIES) {
    for (const domain of domains) {
      await db.insert(schema.claudeRolePolicies).values({
        orgId: ORG_ID,
        role,
        dataDomain: domain,
        allowed: true,
      }).onConflictDoNothing();
    }
  }
  console.log('✅ RBAC policies seeded');

  // 3. Default workspace
  const [workspace] = await db.insert(schema.workspaces).values({
    orgId: ORG_ID,
    name: 'ViBe',
    slug: 'vibe',
  }).onConflictDoNothing().returning();

  const wsId = workspace?.id;

  // 4. Default channels
  const defaultChannels = [
    { name: 'general', description: 'Company-wide announcements and discussion', isDefault: true },
    { name: 'announcements', description: 'Important company announcements', type: 'announcement' as const },
    { name: 'random', description: 'Non-work discussion' },
  ];

  for (const ch of defaultChannels) {
    const [channel] = await db.insert(schema.channels).values({
      orgId: ORG_ID,
      workspaceId: wsId,
      name: ch.name,
      description: ch.description,
      type: (ch as { type?: string }).type ?? 'public',
      isDefault: ch.isDefault ?? false,
      claudeEnabled: true,
      createdBy: CLAUDE_BOT_USER_ID,
    }).onConflictDoNothing().returning();

    if (channel) {
      // Add Claude bot as member of every channel
      await db.insert(schema.channelMembers).values({
        channelId: channel.id,
        userId: CLAUDE_BOT_USER_ID,
        orgId: ORG_ID,
        role: 'member',
      }).onConflictDoNothing();
    }
  }

  console.log('✅ Default channels seeded');
  console.log('🎉 Seed complete');
  await pool.end();
}

seed().catch((err) => { console.error(err); process.exit(1); });
