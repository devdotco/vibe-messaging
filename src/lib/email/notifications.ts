import { Resend } from 'resend';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? 'ViBe Messaging <notifications@dev.co>';
const REPLY_DOMAIN = process.env.EMAIL_REPLY_DOMAIN ?? 'reply.vb.co';
const REPLY_SECRET = process.env.EMAIL_REPLY_SECRET ?? 'dev-secret';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://chat.vb.co';

function replyToken(type: string, entityId: string, recipientEmail: string) {
  return crypto.createHmac('sha256', REPLY_SECRET)
    .update(`${type}:${entityId}:${recipientEmail}`)
    .digest('hex').slice(0, 16);
}

function replyAddress(type: string, entityId: string, recipientEmail: string) {
  return `reply+${type}-${entityId}-${replyToken(type, entityId, recipientEmail)}@${REPLY_DOMAIN}`;
}

export function verifyReplyAddress(toAddress: string, fromEmail: string): { type: string; entityId: string } | null {
  const match = toAddress.match(/reply\+(\w+)-([0-9a-f-]+)-([0-9a-f]+)@/);
  if (!match) return null;
  const [, type, entityId, token] = match;
  const expected = replyToken(type!, entityId!, fromEmail);
  if (expected !== token) return null;
  return { type: type!, entityId: entityId! };
}

export function stripQuotedReply(text: string): string {
  const patterns = [
    /\r?\nOn .{5,100} wrote:\r?\n/,
    /\r?\n[-_]{3,} *Original Message *[-_]{3,}/i,
    /\r?\nFrom: .+/,
    /\r?\n>[ \t]/,
  ];
  let cutAt = text.length;
  for (const p of patterns) {
    const m = text.search(p);
    if (m > 0 && m < cutAt) cutAt = m;
  }
  return text.slice(0, cutAt).trim();
}

interface MentionNotificationData {
  channelId: string;
  channelName: string;
  messageText: string;
  senderName: string;
  recipientEmail: string;
  recipientName: string;
  channelUrl: string;
}

async function sendNotification(to: string, subject: string, html: string, replyTo: string) {
  if (!process.env.RESEND_API_KEY) return;
  await resend.emails.send({ from: FROM, to, subject, html, replyTo }).catch(console.error);
}

export async function sendMentionEmail(data: MentionNotificationData) {
  const replyTo = replyAddress('channel', data.channelId, data.recipientEmail);
  await sendNotification(
    data.recipientEmail,
    `${data.senderName} mentioned you in #${data.channelName}`,
    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="font-size:18px;margin-bottom:8px">💬 You were mentioned</h2>
      <p style="color:#666;margin-bottom:16px">${data.senderName} mentioned you in <strong>#${data.channelName}</strong>:</p>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px">
        <p style="color:#374151;margin:0">${data.messageText}</p>
      </div>
      <a href="${data.channelUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Open in ViBe Messaging</a>
      <p style="color:#9ca3af;font-size:12px;margin-top:24px">Reply to this email to respond in the channel without logging in.</p>
    </div>`,
    replyTo
  );
}
