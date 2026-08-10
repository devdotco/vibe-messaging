import sgMail from '@sendgrid/mail';
import crypto from 'crypto';

// SendGrid requires { email, name } object — not "Name <email>" string format
function parseFrom(s: string): { email: string; name?: string } {
  const m = s.match(/^(.+?)\s*<([^>]+)>$/);
  return m ? { name: m[1].trim(), email: m[2].trim() } : { email: s.trim() };
}
const FROM = parseFrom(process.env.EMAIL_FROM ?? 'ViBe Messaging <notifications@vb.co>');
const REPLY_DOMAIN = process.env.EMAIL_REPLY_DOMAIN ?? 'reply.vb.co';
const REPLY_SECRET = process.env.EMAIL_REPLY_SECRET ?? 'dev-secret';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://chat.vb.co';

// Strip plus-addressing (e.g. user+tag@gmail.com → user@gmail.com) before hashing
// so that Gmail alias recipients can reply from their base address and still verify.
function normalizeEmail(email: string) {
  const [local, domain] = email.split('@');
  return `${(local ?? '').replace(/\+.*$/, '')}@${domain ?? ''}`.toLowerCase();
}

function replyToken(type: string, entityId: string, recipientEmail: string) {
  return crypto.createHmac('sha256', REPLY_SECRET)
    .update(`${type}:${entityId}:${normalizeEmail(recipientEmail)}`)
    .digest('hex').slice(0, 16);
}

// Single-char type codes keep local part ≤64 chars (RFC 5321 limit)
const TYPE_ENCODE: Record<string, string> = { channel: 'c', dm: 'd' };
const TYPE_DECODE: Record<string, string> = { c: 'channel', d: 'dm' };

function replyAddress(type: string, entityId: string, recipientEmail: string) {
  const code = TYPE_ENCODE[type] ?? type[0]!;
  const shortId = entityId.replace(/-/g, ''); // UUID without dashes: 32 chars
  return `reply+${code}-${shortId}-${replyToken(type, entityId, recipientEmail)}@${REPLY_DOMAIN}`;
}

function restoreUuid(s: string) {
  return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}

export function verifyReplyAddress(toAddress: string, fromEmail: string): { type: string; entityId: string } | null {
  const match = toAddress.match(/reply\+([a-z])-([0-9a-f]{32})-([0-9a-f]{16})@/);
  if (!match) return null;
  const [, code, shortId, token] = match;
  const type = TYPE_DECODE[code!] ?? code!;
  const entityId = restoreUuid(shortId!);
  const expected = replyToken(type, entityId, fromEmail);
  if (expected !== token) return null;
  return { type, entityId };
}

export function stripQuotedReply(text: string): string {
  const patterns = [
    /\r?\n--[ \t]*\r?\n/,                          // RFC 3676 signature delimiter: -- on its own line
    /\r?\nOn .{5,100} wrote:\r?\n/,                 // Gmail/Outlook quote header
    /\r?\n[-_]{3,} *Original Message *[-_]{3,}/i,   // Outlook original message
    /\r?\nFrom: .+/,                                // bare From: line
    /\r?\n>[ \t]/,                                  // quoted text
    /\r?\nSent from my /i,                          // mobile signature
    /\r?\nGet Outlook for /i,                       // Outlook mobile
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
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return;
  sgMail.setApiKey(apiKey);
  await sgMail.send({ from: FROM, to, subject, html, replyTo }).catch(console.error);
}

interface DmNotificationData {
  conversationId: string;
  messageText: string;
  senderName: string;
  recipientEmail: string;
  recipientName: string;
  dmUrl: string;
}

export async function sendDmEmail(data: DmNotificationData) {
  const replyTo = replyAddress('dm', data.conversationId, data.recipientEmail);
  await sendNotification(
    data.recipientEmail,
    `${data.senderName} sent you a message`,
    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="font-size:18px;margin-bottom:8px">💬 New direct message</h2>
      <p style="color:#666;margin-bottom:16px">${data.senderName} sent you a message:</p>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px">
        <p style="color:#374151;margin:0">${data.messageText}</p>
      </div>
      <a href="${data.dmUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Reply in ViBe Messaging</a>
      <p style="color:#9ca3af;font-size:12px;margin-top:24px">Reply to this email to respond directly without logging in.</p>
    </div>`,
    replyTo
  );
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
