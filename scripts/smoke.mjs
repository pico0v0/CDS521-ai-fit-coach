import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync, rmdirSync, lstatSync, existsSync, symlinkSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const port = 47183;
const cwd = process.cwd();

// Temporary test files
const privateJsonFile = resolve(cwd, 'private_notes.json');
const teachingFile = resolve(cwd, 'teaching_results.json');
const probeKeyFile = resolve(cwd, 'dummy_probe_key.pem');
const outsideTarget = resolve(tmpdir(), 'ai_fit_external_secret.txt');
const symlinkFile = resolve(cwd, 'src', 'outside-demo.js');
const internalDirSymlink = resolve(cwd, 'src', 'internal-alias');

const CANARY_TEXT = 'FAKE_SECRET_CANARY_2026_DO_NOT_EXPOSE';
const TEACHING_CANARY = 'R2_TEST_ONLY_CANARY_DO_NOT_PUBLISH';
const EXTERNAL_CANARY = 'EXTERNAL_DUMMY_CANARY';

writeFileSync(privateJsonFile, JSON.stringify({ secret: CANARY_TEXT }), 'utf-8');
writeFileSync(teachingFile, TEACHING_CANARY, 'utf-8');
writeFileSync(probeKeyFile, '-----BEGIN DUMMY TEST KEY-----\nMIIB...\n-----END DUMMY TEST KEY-----\n', 'utf-8');
writeFileSync(outsideTarget, EXTERNAL_CANARY, 'utf-8');

let fileSymlinkCreated = false;
try {
  symlinkSync(outsideTarget, symlinkFile, 'file');
  fileSymlinkCreated = true;
} catch {
  fileSymlinkCreated = false;
}

let dirSymlinkCreated = false;
try {
  symlinkSync('..', internalDirSymlink, 'dir');
  dirSymlinkCreated = true;
} catch {
  dirSymlinkCreated = false;
}

function safeRemoveSymlink(p) {
  try {
    const st = lstatSync(p);
    if (st.isSymbolicLink()) {
      if (st.isDirectory()) {
        try { rmdirSync(p); } catch { unlinkSync(p); }
      } else {
        unlinkSync(p);
      }
    } else if (existsSync(p)) {
      unlinkSync(p);
    }
  } catch {}
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
    '/teaching_results.json',
    '/dummy_probe_key.pem'
  ];

  for (const path of forbiddenPaths) {
    const getRes = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(getRes.status, 403, `GET ${path} must be 403 Forbidden, got ${getRes.status}`);
    const body = await getRes.text();
    assert.ok(!body.includes(CANARY_TEXT), `GET ${path} leaked canary content!`);
    assert.ok(!body.includes(TEACHING_CANARY), `GET ${path} leaked teaching canary!`);

    const headRes = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'HEAD' });
    assert.equal(headRes.status, 403, `HEAD ${path} must be 403 Forbidden, got ${headRes.status}`);
  }

  // C. File Symlink test
  if (fileSymlinkCreated) {
    const symlinkRes = await fetch(`http://127.0.0.1:${port}/src/outside-demo.js`);
    assert.equal(symlinkRes.status, 403, `GET /src/outside-demo.js must be 403 Forbidden, got ${symlinkRes.status}`);
    const body = await symlinkRes.text();
    assert.ok(!body.includes(EXTERNAL_CANARY), 'Symlink leaked external secret!');

    const headSymlink = await fetch(`http://127.0.0.1:${port}/src/outside-demo.js`, { method: 'HEAD' });
    assert.equal(headSymlink.status, 403, `HEAD /src/outside-demo.js must be 403 Forbidden, got ${headSymlink.status}`);
  }

  // D. Directory Symlink traversal test (P0-01)
  if (dirSymlinkCreated) {
    for (const sub of ['server.mjs', 'package.json', 'teaching_results.json']) {
      const dirLinkPath = `/src/internal-alias/${sub}`;
      const res = await fetch(`http://127.0.0.1:${port}${dirLinkPath}`);
      assert.equal(res.status, 403, `GET ${dirLinkPath} must be 403 Forbidden, got ${res.status}`);
      const body = await res.text();
      assert.ok(!body.includes(TEACHING_CANARY), `Directory symlink ${dirLinkPath} leaked content!`);

      const headRes = await fetch(`http://127.0.0.1:${port}${dirLinkPath}`, { method: 'HEAD' });
      assert.equal(headRes.status, 403, `HEAD ${dirLinkPath} must be 403 Forbidden, got ${headRes.status}`);
    }
  }

  // E. 404 on non-existent whitelisted path
  const notFoundRes = await fetch(`http://127.0.0.1:${port}/src/non_existent_module.js`);
  assert.equal(notFoundRes.status, 404, 'Non-existent whitelisted path should return 404');

  console.log('HTTP smoke PASS: routes, MIME, path whitelist, directory/file symlink defense, zero leakage (R-001-A)');
} finally {
  server.kill('SIGTERM');

  // Clean up symlinks FIRST using lstatSync to prevent dangling symlinks
  safeRemoveSymlink(symlinkFile);
  safeRemoveSymlink(internalDirSymlink);

  // Then clean up targets and temporary files
  if (existsSync(outsideTarget)) { try { unlinkSync(outsideTarget); } catch {} }
  if (existsSync(privateJsonFile)) { try { unlinkSync(privateJsonFile); } catch {} }
  if (existsSync(teachingFile)) { try { unlinkSync(teachingFile); } catch {} }
  if (existsSync(probeKeyFile)) { try { unlinkSync(probeKeyFile); } catch {} }
}
