export default function SignInPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="w-full max-w-sm rounded-xl p-8 text-center"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      >
        <div
          className="w-10 h-10 rounded-xl mx-auto mb-4 flex items-center justify-center text-white font-bold text-lg"
          style={{ background: 'linear-gradient(135deg, #2f5cff, #6d4be0)' }}
        >
          V
        </div>
        <h1 className="text-lg font-bold text-[var(--text-primary)] mb-1">ViBe Messaging</h1>
        <p className="text-sm text-[var(--text-muted)] mb-6">Sign in via the main ViBe app to access messaging.</p>
        <a
          href={`https://finance.vb.co/sign-in?next=${encodeURIComponent(process.env.NEXT_PUBLIC_APP_URL ?? 'https://chat.vb.co')}`}
          className="inline-flex items-center justify-center w-full h-9 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ background: 'var(--accent)' }}
        >
          Go to ViBe
        </a>
      </div>
    </div>
  );
}
