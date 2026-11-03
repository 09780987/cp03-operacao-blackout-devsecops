import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';

const publicRoot = new URL('./public/', import.meta.url);
let release = 'local';
try {
  release = JSON.parse(readFileSync(new URL('./version.json', import.meta.url), 'utf8')).commit;
} catch {}
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};
const assets = new Map();
for (const path of readdirSync(publicRoot, { recursive: true })) {
  const normalized = path.replaceAll('\\', '/');
  if (types[extname(normalized)] && !normalized.split('/').some(part => part.startsWith('.'))) {
    assets.set('/' + normalized, normalized);
  }
}
assets.set('/', 'index.html');
assets.set('/blackout', 'index.html');
assets.set('/blackout/', 'index.html');

const headers = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cache-Control': 'no-store'
};

function respond(request, response, status, data, type = 'application/json; charset=utf-8') {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  response.writeHead(status, { ...headers, 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) });
  response.end(request.method === 'HEAD' ? undefined : body);
}

export function createApp() {
  const server = http.createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.setHeader('Allow', 'GET, HEAD');
        respond(request, response, 405, { error: 'Método não permitido.' });
        return;
      }
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (path === '/health') {
        respond(request, response, 200, { status: 'ok', application: 'operacao-blackout', version: process.env.APP_VERSION || release });
        return;
      }
      const asset = assets.get(path);
      if (!asset) {
        respond(request, response, 404, { error: 'Página não encontrada.' });
        return;
      }
      const content = await readFile(new URL(asset, publicRoot));
      respond(request, response, 200, content, types[extname(asset)]);
    } catch {
      respond(request, response, 400, { error: 'Requisição inválida.' });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createApp();
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Operação Blackout disponível via HTTP.'));
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000).unref();
    });
  }
}
