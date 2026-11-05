import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, symlinkSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const port = 47183;
const cwd = process.cwd();

// 1. Temporary test canary file in project root (simulating arbitrary private JSON)
const privateJsonFile = resolve(cwd, 'private_notes.json');
const CANARY_TEXT = 'FAKE_SECRET_CANARY_2026_DO_NOT_EXPOSE';
writeFileSync(privateJsonFile, JSON.stringify({ secret: CANARY_TEXT }), 'utf-8');

// 2. Temporary dummy probe key
const probeKeyFile = resolve(cwd, 'dummy_probe_key.pem');
writeFileSync(probeKeyFile, '-----BEGIN DUMMY TEST KEY-----\nMIIB...\n-----END DUMMY TEST KEY-----\n', 'utf-8');

// 3. Temporary symlink pointing outside project root
const outsideTarget = resolve(tmpdir(), 'ai_fit_external_secret.txt');
writeFileSync(outsideTarget, 'EXTERNAL_SECRET_CONTENT_CANARY', 'utf-8');
const symlinkFile = resolve(cwd, 'linked-public.js');
let symlinkCreated = false;
try {
  symlinkSync(outsideTarget, symlinkFile, 'file');
  symlinkCreated = true;
} catch {
  // On some Windows machines, symlink requires Developer Mode or Admin rights
  symlinkCreated = false;
}

const server = spawn(process.execPath, ['server.mjs'], {
  cwd,
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

  // A. Legitimate client asset paths MUST be 200 with proper MIME
  for (const [path, mime] of [
    ['/', 'text/html'],
    ['/index.html', 'text/html'],
    ['/src/app.js', 'text/javascript'],
    ['/src/exercise.js', 'text/javascript'],
    ['/src/styles.css', 'text/css']
  ]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(response.status, 200, `GET ${path} should be 200`);
    assert.ok(response.headers.get('content-type')?.includes(mime), `GET ${path} content-type mismatch`);

    const headRes = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'HEAD' });
    assert.equal(headRes.status, 200, `HEAD ${path} should be 200`);
  }

  // B. Internal and sensitive files MUST return 403 Forbidden (GET & HEAD)
  const forbiddenPaths = [
    '/key.pem',
    '/server.key',
    '/.env',
    '/docs/ARCHITECTURE.md',
    '/handoff/FIX_REPORT.md',
    '/server.mjs',
    '/package.json',
    '/private_notes.json',
    '/dummy_probe_key.pem'
  ];

  for (const path of forbiddenPaths) {
    const getRes = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(getRes.status, 403, `GET ${path} must be 403 Forbidden, got ${getRes.status}`);
    const body = await getRes.text();
    assert.ok(!body.includes(CANARY_TEXT), `GET ${path} leaked canary content!`);

    const headRes = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'HEAD' });
    assert.equal(headRes.status, 403, `HEAD ${path} must be 403 Forbidden, got ${headRes.status}`);
  }

  // C. Symlink test (if created)
  if (symlinkCreated) {
    const symlinkRes = await fetch(`http://127.0.0.1:${port}/linked-public.js`);
    assert.equal(symlinkRes.status, 403, `GET /linked-public.js must be 403 Forbidden, got ${symlinkRes.status}`);
    const body = await symlinkRes.text();
    assert.ok(!body.includes('EXTERNAL_SECRET_CONTENT_CANARY'), 'Symlink leaked external secret!');

    const headSymlink = await fetch(`http://127.0.0.1:${port}/linked-public.js`, { method: 'HEAD' });
    assert.equal(headSymlink.status, 403, `HEAD /linked-public.js must be 403 Forbidden, got ${headSymlink.status}`);
  }

  // D. 404 on non-existent whitelisted path
  const notFoundRes = await fetch(`http://127.0.0.1:${port}/src/non_existent_module.js`);
  assert.equal(notFoundRes.status, 404, 'Non-existent whitelisted path should return 404');

  console.log('HTTP smoke PASS: routes, MIME, path whitelist, symlink defense, canary protection (R-001-A)');
} finally {
  server.kill('SIGTERM');
  if (existsSync(privateJsonFile)) { try { unlinkSync(privateJsonFile); } catch {} }
  if (existsSync(probeKeyFile)) { try { unlinkSync(probeKeyFile); } catch {} }
  if (existsSync(outsideTarget)) { try { unlinkSync(outsideTarget); } catch {} }
  if (existsSync(symlinkFile)) { try { unlinkSync(symlinkFile); } catch {} }
}
