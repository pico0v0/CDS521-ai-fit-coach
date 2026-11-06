import test from 'node:test';
import assert from 'node:assert/strict';
import { simulatePose, simulatedAngle } from '../src/simulator.js';
import { angleDegrees, checkPostureFault, extractJointAngle } from '../src/exercise.js';

const PIXEL = p => ({ x: p.x * 960, y: p.y * 540 });
const DIST = (pose, i, j) => {
  const a = PIXEL(pose[i]), b = PIXEL(pose[j]);
  return Math.hypot(a.x - b.x, a.y - b.y);
};
const BONE_SPECS = {
  lunge: [
    [23,25,113.4], [25,27,118.8], [24,26,113.4], [26,28,118.8],
    [11,23,124.2], [12,24,124.2],
    [11,13,76], [13,15,76], [12,14,76], [14,16,76]
  ],
  pushup: [
    [23,25,115], [25,27,110], [24,26,115], [26,28,110],
    [11,23,145], [12,24,145],
    [11,13,92], [13,15,88], [12,14,92], [14,16,88]
  ]
};
const VARIANTS = [
  { mode: 'standard' },
  { mode: 'fault', faultIndex: 0 },
  { mode: 'fault', faultIndex: 1 }
];

for (const exercise of ['lunge', 'pushup']) {
  test(`${exercise}: every millisecond has exactly rigid bilateral bones and target pixel angle`, () => {
    for (const difficulty of ['beginner', 'standard', 'advanced']) {
      for (const variant of VARIANTS) {
        const options = { ...variant, difficulty };
        for (let ms = 0; ms <= 4700; ms++) {
          const pose = simulatePose(ms, exercise, options);
          assert.equal(pose.length, 33);
          for (const [i,j,length] of BONE_SPECS[exercise]) {
            const actual = DIST(pose,i,j);
            assert.ok(Math.abs(actual-length) <= 1e-6,
              `${exercise}/${difficulty}/${variant.mode}/${variant.faultIndex} ${i}-${j} at ${ms}: ${actual} vs ${length}`);
          }
          const triplet = exercise === 'lunge' ? [23,25,27] : [11,13,15];
          const angle = angleDegrees(...triplet.map(i => PIXEL(pose[i])));
          const target = simulatedAngle(ms, exercise, options);
          assert.ok(Math.abs(angle-target) <= 0.05,
            `${exercise}/${difficulty}/${variant.mode}/${variant.faultIndex} at ${ms}: ${angle} vs ${target}`);
        }
      }
    }
  });

  test(`${exercise}: exact 4700ms periodic closure, no per-frame joint teleportation`, () => {
    for (const options of VARIANTS) {
      for (const ms of [0,1,846,1400,2150,2350,2900,3900,4699,4700]) {
        const first = simulatePose(ms, exercise, options);
        const repeated = simulatePose(ms+4700, exercise, options);
        for (let i=0; i<33; i++) {
          assert.deepEqual(first[i], repeated[i], `periodic mismatch at index ${i}, ms=${ms}`);
        }
      }
      let prev = simulatePose(0, exercise, options);
      for (let ms=1; ms<=4700; ms++) {
        const next = simulatePose(ms, exercise, options);
        for (const i of [0,11,12,13,14,15,16,23,24,25,26,27,28]) {
          const dx = (next[i].x-prev[i].x)*960;
          const dy = (next[i].y-prev[i].y)*540;
          assert.ok(Math.hypot(dx,dy) < 1, `${exercise} joint ${i} jumped at ${ms}ms`);
        }
        prev=next;
      }
    }
  });
}

test('lunge: support ankles are planted, proper knee/toe direction and fault isolation', () => {
  for (const options of VARIANTS) {
    const first = simulatePose(0, 'lunge', options);
    for (let ms=0;ms<=4700;ms+=5) {
      const p=simulatePose(ms, 'lunge',options);
      for(const i of [27,28,29,30,31,32]) {
        assert.deepEqual(p[i],first[i],`planted lunge joint ${i} moved at ${ms}`);
      }
    }
  }
  const healthy=simulatePose(2350,'lunge',{mode:'standard'});
  const faulty=simulatePose(2350,'lunge',{mode:'fault',faultIndex:0});
  const shallow=simulatePose(2350,'lunge',{mode:'fault',faultIndex:1});
  assert.ok(PIXEL(healthy[25]).x < PIXEL(healthy[31]).x,
    'standard knee stays behind front toe');
  assert.ok(PIXEL(faulty[25]).x > PIXEL(faulty[31]).x,
    'knee drive crosses the planted toe in the fault');
  assert.equal(checkPostureFault(healthy,'lunge')?.code,undefined);
  assert.equal(checkPostureFault(faulty,'lunge')?.code,'knee_over_toes');
  assert.equal(checkPostureFault(shallow,'lunge')?.code,undefined);
  assert.ok(simulatedAngle(2350,'lunge',{mode:'fault',faultIndex:1}) >
    simulatedAngle(2350,'lunge',{mode:'standard'}),'shallow lunge must not fully bend');
});

test('pushup: wrists, feet and palms do not slide; arms fold back and pelvis sags only in fault', () => {
  for(const options of VARIANTS) {
    const first=simulatePose(0,'pushup',options);
    for(let ms=0;ms<=4700;ms+=5){
      const p=simulatePose(ms,'pushup',options);
      for(const i of [15,16,27,28,29,30,31,32]) {
        assert.deepEqual(p[i],first[i],`pushup planted joint ${i} moved at ${ms}`);
      }
    }
  }
  const normal=simulatePose(2350,'pushup',{mode:'standard'});
  const sag=simulatePose(2350,'pushup',{mode:'fault',faultIndex:0});
  const shallow=simulatePose(2350,'pushup',{mode:'fault',faultIndex:1});
  assert.ok(PIXEL(normal[13]).x < PIXEL(normal[15]).x,
    'elbow should bend toward the feet, not beyond the palm');
  assert.ok(PIXEL(sag[23]).y > PIXEL(normal[23]).y+25,
    'the faulty pelvis should drop by a visible amount');
  assert.equal(checkPostureFault(normal,'pushup')?.code,undefined);
  assert.equal(checkPostureFault(sag,'pushup')?.code,'sagging_hips');
  assert.equal(checkPostureFault(shallow,'pushup')?.code,undefined);
  assert.ok(extractJointAngle(shallow,'pushup').angle > extractJointAngle(normal,'pushup').angle);
});

test('pushup: quintic-squared sag envelope has negligible acceleration at fade boundaries', () => {
  const opts={mode:'fault',faultIndex:0};
  // Check second finite differences of hip position at both endpoints of
  // the fault's onset/recovery; numerical noise is far below a pixel.
  for(const instant of [0.29*4700,0.46*4700,0.56*4700,0.73*4700]) {
    const pts=[-1,0,1].map(dt=>PIXEL(simulatePose(instant+dt,'pushup',opts)[23]));
    const ddx=pts[2].x-2*pts[1].x+pts[0].x;
    const ddy=pts[2].y-2*pts[1].y+pts[0].y;
    assert.ok(Math.hypot(ddx,ddy)<0.001,`hip acceleration breaks at ${instant}`);
  }
});
