import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { headModel, metaFor } from '../seo';

function upsert<T extends HTMLElement>(selector: string, make: () => T): T {
  const found = document.head.querySelector<T>(selector);
  if (found) return found;
  const el = make();
  document.head.appendChild(el);
  return el;
}

/** Writes the page title, description, canonical, Open Graph and JSON-LD tags for a path. */
export function applyHead(pathname: string): void {
  const hm = headModel(metaFor(pathname));
  document.title = hm.title;
  for (const m of hm.meta) {
    const isName = 'name' in m;
    const sel = isName ? `meta[name="${m.name}"]` : `meta[property="${m.property}"]`;
    const el = upsert(sel, () => { const e = document.createElement('meta'); if (isName) e.setAttribute('name', m.name); else e.setAttribute('property', m.property); return e; });
    el.setAttribute('content', m.content);
  }
  for (const l of hm.links) {
    const el = upsert(`link[rel="${l.rel}"]`, () => { const e = document.createElement('link'); e.setAttribute('rel', l.rel); return e; });
    el.setAttribute('href', l.href);
  }
  const ld = upsert<HTMLScriptElement>('script[type="application/ld+json"]', () => { const e = document.createElement('script'); e.type = 'application/ld+json'; return e; });
  ld.textContent = JSON.stringify(hm.jsonLd).replace(/</g, '\\u003c');
}

/** Keeps the document head in step with the current route. */
export function RouteHead() {
  const loc = useLocation();
  useEffect(() => { applyHead(loc.pathname); }, [loc.pathname]);
  return null;
}
