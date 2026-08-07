'use client';
import { useEffect, useState } from 'react';
import { formatTime } from '@/lib/utils';
import type { FileEntry } from '@/app/api/messaging/channels/[channelId]/files/route';

interface Props {
  channelId: string;
}

function fileIcon(fileType: string): string {
  if (fileType.startsWith('image/')) return '🖼️';
  if (fileType.includes('pdf')) return '📄';
  if (fileType.includes('spreadsheet') || fileType.includes('excel') || fileType.includes('csv')) return '📊';
  if (fileType.includes('word') || fileType.includes('document')) return '📝';
  if (fileType.includes('zip') || fileType.includes('rar') || fileType.includes('tar')) return '🗜️';
  if (fileType.includes('video')) return '🎬';
  if (fileType.includes('audio')) return '🎵';
  return '📎';
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesTab({ channelId }: Props) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/messaging/channels/${channelId}/files`)
      .then((r) => r.json())
      .then((data: FileEntry[]) => setFiles(data))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [channelId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 text-sm text-[var(--text-muted)]">
        Loading files…
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 text-[var(--text-muted)]">
        <span className="text-4xl">📂</span>
        <p className="text-sm font-medium">No files shared yet</p>
        <p className="text-xs">Files shared in messages will appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {files.flatMap((entry) =>
          entry.attachments.map((att) => {
            const isImage = att.fileType.startsWith('image/');
            return (
              <a
                key={att.id}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                download={att.filename}
                className="group block rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden hover:border-[var(--accent)] transition-colors"
              >
                {/* Preview area */}
                <div
                  className="h-28 flex items-center justify-center bg-[var(--panel-hover)]"
                  style={{ fontSize: isImage ? undefined : '2.5rem' }}
                >
                  {isImage ? (
                    <img
                      src={att.url}
                      alt={att.filename}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{fileIcon(att.fileType)}</span>
                  )}
                </div>

                {/* Meta */}
                <div className="px-3 py-2">
                  <p className="text-xs font-medium text-[var(--text-primary)] truncate" title={att.filename}>
                    {att.filename}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {entry.userName}
                    {att.size ? ` · ${formatBytes(att.size)}` : ''}
                  </p>
                  {entry.createdAt && (
                    <p className="text-xs text-[var(--text-muted)]">
                      {formatTime(entry.createdAt)}
                    </p>
                  )}
                </div>
              </a>
            );
          }),
        )}
      </div>
    </div>
  );
}
