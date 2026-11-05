import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSessions, saveSession, clearSessions, makeAdvice, exportSessionsCSV, exportSessionsJSON } from '../src/store.js';

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
