/** Dependency-free static server. Only serves files within the project root. Supports HTTP/HTTPS & LAN. */
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve(import.meta.dirname);
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

async function handleRequest(req, res) {
  try {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    const filename = resolve(root, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');
    if (!filename.startsWith(root + sep) && filename !== root) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (/\/(?:\.|node_modules|handoff|tests|scripts)/.test(pathname) || /\.(?:log|py|md|map)$/.test(pathname)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const info = await stat(filename);
    if (!info.isFile()) throw new Error('Not a file');
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': contentTypes[extname(filename)] || 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end();
      return;
    }
    const data = await readFile(filename);
    res.writeHead(200, { 'Content-Type': contentTypes[extname(filename)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

let server;
const keyPath = resolve(root, 'key.pem');
const certPath = resolve(root, 'cert.pem');

if (useHttps && existsSync(keyPath) && existsSync(certPath)) {
  server = createHttpsServer({
    key: readFileSync(keyPath),
    cert: readFileSync(certPath)
  }, handleRequest);
} else {
  server = createHttpServer(handleRequest);
}

server.listen(port, host, () => {
  const protocol = server instanceof createHttpsServer ? 'https' : 'http';
  console.log(`AI Fit Coach: ${protocol}://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  if (host === '0.0.0.0') {
    console.log(`  (局域网手机访问请确保使用安全上下文或本地视频评测模式)`);
  }
});
