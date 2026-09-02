'use client';

import Link from 'next/link';
import {
  Home,
  MessageSquare,
  CheckSquare,
  Users,
  TrendingUp,
  Building2,
  Megaphone,
  Bell,
} from 'lucide-react';

const PM_URL = process.env.NEXT_PUBLIC_PM_URL ?? 'https://pm.vb.co';
const FINANCE_URL = process.env.NEXT_PUBLIC_FINANCE_URL ?? 'https://finance.vb.co';
const CRM_URL = process.env.NEXT_PUBLIC_CRM_URL ?? 'https://crm.vb.co';
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.vb.co';
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? 'https://marketing.vb.co';
const SHELL_URL = process.env.NEXT_PUBLIC_SHELL_URL ?? 'https://app.vb.co';

function AppIcon({
  href,
  title,
  children,
  active,
  external,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
  active?: boolean;
  external?: boolean;
}) {
  const style: React.CSSProperties = {
    width: '34px',
    height: '34px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    color: active ? 'white' : 'rgba(255,255,255,0.55)',
    background: active ? 'var(--accent)' : 'transparent',
    textDecoration: 'none',
    transition: 'background 0.1s, color 0.1s',
    cursor: 'pointer',
    border: 'none',
    flexShrink: 0,
  };

  const hoverOn = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!active) {
      e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
      e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
    }
  };
  const hoverOff = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!active) {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = 'rgba(255,255,255,0.55)';
    }
  };

  /**
   * A sibling application is still one product, so it opens in THIS tab.
   *
   * `target="_blank"` made every switcher click spawn a window, and a new window
   * that lands mid-hand-off reads as "it logged me out again" — you are staring
   * at a sign-in form in a tab you did not ask for while the tab you were using
   * sits behind it, still signed in. Same-tab navigation also lets the browser's
   * back button undo a misclick, which a new window cannot.
   */
  if (external) {
    return (
      <a href={href} title={title} style={style} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} title={title} style={style} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
      {children}
    </Link>
  );
}

export function AppSwitcher() {
  return (
    <div
      style={{
        width: '44px',
        flexShrink: 0,
        background: '#13141e',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '10px 0',
        gap: '4px',
        height: '100%',
      }}
    >
      {/* erp.io logo */}
      <div
        style={{
          width: '34px',
          height: '34px',
          borderRadius: '8px',
          background: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginBottom: '8px',
          overflow: 'hidden',
        }}
        title="erp.io"
      >
        <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
          <text x="0" y="13" fontFamily="var(--font-geist-sans), system-ui, sans-serif" fontWeight="800" fontSize="13" fill="white" fontStyle="italic">E.</text>
        </svg>
      </div>

      <div style={{ width: '20px', height: '1px', background: 'rgba(255,255,255,0.08)', marginBottom: '4px' }} />

      {/* Home */}
      <AppIcon href={SHELL_URL} title="erp.io Home" external>
        <Home size={17} />
      </AppIcon>

      {/* Messaging (active) */}
      <AppIcon href="/" title="erp.io Chat" active>
        <MessageSquare size={17} />
      </AppIcon>

      {/* PM */}
      <AppIcon href={PM_URL} title="erp.io PM" external>
        <CheckSquare size={17} />
      </AppIcon>

      {/* Portal */}
      <AppIcon href={PORTAL_URL} title="erp.io Portal" external>
        <Users size={17} />
      </AppIcon>

      {/* Finance */}
      <AppIcon href={FINANCE_URL} title="erp.io Finance" external>
        <TrendingUp size={17} />
      </AppIcon>

      {/* CRM */}
      <AppIcon href={CRM_URL} title="erp.io CRM" external>
        <Building2 size={17} />
      </AppIcon>

      {/* Marketing */}
      <AppIcon href={MARKETING_URL} title="erp.io Marketing" external>
        <Megaphone size={17} />
      </AppIcon>

      <div style={{ flex: 1 }} />

      <div style={{ width: '20px', height: '1px', background: 'rgba(255,255,255,0.08)', marginBottom: '4px' }} />

      {/* Notifications */}
      <AppIcon href="/notifications" title="Notifications">
        <Bell size={17} />
      </AppIcon>
    </div>
  );
}
