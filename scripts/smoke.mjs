import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const port=47183;
const server=spawn(process.execPath,['server.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(port)},stdio:'ignore'});
try {
  let ready=false;
  for(let n=0;n<35;n++) {
    try {const res=await fetch(`http://127.0.0.1:${port}/`); if(res.ok){ready=true;break;}} catch{}
    await delay(100);
  }
  assert.ok(ready,'server should start');
  for(const [path,mime] of [['/','text/html'],['/src/app.js','text/javascript'],['/src/exercise.js','text/javascript'],['/src/styles.css','text/css']]) {
    const response=await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(response.status,200,`GET ${path}`);
    assert.ok(response.headers.get('content-type').includes(mime));
  }
  for(const path of ['/tests/exercise.test.mjs','/handoff/REVIEW_REQUEST.md','/not-found']) {
    const response=await fetch(`http://127.0.0.1:${port}${path}`);
    assert.notEqual(response.status,200);
  }
  console.log('HTTP smoke PASS: routes, MIME, protected paths, 404');
} finally {server.kill('SIGTERM');}
