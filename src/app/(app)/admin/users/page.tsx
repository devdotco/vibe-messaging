import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/messaging';
import { desc } from 'drizzle-orm';
import { UsersAdminClient } from './users-admin-client';

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  if (!['PLATFORM_ADMIN', 'ENTITY_ADMIN'].includes(user.role)) redirect('/');

  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      orgId: users.orgId,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return <UsersAdminClient initialUsers={allUsers} currentUserId={user.id} />;
}
