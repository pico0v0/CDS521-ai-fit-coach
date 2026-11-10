/** Dependency-free static server.
 * Enforces strict per-zone client asset path whitelisting, directory & file symlink rejection, and HTTPS support.
 */
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
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

const srcDir = resolve(root, 'src');
const modelsDir = resolve(root, 'models');
const indexFile = resolve(root, 'index.html');
const previewFile = resolve(root, 'preview.html');
const faviconFile = resolve(root, 'favicon.ico');

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

const FORBIDDEN_EXTENSIONS = new Set([
  '.pem', '.key', '.crt', '.cert', '.p12', '.pfx', '.pkcs8',
  '.env', '.log', '.py', '.pyc', '.md', '.map', '.sh', '.bat', '.ps1'
]);

async function handleRequest(req, res) {
  try {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // Reject path traversal tokens
    const relParts = pathname.split('/').filter(Boolean);
    if (relParts.some(part => part === '..' || part.startsWith('.'))) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    // Forward /plan requests to FitMind AI (for local dev mode)
    if (pathname === '/plan' || pathname.startsWith('/plan/')) {
      const fitmindPort = Number(process.env.FITMIND_PORT) || 6692;
      const proxyReq = httpRequest({
        hostname: '127.0.0.1',
        port: fitmindPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${fitmindPort}` }
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', () => {
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>FitMind AI 未启动</title><style>body{font-family:sans-serif;background:#0c1b28;color:#e2e8f0;padding:40px;line-height:1.6}pre{background:#172d3c;padding:15px;border-radius:8px;color:#a7f3d0}</style></head><body><h2>🥗 FitMind AI 本地规划服务未启动</h2><p>当前运行在本地开发模式。如需使用饮食与训练规划功能，请在终端启动 Streamlit 服务：</p><pre>cd "AI 个性化健身与饮食规划系统/fitmind-ai"\nstreamlit run app.py --server.baseUrlPath plan --server.port 6692</pre><p>如在云端部署，Nginx 会自动代理到线上服务。</p></body></html>`);
      });
      req.pipe(proxyReq);
      return;
    }

    // 1. Strict Zone Identification: Only exact allowed zones are accepted
    let expectedDir = null;
    let expectedExactFile = null;

    if (pathname === '/' || pathname === '/index.html') {
      expectedExactFile = indexFile;
    } else if (pathname === '/preview.html') {
      expectedExactFile = previewFile;
    } else if (pathname === '/favicon.ico') {
      expectedExactFile = faviconFile;
    } else if (pathname.startsWith('/src/')) {
      expectedDir = srcDir;
    } else if (pathname.startsWith('/models/')) {
      expectedDir = modelsDir;
    } else {
      // All other root files (/server.mjs, /package.json, root json/md files) are 403 Forbidden
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const filename = resolve(root, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');

    // 2. Step-by-step symlink check: Inspect EVERY path component from root to leaf
    let currentPath = root;
    for (const part of relParts) {
      currentPath = resolve(currentPath, part);
      try {
        const segStat = await lstat(currentPath);
        if (segStat.isSymbolicLink()) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Forbidden');
          return;
        }
      } catch {
        // If an intermediate segment does not exist, standard 404 will handle it later
      }
    }

    // Check leaf file itself with lstat
    let leafStat;
    try {
      leafStat = await lstat(filename);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    if (leafStat.isSymbolicLink()) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    // 3. Physical Realpath Verification against Designated Zone
    const realFilePath = await realpath(filename);
    if (expectedExactFile) {
      if (realFilePath !== expectedExactFile) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }
    } else if (expectedDir) {
      if (!realFilePath.startsWith(expectedDir + sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }
    } else {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    // 4. Reject sensitive keywords in filenames
    if (/(?:^|[\\/])(?:key|cert|secret|probe|token|password|credential|private|notes|canary|internal)/i.test(filename)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    // 5. Extension and Content-Type Verification
    const ext = extname(realFilePath).toLowerCase();
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

    const info = await stat(realFilePath);
    if (!info.isFile()) {
      throw new Error('Not a file');
    }

    const isModelAsset = pathname.startsWith('/models/');
    const headers = {
      'Content-Type': contentType,
      'Content-Length': info.size,
      'Cache-Control': isModelAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
      'Access-Control-Allow-Origin': '*',
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
if (useHttps) {
  if (!existsSync(keyPath) || !existsSync(certPath)) {
    console.error(`FATAL: HTTPS is enabled (HTTPS=true), but TLS credentials are missing:\n  Key:  ${keyPath}\n  Cert: ${certPath}\nServer cannot start insecurely when HTTPS is explicitly required.`);
    process.exit(1);
  }
  server = createHttpsServer({
    key: readFileSync(keyPath),
    cert: readFileSync(certPath)
  }, handleRequest);
} else {
  server = createHttpServer(handleRequest);
}

server.listen(port, host, () => {
  const protocol = useHttps ? 'https' : 'http';
  console.log(`AI Fit Coach: ${protocol}://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  if (host === '0.0.0.0') {
    console.log(`  (局域网手机访问请确保使用安全上下文或本地视频评测模式)`);
  }
});
