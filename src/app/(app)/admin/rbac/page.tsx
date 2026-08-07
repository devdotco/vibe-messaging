'use client';
import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ClaudeRolePolicy } from '@/lib/db/schema/messaging';

const DATA_DOMAINS = [
  'financial.transactions', 'financial.reports', 'financial.payroll',
  'financial.budgets', 'financial.invoices',
  'deals.overview', 'deals.documents', 'deals.diligence', 'deals.valuation',
  'hr.headcount', 'hr.employee_records', 'hr.compensation',
  'ops.orders', 'ops.clients', 'ops.inventory', 'ops.work_orders',
  'projects.tasks', 'projects.overview',
  'analytics.usage', 'messages.history',
];

const ROLES = ['TEAM_MEMBER', 'MANAGER', 'ENTITY_ADMIN', 'PLATFORM_ADMIN'];

export default function RbacPage() {
  const [policies, setPolicies] = useState<ClaudeRolePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRole, setNewRole] = useState('TEAM_MEMBER');
  const [newDomain, setNewDomain] = useState(DATA_DOMAINS[0]);
  const [newAllowed, setNewAllowed] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch('/api/messaging/admin/rbac')
      .then((r) => r.json())
      .then((data) => { setPolicies(Array.isArray(data) ? data : []); setLoading(false); });
  }, []);

  async function handleToggle(policy: ClaudeRolePolicy) {
    const res = await fetch(`/api/messaging/admin/rbac/${policy.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowed: !policy.allowed }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPolicies((prev) => prev.map((p) => p.id === policy.id ? updated : p));
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/messaging/admin/rbac/${id}`, { method: 'DELETE' });
    setPolicies((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleAdd() {
    setAdding(true);
    const res = await fetch('/api/messaging/admin/rbac', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole, dataDomain: newDomain, allowed: newAllowed }),
    });
    if (res.ok) {
      const created = await res.json();
      setPolicies((prev) => {
        const exists = prev.findIndex((p) => p.id === created.id);
        if (exists >= 0) return prev.map((p) => p.id === created.id ? created : p);
        return [...prev, created];
      });
    }
    setAdding(false);
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">Claude RBAC Policies</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Control which roles can access which data domains via Claude</p>
      </div>

      {/* Add policy */}
      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-4 mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Role</label>
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text-primary)] px-3 py-2 outline-none"
          >
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Data Domain</label>
          <select
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text-primary)] px-3 py-2 outline-none"
          >
            {DATA_DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Access</label>
          <select
            value={newAllowed ? 'allow' : 'deny'}
            onChange={(e) => setNewAllowed(e.target.value === 'allow')}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text-primary)] px-3 py-2 outline-none"
          >
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </select>
        </div>
        <button
          onClick={handleAdd}
          disabled={adding}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add Policy
        </button>
      </div>

      {/* Policies table */}
      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{policies.length} polic{policies.length !== 1 ? 'ies' : 'y'}</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-[var(--text-muted)]">Loading…</div>
        ) : policies.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--text-muted)]">No policies configured yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--text-muted)] text-left border-b border-[var(--border)]">
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Data Domain</th>
                <th className="px-4 py-2">Access</th>
                <th className="px-4 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id} className="border-b border-[var(--border)] hover:bg-[var(--panel-hover)]">
                  <td className="px-4 py-2 font-mono text-[var(--text-secondary)]">{p.role}</td>
                  <td className="px-4 py-2 font-mono text-[var(--text-secondary)]">{p.dataDomain}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleToggle(p)}
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                        p.allowed
                          ? 'bg-[var(--positive)] text-white'
                          : 'bg-[var(--negative)] text-white'
                      }`}
                    >
                      {p.allowed ? 'ALLOW' : 'DENY'}
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-[var(--text-muted)] hover:text-[var(--negative)] transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
