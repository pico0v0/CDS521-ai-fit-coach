import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleDegrees, extractJointAngle, ExerciseAnalyzer } from '../src/exercise.js';
import { simulatedAngle, simulatePose } from '../src/simulator.js';

test('2D angle geometry, invalid and degenerate landmarks', () => {
  assert.equal(Math.round(angleDegrees({x:1,y:0},{x:0,y:0},{x:0,y:1})), 90);
  assert.equal(Math.round(angleDegrees({x:0,y:-1},{x:0,y:0},{x:0,y:1})), 180);
  assert.equal(angleDegrees({x:0,y:0},{x:0,y:0},{x:1,y:1}), null);
  assert.equal(angleDegrees({x:0,y:0},{x:0,y:0},null), null);
});

test('synthetic landmarks have measurable squat and curl joint angles', () => {
  for (const id of ['squat','curl']) {
    const pose=simulatePose(2000,id);
    const joint=extractJointAngle(pose,id);
    assert.ok(joint && joint.confidence >= .9);
    assert.ok(joint.angle > 40 && joint.angle <= 180);
  }
});

test('low visibility and missing landmarks do not produce fake measurements', () => {
  const pose=simulatePose(0,'squat');
  for(const i of [23,25,27,24,26,28]) pose[i].visibility=0;
  assert.equal(extractJointAngle(pose,'squat'),null);
  assert.equal(extractJointAngle([], 'curl'),null);
});

for(const id of ['squat','curl']) {
  test(`${id}: counts 3 complete and flags one shallow in 4 synthetic cycles`, () => {
    const analyzer=new ExerciseAnalyzer(id);
    const events=[];
    for(let t=0;t<4700*4;t+=100) {
      const pose=simulatePose(t,id);
      const joint=extractJointAngle(pose,id);
      const state=analyzer.update({angle:joint?.angle,visible:!!joint,timestamp:t+1});
      if(state.event)events.push(state.event.type);
    }
    assert.equal(analyzer.count,3);
    assert.equal(analyzer.partialCount,1);
    assert.deepEqual(events,['success','success','warning','success']);
  });
  test(`${id}: static pose never counts`, () => {
    const analyzer=new ExerciseAnalyzer(id);
    for(let t=0;t<5000;t+=100) analyzer.update({angle:175,visible:true,timestamp:t+1});
    assert.equal(analyzer.count,0);
  });
  test(`${id}: loss of pose interrupts rep`, () => {
    const a=new ExerciseAnalyzer(id);
    a.update({angle:174,visible:true,timestamp:1});
    a.update({angle:100,visible:true,timestamp:101});
    a.update({angle:null,visible:false,timestamp:201});
    a.update({angle:175,visible:true,timestamp:301});
    assert.equal(a.count,0);
    assert.equal(a.partialCount,0);
  });
  test(`${id}: long gap does not complete an unfinished rep`, () => {
    const a=new ExerciseAnalyzer(id);
    a.update({angle:174,visible:true,timestamp:1});
    a.update({angle:100,visible:true,timestamp:101});
    a.update({angle:175,visible:true,timestamp:2000});
    assert.equal(a.count,0);
  });
}

test('timestamps must be increasing; invalid exercise rejected', () => {
  assert.throws(()=>new ExerciseAnalyzer('unknown'));
  const a=new ExerciseAnalyzer();
  a.update({angle:175,timestamp:100});
  assert.equal(a.update({angle:85,timestamp:100}).angle,175);
  assert.throws(()=>a.update({angle:85,timestamp:NaN}));
});

test('simulated angle exercises have planned shallow cycles', () => {
  for (const id of ['squat','curl']) {
    const full = simulatedAngle(4700+2400,id);
    const shallow=simulatedAngle(2*4700+2400,id);
    assert.ok(shallow > full);
  }
});
