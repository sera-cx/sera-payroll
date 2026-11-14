import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Tabs } from '../../components/Common';
import { useSession } from '../../lib/session';
import { useOutbox, useRuns } from '../../hooks/employer';
import { PayRun } from './PayRun';
import { Employees } from './Employees';
import { History } from './History';
import { Outbox } from './Outbox';
import { Settings } from './Settings';

export function EmployerView() {
  const { clientId, me } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const runs = useRuns();
  const outbox = useOutbox();
  if (!clientId) return <p className="sub">{me.user?.role === 'operator_admin' ? 'Pick a client under Operator, Clients, to work as that client.' : 'Your account is not linked to a client yet.'}</p>;
  const current = loc.pathname.split('/')[2] ?? 'run';
  const items: [string, string][] = [
    ['run', 'Pay run'], ['staff', 'Employees'],
    ['history', `History${runs.data?.length ? ` (${runs.data.length})` : ''}`],
    ['outbox', `Outbox${outbox.data?.length ? ` (${outbox.data.length})` : ''}`],
    ['settings', 'Settings'],
  ];
  return (
    <>
      <Tabs items={items} current={current} onPick={(k) => nav(`/employer/${k}`)} />
      <Routes>
        <Route index element={<Navigate to="run" replace />} />
        <Route path="run" element={<PayRun />} />
        <Route path="staff" element={<Employees />} />
        <Route path="history" element={<History />} />
        <Route path="history/:runId" element={<History />} />
        <Route path="outbox" element={<Outbox />} />
        <Route path="settings" element={<Settings />} />
      </Routes>
    </>
  );
}
