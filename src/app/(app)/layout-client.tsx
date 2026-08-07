'use client';
import React, { useState } from 'react';
import { Sidebar, type DmEntry } from '@/components/layout/sidebar';
import { NotificationsDrawer } from '@/components/messaging/notifications-drawer';
import type { Channel, User } from '@/lib/db/schema/messaging';

interface Props {
  channels: Channel[];
  dms: DmEntry[];
  currentUser: User;
  workspaceName: string;
  unreadCounts: Record<string, number>;
  notificationCount: number;
}

export function AppLayoutClient({ channels, dms, currentUser, workspaceName, unreadCounts, notificationCount }: Props) {
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <>
      <Sidebar
        channels={channels}
        dms={dms}
        currentUser={currentUser}
        workspaceName={workspaceName}
        unreadCounts={unreadCounts}
        notificationCount={notificationCount}
        onOpenNotifications={() => setShowNotifications(true)}
      />
      {showNotifications && (
        <NotificationsDrawer onClose={() => setShowNotifications(false)} />
      )}
    </>
  );
}
