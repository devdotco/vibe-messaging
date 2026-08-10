import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { requireUser } from '@/lib/auth/session';

const UPLOAD_BASE = process.env.UPLOAD_DIR ?? '/tmp/vibe-uploads';

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv', '.json': 'application/json',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.zip': 'application/zip',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  await requireUser();
  const { path } = await params;

  const safe = path.map((p) => p.replace(/\.\./g, '')).filter(Boolean);
  if (safe.length === 0) return new Response('Not found', { status: 404 });

  const filePath = join(UPLOAD_BASE, ...safe);
  if (!filePath.startsWith(UPLOAD_BASE)) return new Response('Forbidden', { status: 403 });

  try {
    const bytes = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_MAP[ext] ?? 'application/octet-stream';
    return new Response(bytes, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
