// Serves dist/ the way GitHub Pages does: under the base path, folders resolve
// to index.html, unknown paths get 404.html with a 404 status. For checking a
// prerendered build locally:  VITE_BASE=/sera-payroll/ node scripts/serve-static.mjs
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const base = (process.env.VITE_BASE ?? '/').replace(/\/$/, '');
const port = Number(process.env.PORT ?? 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.map': 'application/json' };

createServer((req, res) => {
  const { pathname, search } = new URL(req.url, 'http://localhost');
  const url = decodeURIComponent(pathname);
  if (base && url === base) { res.writeHead(301, { Location: `${base}/${search}` }); return res.end(); }
  if (base && !url.startsWith(`${base}/`)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end(`This build is served under ${base}/`); }
  let file = join(root, url.slice(base.length + 1));
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!url.endsWith('/')) { res.writeHead(301, { Location: `${url}/${search}` }); return res.end(); }
    file = join(file, 'index.html');
  }
  if (!existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(readFileSync(join(root, '404.html'))); }
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`Serving ${root} on http://localhost:${port}${base}/`));
