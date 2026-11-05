/** Dependency-free static server.
 * Enforces strict client asset path whitelisting, symlink rejection, and HTTPS support.
 */
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat, lstat, realpath } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Node 18+ backwards compatible dirname resolution
const root = resolve(typeof import.meta.dirname === 'string' ? import.meta.dirname : dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || '127.0.0.1';
const useHttps = process.env.HTTPS === 'true';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.woff2': 'font/woff2'
};

/**
 * R-001 Strict Client Asset Path Whitelist:
 * Only public browser client assets are accessible via HTTP.
 * Internal server files (/server.mjs, /package.json, root JSON/MD files) are strictly 403 Forbidden.
 */
function isAllowedClientPath(pathname) {
  if (pathname === '/' || pathname === '/index.html' || pathname === '/favicon.ico') {
    return true;
  }
  if (pathname.startsWith('/src/')) {
    return true;
  }
  if (pathname.startsWith('/models/')) {
    // Only serve actual models, binaries, wasm, and json metadata under models/
    return true;
  }
  return false;
}

const FORBIDDEN_EXTENSIONS = new Set([
  '.pem', '.key', '.crt', '.cert', '.p12', '.pfx', '.pkcs8',
  '.env', '.log', '.py', '.pyc', '.md', '.map', '.sh', '.bat', '.ps1'
]);

async function handleRequest(req, res) {
  try {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // 1. Dual-check: Must match client asset path whitelist
    if (!isAllowedClientPath(pathname)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    // Reject path traversal tokens
    const relParts = pathname.split('/').filter(Boolean);
    if (relParts.some(part => part === '..' || part.startsWith('.'))) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const filename = resolve(root, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');

    // Path must stay inside project root
    if (!filename.startsWith(root + sep) && filename !== root) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    // 2. Reject sensitive keywords in filenames
    if (/(?:^|[\\/])(?:key|cert|secret|probe|token|password|credential|private)/i.test(filename)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    // 3. Extension check
    const ext = extname(filename).toLowerCase();
    if (FORBIDDEN_EXTENSIONS.has(ext)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const contentType = contentTypes[ext];
    if (!contentType) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    // 4. Strict Symlink & Realpath verification (R-001-A)
    // Inspect with lstat first: reject if filename itself is a symlink
    let linkStat;
    try {
      linkStat = await lstat(filename);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    if (linkStat.isSymbolicLink()) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    // Resolve real physical path and verify it stays within web root
    const realFilePath = await realpath(filename);
    if (!realFilePath.startsWith(root + sep) && realFilePath !== root) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const info = await stat(realFilePath);
    if (!info.isFile()) {
      throw new Error('Not a file');
    }

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

    const data = await readFile(realFilePath);
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

// R-001: TLS certificates MUST reside outside of web-served project root
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
