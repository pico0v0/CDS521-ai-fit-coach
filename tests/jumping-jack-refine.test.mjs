import {test} from 'node:test';
import assert from 'node:assert/strict';
import { simulatePose, simulatedAngle } from '../src/simulator.js';
import { angleDegrees, extractJointAngle, getLegSpreadRatio, checkPostureFault, ExerciseAnalyzer } from '../src/exercise.js';

const PERIOD = 4700;
const W = 960, H = 540;
const bones = [
  [11,13,76],[13,15,76],[12,14,76],[14,16,76],
  [23,25,101],[25,27,110],[24,26,101],[26,28,110],
  [27,29,25],[28,30,25],[27,31,13],[28,32,13],
  [11,23,Math.hypot(12,113)],[12,24,Math.hypot(12,113)],
];
const ids = [0,11,12,13,14,15,16,23,24,25,26,27,28,29,30,31,32];
const px = p => ({x:p.x*W,y:p.y*H});
const dist = (a,b) => Math.hypot((a.x-b.x)*W,(a.y-b.y)*H);
const variants = [
  {mode:'standard',faultIndex:0},
  ...[0,1,2].map(faultIndex=>({mode:'fault',faultIndex})),
];

test('JACK-RIGID: arms, legs, torso, feet retain exact pixel lengths every millisecond, all modes and difficulties',()=>{
  for (const difficulty of ['beginner','standard','advanced']) {
    for (const v of variants) {
      for(let ms=0;ms<=PERIOD;ms++) {
        const p=simulatePose(ms,'jumping_jack',{...v,difficulty});
        for(const [a,b,len] of bones) assert.ok(Math.abs(dist(p[a],p[b])-len)<1e-8,
          `${JSON.stringify(v)} ${difficulty} ms=${ms}, ${a}-${b}`);
        for(const i of ids) {
          assert.equal(p[i].visibility,0.99);
          assert.ok(p[i].x>0&&p[i].x<1 && p[i].y>0&&p[i].y<1,`out of stage ${i} @${ms}`);
        }
      }
    }
  }
});

test('JACK-ANGLE: left/right *rendered pixel* shoulder angles match requested and extracted angles',()=>{
  for (const difficulty of ['beginner','standard','advanced'])for(const v of variants) {
    for(let ms=0;ms<PERIOD;ms+=11) {
      const p=simulatePose(ms,'jumping_jack',{...v,difficulty});
      const L=angleDegrees(...[23,11,15].map(i=>px(p[i])));
      const R=angleDegrees(...[24,12,16].map(i=>px(p[i])));
      const avg=(L+R)/2;
      const analyzed=extractJointAngle(p,'jumping_jack');
      assert.ok(Math.abs(avg-analyzed.angle)<0.501,`measured average ${ms}`);
      if(v.mode==='standard'||v.faultIndex!==1) {
        const target=simulatedAngle(ms,'jumping_jack',{...v,difficulty});
        assert.ok(Math.abs(L-target)<1e-8,`left arm ${ms}: ${L} != ${target}`);
        assert.ok(Math.abs(R-target)<1e-8,`right arm ${ms}: ${R} != ${target}`);
      } else if(ms===Math.round(PERIOD*0.5)) {
        assert.ok(Math.abs(L-R)>35);
      }
    }
  }
});

test('JACK-CONTINUITY: 4700ms seam closes exactly, no instantaneous limb teleports',()=>{
  for(const v of variants) {
    let prev=simulatePose(0,'jumping_jack',v);
    for(let ms=1;ms<=PERIOD;ms++) {
      const p=simulatePose(ms,'jumping_jack',v);
      for(const i of ids) assert.ok(dist(p[i],prev[i]) < 0.8,
        `discontinuous ${JSON.stringify(v)} ms=${ms} landmark=${i}`);
      prev=p;
    }
    const zero=simulatePose(0,'jumping_jack',v);
    for(const i of ids) assert.ok(dist(prev[i],zero[i])<1e-9, `cycle seam index=${i}`);
  }
});

test('JACK-AIRBORNE: standard takes off and lands; faulty legs remain planted, delayed legs jump late',()=>{
  const standard = ms => simulatePose(ms,'jumping_jack',{mode:'standard'});
  const staticLeg = ms => simulatePose(ms,'jumping_jack',{mode:'fault',faultIndex:2});
  const delayed = ms => simulatePose(ms,'jumping_jack',{mode:'fault',faultIndex:0});
  assert.ok((standard(0)[27].y-standard(2300)[27].y)*H>=30,'both feet leave ground');
  assert.equal(staticLeg(0)[27].y,staticLeg(2300)[27].y,'static feet do not jump');
  assert.equal(staticLeg(0)[27].x,staticLeg(2300)[27].x,'static ankles do not move sideways');
  assert.ok(getLegSpreadRatio(standard(2300))>=1.65,'standard wide stance');
  assert.ok(getLegSpreadRatio(delayed(2300))<1.38,'desync legs are late at hand peak');
  assert.ok(getLegSpreadRatio(delayed(3650))>2.25,'desync legs kick open late');
  assert.ok(getLegSpreadRatio(staticLeg(2300))<1.35,'legs never open');
  assert.ok(Math.abs(standard(0)[27].y-standard(PERIOD)[27].y)<1e-12,'returns to floor');
});

test('JACK-CLOSED-LOOP: all three faults warn and reject reps, normal reps count',()=>{
  const cases=[['standard',0,1,0,null],['fault',0,0,1,'asymmetry_or_desync'],
    ['fault',1,0,1,'arm_asymmetry'],['fault',2,0,1,'static_legs']];
  for(const [mode,faultIndex,nCount,nPartial,code] of cases) {
    const analyzer=new ExerciseAnalyzer('jumping_jack');
    const events=[];
    for(let ms=0;ms<PERIOD;ms+=80) {
      const p=simulatePose(ms,'jumping_jack',{mode,faultIndex});
      const measured=extractJointAngle(p,'jumping_jack');
      const result=analyzer.update({angle:measured?.angle,visible:!!measured,timestamp:ms+1,landmarks:p});
      if(result.event) events.push(result.event);
    }
    assert.equal(analyzer.count,nCount,`${mode} ${faultIndex} count`);
    assert.equal(analyzer.partialCount,nPartial,`${mode} ${faultIndex} partial`);
    if(code) assert.equal(events.at(-1)?.code,code,`alert: ${mode}/${faultIndex}`);
    else assert.equal(events.at(-1)?.type,'success');
  }
});

test('JACK-PEAK: asymmetry appears at peak, normal is symmetric',()=>{
  const base=simulatePose(2350,'jumping_jack',{mode:'standard'});
  const faulty=simulatePose(2350,'jumping_jack',{mode:'fault',faultIndex:1});
  assert.equal(checkPostureFault(base,'jumping_jack'),null);
  assert.equal(checkPostureFault(faulty,'jumping_jack')?.code,'arm_asymmetry');
  assert.equal(checkPostureFault(simulatePose(2350,'jumping_jack',{mode:'fault',faultIndex:0}),'jumping_jack')?.code,'asymmetry_or_desync');
});
