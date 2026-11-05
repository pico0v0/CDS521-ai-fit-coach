import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSessions, saveSession, clearSessions, makeAdvice, exportSessionsCSV, exportSessionsJSON, computeMaeStats } from '../src/store.js';

function memoryStorage() {
  const map=new Map();
  return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k), map};
}
const record={id:'1', startedAt:'2026-11-05T00:00:00.000Z',exercise:'squat',mode:'demo',count:5,partialCount:1,durationSeconds:20};

test('session persistence is local, bounded, and clearable',()=>{
  const db=memoryStorage();
  assert.deepEqual(loadSessions(db),[]);
  assert.equal(saveSession(record,db),true);
  assert.equal(loadSessions(db)[0].count,5);
  for (let i=0;i<50;i++) saveSession({...record,id:String(i)},db);
  assert.equal(loadSessions(db).length,40);
  assert.equal(clearSessions(db),true);
  assert.deepEqual(loadSessions(db),[]);
});
test('corrupted and untrusted local records are ignored',()=>{
  const db=memoryStorage();
  db.setItem('aifit-demo-sessions-v1','not json');
  assert.deepEqual(loadSessions(db),[]);
  db.setItem('aifit-demo-sessions-v1',JSON.stringify([{id:'bad',count:'oops'},record,{...record,id:'2',exercise:'jumping_jack'}]));
  assert.equal(loadSessions(db).length,2);
});
test('advice depends on fatigue, incomplete reps, no reps and goal',()=>{
  assert.match(makeAdvice(record,'habit','high'),/休息/);
  assert.match(makeAdvice({...record,count:1,partialCount:5},'habit','normal'),/幅度/);
  assert.match(makeAdvice({...record,count:0,partialCount:0},'habit','normal'),/没有记录/);
  assert.match(makeAdvice(record,'strength','low'),/稳定/);
  assert.match(makeAdvice({...record,count:4,faultCounts:{trunk_lean:2}},'habit','normal'),/躯干前倾/);
  assert.match(makeAdvice({...record,count:4,faultCounts:{arm_swing:1}},'habit','normal'),/借力/);
  assert.match(makeAdvice({...record,exercise:'jumping_jack',count:8,faultCounts:{arm_asymmetry:1}},'habit','normal'),/不对称/);
});

test('session export generates valid CSV with BOM and JSON', () => {
  const sample = [
    { ...record, count: 12, manualCount: 10, absError: 2, faultCounts: { trunk_lean: 1, arm_swing: 0 } },
    { ...record, id: '2', exercise: 'jumping_jack', mode: 'video', count: 20, faultCounts: { arm_asymmetry: 1 } }
  ];
  const csv = exportSessionsCSV(sample);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /深蹲/);
  assert.match(csv, /开合跳/);
  assert.match(csv, /本地视频AI/);
  assert.match(csv, /"10"/); // manualCount
  assert.match(csv, /"2"/);  // absError
  assert.match(csv, /"20"/);

  const jsonStr = exportSessionsJSON(sample);
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].count, 12);
  assert.equal(parsed[0].manualCount, 10);
  assert.equal(parsed[0].absError, 2);
  assert.equal(parsed[1].exercise, 'jumping_jack');
});

test('computeMaeStats strictly isolates real AI sessions from simulation data', () => {
  // 1. Only demo sessions with 0 error: realMae must be null (not 0.00!)
  const demoOnly = Array.from({ length: 10 }, (_, i) => ({
    ...record,
    id: `demo-${i}`,
    mode: 'demo',
    count: 10,
    manualCount: 10,
    absError: 0
  }));
  const resDemo = computeMaeStats(demoOnly);
  assert.equal(resDemo.realMae, null, 'realMae must be null when only demo data is present');
  assert.equal(resDemo.realCount, 0);
  assert.equal(resDemo.demoMae, 0.00);
  assert.equal(resDemo.demoCount, 10);

  // 2. Real camera/video sessions with error
  const realSessions = [
    { ...record, id: 'real-1', mode: 'camera', count: 12, manualCount: 10, absError: 2, trackedFrames: 120 },
    { ...record, id: 'real-2', mode: 'video', count: 15, manualCount: 16, absError: 1, trackedFrames: 200 }
  ];
  const resReal = computeMaeStats(realSessions);
  assert.equal(resReal.realMae, 1.50);
  assert.equal(resReal.realCount, 2);

  // 3. Mixing 10 perfect demo sessions does NOT dilute or change real MAE at all!
  const mixed = [...realSessions, ...demoOnly];
  const resMixed = computeMaeStats(mixed);
  assert.equal(resMixed.realMae, 1.50, 'realMae must remain exactly 1.50 even when 10 demo sessions are mixed');
  assert.equal(resMixed.realCount, 2);
  assert.equal(resMixed.demoMae, 0.00);
  assert.equal(resMixed.demoCount, 10);

  // 4. Invalid manualCount or insufficient tracked frames are rejected
  const invalid = [
    { ...record, id: 'bad-1', mode: 'camera', count: 10, manualCount: -5, absError: 15, trackedFrames: 100 },
    { ...record, id: 'bad-2', mode: 'video', count: 10, manualCount: 3.8, absError: 6.2, trackedFrames: 100 },
    { ...record, id: 'bad-3', mode: 'camera', count: 10, manualCount: 10, absError: 0, trackedFrames: 2 } // < 5 frames
  ];
  const resInvalid = computeMaeStats(invalid);
  assert.equal(resInvalid.realMae, null);
  assert.equal(resInvalid.realCount, 0);
});
