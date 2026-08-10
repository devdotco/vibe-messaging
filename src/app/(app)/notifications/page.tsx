import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { NotificationsPage } from './notifications-page-client';

export default async function NotificationsRoute() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  return <NotificationsPage />;
}
