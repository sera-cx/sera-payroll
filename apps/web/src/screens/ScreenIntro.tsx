import { Link } from 'react-router-dom';
import { ROUTES, type RouteMeta } from '../seo';

const ROLE: Record<string, string> = { preparer: 'the preparer', approver: 'the approver', employee: 'a sample employee', operator_admin: 'the operator admin' };

/**
 * Static description of an app screen. It is what crawlers and visitors without
 * JavaScript see, and the first paint before the live screen replaces it.
 */
export function ScreenIntro({ meta }: { meta: RouteMeta }) {
  const siblings = ROUTES.filter((r) => r.group === meta.group && r.index && r.path !== meta.path);
  return (
    <article className="intro">
      <p className="chip">{meta.group === 'Start here' ? 'Demo' : `${meta.group} view`}</p>
      <h1>{meta.heading}</h1>
      <p className="sub">{meta.description}</p>
      {meta.points.length > 0 && (
        <>
          <h2 className="mt">On this screen</h2>
          <ul>{meta.points.map((p) => <li key={p}>{p}</li>)}</ul>
        </>
      )}
      {meta.as && <p className="fine">The demo opens this screen signed in as {ROLE[meta.as]} with sample data. Nothing is sent, emailed or paid for real.</p>}
      {siblings.length > 0 && (
        <nav aria-label={`More in the ${meta.group.toLowerCase()} view`} className="mt">
          <h2>More in this view</h2>
          <ul>{siblings.map((s) => <li key={s.path}><Link to={s.path}>{s.title}</Link>: {s.description}</li>)}</ul>
        </nav>
      )}
      <p className="fine"><Link to="/">Back to the overview</Link></p>
    </article>
  );
}
