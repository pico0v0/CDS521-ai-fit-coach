import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleDegrees, extractJointAngle, ExerciseAnalyzer, checkPostureFault, EXERCISE_GUIDES } from '../src/exercise.js';
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

test('R-005 regression: jumping jacks require bidirectional leg coordination across all scenarios', () => {
  function testJumpingJackScenario(mode, options = {}) {
    const difficulty = options.difficulty || 'standard';
    const a = new ExerciseAnalyzer('jumping_jack', { difficulty });
    const standing = simulatePose(0, 'jumping_jack');
    const spread = simulatePose(2200, 'jumping_jack');
    for (let t = 0; t < 4 * 4700; t += 100) {
      const p = simulatePose(t, 'jumping_jack');
      const phase = t % 4700;
      if (mode === 'closed') for (const i of [25, 26, 27, 28, 29, 30]) p[i] = { ...standing[i] };
      if (mode === 'wide') for (const i of [25, 26, 27, 28, 29, 30]) p[i] = { ...spread[i] };
      if (mode === 'occluded') for (const i of [27, 28]) p[i].visibility = 0;
      if (mode === 'hips_move_ankles_static') {
        for (const i of [25, 26, 27, 28, 29, 30]) p[i] = { ...standing[i] };
        if (phase > 1450 && phase < 2050) {
          p[23].x = 0.47; p[24].x = 0.53;
        }
      }
      if (mode === 'legs_out_of_sync') {
        for (const i of [25, 26, 27, 28, 29, 30]) p[i] = { ...(phase >= 1450 && phase <= 1750 ? spread[i] : standing[i]) };
      }
      if (mode === 'early_leg_close') {
        for (const i of [25, 26, 27, 28, 29, 30]) p[i] = { ...(phase >= 2100 && phase <= 2200 ? spread[i] : standing[i]) };
      }
      if (mode === 'beginner_118') {
        // Construct a deliberately limited 118° arm sweep in *pixel* space;
        // normalised x/y sin/cos directly would be anisotropically distorted.
        const target = Math.min(simulatedAngle(t, 'jumping_jack'), 118) * Math.PI / 180;
        for (const [hip, shoulder, elbow, wrist, side] of [[23,11,13,15,-1],[24,12,14,16,1]]) {
          const off = Math.atan2(Math.abs(p[hip].x-p[shoulder].x)*960,
            (p[hip].y-p[shoulder].y)*540);
          const theta = target - off;
          const shoulderPx = {x:p[shoulder].x*960, y:p[shoulder].y*540};
          const reach=150;
          const wristPx = {x:shoulderPx.x+side*reach*Math.sin(theta), y:shoulderPx.y+reach*Math.cos(theta)};
          p[wrist] = {...p[wrist],x:wristPx.x/960,y:wristPx.y/540};
          p[elbow] = {...p[elbow],x:(shoulderPx.x+wristPx.x)/2/960,y:(shoulderPx.y+wristPx.y)/2/540};
        }
      }
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

  // 4. Ankles static, hips move (artificial ratio jump without ankle spread) -> count must be 0
  const hipsRes = testJumpingJackScenario('hips_move_ankles_static');
  assert.equal(hipsRes.count, 0, 'Ankles static with only hip narrowing must not count as jumping jacks');
  assert.equal(hipsRes.partial, 4);

  // 5. Legs out of sync (legs spread early and closed before arms reach overhead) -> count must be 0
  const syncRes = testJumpingJackScenario('legs_out_of_sync');
  assert.equal(syncRes.count, 0, 'Asynchronous leg spread before arms overhead must not count as jumping jacks');
  assert.equal(syncRes.partial, 4);

  // 6. Early leg close (legs spread briefly and close while arms remain overhead at true peak) -> count must be 0
  const earlyCloseRes = testJumpingJackScenario('early_leg_close');
  assert.equal(earlyCloseRes.count, 0, 'Legs closing while arms remain at peak overhead must not count');
  assert.equal(earlyCloseRes.partial, 4);

  // 7. Beginner mode with arms reaching 118° (target 115°) and normal legs -> count must be 3 complete, 1 shallow
  const beginnerRes = testJumpingJackScenario('beginner_118', { difficulty: 'beginner' });
  assert.equal(beginnerRes.count, 3, 'Beginner mode must accept arms reaching 118° when target is 115°');
  assert.equal(beginnerRes.partial, 1, 'Beginner mode retains planned shallow rep');

  // 8. Normal synchronized jumping jacks: 3 complete reps, 1 planned shallow rep
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

test('R-009 regression: 1-to-1 event-level shallow rep matching accurately detects duplicate false alarms (FP) under injection', () => {
  function matchShallowEvents(predictions, gtCycles, period = 4700) {
    const gtEvents = gtCycles.map(c => ({
      cycleIndex: c,
      windowStart: c * period,
      windowEnd: (c + 1) * period,
      matched: false
    }));
    let tp = 0;
    let fp = 0;
    for (const pred of predictions) {
      const match = gtEvents.find(gt => !gt.matched && pred.timestamp >= gt.windowStart && pred.timestamp < gt.windowEnd);
      if (match) {
        match.matched = true;
        tp++;
      } else {
        fp++;
      }
    }
    const fn = gtEvents.filter(gt => !gt.matched).length;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 1.0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 1.0;
    return { tp, fp, fn, precision, recall };
  }

  const gtCycles = [2, 6]; // 2 planned shallow cycles in an 8-cycle sequence

  // 1. Normal predictions: exactly one per shallow cycle
  const normalPreds = [
    { timestamp: 2 * 4700 + 4500 },
    { timestamp: 6 * 4700 + 4500 }
  ];
  const normalRes = matchShallowEvents(normalPreds, gtCycles);
  assert.equal(normalRes.tp, 2);
  assert.equal(normalRes.fp, 0);
  assert.equal(normalRes.fn, 0);
  assert.equal(normalRes.precision, 1.0);
  assert.equal(normalRes.recall, 1.0);

  // 2. Negative injection: duplicate predictions within the same shallow cycle window (e.g., 3 predictions for cycle 2)
  const injectedPreds = [
    { timestamp: 2 * 4700 + 4200 },
    { timestamp: 2 * 4700 + 4400 }, // duplicate
    { timestamp: 2 * 4700 + 4600 }, // duplicate
    { timestamp: 6 * 4700 + 4500 }
  ];
  const injectedRes = matchShallowEvents(injectedPreds, gtCycles);
  assert.equal(injectedRes.tp, 2, 'All 2 GT cycles are recalled');
  assert.equal(injectedRes.fp, 2, 'Two duplicate predictions in the same window must be identified as False Positives');
  assert.equal(injectedRes.fn, 0);
  assert.equal(injectedRes.recall, 1.0);
  assert.equal(injectedRes.precision, 0.5, 'Precision drops to 50% due to 2 False Positives');
});

test('EXERCISE_GUIDES schema: all exercises have standard cues and detailed faults breakdown', () => {
  for (const id of ['squat', 'curl', 'jumping_jack']) {
    const guide = EXERCISE_GUIDES[id];
    assert.ok(guide, `Guide exists for ${id}`);
    assert.ok(guide.standard.title && guide.standard.summary, `Standard metadata exists for ${id}`);
    assert.ok(Array.isArray(guide.standard.cues) && guide.standard.cues.length >= 3, `At least 3 cues for ${id}`);
    assert.ok(Array.isArray(guide.faults) && guide.faults.length >= 2, `At least 2 common faults for ${id}`);

    for (const f of guide.faults) {
      assert.ok(f.id, 'Fault has id');
      assert.ok(f.name, 'Fault has name');
      assert.ok(f.where && f.where.length > 10, 'Fault has detailed "where" (错在哪)');
      assert.ok(f.why && f.why.length > 10, 'Fault has detailed "why" (为什么错)');
      assert.ok(f.correction && f.correction.length > 10, 'Fault has detailed "correction" (如何纠正)');
      assert.ok(f.aiRule && f.aiRule.length > 10, 'Fault has detailed "aiRule" (AI 判定规则)');
    }
  }
});

test('simulatePose in standard mode produces 100% full reps without shallow reps', () => {
  for (const id of ['squat', 'curl', 'jumping_jack']) {
    const analyzer = new ExerciseAnalyzer(id);
    for (let t = 0; t < 4700 * 4; t += 100) {
      const pose = simulatePose(t, id, { mode: 'standard' });
      const joint = extractJointAngle(pose, id);
      analyzer.update({ angle: joint?.angle, visible: !!joint, timestamp: t + 1, landmarks: pose });
    }
    assert.equal(analyzer.count, 4, `${id} in standard mode counts all 4 reps`);
    assert.equal(analyzer.partialCount, 0, `${id} in standard mode has 0 shallow reps`);
  }
});

test('simulatePose in fault mode triggers designated biomechanical fault', () => {
  // Squat fault 0: trunk lean triggers checkPostureFault
  const squatLeanPose = simulatePose(2350, 'squat', { mode: 'fault', faultIndex: 0 });
  const leanFault = checkPostureFault(squatLeanPose, 'squat', '左侧');
  assert.equal(leanFault?.code, 'trunk_lean', 'Squat fault 0 triggers trunk_lean');

  // Squat fault 1: shallow squat flags partial reps
  const squatAnalyzer = new ExerciseAnalyzer('squat');
  for (let t = 0; t < 4700 * 2; t += 100) {
    const pose = simulatePose(t, 'squat', { mode: 'fault', faultIndex: 1 });
    const joint = extractJointAngle(pose, 'squat');
    squatAnalyzer.update({ angle: joint?.angle, visible: !!joint, timestamp: t + 1, landmarks: pose });
  }
  assert.equal(squatAnalyzer.count, 0, 'Squat fault 1 has 0 full reps');
  assert.equal(squatAnalyzer.partialCount, 2, 'Squat fault 1 flags both cycles as shallow reps');

  // Curl fault 0: arm swing triggers checkPostureFault
  const curlSwingPose = simulatePose(2350, 'curl', { mode: 'fault', faultIndex: 0 });
  const swingFault = checkPostureFault(curlSwingPose, 'curl', '左侧');
  assert.equal(swingFault?.code, 'arm_swing', 'Curl fault 0 triggers arm_swing');
});

test('GEO-01 & GEO-02 regression: squat pixel Euclidean geometry, rigid bone lengths and double-parallel law', () => {
  const W = 960, H = 540;
  // Test across entire squat cycle (t = 0 .. 4700ms)
  for (let t = 0; t <= 4700; t += 200) {
    const pose = simulatePose(t, 'squat', { mode: 'standard' });
    const ankle = { x: pose[27].x * W, y: pose[27].y * H };
    const knee = { x: pose[25].x * W, y: pose[25].y * H };
    const hip = { x: pose[23].x * W, y: pose[23].y * H };
    const shoulder = { x: pose[11].x * W, y: pose[11].y * H };
    const wrist = { x: pose[15].x * W, y: pose[15].y * H };

    const shinLen = Math.hypot(knee.x - ankle.x, knee.y - ankle.y);
    const thighLen = Math.hypot(hip.x - knee.x, hip.y - knee.y);
    const torsoLen = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y);
    const armLen = Math.hypot(wrist.x - shoulder.x, wrist.y - shoulder.y);

    assert.ok(Math.abs(shinLen - 118.80) < 0.15, `Shin length must be rigid 118.80px at t=${t}, got ${shinLen}`);
    assert.ok(Math.abs(thighLen - 113.40) < 0.15, `Thigh length must be rigid 113.40px at t=${t}, got ${thighLen}`);
    assert.ok(Math.abs(torsoLen - 124.20) < 0.15, `Torso length must be rigid 124.20px (GEO-02 no breathing jitter) at t=${t}, got ${torsoLen}`);
    assert.ok(Math.abs(armLen - 91.80) < 0.15, `Arm length must be rigid 91.80px at t=${t}, got ${armLen}`);
  }

  // Peak squat lowest point (t = 2350ms): verify double parallel law and pixel knee angle
  const peakPose = simulatePose(2350, 'squat', { mode: 'standard' });
  const a = { x: peakPose[27].x * W, y: peakPose[27].y * H };
  const k = { x: peakPose[25].x * W, y: peakPose[25].y * H };
  const h = { x: peakPose[23].x * W, y: peakPose[23].y * H };
  const s = { x: peakPose[11].x * W, y: peakPose[11].y * H };

  const shinTilt = Math.atan2(a.x - k.x, a.y - k.y) * 180 / Math.PI;
  const torsoTilt = Math.atan2(h.x - s.x, h.y - s.y) * 180 / Math.PI;
  const parallelDiff = Math.abs(shinTilt - torsoTilt);
  const pixelKneeAngle = angleDegrees(a, k, h);
  const reportedSimAngle = simulatedAngle(2350, 'squat', { mode: 'standard' });
  const jointAngle = extractJointAngle(peakPose, 'squat')?.angle;

  assert.ok(Math.abs(shinTilt - 20.0) < 0.5, `Shin forward tilt at bottom must be ~20°, got ${shinTilt.toFixed(2)}°`);
  assert.ok(Math.abs(torsoTilt - 22.0) < 0.5, `Torso forward tilt at bottom must be ~22°, got ${torsoTilt.toFixed(2)}°`);
  assert.ok(parallelDiff <= 3.0, `Double-parallel deviation must be <= 3.0°, got ${parallelDiff.toFixed(2)}°`);
  assert.ok(Math.abs(pixelKneeAngle - 91.0) < 0.2, `Pixel knee angle must be exactly 91.0°, got ${pixelKneeAngle.toFixed(2)}°`);
  assert.equal(jointAngle, 91, `Analyzer joint angle must match 91° with zero error`);
  assert.equal(reportedSimAngle, 91, `Simulated angle must match 91°`);
});

test('MODE-01 regression: jumping jack fault 1 (arm_asymmetry) preserves full amplitude without shallow rep reduction', () => {
  // Peak at t = 2350ms for jumping jack fault 1
  const peakAngle = simulatedAngle(2350, 'jumping_jack', { mode: 'fault', faultIndex: 1 });
  assert.ok(peakAngle >= 135, `Simulated angle must preserve full target depth (>= 135°), got ${peakAngle}° (must not be reduced to 85° shallow rep)`);

  const peakPose = simulatePose(2350, 'jumping_jack', { mode: 'fault', faultIndex: 1 });
  const leftAngle = angleDegrees(peakPose[23], peakPose[11], peakPose[15]);
  const rightAngle = angleDegrees(peakPose[24], peakPose[12], peakPose[16]);

  assert.ok(leftAngle >= 135, `Left arm must reach full overhead peak (>= 135°), got ${leftAngle}°`);
  assert.ok(Math.abs(leftAngle - rightAngle) > 35, `Asymmetry between arms must exceed 35°, got ${Math.abs(leftAngle - rightAngle)}°`);

  const fault = checkPostureFault(peakPose, 'jumping_jack');
  assert.equal(fault?.code, 'arm_asymmetry', 'Jumping jack fault 1 must trigger arm_asymmetry fault');
});

test('MODE-02 regression: 3x3 difficulty matrix in standard demonstration achieves 100% full reps without shallow reps', () => {
  const exercises = ['squat', 'curl', 'jumping_jack'];
  const difficulties = ['beginner', 'standard', 'advanced'];

  for (const difficulty of difficulties) {
    for (const exerciseId of exercises) {
      const analyzer = new ExerciseAnalyzer(exerciseId, { difficulty });
      for (let t = 0; t < 4700 * 2; t += 100) {
        const pose = simulatePose(t, exerciseId, { mode: 'standard', difficulty });
        const joint = extractJointAngle(pose, exerciseId);
        analyzer.update({ angle: joint?.angle, visible: !!joint, timestamp: t + 1, landmarks: pose });
      }
      assert.equal(analyzer.count, 2, `${exerciseId} in ${difficulty} mode must complete all 2 full reps`);
      assert.equal(analyzer.partialCount, 0, `${exerciseId} in ${difficulty} mode must have 0 shallow reps`);
    }
  }
});

test('STATE-01 regression: resetIncompleteRep clears active rep state on mode switch preventing cross-mode state bleeding', () => {
  const analyzer = new ExerciseAnalyzer('squat');

  // Feed partial squat movement until analyzer enters inRep (mid-descent)
  for (let t = 0; t <= 1800; t += 100) {
    const pose = simulatePose(t, 'squat', { mode: 'standard' });
    const joint = extractJointAngle(pose, 'squat');
    analyzer.update({ angle: joint?.angle, visible: !!joint, timestamp: t + 1, landmarks: pose });
  }
  assert.equal(analyzer.inRep, true, 'Analyzer must be inRep midway through squat');
  assert.ok(analyzer.depthProgress > 0, 'Progress must be non-zero');

  // Trigger mid-rep tab/mode switch reset
  analyzer.resetIncompleteRep();
  assert.equal(analyzer.inRep, false, 'inRep must be false immediately after reset');
  assert.equal(analyzer.ready, true, 'ready must be true');
  assert.equal(analyzer.depthProgress, 0, 'depthProgress must be reset to 0');
  assert.equal(analyzer.minAngle, 180, 'minAngle must be reset to 180');

  // Start clean cycle from t = 0 (standing)
  for (let t = 0; t < 4700; t += 100) {
    const pose = simulatePose(t, 'squat', { mode: 'standard' });
    const joint = extractJointAngle(pose, 'squat');
    analyzer.update({ angle: joint?.angle, visible: !!joint, timestamp: 2000 + t + 1, landmarks: pose });
  }
  assert.equal(analyzer.count, 1, 'Clean cycle completes exactly 1 rep');
  assert.equal(analyzer.partialCount, 0, 'No corrupted partial count was produced from prior switched state');
});

// Refinement regressions: sample every millisecond, including both transitions.
// These check physical pixel distances, not distances in normalized coordinates.
test('REFINE-01: fixed segment lengths for both sides across every fault-mode frame', () => {
  const specs = {
    squat: [[27,25,118.8],[25,23,113.4],[23,11,124.2],[11,13,45.9],[13,15,45.9],
      [28,26,118.8],[26,24,113.4],[24,12,124.2],[12,14,45.9],[14,16,45.9]],
    curl: [[11,13,150],[13,15,128],[12,14,150],[14,16,128],[11,23,145.8],[12,24,145.8]],
  };
  for (const exercise of ['squat', 'curl']) {
    for (const mode of ['standard', 'fault']) {
      for (let ms = 0; ms <= 4700; ms++) {
        const p = simulatePose(ms, exercise, { mode, faultIndex: 0 });
        for (const [a,b,expected] of specs[exercise]) {
          const length = Math.hypot((p[a].x-p[b].x)*960, (p[a].y-p[b].y)*540);
          assert.ok(Math.abs(length - expected) < 1e-8,
            `${exercise} ${mode} at ${ms}ms: ${a}-${b} expected ${expected}px, got ${length}`);
        }
      }
    }
  }
});

test('REFINE-02: pixel-rendered hinge angles equal simulated and measured angles', () => {
  for (const exercise of ['squat','curl']) {
    for (const mode of ['standard','fault']) {
      for (let ms = 0; ms <= 4700; ms += 7) {
        const pose = simulatePose(ms, exercise, { mode, faultIndex: 0 });
        const [a,b,c] = exercise === 'squat' ? [27,25,23] : [11,13,15];
        const px = [a,b,c].map(i=>({x:pose[i].x*960,y:pose[i].y*540}));
        const pixelAngle = angleDegrees(...px);
        const analyzedAngle = extractJointAngle(pose, exercise)?.angle;
        const target = simulatedAngle(ms, exercise, { mode, faultIndex: 0 });
        assert.ok(Math.abs(pixelAngle-target) < 1e-8, `${exercise} at ${ms}: pixel angle mismatch`);
        assert.ok(Math.abs(analyzedAngle-target) < 1e-8, `${exercise} at ${ms}: analyzer mismatch`);
      }
    }
  }
});

test('REFINE-03: error peaks and alerts are continuous, transient, and repeat at 4700ms', () => {
  for (const [exercise, expected] of [['squat','trunk_lean'],['curl','arm_swing']]) {
    const options = { mode:'fault', faultIndex:0 };
    const found = [];
    let prev = simulatePose(0,exercise,options);
    for(let ms=0;ms<=4700;ms++) {
      const pose = simulatePose(ms,exercise,options);
      const flag = checkPostureFault(pose,exercise)?.code;
      if(flag) {
        assert.equal(flag,expected);
        found.push(ms);
      }
      for(const i of [0,11,13,15,23,25,27]) {
        if(ms>0) {
          const travel=Math.hypot((pose[i].x-prev[i].x)*960,(pose[i].y-prev[i].y)*540);
          assert.ok(travel < 0.8, `${exercise} teleports joint ${i} at ${ms}: ${travel}px/ms`);
        }
      }
      prev=pose;
    }
    assert.ok(found.length > 150 && found[0] > 0.38*4700 && found.at(-1) < 0.65*4700,
      `${exercise} warning must be sustained in the error region`);
    assert.equal(checkPostureFault(simulatePose(0,exercise,options),exercise),null);
    assert.equal(checkPostureFault(simulatePose(4700,exercise,options),exercise),null);
    const peak = simulatePose(0.5*4700,exercise,options);
    assert.equal(checkPostureFault(peak,exercise)?.code,expected);
    const repeated = simulatePose(4700+0.5*4700,exercise,options);
    for(const i of [11,13,15,23,25,27]) {
      assert.equal(peak[i].x,repeated[i].x);
      assert.equal(peak[i].y,repeated[i].y);
    }
  }
});
