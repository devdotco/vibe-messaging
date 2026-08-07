'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, Hash, Clock } from 'lucide-react';
import type { Message, Channel } from '@/lib/db/schema/messaging';

type Tab = 'messages' | 'channels' | 'files';

interface SearchResult {
  message: Message;
  channel: Channel;
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-900 text-inherit rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [tab, setTab] = useState<Tab>('messages');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetch(`/api/messaging/search?q=${encodeURIComponent(q)}&type=${tab}`)
        .then((r) => r.json())
        .then((data) => { setResults(Array.isArray(data) ? data : []); setLoading(false); });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, tab]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.replace(`/search?q=${encodeURIComponent(q)}`);
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'messages', label: 'Messages' },
    { key: 'channels', label: 'Channels' },
    { key: 'files', label: 'Files' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-3 max-w-2xl mx-auto bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-2.5 focus-within:border-[var(--accent)] transition-colors">
            <Search className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search messages, channels, files…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
            />
            {q && (
              <button type="button" onClick={() => setQ('')} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                Clear
              </button>
            )}
          </div>
        </form>

        {/* Filter tabs */}
        <div className="flex gap-0 mt-3 border-b border-[var(--border)] -mb-4 max-w-2xl mx-auto">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px"
              style={{
                borderColor: tab === key ? 'var(--accent)' : 'transparent',
                color: tab === key ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto py-6 px-6" style={{ scrollbarWidth: 'thin' }}>
        <div className="max-w-2xl mx-auto">
          {!q || q.length < 2 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-muted)]">
              <Search className="h-10 w-10 opacity-20" />
              <p className="text-sm">Type at least 2 characters to search</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-20 text-[var(--text-muted)] text-sm">Searching…</div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-muted)]">
              <Search className="h-10 w-10 opacity-20" />
              <p className="text-sm">No results for <strong>&ldquo;{q}&rdquo;</strong></p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-muted)] mb-4">{results.length} result{results.length !== 1 ? 's' : ''}</p>
              {results.map(({ message, channel }) => (
                <button
                  key={message.id}
                  onClick={() => router.push(`/channels/${channel.id}`)}
                  className="w-full text-left bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--accent)] transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Hash className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                    <span className="text-xs font-medium text-[var(--accent)]">{channel.name}</span>
                    <span className="text-[var(--border-strong)]">·</span>
                    <Clock className="h-3 w-3 text-[var(--text-muted)]" />
                    <span className="text-xs text-[var(--text-muted)]">
                      {message.createdAt ? new Date(message.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-primary)] leading-relaxed line-clamp-3">
                    {highlight(message.content, q)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
