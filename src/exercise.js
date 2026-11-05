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

export const DIFFICULTY_PRESETS = Object.freeze({
  beginner: { name: '初学', squat: 122, curl: 80 },
  standard: { name: '标准', squat: 110, curl: 65 },
  advanced: { name: '进阶', squat: 95, curl: 50 },
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

/** MediaPipe 33-landmark index convention. Supports side hysteresis & preferred side. */
export function extractJointAngle(landmarks, exerciseId, options = 0.6) {
  if (!landmarks || landmarks.length < 33) return null;
  const visibilityThreshold = typeof options === 'number' ? options : (options.visibilityThreshold ?? 0.6);
  const preferredSide = typeof options === 'object' ? options.preferredSide : null;
  const hysteresis = typeof options === 'object' ? (options.hysteresis ?? 0.12) : 0.12;

  const sideConfigs = exerciseId === 'curl'
    ? [{ ids: [11, 13, 15], side: '左侧' }, { ids: [12, 14, 16], side: '右侧' }]
    : [{ ids: [23, 25, 27], side: '左侧' }, { ids: [24, 26, 28], side: '右侧' }];

  let candidates = [];
  for (const { ids, side } of sideConfigs) {
    const pts = ids.map(i => landmarks[i]);
    if (pts.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
      (p.visibility ?? 1) < visibilityThreshold)) continue;
    const angle = angleDegrees(...pts);
    const score = Math.min(...pts.map(p => p.visibility ?? 1));
    if (angle !== null) {
      candidates.push({ angle, confidence: score, side, ids });
    }
  }

  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  // If a side was previously preferred, require other side to exceed hysteresis threshold to switch.
  if (preferredSide) {
    const current = candidates.find(c => c.side === preferredSide);
    const other = candidates.find(c => c.side !== preferredSide);
    if (current && other) {
      if (other.confidence > current.confidence + hysteresis) {
        return other;
      }
      return current;
    }
    if (current) return current;
  }

  // Default: select the one with highest minimum landmark confidence
  return candidates.sort((a, b) => b.confidence - a.confidence)[0];
}

/** Evaluates form quality and biomechanical risk factors (e.g. excessive trunk lean, arm swinging). */
export function checkPostureFault(landmarks, exerciseId, side = '左侧', options = {}) {
  if (!landmarks || landmarks.length < 33) return null;
  const isLeft = side === '左侧';

  if (exerciseId === 'squat') {
    const shoulder = landmarks[isLeft ? 11 : 12];
    const hip = landmarks[isLeft ? 23 : 24];
    if (!shoulder || !hip || (shoulder.visibility ?? 1) < 0.45 || (hip.visibility ?? 1) < 0.45) return null;
    const dx = Math.abs(shoulder.x - hip.x);
    const dy = hip.y - shoulder.y; // shoulder is above hip, so dy > 0
    if (dy <= 0.02) return null;
    const trunkAngle = Math.atan2(dx, dy) * 180 / Math.PI;
    // Excessive forward trunk lean beyond 46 degrees indicates rounding back / hip compensation
    if (trunkAngle > 46) {
      return { code: 'trunk_lean', message: '注意挺胸收腹，避免躯干过度前倾', value: Math.round(trunkAngle) };
    }
  } else if (exerciseId === 'curl') {
    const shoulder = landmarks[isLeft ? 11 : 12];
    const elbow = landmarks[isLeft ? 13 : 14];
    if (!shoulder || !elbow || (shoulder.visibility ?? 1) < 0.45 || (elbow.visibility ?? 1) < 0.45) return null;
    const horizontalDrift = Math.abs(elbow.x - shoulder.x);
    // Noticeable upper arm drift away from vertical axis indicates momentum swinging
    if (horizontalDrift > 0.11) {
      return { code: 'arm_swing', message: '大臂尽量贴紧躯干，避免前后晃动借力', value: Math.round(horizontalDrift * 100) };
    }
  }
  return null;
}

const MIN_REP_MS = 650;
const MIN_TRACKING_INTERVAL_MS = 80;

export class ExerciseAnalyzer {
  constructor(exerciseId = 'squat', options = {}) { this.configure(exerciseId, options); }
  configure(exerciseId, options = {}) {
    if (!EXERCISES[exerciseId]) throw new Error(`Unknown exercise: ${exerciseId}`);
    const base = EXERCISES[exerciseId];
    const difficulty = options.difficulty || 'standard';
    const targetAngle = options.targetAngle ?? (DIFFICULTY_PRESETS[difficulty]?.[exerciseId] ?? base.full);
    this.exercise = { ...base, full: targetAngle, difficulty };
    this.targetReps = options.targetReps || 0;
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
    this.activeSide = null;
    this.depthProgress = 0;
    this.faultCounts = { trunk_lean: 0, arm_swing: 0 };
    this.lastFaultTimes = {};
    this.currentFault = null;
  }
  update({ angle, visible = true, timestamp, side = null, landmarks = null }) {
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
      this.depthProgress = 0;
      this.currentFault = null;
      return this.snapshot();
    }
    this.visible = true;
    if (!this.inRep && side) {
      this.activeSide = side;
    }
    this.lastSmooth = this.lastSmooth === null || sinceLast > 1000
      ? angle : this.lastSmooth * 0.55 + angle * 0.45;
    const measured = this.lastSmooth;
    this.lastAngle = Math.round(measured);
    this.samples++;
    this.lastEvent = null;
    this.currentFault = null;
    const { extended, started, full } = this.exercise;

    const progressRatio = (extended - measured) / Math.max(1, (extended - full));
    this.depthProgress = Math.max(0, Math.min(120, Math.round(progressRatio * 100)));

    if (!this.ready && !this.inRep && measured >= extended) {
      this.ready = true;
      this.phase = '已就绪';
    } else if (this.ready && !this.inRep && measured <= started) {
      this.inRep = true;
      this.ready = false;
      this.repStartedAt = timestamp;
      this.minAngle = measured;
      this.phase = '动作进行中';
      if (side) this.activeSide = side;
    } else if (this.inRep) {
      this.minAngle = Math.min(this.minAngle, measured);
      this.phase = this.minAngle <= full ? '完成幅度 · 返回起点' : '动作进行中';

      // Check posture faults during movement
      if (landmarks && measured < started) {
        const fault = checkPostureFault(landmarks, this.exercise.id, this.activeSide || side);
        if (fault) {
          const lastTime = this.lastFaultTimes[fault.code] || 0;
          if (timestamp - lastTime >= 3000) {
            this.lastFaultTimes[fault.code] = timestamp;
            this.faultCounts[fault.code] = (this.faultCounts[fault.code] || 0) + 1;
            this.currentFault = fault;
            this.lastEvent = { type: 'warning', message: fault.message, timestamp, code: fault.code };
          }
        }
      }

      if (measured >= extended) {
        const duration = timestamp - this.repStartedAt;
        const complete = this.minAngle <= full;
        if (duration >= MIN_REP_MS && duration >= MIN_TRACKING_INTERVAL_MS) {
          if (complete) {
            this.count++;
            const isGoalAchieved = this.targetReps > 0 && this.count >= this.targetReps;
            const message = isGoalAchieved ? `🎉 达成目标！已完成 ${this.count} 次${this.exercise.name}！` : `完成第 ${this.count} 次${this.exercise.name}`;
            this.lastEvent = { type: 'success', message, isGoalAchieved, timestamp };
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
      angle: this.lastAngle, visible: this.visible, event: this.lastEvent, samples: this.samples,
      side: this.activeSide, progress: this.depthProgress, minAngle: this.inRep ? Math.round(this.minAngle) : null,
      fault: this.currentFault, faultCounts: { ...this.faultCounts },
      difficulty: this.exercise.difficulty, fullAngle: this.exercise.full, targetReps: this.targetReps };
  }
}
