'use client';

import { useState, FormEvent } from 'react';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setState('loading');
    setError('');

    const next = new URLSearchParams(window.location.search).get('next') ?? '/';

    try {
      const res = await fetch('/api/auth/magic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), next }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
        setState('error');
      } else {
        setState('sent');
      }
    } catch {
      setError('Network error — please try again');
      setState('error');
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="w-full max-w-sm rounded-xl p-8"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      >
        <div
          className="w-10 h-10 rounded-xl mx-auto mb-4 flex items-center justify-center text-white font-bold text-lg"
          style={{ background: 'linear-gradient(135deg, #2f5cff, #6d4be0)' }}
        >
          V
        </div>

        {state === 'sent' ? (
          <div className="text-center">
            <h1 className="text-lg font-bold text-[var(--text-primary)] mb-2">Check your email</h1>
            <p className="text-sm text-[var(--text-muted)]">
              We sent a sign-in link to <strong>{email}</strong>. Click it to continue.
            </p>
            <button
              onClick={() => setState('idle')}
              className="mt-6 text-xs text-[var(--text-muted)] underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-bold text-[var(--text-primary)] mb-1 text-center">
              ViBe Messaging
            </h1>
            <p className="text-sm text-[var(--text-muted)] mb-5 text-center">
              Enter your email to receive a sign-in link.
            </p>

            {/*
              One click for anyone who has an app.vb.co account — the shell
              mints a hand-off token and sends them back signed in. The
              magic-link form stays the default, because plenty of people here
              were invited to a channel by email and have no shell account.
            */}
            <a
              href="https://app.vb.co/api/shell/auth/module-token?aud=messaging&next=%2F"
              className="flex h-11 w-full items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-semibold text-white no-underline"
            >
              Continue with ViBe
            </a>

            <div className="my-4 flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <span className="h-px flex-1 bg-[var(--border)]" />
              or
              <span className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full h-9 rounded-lg px-3 text-sm bg-[var(--bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />

              {state === 'error' && (
                <p className="text-xs text-red-500">{error}</p>
              )}

              <button
                type="submit"
                disabled={state === 'loading'}
                className="w-full h-9 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
                style={{ background: 'var(--accent)' }}
              >
                {state === 'loading' ? 'Sending…' : 'Send sign-in link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
