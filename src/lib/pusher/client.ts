'use client';
import PusherClient from 'pusher-js';
import { withBase } from '@/lib/base-path';

let client: PusherClient | null = null;

export function getPusherClient(): PusherClient {
  if (!client) {
    client = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      // Every channel is `private-` (see lib/pusher/channels.ts), so pusher-js
      // must reach our auth route; its default `/pusher/auth` is outside /chat.
      channelAuthorization: { endpoint: withBase('/api/messaging/pusher'), transport: 'ajax' },
    });
  }
  return client;
}
