/** Dependency-free static server. Only serves files within the project root. Supports HTTP/HTTPS & LAN. */
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Node 18+ backwards compatible dirname resolution
const root = resolve(typeof import.meta.dirname === 'string' ? import.meta.dirname : dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || '127.0.0.1';
const useHttps = process.env.HTTPS === 'true';

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.png': 'image/png', '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.woff2': 'font/woff2'
};

const FORBIDDEN_EXTENSIONS = new Set([
  '.pem', '.key', '.crt', '.cert', '.p12', '.pfx', '.pkcs8',
  '.env', '.log', '.py', '.pyc', '.md', '.map', '.sh', '.bat', '.ps1'
]);

const FORBIDDEN_DIRS = new Set([
  '.git', 'node_modules', 'handoff', 'tests', 'scripts', 'audit', 'release', 'docs'
]);

async function handleRequest(req, res) {
  try {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    const relParts = pathname.split('/').filter(Boolean);

    // Reject dot-files and protected directories
    if (relParts.some(part => part.startsWith('.') || FORBIDDEN_DIRS.has(part.toLowerCase()))) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const filename = resolve(root, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');
    if (!filename.startsWith(root + sep) && filename !== root) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const ext = extname(filename).toLowerCase();

    // R-001: Explicitly forbid secret certificate/key files and sensitive names
    if (FORBIDDEN_EXTENSIONS.has(ext) || /(?:^|[\\/])(?:key|cert|secret|probe|token|password|credential)/i.test(filename)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    // Strict extension whitelist: only serve defined web assets
    const contentType = contentTypes[ext];
    if (!contentType) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const info = await stat(filename);
    if (!info.isFile()) throw new Error('Not a file');

    const headers = {
      'Content-Type': contentType,
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    };

    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      res.end();
      return;
    }

    const data = await readFile(filename);
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

// R-001: TLS certificates MUST reside outside of the web-served root by default
const keyPath = process.env.TLS_KEY_PATH
  ? resolve(process.env.TLS_KEY_PATH)
  : resolve(root, '..', 'ai-fit-coach-tls', 'key.pem');
const certPath = process.env.TLS_CERT_PATH
  ? resolve(process.env.TLS_CERT_PATH)
  : resolve(root, '..', 'ai-fit-coach-tls', 'cert.pem');

let server;
const isHttps = Boolean(useHttps && existsSync(keyPath) && existsSync(certPath));

if (isHttps) {
  server = createHttpsServer({
    key: readFileSync(keyPath),
    cert: readFileSync(certPath)
  }, handleRequest);
} else {
  server = createHttpServer(handleRequest);
}

server.listen(port, host, () => {
  const protocol = isHttps ? 'https' : 'http';
  console.log(`AI Fit Coach: ${protocol}://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  if (host === '0.0.0.0') {
    console.log(`  (局域网手机访问请确保使用安全上下文或本地视频评测模式)`);
  }
});
