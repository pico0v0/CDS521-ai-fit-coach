import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleDegrees, extractJointAngle, ExerciseAnalyzer, checkPostureFault } from '../src/exercise.js';
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

test('side hysteresis prevents flickering when confidences are close', () => {
  const pose = simulatePose(0, 'squat');
  // Left leg: 23, 25, 27. Right leg: 24, 26, 28.
  // Set left confidence to 0.85, right confidence to 0.88 (diff < 0.12 default hysteresis)
  for (const i of [23, 25, 27]) pose[i].visibility = 0.85;
  for (const i of [24, 26, 28]) pose[i].visibility = 0.88;

  // When left side is already preferred, small advantage of right (0.03) must not switch side
  const res1 = extractJointAngle(pose, 'squat', { preferredSide: '左侧', hysteresis: 0.12 });
  assert.equal(res1.side, '左侧');

  // When right advantage exceeds hysteresis (e.g. 0.88 vs 0.70, diff 0.18 > 0.12), switch side
  for (const i of [23, 25, 27]) pose[i].visibility = 0.70;
  const res2 = extractJointAngle(pose, 'squat', { preferredSide: '左侧', hysteresis: 0.12 });
  assert.equal(res2.side, '右侧');
});

test('analyzer tracks depth progress and retains active side during rep', () => {
  const a = new ExerciseAnalyzer('squat');
  // Standing pose (170°), extended=155 -> ready
  a.update({ angle: 170, visible: true, timestamp: 100, side: '左侧' });
  const s1 = a.update({ angle: 170, visible: true, timestamp: 200, side: '左侧' });
  assert.equal(s1.progress, 0);
  assert.equal(s1.side, '左侧');
  assert.equal(a.ready, true);

  // Descending (smoothly down to 130° over samples)
  a.update({ angle: 130, visible: true, timestamp: 300, side: '左侧' });
  a.update({ angle: 130, visible: true, timestamp: 400, side: '左侧' });
  const s2 = a.update({ angle: 130, visible: true, timestamp: 500, side: '左侧' });
  assert.ok(s2.progress > 0);
  assert.equal(a.inRep, true);

  // During rep, if noisy frame detects '右侧', activeSide stays locked on '左侧'
  a.update({ angle: 105, visible: true, timestamp: 600, side: '右侧' });
  a.update({ angle: 105, visible: true, timestamp: 700, side: '右侧' });
  const s3 = a.update({ angle: 105, visible: true, timestamp: 800, side: '右侧' });
  assert.equal(s3.side, '左侧');
  assert.ok(s3.progress >= 95);
});

test('checkPostureFault detects excessive trunk forward lean in squat', () => {
  const pose = simulatePose(2000, 'squat');
  // Normal posture: shoulder 11 at (0.37, 0.41), hip 23 at (0.42, 0.66) -> dx ~ 0.05, dy ~ 0.25 (angle ~ 11°)
  const normalFault = checkPostureFault(pose, 'squat', '左侧');
  assert.equal(normalFault, null);

  // Severe trunk lean: shoulder pitched forward significantly (x = 0.12 vs hip x = 0.42, dx = 0.30, dy = 0.22 -> angle ~ 53° > 46°)
  pose[11] = { x: 0.12, y: 0.44, visibility: 0.95 };
  const leanFault = checkPostureFault(pose, 'squat', '左侧');
  assert.ok(leanFault);
  assert.equal(leanFault.code, 'trunk_lean');
  assert.match(leanFault.message, /挺胸收腹/);
});

test('checkPostureFault detects upper arm swinging during curl', () => {
  const pose = simulatePose(2000, 'curl');
  // Normal curl: shoulder 11 x=0.54, elbow 13 x=0.57 -> dx = 0.03 <= 0.11
  assert.equal(checkPostureFault(pose, 'curl', '左侧'), null);

  // Arm drift: elbow shifted to x=0.72 -> dx = 0.18 > 0.11
  pose[13] = { x: 0.72, y: 0.51, visibility: 0.95 };
  const swingFault = checkPostureFault(pose, 'curl', '左侧');
  assert.ok(swingFault);
  assert.equal(swingFault.code, 'arm_swing');
  assert.match(swingFault.message, /大臂尽量贴紧躯干/);
});

test('analyzer supports difficulty presets and target rep goal achievement', () => {
  // Beginner preset for squat sets full threshold to 122°
  const beginner = new ExerciseAnalyzer('squat', { difficulty: 'beginner', targetReps: 1 });
  assert.equal(beginner.exercise.full, 122);
  assert.equal(beginner.targetReps, 1);

  // Perform 1 rep: descend below 122° and ascend back to 170°
  beginner.update({ angle: 170, timestamp: 100 });
  beginner.update({ angle: 170, timestamp: 200 });
  beginner.update({ angle: 115, timestamp: 300 });
  beginner.update({ angle: 115, timestamp: 400 });
  beginner.update({ angle: 115, timestamp: 500 });
  beginner.update({ angle: 115, timestamp: 600 });
  beginner.update({ angle: 115, timestamp: 700 });
  beginner.update({ angle: 170, timestamp: 1000 });
  beginner.update({ angle: 170, timestamp: 1100 });
  const finalState = beginner.update({ angle: 170, timestamp: 1200 });

  assert.equal(beginner.count, 1);
  assert.ok(finalState.event?.isGoalAchieved);
  assert.match(finalState.event.message, /达成目标/);
});
