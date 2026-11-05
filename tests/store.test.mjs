import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSessions, saveSession, clearSessions, makeAdvice } from '../src/store.js';

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
  db.setItem('aifit-demo-sessions-v1',JSON.stringify([{id:'bad',count:'oops'},record]));
  assert.equal(loadSessions(db).length,1);
});
test('advice depends on fatigue, incomplete reps, no reps and goal',()=>{
  assert.match(makeAdvice(record,'habit','high'),/休息/);
  assert.match(makeAdvice({...record,count:1,partialCount:5},'habit','normal'),/幅度/);
  assert.match(makeAdvice({...record,count:0,partialCount:0},'habit','normal'),/没有记录/);
  assert.match(makeAdvice(record,'strength','low'),/稳定/);
  assert.match(makeAdvice({...record,count:4,faultCounts:{trunk_lean:2}},'habit','normal'),/躯干前倾/);
  assert.match(makeAdvice({...record,count:4,faultCounts:{arm_swing:1}},'habit','normal'),/借力/);
});
