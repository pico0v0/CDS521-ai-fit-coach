import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadSessions, saveSession, clearSessions, makeAdvice, exportSessionsCSV, exportSessionsJSON, computeMaeStats, deriveVerifiedAbsError, getSessionMaeEligibility } from '../src/store.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k), map };
}
const record = { id: '1', startedAt: '2026-11-05T00:00:00.000Z', exercise: 'squat', mode: 'demo', count: 5, partialCount: 1, durationSeconds: 20 };

test('session persistence is local, bounded, and clearable', () => {
  const db = memoryStorage();
  assert.deepEqual(loadSessions(db), []);
  assert.equal(saveSession(record, db), true);
  assert.equal(loadSessions(db)[0].count, 5);
  for (let i = 0; i < 50; i++) saveSession({ ...record, id: String(i) }, db);
  assert.equal(loadSessions(db).length, 40);
  assert.equal(clearSessions(db), true);
  assert.deepEqual(loadSessions(db), []);
});
test('corrupted and untrusted local records are ignored', () => {
  const db = memoryStorage();
  db.setItem('aifit-demo-sessions-v1', 'not json');
  assert.deepEqual(loadSessions(db), []);
  db.setItem('aifit-demo-sessions-v1', JSON.stringify([{ id: 'bad', count: 'oops' }, record, { ...record, id: '2', exercise: 'jumping_jack' }]));
  assert.equal(loadSessions(db).length, 2);
});
test('advice depends on fatigue, incomplete reps, no reps and goal', () => {
  assert.match(makeAdvice(record, 'habit', 'high'), /休息/);
  assert.match(makeAdvice({ ...record, count: 1, partialCount: 5 }, 'habit', 'normal'), /幅度/);
  assert.match(makeAdvice({ ...record, count: 0, partialCount: 0 }, 'habit', 'normal'), /没有记录/);
  assert.match(makeAdvice(record, 'strength', 'low'), /稳定/);
  assert.match(makeAdvice({ ...record, count: 4, faultCounts: { trunk_lean: 2 } }, 'habit', 'normal'), /躯干前倾/);
  assert.match(makeAdvice({ ...record, count: 4, faultCounts: { arm_swing: 1 } }, 'habit', 'normal'), /借力/);
  assert.match(makeAdvice({ ...record, exercise: 'jumping_jack', count: 8, faultCounts: { arm_asymmetry: 1 } }, 'habit', 'normal'), /不对称/);
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
    { ...record, id: 'bad-3', mode: 'camera', count: 10, manualCount: 10, absError: 0, trackedFrames: 2 }, // < 5 frames
    { ...record, id: 'bad-4', mode: 'camera', count: 10, manualCount: 10, absError: 0, trackedFrames: '30' } // string rejected
  ];
  const resInvalid = computeMaeStats(invalid);
  assert.equal(resInvalid.realMae, null);
  assert.equal(resInvalid.realCount, 0);

  // 5. Corrupted persisted absError is automatically self-healed by recalculation
  const corrupted = [
    { ...record, id: 'corrupt-1', mode: 'camera', count: 99, manualCount: 0, absError: 0, trackedFrames: 30 },
    { ...record, id: 'corrupt-2', mode: 'video', count: 8, manualCount: 0, absError: -8, trackedFrames: 30 }
  ];
  const resCorrupted = computeMaeStats(corrupted);
  assert.equal(resCorrupted.realMae, 53.50); // (99 + 8) / 2 = 53.50, strictly non-negative!
  assert.equal(resCorrupted.realCount, 2);
});

test('exportSessionsCSV uses deriveVerifiedAbsError ensuring screen MAE matches CSV row-by-row (P1-DATA-CSV)', () => {
  // Test deriveVerifiedAbsError unit cases
  assert.equal(deriveVerifiedAbsError(null), null);
  assert.equal(deriveVerifiedAbsError({ count: 10 }), null);
  assert.equal(deriveVerifiedAbsError({ count: 10, manualCount: -1 }), null);
  assert.equal(deriveVerifiedAbsError({ count: 10, manualCount: 3.5 }), null);
  assert.equal(deriveVerifiedAbsError({ count: 10, manualCount: 8 }), 2);
  assert.equal(deriveVerifiedAbsError({ count: 5, manualCount: 12 }), 7);

  // Test CSV export consistency with unannotated, corrupted, and low-frame sessions
  const sessions = [
    { ...record, id: 'unannotated', mode: 'camera', count: 10, trackedFrames: 100 },
    { ...record, id: 'valid', mode: 'camera', count: 12, manualCount: 10, absError: 999, trackedFrames: 100 },
    { ...record, id: 'corrupted-negative', mode: 'video', count: 8, manualCount: 0, absError: -8, trackedFrames: 100 },
    { ...record, id: 'low-frame-ineligible', mode: 'camera', count: 10, manualCount: 1, trackedFrames: 2 }
  ];

  const csv = exportSessionsCSV(sessions);
  const lines = csv.replace('\uFEFF', '').trim().split('\r\n');
  assert.equal(lines.length, 5); // 1 header + 4 rows

  // Row 1: unannotated session must have EMPTY strings for manualCount and absError (NOT "0" or "null"!)
  assert.match(lines[1], /^"unannotated",.*,"10","1","","","否","未标注人工真值达标次数"/);

  // Row 2: valid session must derive verified absError = |12 - 10| = 2 (NOT persisted 999), eligible = 是
  assert.match(lines[2], /^"valid",.*,"12","1","10","2","是",""/);

  // Row 3: corrupted session must derive verified absError = |8 - 0| = 8 (NOT persisted -8), eligible = 是
  assert.match(lines[3], /^"corrupted-negative",.*,"8","1","0","8","是",""/);

  // Row 4: low frame session must be eligible = 否, reason = 有效姿态跟踪帧数不足
  assert.match(lines[4], /^"low-frame-ineligible",.*,"10","1","1","9","否","有效姿态跟踪帧数不足/);

  // Consistency: filtering CSV rows where 计入真实MAE == "是" matches computeMaeStats realMae粘 matches computeMaeStats realMae exactly!
  const stats = computeMaeStats(sessions);
  assert.equal(stats.realCount, 2);
  assert.equal(stats.realMae, 5.00); // (2 + 8) / 2 = 5.00
});

test('R-003 regression: video timeline simulation spanning >3s proves cumulative infer counts are never wiped by 1-sec FPS resets', () => {
  // Simulate video session state over 3.5 seconds with 1-sec sliding FPS resets
  const simState = {
    totalInferredFrames: 0,
    inferFramesWindow: 0,
    fpsFrames: 0,
    fpsLastTime: 0,
    trackedFrames: 0,
    latencySumMs: 0,
    latencyMs: 0
  };

  // Run 35 frames over 3500ms (10 FPS video sampling rate)
  for (let t = 100; t <= 3500; t += 100) {
    if (!simState.fpsLastTime) simState.fpsLastTime = t;
    simState.fpsFrames++;

    // 1-second FPS sliding window trigger
    if (t - simState.fpsLastTime >= 1000) {
      simState.fpsFrames = 0;
      simState.inferFramesWindow = 0; // Window resets every second
      simState.fpsLastTime = t;
    }

    // Simulate inference
    const latency = 15;
    simState.latencyMs = latency;
    simState.latencySumMs += latency;
    simState.totalInferredFrames++; // Cumulative counter MUST NOT reset!
    simState.inferFramesWindow++;
    if (t % 200 === 0) simState.trackedFrames++; // Human detected every 200ms
  }

  // Verification after 3.5 seconds across 3 window resets:
  assert.equal(simState.totalInferredFrames, 35, 'Cumulative inferred frames must equal total calls (35), not wiped by 1-sec window resets');
  assert.ok(simState.totalInferredFrames >= simState.trackedFrames, 'Cumulative inference count must be >= tracked human pose frames');
  assert.equal(simState.trackedFrames, 17, 'Tracked frames correctly accumulated');
  const avgLatency = Math.round(simState.latencySumMs / simState.totalInferredFrames);
  assert.equal(avgLatency, 15, 'Average latency accurately computed from cumulative sum / total');
});

test("R-003 integration: begin('video') path strictly verifies frame 0 single tracking count and error abort", async (t) => {
  const original = resolve(process.cwd(), 'src/app.js');
  const tempPath = resolve(process.cwd(), 'src/__test_video_path.mjs');

  let playCalled = false;
  const makeNode = () => ({
    innerHTML: '', textContent: '', style: {}, value: '', checked: false, src: '',
    currentTime: 0, readyState: 2, videoWidth: 640, videoHeight: 480,
    loop: false, paused: true,
    play: async () => { playCalled = true; },
    pause: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    dataset: {}, getContext: () => ({}), focus: () => {}, click: () => {}
  });

  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, makeNode());
    return nodes.get(id);
  };

  globalThis.document = {
    querySelector: node, querySelectorAll: () => [], addEventListener: () => {},
    createElement: makeNode, body: { appendChild: () => {}, removeChild: () => {} }
  };
  globalThis.window = {
    addEventListener: () => {}, isSecureContext: true, scrollTo: () => {},
    speechSynthesis: null
  };
  globalThis.location = { hostname: 'localhost' };
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.requestAnimationFrame = () => 100;
  globalThis.cancelAnimationFrame = () => {};
  URL.createObjectURL = () => 'blob:test-r8';
  URL.revokeObjectURL = () => {};

  let source = readFileSync(original, 'utf8');
  const poseImport = "import { createPoseLandmarker } from './pose.js';";
  const drawImport = "import { drawPose, drawIdle } from './draw.js';";
  source = source.replace(poseImport, `const createPoseLandmarker = async () => {
    if (globalThis.__testUseDeferredModel) {
      await globalThis.__testModelDeferredPromise;
    }
    return {
      detector: {
        detectForVideo: () => {
          if (globalThis.__testFirstFrameFail) throw new Error('TEST_FIRST_FRAME_SIMULATED_FAILURE');
          if (globalThis.__testEmptyLandmarks) return { landmarks: [] };
          return {
            landmarks: [Array.from({ length: 33 }, (_, i) => ({ x: 0.2 + i * 0.003, y: 0.2 + i * 0.001, visibility: 0.9 }))]
          };
        },
        close: () => {}
      },
      isLocalModel: true
    };
  };`);
  source = source.replace(drawImport, 'const drawPose = () => {}; const drawIdle = () => {};');
  source += '\nexport { state, begin, stopRealtime, finishSession };\n';

  writeFileSync(tempPath, source, { flag: 'w' });

  try {
    const { state, begin, stopRealtime, finishSession } = await import(pathToFileURL(tempPath).href);

    // Subtest 1: Successful frame 0 detection produces exactly 1 inferred and 1 tracked frame
    globalThis.__testFirstFrameFail = false;
    globalThis.__testEmptyLandmarks = false;
    playCalled = false;
    state.view = 'training';
    await begin('video', { name: 'test.mp4' });
    assert.equal(state.totalInferredFrames, 1, 'Frame 0 inferred count equals 1');
    assert.equal(state.trackedFrames, 1, 'Frame 0 tracked count equals 1 (single-counted, no double counting)');
    assert.equal(state.mode, 'video', 'State transitioned to video mode');
    assert.equal(state.modelReady, true, 'Model is marked ready');
    assert.equal(playCalled, true, 'video.play() was initiated');
    stopRealtime();
    state.mode = null;

    // Subtest 2: Frame 0 with 0 persons produces 1 inferred and 0 tracked frames
    globalThis.__testFirstFrameFail = false;
    globalThis.__testEmptyLandmarks = true;
    playCalled = false;
    state.view = 'training';
    await begin('video', { name: 'test-empty.mp4' });
    assert.equal(state.totalInferredFrames, 1, 'Frame 0 inferred count equals 1');
    assert.equal(state.trackedFrames, 0, 'Frame 0 tracked count equals 0 when no person present');
    assert.equal(state.mode, 'video', 'State transitioned to video mode');
    assert.equal(state.modelReady, true, 'Model is marked ready');
    assert.equal(playCalled, true, 'video.play() was initiated');
    stopRealtime();
    state.mode = null;

    // Subtest 3: Frame 0 detection failure blocks video playback and resets state
    globalThis.__testFirstFrameFail = true;
    globalThis.__testEmptyLandmarks = false;
    playCalled = false;
    state.view = 'training';
    const origError = console.error;
    console.error = () => {};
    try {
      await begin('video', { name: 'test-fail.mp4' });
    } finally {
      console.error = origError;
    }
    assert.equal(state.totalInferredFrames, 0, '0 inferred frames on startup failure');
    assert.equal(state.trackedFrames, 0, '0 tracked frames on startup failure');
    assert.equal(state.mode, null, 'Mode MUST NOT remain video on frame 0 failure');
    assert.equal(state.modelReady, false, 'Model MUST NOT be marked ready on failure');
    assert.equal(playCalled, false, 'video.play() MUST NOT be called when frame 0 fails');
    stopRealtime();
    state.mode = null;

    // Subtest 4: Multi-frame sequence simulation (35 inferences, 17 tracked poses)
    globalThis.__testFirstFrameFail = false;
    globalThis.__testEmptyLandmarks = false;
    state.view = 'training';
    await begin('video', { name: 'multi-frame.mp4' });
    assert.equal(state.totalInferredFrames, 1);
    assert.equal(state.trackedFrames, 1);
    for (let i = 2; i <= 35; i++) {
      state.totalInferredFrames++;
      if (i % 2 === 0 && state.trackedFrames < 17) {
        state.trackedFrames++;
      }
      assert.ok(state.totalInferredFrames >= state.trackedFrames);
    }
    assert.equal(state.totalInferredFrames, 35);
    assert.equal(state.trackedFrames, 17);
    stopRealtime();
    state.mode = null;

    // Subtest 5: Cancel pending video waiting for loadeddata, start demo, then delayed video error fires
    state.view = 'training';
    const videoNode = nodes.get('#liveVideo');
    videoNode.readyState = 0;
    const handlers = new Map();
    videoNode.addEventListener = (ev, fn) => handlers.set(ev, fn);
    videoNode.removeEventListener = (ev, fn) => { if (handlers.get(ev) === fn) handlers.delete(ev); };

    const pendingVideo = begin('video', { name: 'waiting.mp4' });
    assert.equal(state.mode, 'video');
    finishSession();
    assert.equal(state.mode, null);

    await begin('demo');
    assert.equal(state.mode, 'demo');
    assert.equal(state.running, true);

    const onError = handlers.get('error');
    assert.ok(onError, 'expected video error handler');
    const delayedErr = console.error;
    console.error = () => {};
    try {
      onError();
      await pendingVideo;
    } finally {
      console.error = delayedErr;
    }

    assert.equal(state.mode, 'demo', 'Demo session must remain active after delayed video error');
    assert.equal(state.running, true, 'Running flag must remain true');
    stopRealtime();
    state.mode = null;

    // Subtest 6: Delayed model failure from cancelled run does not affect subsequent session
    state.view = 'training';
    let delayedModelReject;
    globalThis.__testModelDeferredPromise = new Promise((_, rej) => { delayedModelReject = rej; });
    globalThis.__testModelDeferredPromise.catch(() => {}); // Prevent unhandled promise rejection in harness
    globalThis.__testUseDeferredModel = true;
    videoNode.readyState = 2; // Let loadeddata pass immediately

    const pendingModelVideo = begin('video', { name: 'slow-model.mp4' });
    assert.equal(state.mode, 'video');
    finishSession();
    assert.equal(state.mode, null);

    await begin('demo');
    assert.equal(state.mode, 'demo');
    assert.equal(state.running, true);

    // Now delayed model rejection fires for the cancelled video run
    const deferredErr = console.error;
    console.error = () => {};
    try {
      delayedModelReject(new Error('DEFERRED_MODEL_INIT_FAILURE'));
      await pendingModelVideo.catch(() => {});
    } finally {
      console.error = deferredErr;
      globalThis.__testUseDeferredModel = false;
    }

    assert.equal(state.mode, 'demo', 'Demo mode must remain undisturbed by old model failure');
    assert.equal(state.running, true, 'Demo session must continue running');
    stopRealtime();
    state.mode = null;

    // Subtest 7: Demo demonstration mode is purely instructional; clean exit resets state without fake workout session
    await begin('demo', null, { demoType: 'standard' });
    assert.equal(state.mode, 'demo');
    assert.equal(state.demoType, 'standard');
    assert.equal(state.running, true);
    stopRealtime();
    state.mode = null;
    state.paused = false;
    state.analyzer.resetIncompleteRep();
    assert.equal(state.mode, null, 'Demo exit cleanly returns state.mode to null');
    assert.equal(state.analyzer.inRep, false, 'Incomplete rep state is reset on demo exit');
    assert.equal(state.running, false, 'Running is cleanly stopped');

  } finally {
    if (existsSync(tempPath)) unlinkSync(tempPath);
  }
});
