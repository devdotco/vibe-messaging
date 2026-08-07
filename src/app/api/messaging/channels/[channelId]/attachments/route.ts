import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channelMembers, messageAttachments } from '@/lib/db/schema/messaging';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const UPLOAD_BASE = process.env.UPLOAD_DIR ?? '/tmp/vibe-uploads';

export async function POST(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const user = await requireUser();
  const { channelId } = await params;

  // Verify membership
  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)));

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 413 });

  const uploadDir = join(UPLOAD_BASE, user.orgId, channelId);
  await mkdir(uploadDir, { recursive: true });

  // Sanitize filename
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueName = `${Date.now()}-${safeName}`;
  const filePath = join(uploadDir, uniqueName);

  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  const urlPath = `/uploads/${user.orgId}/${channelId}/${uniqueName}`;

  return NextResponse.json({
    url: urlPath,
    filename: file.name,
    fileType: file.type,
    size: file.size,
  }, { status: 201 });
}
