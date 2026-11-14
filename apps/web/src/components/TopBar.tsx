import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { api } from '../api';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { short } from '../lib/format';

export function TopBar({ brand, clientName }: { brand: string; clientName: string | null }) {
  const { me, refresh } = useSession();
  const role = me.user?.role;
  const views: [string, string][] = [];
  if (role === 'operator_admin') views.push(['/employer', 'Employer'], ['/employee', 'Employee'], ['/operator', 'Operator']);
  else if (role === 'preparer' || role === 'approver') views.push(['/employer', 'Employer']);
  else if (role === 'employee') views.push(['/employee', 'Employee']);
  return (
    <div className="bar">
      <div className="brand"><div className="dot" aria-hidden="true" /><span>{brand}{clientName && <small>Client: {clientName}</small>}</span></div>
      {views.length > 0 && (
        <nav className="seg" aria-label="View as">
          {views.map(([to, label]) => (
            <NavLink key={to} to={to}>{({ isActive }) => <button type="button" aria-pressed={isActive}>{label}</button>}</NavLink>
          ))}
          <NavLink to="/build-notes">{({ isActive }) => <button type="button" aria-pressed={isActive}>Build notes</button>}</NavLink>
        </nav>
      )}
      <div className="flex">
        {me.demoMode && <DemoPicker />}
        <WalletButton />
        {me.user && !me.demoMode && <button type="button" className="ghostbtn small" onClick={async () => { await api.logout(); refresh(); }}>Sign out</button>}
        <span className="pill">Settlement by Sera.cx</span>
      </div>
    </div>
  );
}

function DemoPicker() {
  const { me, refresh, setClientId } = useSession();
  const qc = useQueryClient();
  const nav = useNavigate();
  const users = useQuery({ queryKey: ['demoUsers'], queryFn: api.demoUsers });
  const login = useMutation({
    mutationFn: api.demoLogin,
    onSuccess: async (_d, userId) => {
      const u = users.data?.find((x) => x.id === userId);
      if (u?.clientId) setClientId(u.clientId);
      // Drop the previous role's cached queries so they do not refetch (and 403) under the new session.
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'demoUsers' });
      await qc.invalidateQueries({ queryKey: ['me'] });
      refresh();
      nav(u?.role === 'employee' ? '/employee' : u?.role === 'operator_admin' ? '/operator' : '/employer');
    },
  });
  return (
    <label className="inline" style={{ fontSize: 12, flex: '1 1 240px', maxWidth: '100%' }}>
      Sign in as
      <select aria-label="Sign in as" value={me.user?.id ?? ''} onChange={(e) => login.mutate(e.target.value)} style={{ width: 'auto', minWidth: 0, flex: 1 }}>
        <option value="" disabled>Pick a sample user</option>
        {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role.replace('_', ' ')}{u.clientName ? `, ${u.clientName}` : ''})</option>)}
      </select>
    </label>
  );
}

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const toast = useToast();
  if (isConnected && address) return <button type="button" className="ghostbtn small mono" onClick={() => disconnect()} title="Disconnect wallet">{short(address)}</button>;
  const c = connectors[0];
  return (
    <button type="button" className="ghostbtn small" disabled={isPending} onClick={() => { if (!c) { toast('No wallet found in this browser.'); return; } connect({ connector: c }); }}>
      {isPending ? 'Connecting…' : 'Connect wallet'}
    </button>
  );
}
