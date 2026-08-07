import { cn } from '@/lib/utils';

export function ClaudeAvatar({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn('flex items-center justify-center rounded-full shrink-0 font-bold text-white', className)}
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #6d4be0 0%, #9370f8 100%)',
        fontSize: size * 0.4,
      }}
    >
      C
    </div>
  );
}

export function ClaudeAiBadge() {
  return (
    <span
      className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-semibold uppercase"
      style={{ background: 'var(--ai-subtle)', color: 'var(--ai)' }}
    >
      AI
    </span>
  );
}
