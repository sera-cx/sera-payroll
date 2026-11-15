import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { SessionProvider, useSession } from './lib/session';
import { RouteHead } from './lib/head';
import { metaFor, type DemoRole, type Group } from './seo';

/** Which sample roles may open each group of screens without switching user. */
const ALLOWED: Record<Group, DemoRole[]> = {
  'Start here': ['preparer', 'approver', 'employee', 'operator_admin'],
  Employer: ['preparer', 'approver', 'operator_admin'],
  Employee: ['employee'],
  Operator: ['operator_admin'],
};
import { TopBar } from './components/TopBar';
import { DemoBanner } from './components/DemoBanner';
import { Loading } from './components/Common';
import { Landing } from './screens/Landing';
import { SignIn } from './screens/SignIn';
import { Verify } from './screens/Verify';
import { BuildNotes } from './screens/BuildNotes';
import { EmployerView } from './screens/employer/EmployerView';
import { EmployeeView } from './screens/employee/EmployeeView';
import { InvitePage } from './screens/employee/InvitePage';
import { OperatorView } from './screens/operator/OperatorView';

export default function App() {
  return (
    <SessionProvider fallback={<div className="wrap"><Loading /></div>}>
      <RouteHead />
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
  const signingIn = useDemoAutoSignIn();
  return (
    <>
      <TopBar brand={brand} clientName={clientName} />
      {me.demoMode && <DemoBanner canReset={!!me.user} />}
      <div className="wrap">
        {signingIn ? <Loading what="Opening the demo" /> : (
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/invite/:token" element={<InviteParam />} />
            <Route path="/build-notes" element={<BuildNotes />} />
            <Route path="/employer/*" element={role === 'operator_admin' || role === 'preparer' || role === 'approver' ? <EmployerView /> : <Navigate to={home} replace />} />
            <Route path="/employee/*" element={role === 'employee' || role === 'operator_admin' ? <EmployeeView /> : <Navigate to={home} replace />} />
            <Route path="/operator/*" element={role === 'operator_admin' ? <OperatorView /> : <Navigate to={home} replace />} />
            <Route path="*" element={<Navigate to={home} replace />} />
          </Routes>
        )}
      </div>
    </>
  );
}

/**
 * In demo mode a deep link opens signed in as the sample user that screen is
 * for, and `?as=<role or user id>` switches user. Returns true while signing in.
 * Outside demo mode it does nothing and the route guards apply.
 */
function useDemoAutoSignIn(): boolean {
  const { me, setClientId } = useSession();
  const loc = useLocation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const params = new URLSearchParams(loc.search);
  const asParam = params.get('as');
  const meta = metaFor(loc.pathname);
  const roleOk = !!me.user && ALLOWED[meta.group].includes(me.user.role as DemoRole);
  // After an explicit switch, wait until the session reflects it before falling back to the screen's default user.
  const pendingUser = useRef<string | null>(null);
  const settled = !pendingUser.current || me.user?.id === pendingUser.current;
  const want = asParam ?? (settled && !roleOk && meta.as ? meta.as : null);
  const tried = useRef<string | null>(null);
  const key = want ? `${want}@${loc.pathname}` : null;
  const need = !!me.demoMode && !!key && tried.current !== key;
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!need || !key || !want) return;
    tried.current = key;
    (async () => {
      setBusy(true);
      try {
        const users = await api.demoUsers();
        const u = users.find((x) => x.id === want) ?? users.find((x) => x.role === want);
        if (u && me.user?.id !== u.id) {
          pendingUser.current = u.id;
          await api.demoLogin(u.id);
          if (u.clientId) setClientId(u.clientId);
          qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'demoUsers' });
          await qc.invalidateQueries({ queryKey: ['me'] });
        }
      } catch { pendingUser.current = null; /* fall through to the normal route guards */ }
      finally {
        // No cancellation: the session refresh re-runs this effect before the login settles, and busy must still clear.
        setBusy(false);
        if (asParam) { params.delete('as'); nav({ pathname: loc.pathname, search: params.toString() ? `?${params}` : '' }, { replace: true }); }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [need, key]);
  return need || busy;
}

function InviteParam() {
  const { token } = useParams();
  return <InvitePage token={token ?? ''} />;
}
