// Serves the built demo-app (dev build) plus a small fake API on http://localhost:4321.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const root = resolve(process.env.DEMO_ROOT ?? 'dist/demo-app/browser');
const port = Number(process.env.PORT ?? 4321);
const products = [
  { id: 1, name: 'Shoes', price: 80 },
  { id: 2, name: 'Hat', price: 25 },
  { id: 3, name: 'Scarf', price: 30 },
];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

function api(req, res, url, body) {
  const path = url.pathname;
  let m;
  if (path === '/api/config') return json(res, 200, { theme: 'light' });
  if (path === '/api/banner') return json(res, 200, { message: 'Autumn sale' });
  if (path === '/api/products') return json(res, 200, products, { 'x-total-count': '3' });
  if ((m = /^\/api\/products\/(\d+)$/.exec(path))) return json(res, 200, products.find((p) => p.id === +m[1]) ?? null);
  if ((m = /^\/api\/stock\/(\d+)$/.exec(path))) return json(res, 200, { id: +m[1], stock: +m[1] * 10 });
  if (path === '/api/search') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    return json(res, 200, products.filter((p) => p.name.toLowerCase().includes(q)));
  }
  if (path === '/api/cart' && req.method === 'POST') {
    return json(res, 201, { ok: true, received: JSON.parse(body || 'null') }, { 'set-cookie': 'cart=1' });
  }
  if (path === '/api/legacy') {
    res.writeHead(200, { 'content-type': 'application/xml' });
    return res.end('<legacy ok="true"/>');
  }
  if (path === '/api/error') return json(res, 500, { error: 'boom' });
  return json(res, 404, { error: 'not found' });
}

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname.startsWith('/api/')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => api(req, res, url, body));
    return;
  }
  let file = join(root, url.pathname);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`demo on http://localhost:${port}`));
