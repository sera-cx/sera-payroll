import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { SessionProvider, useSession } from './lib/session';
import { TopBar } from './components/TopBar';
import { DemoBanner } from './components/DemoBanner';
import { Loading } from './components/Common';
import { SignIn } from './screens/SignIn';
import { BuildNotes } from './screens/BuildNotes';
import { EmployerView } from './screens/employer/EmployerView';
import { EmployeeView } from './screens/employee/EmployeeView';
import { InvitePage } from './screens/employee/InvitePage';
import { OperatorView } from './screens/operator/OperatorView';

export default function App() {
  return (
    <SessionProvider fallback={<div className="wrap"><Loading /></div>}>
      <Shell />
    </SessionProvider>
  );
}

function Shell() {
  const { me, clientId } = useSession();
  const role = me.user?.role;
  const client = useQuery({ queryKey: ['client', clientId], queryFn: () => api.client(clientId!), enabled: !!clientId && role !== 'employee' });
  const mine = useQuery({ queryKey: ['me-person'], queryFn: api.myself, enabled: role === 'employee' });
  const brand = client.data?.settings.brand ?? client.data?.operator.brand ?? mine.data?.client.brand ?? 'Payroll';
  const clientName = role === 'employee' ? mine.data?.client.name ?? null : client.data?.name ?? null;
  const home = role === 'employee' ? '/employee' : role === 'operator_admin' ? '/operator' : role ? '/employer' : '/sign-in';
  return (
    <>
      <TopBar brand={brand} clientName={clientName} />
      {me.demoMode && <DemoBanner canReset={!!me.user} />}
      <div className="wrap">
        <Routes>
          <Route path="/" element={<Navigate to={home} replace />} />
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/invite/:token" element={<InviteParam />} />
          <Route path="/build-notes" element={<BuildNotes />} />
          <Route path="/employer/*" element={role === 'operator_admin' || role === 'preparer' || role === 'approver' ? <EmployerView /> : <Navigate to={home} replace />} />
          <Route path="/employee/*" element={role === 'employee' || role === 'operator_admin' ? <EmployeeView /> : <Navigate to={home} replace />} />
          <Route path="/operator/*" element={role === 'operator_admin' ? <OperatorView /> : <Navigate to={home} replace />} />
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </div>
    </>
  );
}

function InviteParam() {
  const { token } = useParams();
  return <InvitePage token={token ?? ''} />;
}
