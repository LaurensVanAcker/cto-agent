/**
 * Tiny zero-dep static server for the MyStaffler employee PoC.
 *
 * Two responsibilities:
 *   1. Serve `index.html` + `src/*` from this directory on PORT 4201.
 *   2. Proxy every `/api/*` request to the Fastify backend on :5173,
 *      forwarding cookies both ways so the stub-login session
 *      survives a page reload.
 *
 * Zero npm install needed — Node's built-in `http` is enough. Vercel /
 * Cloudflare can serve `index.html` + `src/` directly as static; the
 * proxy is only useful for local dev.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname);
const PORT = Number(process.env.PORT ?? 4201);
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? 'http://localhost:5173';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // SPA fallback: anything without an extension and not under /src/
  // resolves to index.html so client-side routing keeps working.
  const looksLikeFile = /\.[a-z0-9]+$/i.test(urlPath);
  if (!looksLikeFile) urlPath = '/index.html';

  // Path traversal guard — keep the served path inside ROOT.
  const filePath = normalize(join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const s = await stat(filePath);
    if (!s.isFile()) throw new Error('not a file');
    const buf = await readFile(filePath);
    const ct = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'no-cache' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}

async function proxyApi(req, res) {
  const target = new URL(BACKEND_ORIGIN + req.url);
  const headers = { ...req.headers, host: target.host };
  // Drop the connection-related headers — fetch() repopulates them.
  delete headers['content-length'];

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  let upstream;
  try {
    upstream = await fetch(target, { method: req.method, headers, body });
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ kind: 'upstream_unreachable', message: String(err) }));
    return;
  }

  // Forward every response header except the ones Node will reset on us.
  const outHeaders = {};
  upstream.headers.forEach((v, k) => {
    if (k === 'content-length' || k === 'content-encoding') return;
    outHeaders[k] = v;
  });
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(upstream.status, outHeaders);
  res.end(buf);
}

const server = createServer(async (req, res) => {
  // CORS-less because we proxy /api back through the same origin.
  if (req.url?.startsWith('/api/')) {
    await proxyApi(req, res);
  } else {
    await serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`MyStaffler-PoC running on http://localhost:${PORT}`);
  console.log(`Proxying /api/* → ${BACKEND_ORIGIN}`);
});
