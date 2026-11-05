/** Dependency-free static server. Only serves files within the project root. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve(import.meta.dirname);
const port = Number(process.env.PORT) || 4173;
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.png': 'image/png', '.wasm': 'application/wasm', '.task': 'application/octet-stream'
};

createServer(async (req, res) => {
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
    const data = await readFile(filename);
    res.writeHead(200, { 'Content-Type': contentTypes[extname(filename)] || 'application/octet-stream',
      'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`AI Fit Coach: http://localhost:${port}`);
});
