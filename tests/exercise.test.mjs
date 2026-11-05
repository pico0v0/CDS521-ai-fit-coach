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

test('synthetic landmarks have measurable joint angles', () => {
  for (const id of ['squat','curl','jumping_jack']) {
    const pose=simulatePose(2000,id);
    const joint=extractJointAngle(pose,id);
    assert.ok(joint && joint.confidence >= .9);
    assert.ok(joint.angle > 20 && joint.angle <= 180);
  }
});

test('low visibility and missing landmarks do not produce fake measurements', () => {
  const pose=simulatePose(0,'squat');
  for(const i of [23,25,27,24,26,28]) pose[i].visibility=0;
  assert.equal(extractJointAngle(pose,'squat'),null);
  assert.equal(extractJointAngle([], 'curl'),null);
});

for(const id of ['squat','curl','jumping_jack']) {
  test(`${id}: counts 3 complete and flags one shallow in 4 synthetic cycles`, () => {
    const analyzer=new ExerciseAnalyzer(id);
    const events=[];
    for(let t=0;t<4700*4;t+=100) {
      const pose=simulatePose(t,id);
      const joint=extractJointAngle(pose,id);
      const state=analyzer.update({angle:joint?.angle,visible:!!joint,timestamp:t+1,landmarks:pose});
      if(state.event)events.push(state.event.type);
    }
    assert.equal(analyzer.count,3);
    assert.equal(analyzer.partialCount,1);
    assert.deepEqual(events,['success','success','warning','success']);
  });
}

for(const id of ['squat','curl']) {
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

test('jumping_jack: static pose and interrupted rep handling', () => {
  const staticAnalyzer = new ExerciseAnalyzer('jumping_jack');
  for (let t = 0; t < 5000; t += 100) staticAnalyzer.update({ angle: 25, visible: true, timestamp: t + 1 });
  assert.equal(staticAnalyzer.count, 0);

  const interruptAnalyzer = new ExerciseAnalyzer('jumping_jack');
  interruptAnalyzer.update({ angle: 25, visible: true, timestamp: 1 });
  interruptAnalyzer.update({ angle: 135, visible: true, timestamp: 101 });
  interruptAnalyzer.update({ angle: null, visible: false, timestamp: 201 });
  interruptAnalyzer.update({ angle: 25, visible: true, timestamp: 301 });
  assert.equal(interruptAnalyzer.count, 0);
  assert.equal(interruptAnalyzer.partialCount, 0);
});

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

test('analyzer tracks depth progress and strictly resets rep if side switches mid-rep (R-004)', () => {
  const a = new ExerciseAnalyzer('squat');
  // Standing pose (170°), extended=155 -> ready
  a.update({ angle: 170, visible: true, timestamp: 100, side: '左侧' });
  const s1 = a.update({ angle: 170, visible: true, timestamp: 200, side: '左侧' });
  assert.equal(s1.progress, 0);
  assert.equal(s1.side, '左侧');
  assert.equal(a.ready, true);

  // Descending on 左侧 (smoothly down to 130° over samples)
  a.update({ angle: 130, visible: true, timestamp: 300, side: '左侧' });
  a.update({ angle: 130, visible: true, timestamp: 400, side: '左侧' });
  const s2 = a.update({ angle: 130, visible: true, timestamp: 500, side: '左侧' });
  assert.ok(s2.progress > 0);
  assert.equal(a.inRep, true);
  assert.equal(a.activeSide, '左侧');

  // Continues descending on same side (左侧)
  a.update({ angle: 105, visible: true, timestamp: 600, side: '左侧' });
  a.update({ angle: 105, visible: true, timestamp: 700, side: '左侧' });
  const s3 = a.update({ angle: 105, visible: true, timestamp: 800, side: '左侧' });
  assert.equal(s3.side, '左侧');
  assert.ok(s3.progress >= 95);
  assert.equal(a.inRep, true);

  // Mid-rep side jump to 右侧 must immediately abort the rep to prevent false count
  const resetSnap = a.update({ angle: 105, visible: true, timestamp: 900, side: '右侧' });
  assert.equal(a.inRep, false);
  assert.equal(resetSnap.event?.type, 'warning');
  assert.match(resetSnap.event?.message, /侧别切换/);
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

test('checkPostureFault detects arm asymmetry in jumping jacks', () => {
  const normalPose = simulatePose(2000, 'jumping_jack');
  assert.equal(checkPostureFault(normalPose, 'jumping_jack'), null);

  // Injected fault simulation (cycle % 4 === 1 at t=2000ms: 4700 + 2000 = 6700ms)
  const faultPose = simulatePose(6700, 'jumping_jack', { simulateFault: true });
  const fault = checkPostureFault(faultPose, 'jumping_jack');
  assert.ok(fault);
  assert.equal(fault.code, 'arm_asymmetry');
  assert.match(fault.message, /对称舒展/);
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

test('R-010 regression: degenerate landmarks in jumping_jack return null instead of 0°', () => {
  let p = simulatePose(0, 'jumping_jack');
  for (let [w, s] of [[15, 11], [16, 12]]) p[w] = { ...p[w], x: p[s].x, y: p[s].y };
  const res = extractJointAngle(p, 'jumping_jack');
  assert.equal(res, null, 'Degenerate overlapping landmarks must return null, never 0° with fake confidence');
});

test('R-004 regression: side switch while tracked side stays bent does NOT count a rep', () => {
  const a = new ExerciseAnalyzer('squat');
  const feed = (t, phase) => {
    const p = simulatePose(phase === 'bent' ? 2000 : 0, 'squat');
    if (phase === 'bent') {
      const standing = simulatePose(0, 'squat');
      for (const i of [24, 26, 28]) p[i] = { ...standing[i], visibility: 0 };
    }
    if (phase === 'other_straight') {
      const bent = simulatePose(2000, 'squat');
      const standing = simulatePose(0, 'squat');
      for (const i of [23, 25, 27]) p[i] = { ...bent[i], visibility: 0 };
      for (const i of [24, 26, 28]) p[i] = standing[i];
    }
    let joint = extractJointAngle(p, 'squat', { preferredSide: a.activeSide, hysteresis: 0.12 });
    a.update({ angle: joint?.angle, visible: !!joint, timestamp: t, side: joint?.side });
  };
  for (const t of [100, 200, 300]) feed(t, 'standing');
  for (const t of [400, 500, 600, 700, 800, 900]) feed(t, 'bent');
  for (const t of [1000, 1100, 1200, 1300, 1400, 1500]) feed(t, 'other_straight');

  assert.equal(a.count, 0, 'Abruptly switching to straight opposite leg must not count as a completed squat');
});

test('R-005 regression: jumping jacks require bidirectional leg coordination across all 4 scenarios', () => {
  function testJumpingJackScenario(mode) {
    const a = new ExerciseAnalyzer('jumping_jack');
    const standing = simulatePose(0, 'jumping_jack');
    const spread = simulatePose(2200, 'jumping_jack');
    for (let t = 0; t < 4 * 4700; t += 100) {
      const p = simulatePose(t, 'jumping_jack');
      if (mode === 'closed') for (const i of [25, 26, 27, 28, 29, 30]) p[i] = { ...standing[i] };
      if (mode === 'wide') for (const i of [25, 26, 27, 28, 29, 30]) p[i] = { ...spread[i] };
      if (mode === 'occluded') for (const i of [27, 28]) p[i].visibility = 0;
      const j = extractJointAngle(p, 'jumping_jack');
      a.update({ angle: j?.angle, visible: !!j, timestamp: t + 1, side: j?.side, landmarks: p });
    }
    return { count: a.count, partial: a.partialCount };
  }

  // 1. Legs held closed: arms only -> count must be 0
  const closedRes = testJumpingJackScenario('closed');
  assert.equal(closedRes.count, 0, 'Legs held closed must not count as jumping jacks');
  assert.equal(closedRes.partial, 4);

  // 2. Legs held permanently wide: no start/end closing cycle -> count must be 0
  const wideRes = testJumpingJackScenario('wide');
  assert.equal(wideRes.count, 0, 'Legs permanently wide without closing cycle must not count as jumping jacks');
  assert.equal(wideRes.partial, 4);

  // 3. Legs occluded/invisible: cannot verify lower body -> count must be 0
  const occludedRes = testJumpingJackScenario('occluded');
  assert.equal(occludedRes.count, 0, 'Legs occluded must not be defaulted to complete jumping jacks');
  assert.equal(occludedRes.partial, 4);

  // 4. Normal synchronized jumping jacks: 3 complete reps, 1 planned shallow rep
  const normalRes = testJumpingJackScenario('normal');
  assert.equal(normalRes.count, 3, 'Normal jumping jacks must retain 3 completed reps');
  assert.equal(normalRes.partial, 1, 'Normal jumping jacks must retain 1 shallow rep');
});

test('R-006 regression: first posture fault within first 3000ms is immediately triggered', () => {
  const a = new ExerciseAnalyzer('curl');
  let p = simulatePose(2000, 'curl');
  p[13] = { ...p[13], x: p[11].x + 0.25 }; // Injected arm swing fault
  const triggeredTimes = [];
  for (let t = 100; t < 2400; t += 100) {
    const s = a.update({ angle: t < 300 ? 175 : 55, visible: true, timestamp: t, side: '左侧', landmarks: p });
    if (s.event?.code === 'arm_swing') triggeredTimes.push(t);
  }

  assert.ok(triggeredTimes.length > 0, 'First posture fault must NOT be suppressed by cooldown when timestamp < 3000ms');
  assert.equal(a.faultCounts.arm_swing, 1);
});
