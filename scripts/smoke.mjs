import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';

const port = 47183;
const probeFile = resolve(process.cwd(), 'dummy_probe_key.pem');

// Create temporary dummy secret file for regression testing R-001
writeFileSync(probeFile, '-----BEGIN DUMMY TEST KEY-----\nMIIB...\n-----END DUMMY TEST KEY-----\n', 'utf-8');

const server = spawn(process.execPath, ['server.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore'
});

try {
  let ready = false;
  for (let n = 0; n < 35; n++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) { ready = true; break; }
    } catch {}
    await delay(100);
  }
  assert.ok(ready, 'server should start');

  // Verify normal allowed static routes
  for (const [path, mime] of [
    ['/', 'text/html'],
    ['/src/app.js', 'text/javascript'],
    ['/src/exercise.js', 'text/javascript'],
    ['/src/styles.css', 'text/css']
  ]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(response.status, 200, `GET ${path}`);
    assert.ok(response.headers.get('content-type').includes(mime));
  }

  // Verify protected paths and 404
  for (const path of ['/tests/exercise.test.mjs', '/handoff/REVIEW_REQUEST.md', '/not-found', '/.env']) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.notEqual(response.status, 200, `Path ${path} should not be 200`);
  }

  // R-001 Security verification: secret key and cert files MUST be denied (403/404)
  for (const secretPath of ['/dummy_probe_key.pem', '/key.pem', '/cert.pem', '/server.key', '/audit_secret_probe.pem']) {
    const getRes = await fetch(`http://127.0.0.1:${port}${secretPath}`);
    assert.notEqual(getRes.status, 200, `GET ${secretPath} must not return 200`);
    assert.ok(getRes.status === 403 || getRes.status === 404, `GET ${secretPath} must return 403 or 404`);

    const headRes = await fetch(`http://127.0.0.1:${port}${secretPath}`, { method: 'HEAD' });
    assert.notEqual(headRes.status, 200, `HEAD ${secretPath} must not return 200`);
  }

  console.log('HTTP smoke PASS: routes, MIME, protected paths, 404, secret key protection (R-001)');
} finally {
  server.kill('SIGTERM');
  if (existsSync(probeFile)) {
    try { unlinkSync(probeFile); } catch {}
  }
}
