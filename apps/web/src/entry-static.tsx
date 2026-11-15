/**
 * Server-side entry used only at build time by scripts/prerender.mjs. It renders
 * each route's static content (the landing page, build notes, verifier copy or
 * a screen description) into plain HTML so crawlers and first paint get real
 * content before the app boots and takes over the root element.
 */
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Link } from 'react-router-dom';
import { REPO, SITE_NAME, metaFor, type RouteMeta } from './seo';
import { Landing } from './screens/Landing';
import { BuildNotes } from './screens/BuildNotes';
import { VerifyIntro } from './screens/VerifyIntro';
import { ScreenIntro } from './screens/ScreenIntro';

export { ROUTES, headModel, metaFor, SITE_URL, canonicalUrl } from './seo';

function Content({ meta }: { meta: RouteMeta }) {
  switch (meta.path) {
    case '/': return <Landing />;
    case '/build-notes': return <BuildNotes />;
    case '/verify': return <div className="notes"><VerifyIntro /><p className="fine">The verifier runs in your browser. Enable JavaScript to paste a proof.</p></div>;
    default: return <ScreenIntro meta={meta} />;
  }
}

function StaticPage({ meta }: { meta: RouteMeta }) {
  return (
    <>
      <div className="bar">
        <Link to="/" className="brand"><div className="dot" aria-hidden="true" /><span>{SITE_NAME}<small>Open-source demo</small></span></Link>
        <nav className="seg" aria-label="Site">
          <Link to="/" aria-current={meta.path === '/' ? 'page' : undefined}>Overview</Link>
          <Link to="/employer/run" aria-current={meta.group === 'Employer' ? 'page' : undefined}>Employer</Link>
          <Link to="/employee" aria-current={meta.group === 'Employee' ? 'page' : undefined}>Employee</Link>
          <Link to="/operator/clients" aria-current={meta.group === 'Operator' ? 'page' : undefined}>Operator</Link>
          <Link to="/verify" aria-current={meta.path === '/verify' ? 'page' : undefined}>Verify a payslip</Link>
          <Link to="/build-notes" aria-current={meta.path === '/build-notes' ? 'page' : undefined}>Build notes</Link>
        </nav>
        <div className="flex"><span className="pill">Settlement by Sera.cx</span></div>
      </div>
      <div className="note"><span><strong>DEMO SITE</strong>Sample data on the Sepolia testnet. Nothing is sent, emailed or paid for real. Open source: fork it and add your own database, emails and ramp partners. <a href={REPO}>github.com/sera-cx/sera-payroll</a></span></div>
      <div className="wrap"><Content meta={meta} /></div>
    </>
  );
}

export function renderRoute(path: string, base = '/'): string {
  const meta = metaFor(path);
  const basename = base.replace(/\/$/, '');
  return renderToString(<StaticRouter basename={basename || undefined} location={`${basename}${path === "/" ? "/" : path}`}><StaticPage meta={meta} /></StaticRouter>);
}
