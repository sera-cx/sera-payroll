// Turns the client build into one static HTML file per route, plus sitemap.xml,
// robots.txt, 404.html and .nojekyll. Runs after `vite build` and the SSR build
// of src/entry-static.tsx. Every route comes from src/seo.ts.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const ssr = join(root, 'dist-static');
const base = process.env.VITE_BASE ?? '/';
if (!existsSync(join(dist, 'index.html'))) throw new Error('Run vite build first.');
const entry = join(ssr, 'entry-static.js');
if (!existsSync(entry)) throw new Error('Run the SSR build first: vite build --ssr src/entry-static.tsx --outDir dist-static');

const { ROUTES, headModel, metaFor, renderRoute, SITE_URL, canonicalUrl } = await import(pathToFileURL(entry).href);
const template = readFileSync(join(dist, 'index.html'), 'utf8').replace(/<title>[\s\S]*?<\/title>\s*/, '');
if (!template.includes('<!--seo-->') || !template.includes('<div id="root"></div>')) throw new Error('index.html lost its <!--seo--> or root markers.');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function headHtml(hm) {
  const lines = [`<title>${esc(hm.title)}</title>`];
  for (const m of hm.meta) lines.push('name' in m ? `<meta name="${m.name}" content="${esc(m.content)}">` : `<meta property="${m.property}" content="${esc(m.content)}">`);
  for (const l of hm.links) lines.push(`<link rel="${l.rel}" href="${esc(l.href)}">`);
  if (hm.jsonLd.length) lines.push(`<script type="application/ld+json">${JSON.stringify(hm.jsonLd).replace(/</g, '\\u003c')}</script>`);
  return lines.join('\n');
}
function page(path, { noindex = false } = {}) {
  const hm = headModel(metaFor(path), { noindex });
  return template.replace('<!--seo-->', headHtml(hm)).replace('<div id="root"></div>', `<div id="root">${renderRoute(path, base)}</div>`);
}
function write(rel, content) { const f = join(dist, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, content); }

const today = new Date().toISOString().slice(0, 10);
const indexed = [];
for (const r of ROUTES) {
  write(r.path === '/' ? 'index.html' : `${r.path.slice(1)}/index.html`, page(r.path));
  if (r.index) indexed.push(r);
}
// Section roots redirect in the app; give them a static page too so direct hits have content.
for (const p of ['/employer', '/operator']) write(`${p.slice(1)}/index.html`, page(p));
// Unknown paths: GitHub Pages serves 404.html, which boots the app and lets the router decide.
write('404.html', page('/', { noindex: true }));
write('.nojekyll', '');
if (SITE_URL) {
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexed.map((r) => `  <url><loc>${esc(canonicalUrl(r.path))}</loc><lastmod>${today}</lastmod><changefreq>${r.path === '/' ? 'weekly' : 'monthly'}</changefreq><priority>${r.path === '/' ? '1.0' : r.group === 'Start here' ? '0.7' : '0.8'}</priority></url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
} else {
  write('robots.txt', 'User-agent: *\nAllow: /\n');
  console.warn('VITE_SITE_URL is not set: no sitemap, relative canonicals.');
}
rmSync(ssr, { recursive: true, force: true });
console.log(`Prerendered ${ROUTES.length + 2} pages${SITE_URL ? ` for ${SITE_URL}` : ''} (${indexed.length} in the sitemap).`);
