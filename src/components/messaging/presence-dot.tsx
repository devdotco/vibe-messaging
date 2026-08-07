import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-[var(--positive)]',
  away: 'bg-[var(--warning)]',
  dnd: 'bg-[var(--negative)]',
  offline: 'bg-[var(--text-muted)]',
};

export function PresenceDot({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full',
        STATUS_COLORS[status] ?? STATUS_COLORS.offline,
        className,
      )}
      style={{ width: 8, height: 8 }}
    />
  );
}
