/** Pure, testable exercise logic. No camera or DOM dependencies. */
export const EXERCISES = Object.freeze({
  squat: {
    id: 'squat', name: '深蹲', english: 'SQUAT', joint: '膝关节', camera: '侧面机位 · 全身入镜',
    guidance: '侧身对着摄像头，确保髋、膝、踝可见。保持自然呼吸，不要强迫达到示例角度。',
    extended: 155, started: 142, full: 110, direction: 'bend',
  },
  curl: {
    id: 'curl', name: '哑铃弯举', english: 'BICEP CURL', joint: '肘关节', camera: '侧面机位 · 单侧上肢入镜',
    guidance: '单侧手臂面向镜头，肩、肘、腕清晰可见。第一版仅统计较清晰的一侧。',
    extended: 155, started: 128, full: 65, direction: 'bend',
  },
});

export function angleDegrees(a, b, c) {
  if (![a, b, c].every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
  const abx = a.x - b.x; const aby = a.y - b.y;
  const cbx = c.x - b.x; const cby = c.y - b.y;
  const denom = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (denom < 1e-7) return null;
  const cos = Math.max(-1, Math.min(1, (abx * cbx + aby * cby) / denom));
  return Math.acos(cos) * 180 / Math.PI;
}

/** MediaPipe 33-landmark index convention. Returns null for low-visibility sides. */
export function extractJointAngle(landmarks, exerciseId, visibilityThreshold = 0.6) {
  if (!landmarks || landmarks.length < 33) return null;
  const sides = exerciseId === 'curl' ? [[11, 13, 15], [12, 14, 16]] : [[23, 25, 27], [24, 26, 28]];
  let best = null;
  for (const ids of sides) {
    const pts = ids.map(i => landmarks[i]);
    if (pts.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
      (p.visibility ?? 1) < visibilityThreshold)) continue;
    const angle = angleDegrees(...pts);
    const score = Math.min(...pts.map(p => p.visibility ?? 1));
    if (angle !== null && (!best || score > best.confidence)) {
      best = { angle, confidence: score, side: ids[0] % 2 ? '左侧' : '右侧' };
    }
  }
  return best;
}

const MIN_REP_MS = 650;
const MIN_TRACKING_INTERVAL_MS = 80;

export class ExerciseAnalyzer {
  constructor(exerciseId = 'squat') { this.configure(exerciseId); }
  configure(exerciseId) {
    if (!EXERCISES[exerciseId]) throw new Error(`Unknown exercise: ${exerciseId}`);
    this.exercise = EXERCISES[exerciseId];
    this.count = 0;
    this.partialCount = 0;
    this.phase = '等待站稳';
    this.ready = false;
    this.inRep = false;
    this.minAngle = 180;
    this.repStartedAt = 0;
    this.lastUpdateAt = -1;
    this.lastAngle = null;
    this.lastSmooth = null;
    this.visible = false;
    this.samples = 0;
    this.lastEvent = null;
  }
  update({ angle, visible = true, timestamp }) {
    if (!Number.isFinite(timestamp)) throw new Error('timestamp must be finite milliseconds');
    if (timestamp <= this.lastUpdateAt) return this.snapshot();
    const sinceLast = this.lastUpdateAt < 0 ? 0 : timestamp - this.lastUpdateAt;
    this.lastUpdateAt = timestamp;
    if (sinceLast > 1200) {
      // Background tabs or long inference stalls cannot bridge an unfinished rep.
      this.ready = false; this.inRep = false; this.lastSmooth = null;
    }
    if (!visible || !Number.isFinite(angle) || angle < 5 || angle > 180) {
      // A lost pose must not complete a rep; reacquire while extended.
      this.visible = false; this.ready = false; this.inRep = false; this.lastSmooth = null;
      this.phase = '请调整机位'; this.lastAngle = null; this.lastEvent = null;
      return this.snapshot();
    }
    this.visible = true;
    this.lastSmooth = this.lastSmooth === null || sinceLast > 1000
      ? angle : this.lastSmooth * 0.55 + angle * 0.45;
    const measured = this.lastSmooth;
    this.lastAngle = Math.round(measured);
    this.samples++;
    this.lastEvent = null;
    const { extended, started, full } = this.exercise;

    if (!this.ready && !this.inRep && measured >= extended) {
      this.ready = true;
      this.phase = '已就绪';
    } else if (this.ready && !this.inRep && measured <= started) {
      this.inRep = true;
      this.ready = false;
      this.repStartedAt = timestamp;
      this.minAngle = measured;
      this.phase = '动作进行中';
    } else if (this.inRep) {
      this.minAngle = Math.min(this.minAngle, measured);
      this.phase = this.minAngle <= full ? '完成幅度 · 返回起点' : '动作进行中';
      if (measured >= extended) {
        const duration = timestamp - this.repStartedAt;
        const complete = this.minAngle <= full;
        if (duration >= MIN_REP_MS && duration >= MIN_TRACKING_INTERVAL_MS) {
          if (complete) {
            this.count++;
            this.lastEvent = { type: 'success', message: `完成第 ${this.count} 次${this.exercise.name}`, timestamp };
          } else {
            this.partialCount++;
            this.lastEvent = { type: 'warning', message: '本次动作幅度未达到演示阈值（不计数）', timestamp };
          }
        }
        this.inRep = false;
        this.ready = true;
        this.phase = '已就绪';
        this.minAngle = 180;
      }
    }
    return this.snapshot();
  }
  snapshot() {
    return { count: this.count, partialCount: this.partialCount, phase: this.phase,
      angle: this.lastAngle, visible: this.visible, event: this.lastEvent, samples: this.samples };
  }
}
