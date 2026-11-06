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
  jumping_jack: {
    id: 'jumping_jack', name: '开合跳', english: 'JUMPING JACK', joint: '双臂展角', camera: '正面机位 · 全身入镜',
    guidance: '正对摄像头，全身入镜。起跳时双臂向上舒展，落地时双臂与双腿自然收回。',
    extended: 35, started: 55, full: 130, direction: 'expand',
  },
});

export const DIFFICULTY_PRESETS = Object.freeze({
  beginner: { name: '初学', squat: 122, curl: 80, jumping_jack: 115 },
  standard: { name: '标准', squat: 110, curl: 65, jumping_jack: 130 },
  advanced: { name: '进阶', squat: 95, curl: 50, jumping_jack: 145 },
});

export const EXERCISE_GUIDES = Object.freeze({
  squat: {
    standard: {
      title: '深蹲 · 标准动作要领示范',
      summary: '屈髋沉髋、双线平行、膝顺脚尖、大腿达标。',
      cues: [
        { label: '双平行线法则', desc: '下蹲到底时，小腿前倾角（约 20°）与脊柱躯干倾角（约 22°）保持相互平行。' },
        { label: '下潜深度达标', desc: '大腿下潜屈曲至与地面平行（膝关节估计角度 ≤ 110°），重心稳稳压在足弓正中。' },
        { label: '双臂平举配重', desc: '双臂自然向前水平平举以维持前后力矩平衡，下蹲吸气、起立呼气。' }
      ]
    },
    faults: [
      {
        id: 'trunk_lean',
        tag: '常见错误 01',
        name: '躯干过度前倾（鞠躬/塌背代偿）',
        shortName: '过度前倾',
        where: '下蹲时上半身前倾夹角超过 46°，胸口向下趴且过度靠近大腿，脊柱弯曲折叠。',
        why: '下肢负荷大量转移到腰椎 L4-L5 与竖脊肌，产生巨大的腰椎剪切力，极易诱发急性腰扭伤或腰肌劳损，且臀大肌无法充分受力。',
        correction: '双眼前视、挺胸沉肩，下蹲时保持背部平直与小腿双线平行，切勿以折腰弯背代替屈膝下蹲。',
        aiRule: 'AI 检测到 shoulder-hip 躯干夹角 > 46°，实时触发 trunk_lean 姿态异常警报。'
      },
      {
        id: 'shallow_squat',
        tag: '常见错误 02',
        name: '下蹲幅度过浅（半蹲偷懒/不达标）',
        shortName: '幅度过浅',
        where: '膝关节屈曲仅到 128°，大腿远未下潜到水平线（标准线 ≤ 110°）便匆忙折返起立。',
        why: '无法有效激活臀大肌与腘绳肌，膝前侧髌韧带承受集中剪切压力，无法形成完整的向心与离心训练刺激。',
        correction: '向后下方深坐，确保大腿至少平行地面，等待界面出现绿色达标提示后再发力蹬地起立。',
        aiRule: 'AI 状态机识别最低折返点未触达 full 目标线，标记为未达标浅动作（不计入有效次数）。'
      }
    ]
  },
  curl: {
    standard: {
      title: '哑铃弯举 · 标准动作要领示范',
      summary: '大臂夹紧贴身、前臂孤立收缩、顶峰挤压收紧。',
      cues: [
        { label: '大臂严格固定', desc: '大臂紧贴身体两侧垂直固定，全程不借助前后晃动冲量借力。' },
        { label: '顶峰充分收缩', desc: '前臂绕肘关节平滑屈曲至胸前（肘内角 ≤ 65°），在顶峰挤压肱二头肌 1 秒。' },
        { label: '躯干笔直中立', desc: '身体挺拔站立，双肩自然下沉，严禁向后仰腰或借腰椎力量后摆。' }
      ]
    },
    faults: [
      {
        id: 'arm_swing',
        tag: '常见错误 01',
        name: '大臂前后甩动借力（肘部前耸代偿）',
        shortName: '大臂借力',
        where: '向上屈臂时肘关节未固定在身体侧面，大臂向前晃动漂移（水平漂移量 > 0.11）。',
        why: '依靠上身冲量甩起重量，三角肌前束大幅借力代偿，导致肱二头肌失去离心张力，易拉伤肩袖。',
        correction: '如钢管般将大臂夹紧在肋骨两侧，仅允许小臂孤立旋转，重量过大时宜主动减轻负重。',
        aiRule: 'AI 检测到 elbow-shoulder 水平漂移量 > 0.11，实时触发 arm_swing 姿态借力警报。'
      },
      {
        id: 'shallow_curl',
        tag: '常见错误 02',
        name: '弯举幅度不完整（半程小臂抖动）',
        shortName: '幅度不足',
        where: '前臂上拉未到顶（屈曲内角仅到 108°，未达到达标线 ≤ 65°）即匆忙下放。',
        why: '肱二头肌未能进入最强的顶峰收缩区间，无法刺激深层肌纤维，力量强化与增肌效果大打折扣。',
        correction: '将重量平稳收至贴近胸前高度，下放时完全伸直手臂完成一次完整收缩周期。',
        aiRule: 'AI 状态机识别最小屈曲内角未达 full 达标线，拦截并提示本次幅度未达演示阈值（不计数）。'
      }
    ]
  },
  jumping_jack: {
    standard: {
      title: '开合跳 · 标准动作要领示范',
      summary: '双臂高举击掌、双腿同步开合、前掌轻盈缓冲。',
      cues: [
        { label: '四肢时序同步', desc: '双臂上举至头顶上方（≥ 130°）与双脚横向跳开（≥ 1.65× 髋距）完全同拍完成。' },
        { label: '落地屈膝减震', desc: '前脚掌轻盈点地，膝关节自然微屈以吸收地面反冲力，保护踝膝关节。' },
        { label: '标准闭环归位', desc: '下落时双臂回落贴身、双腿并拢，每轮均从双脚并拢站立位开始。' }
      ]
    },
    faults: [
      {
        id: 'asymmetry_or_desync',
        tag: '常见错误 01',
        name: '双臂与双腿不同步（动作节奏脱节）',
        shortName: '手腿脱节',
        where: '双腿提前收回并拢，而双臂仍停留在空中，或双臂上举时双腿未充分展开。',
        why: '破坏有氧运动的动力链协同节律，重心频繁骤变容易导致单侧脚踝落地崴伤。',
        correction: '心里默念节奏口诀，手脚同步向外展开，手脚同时落地收拢。',
        aiRule: 'AI 状态机核验 armPeakLegSynchronized 失败，拦截判定为动作不同步（不予计数）。'
      },
      {
        id: 'arm_asymmetry',
        tag: '常见错误 02',
        name: '双臂不对称展开（单侧滞后一高一低）',
        shortName: '双臂不对称',
        where: '左右手臂展角绝对差值 > 35°，一侧高举一侧滞后。',
        why: '单侧肩关节活动度受限或左右肌力不均，长期不对称跳跃易导致脊柱受力倾斜。',
        correction: '目视正前方镜面，双手在头顶正上方对称合拢或打拍，两侧发力均衡。',
        aiRule: 'AI 检测到左右臂展角绝对差 > 35°，实时触发 arm_asymmetry 警报。'
      },
      {
        id: 'static_legs',
        tag: '常见错误 03',
        name: '双腿偷懒未展开（仅晃动手臂假跳）',
        shortName: '腿未展开',
        where: '双脚始终并拢或展开幅度 < 1.65× 髋距，只有手臂在头顶晃动。',
        why: '下肢大肌群（臀中肌、内收肌、股四头肌）完全未参与做功，失去全身有氧燃脂效果。',
        correction: '向两侧轻快跳开至 1.5 倍肩宽，保证脚踝有清晰且充足的横向位移。',
        aiRule: 'AI 下肢位移核验 peakLegSpread 达标失败，判定为伪造开合跳直接拦截（不计数）。'
      }
    ]
  }
});

export function toPixelPoint(p, width = 960, height = 540) {
  if (!p) return null;
  if (p.x <= 2 && p.y <= 2) {
    return { x: p.x * width, y: p.y * height, visibility: p.visibility };
  }
  return p;
}

export function angleDegrees(a, b, c) {
  if (![a, b, c].every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
  const abx = a.x - b.x; const aby = a.y - b.y;
  const cbx = c.x - b.x; const cby = c.y - b.y;
  const denom = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (denom < 1e-7) return null;
  const cos = Math.max(-1, Math.min(1, (abx * cbx + aby * cby) / denom));
  return Math.acos(cos) * 180 / Math.PI;
}

export function getLegSpreadMetrics(landmarks, visibilityThreshold = 0.35) {
  if (!landmarks || landmarks.length < 29) return null;
  const leftHip = landmarks[23], rightHip = landmarks[24];
  const leftAnkle = landmarks[27], rightAnkle = landmarks[28];
  if (!leftHip || !rightHip || !leftAnkle || !rightAnkle) return null;
  const vis = Math.min(
    leftHip.visibility ?? 1, rightHip.visibility ?? 1,
    leftAnkle.visibility ?? 1, rightAnkle.visibility ?? 1
  );
  if (vis < visibilityThreshold) return null;
  const hipDist = Math.hypot(rightHip.x - leftHip.x, rightHip.y - leftHip.y);
  if (!Number.isFinite(hipDist) || hipDist < 0.02) return null;
  const ankleDist = Math.hypot(rightAnkle.x - leftAnkle.x, rightAnkle.y - leftAnkle.y);
  if (!Number.isFinite(ankleDist)) return null;
  return {
    ratio: ankleDist / hipDist,
    ankleDist,
    hipDist,
    vis
  };
}

export function getLegSpreadRatio(landmarks, visibilityThreshold = 0.35) {
  return getLegSpreadMetrics(landmarks, visibilityThreshold)?.ratio ?? null;
}

/** MediaPipe 33-landmark index convention. Supports side hysteresis & preferred side. */
export function extractJointAngle(landmarks, exerciseId, options = 0.6) {
  if (!landmarks || landmarks.length < 33) return null;
  const visibilityThreshold = typeof options === 'number' ? options : (options?.visibilityThreshold ?? 0.6);
  const preferredSide = typeof options === 'string' ? options : (typeof options === 'object' ? options?.preferredSide : null);
  const hysteresis = typeof options === 'object' ? (options?.hysteresis ?? 0.12) : 0.12;

  if (exerciseId === 'jumping_jack') {
    const leftPts = [23, 11, 15].map(i => landmarks[i]);
    const rightPts = [24, 12, 16].map(i => landmarks[i]);
    const leftValid = leftPts.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= visibilityThreshold);
    const rightValid = rightPts.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= visibilityThreshold);

    if (leftValid && rightValid) {
      const leftAngle = angleDegrees(...leftPts);
      const rightAngle = angleDegrees(...rightPts);
      if (leftAngle === null || rightAngle === null || leftAngle < 5 || rightAngle < 5) return null;
      const avg = Math.round((leftAngle + rightAngle) / 2);
      const score = Math.min(...leftPts.concat(rightPts).map(p => p.visibility ?? 1));
      return { angle: avg, confidence: score, side: '双侧', ids: [11, 12, 13, 14, 15, 16, 23, 24] };
    } else if (leftValid) {
      const angle = angleDegrees(...leftPts);
      if (angle === null || angle < 5) return null;
      const score = Math.min(...leftPts.map(p => p.visibility ?? 1));
      return { angle: Math.round(angle), confidence: score, side: '左侧', ids: [11, 13, 15, 23] };
    } else if (rightValid) {
      const angle = angleDegrees(...rightPts);
      if (angle === null || angle < 5) return null;
      const score = Math.min(...rightPts.map(p => p.visibility ?? 1));
      return { angle: Math.round(angle), confidence: score, side: '右侧', ids: [12, 14, 16, 24] };
    }
    return null;
  }

  const sideConfigs = exerciseId === 'curl'
    ? [{ ids: [11, 13, 15], side: '左侧' }, { ids: [12, 14, 16], side: '右侧' }]
    : [{ ids: [23, 25, 27], side: '左侧' }, { ids: [24, 26, 28], side: '右侧' }];

  let candidates = [];
  for (const { ids, side } of sideConfigs) {
    const rawPts = ids.map(i => landmarks[i]);
    if (rawPts.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
      (p.visibility ?? 1) < visibilityThreshold)) continue;
    // Squat joint angles must be evaluated in isotropic pixel space to eliminate aspect ratio distortion (GEO-01)
    const pts = exerciseId === 'squat' ? rawPts.map(p => toPixelPoint(p)) : rawPts;
    const angle = angleDegrees(...pts);
    const score = Math.min(...rawPts.map(p => p.visibility ?? 1));
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
    const shPx = toPixelPoint(shoulder);
    const hipPx = toPixelPoint(hip);
    const dx = Math.abs(shPx.x - hipPx.x);
    const dy = hipPx.y - shPx.y; // shoulder is above hip in canvas coordinates, so dy > 0
    if (dy <= 10) return null;
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
  } else if (exerciseId === 'jumping_jack') {
    const leftShoulder = landmarks[11], rightShoulder = landmarks[12];
    const leftWrist = landmarks[15], rightWrist = landmarks[16];
    const leftHip = landmarks[23], rightHip = landmarks[24];
    if ([leftShoulder, rightShoulder, leftWrist, rightWrist, leftHip, rightHip]
      .some(p => !p || (p.visibility ?? 1) < 0.45)) return null;

    const leftArmAngle = angleDegrees(leftHip, leftShoulder, leftWrist);
    const rightArmAngle = angleDegrees(rightHip, rightShoulder, rightWrist);
    if (leftArmAngle !== null && rightArmAngle !== null) {
      const asymmetry = Math.abs(leftArmAngle - rightArmAngle);
      if (asymmetry > 35) {
        return { code: 'arm_asymmetry', message: '双臂尽量对称舒展，避免单侧动作滞后', value: Math.round(asymmetry) };
      }
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
    this.peakAngle = 0;
    this.repStartedAt = 0;
    this.lastUpdateAt = -1;
    this.lastAngle = null;
    this.lastSmooth = null;
    this.visible = false;
    this.samples = 0;
    this.lastEvent = null;
    this.activeSide = null;
    this.depthProgress = 0;
    this.faultCounts = { trunk_lean: 0, arm_swing: 0, arm_asymmetry: 0 };
    this.lastFaultTimes = {};
    this.currentFault = null;
    this.minLegSpread = Infinity;
    this.peakLegSpread = 0;
    this.minAnkleDist = Infinity;
    this.peakAnkleDist = 0;
    this.legTrackingLost = false;
    this.hadValidLegRatio = false;
    this.armPeakLegSynchronized = false;
    this.armPeakTimestamp = null;
    this.legPeakTimestamp = null;
    this.legRatioAtArmPeak = null;
  }
  /** Reset any in-progress incomplete rep state when demo modes or tabs are switched (STATE-01). */
  resetIncompleteRep() {
    this.inRep = false;
    this.ready = true;
    this.phase = '已就绪';
    this.minAngle = 180;
    this.peakAngle = 0;
    this.lastSmooth = null;
    this.depthProgress = 0;
    this.currentFault = null;
    this.lastEvent = null;
    this.minLegSpread = Infinity;
    this.peakLegSpread = 0;
    this.minAnkleDist = Infinity;
    this.peakAnkleDist = 0;
    this.legTrackingLost = false;
    this.hadValidLegRatio = false;
    this.armPeakLegSynchronized = false;
    this.armPeakTimestamp = null;
    this.legPeakTimestamp = null;
    this.legRatioAtArmPeak = null;
  }
  update({ angle, visible = true, timestamp, side = null, landmarks = null }) {
    if (!Number.isFinite(timestamp)) throw new Error('timestamp must be finite milliseconds');
    if (timestamp <= this.lastUpdateAt) return this.snapshot();
    const sinceLast = this.lastUpdateAt < 0 ? 0 : timestamp - this.lastUpdateAt;
    this.lastUpdateAt = timestamp;
    if (sinceLast > 1200) {
      // Background tabs or long inference stalls cannot bridge an unfinished rep.
      this.ready = false; this.inRep = false; this.lastSmooth = null;
      this.minLegSpread = Infinity; this.peakLegSpread = 0;
      this.minAnkleDist = Infinity; this.peakAnkleDist = 0;
      this.legTrackingLost = false; this.hadValidLegRatio = false;
      this.armPeakLegSynchronized = false; this.armPeakTimestamp = null; this.legPeakTimestamp = null;
      this.legRatioAtArmPeak = null;
    }
    if (!visible || !Number.isFinite(angle) || angle < 5 || angle > 180) {
      // A lost pose must not complete a rep; reacquire while extended.
      this.visible = false; this.ready = false; this.inRep = false; this.lastSmooth = null;
      this.phase = '请调整机位'; this.lastAngle = null; this.lastEvent = null;
      this.depthProgress = 0;
      this.currentFault = null;
      this.minLegSpread = Infinity;
      this.peakLegSpread = 0;
      this.minAnkleDist = Infinity;
      this.peakAnkleDist = 0;
      this.legTrackingLost = false;
      this.hadValidLegRatio = false;
      this.armPeakLegSynchronized = false;
      this.armPeakTimestamp = null;
      this.legPeakTimestamp = null;
      this.legRatioAtArmPeak = null;
      return this.snapshot();
    }
    this.visible = true;

    // Hard side lock: switching side during active rep interrupts rep to prevent cross-side false counting (R-004)
    if (this.inRep && this.activeSide && side && side !== this.activeSide && this.exercise.id !== 'jumping_jack') {
      this.inRep = false;
      this.ready = false;
      this.lastSmooth = null;
      this.minAngle = 180;
      this.peakAngle = 0;
      this.phase = '侧别跳变 · 请保持单侧面向镜头';
      this.depthProgress = 0;
      this.currentFault = null;
      this.minLegSpread = Infinity;
      this.peakLegSpread = 0;
      this.minAnkleDist = Infinity;
      this.peakAnkleDist = 0;
      this.legTrackingLost = false;
      this.hadValidLegRatio = false;
      this.armPeakLegSynchronized = false;
      this.armPeakTimestamp = null;
      this.legPeakTimestamp = null;
      this.legRatioAtArmPeak = null;
      this.lastEvent = { type: 'warning', message: '检测到动作侧别切换，本轮动作已重置', timestamp };
      return this.snapshot();
    }

    if (!this.inRep && side) {
      this.activeSide = side;
    }

    // Monitor lower body keypoints for jumping jacks (R-005)
    let currentLegMetrics = null;
    if (this.exercise.id === 'jumping_jack') {
      currentLegMetrics = getLegSpreadMetrics(landmarks);
      if (currentLegMetrics !== null) {
        this.hadValidLegRatio = true;
        this.minLegSpread = Math.min(this.minLegSpread, currentLegMetrics.ratio);
        this.minAnkleDist = Math.min(this.minAnkleDist, currentLegMetrics.ankleDist);
        if (this.inRep) {
          if (currentLegMetrics.ratio > this.peakLegSpread) {
            this.peakLegSpread = currentLegMetrics.ratio;
            this.legPeakTimestamp = timestamp;
          }
          this.peakAnkleDist = Math.max(this.peakAnkleDist, currentLegMetrics.ankleDist);
        }
      } else if (this.inRep) {
        this.legTrackingLost = true;
      }
    }

    this.lastSmooth = this.lastSmooth === null || sinceLast > 1000
      ? angle : this.lastSmooth * 0.55 + angle * 0.45;
    const measured = this.lastSmooth;
    this.lastAngle = Math.round(measured);
    this.samples++;
    this.lastEvent = null;
    this.currentFault = null;
    const { extended, started, full, direction = 'bend' } = this.exercise;
    const isExpand = direction === 'expand';

    const progressRatio = isExpand
      ? (measured - extended) / Math.max(1, (full - extended))
      : (extended - measured) / Math.max(1, (extended - full));
    this.depthProgress = Math.max(0, Math.min(120, Math.round(progressRatio * 100)));

    const isAtExtended = isExpand ? measured <= extended : measured >= extended;
    const isStarted = isExpand ? measured >= started : measured <= started;

    if (!this.ready && !this.inRep && isAtExtended) {
      this.ready = true;
      this.phase = '已就绪';
    } else if (this.ready && !this.inRep && isStarted) {
      this.inRep = true;
      this.ready = false;
      this.repStartedAt = timestamp;
      this.minAngle = measured;
      this.peakAngle = measured;
      this.phase = '动作进行中';
      if (side) this.activeSide = side;

      // Initialize rep spread tracking
      if (this.exercise.id === 'jumping_jack') {
        if (currentLegMetrics !== null) {
          this.peakLegSpread = Math.max(this.peakLegSpread, currentLegMetrics.ratio);
          this.peakAnkleDist = Math.max(this.peakAnkleDist, currentLegMetrics.ankleDist);
        } else {
          this.legTrackingLost = true;
        }
      }
    } else if (this.inRep) {
      this.minAngle = Math.min(this.minAngle, measured);
      this.peakAngle = Math.max(this.peakAngle, measured);
      const isFullReached = isExpand ? this.peakAngle >= full : this.minAngle <= full;
      this.phase = isFullReached ? '完成幅度 · 返回起点' : '动作进行中';

      // Track temporal arm-leg synchronization for jumping jacks (R-005)
      if (this.exercise.id === 'jumping_jack') {
        const overheadThreshold = Math.min(125, this.exercise.full - 5);
        if (measured >= (this.peakAngle || 0) - 4 && measured >= overheadThreshold) {
          this.armPeakTimestamp = timestamp;
          if (currentLegMetrics !== null) {
            this.legRatioAtArmPeak = currentLegMetrics.ratio;
            this.ankleDistAtArmPeak = currentLegMetrics.ankleDist;
            if (currentLegMetrics.ratio >= 1.50 && currentLegMetrics.ankleDist >= 1.30 * this.minAnkleDist) {
              this.armPeakLegSynchronized = true;
            }
          }
        }
      }

      // Check posture faults during movement
      const shouldCheckFault = isExpand ? measured > started : measured < started;
      if (landmarks && shouldCheckFault) {
        const fault = checkPostureFault(landmarks, this.exercise.id, this.activeSide || side);
        if (fault) {
          const lastTime = this.lastFaultTimes[fault.code];
          if (lastTime === undefined || timestamp - lastTime >= 3000) {
            this.lastFaultTimes[fault.code] = timestamp;
            this.faultCounts[fault.code] = (this.faultCounts[fault.code] || 0) + 1;
            this.currentFault = fault;
            this.lastEvent = { type: 'warning', message: fault.message, timestamp, code: fault.code };
          }
        }
      }

      if (isAtExtended) {
        const duration = timestamp - this.repStartedAt;
        const armComplete = isExpand ? this.peakAngle >= full : this.minAngle <= full;
        let legComplete = true;
        let legFaultReason = '';

        if (this.exercise.id === 'jumping_jack') {
          const endMetrics = currentLegMetrics || getLegSpreadMetrics(landmarks);
          if (!this.hadValidLegRatio || this.legTrackingLost || !endMetrics) {
            legComplete = false;
            legFaultReason = '下肢关键点不可见或被遮挡，无法核验开合跳双腿动作';
          } else if (this.minLegSpread > 1.35) {
            legComplete = false;
            legFaultReason = '双腿全程未见并拢，开合跳须从双脚并拢姿势开始';
          } else if (this.peakLegSpread < 1.65) {
            legComplete = false;
            legFaultReason = '双腿展开幅度不足，开合跳需双臂与双腿同步充分展开';
          } else if (this.peakAnkleDist < 1.35 * this.minAnkleDist || (this.peakAnkleDist - this.minAnkleDist) < 0.035) {
            legComplete = false;
            legFaultReason = '双脚踝未见真实展开位移，不能以单纯髋距变化伪造开合跳';
          } else if (!this.armPeakLegSynchronized || (this.legRatioAtArmPeak !== null && this.legRatioAtArmPeak < 1.45)) {
            legComplete = false;
            legFaultReason = '双臂与双腿展开不同步，手臂上举最高峰时双腿未处于展开状态';
          } else if (endMetrics.ratio > 1.40) {
            legComplete = false;
            legFaultReason = '双腿结束未收回并拢，开合跳每轮须返回双脚并拢起点';
          }
        }

        const complete = armComplete && legComplete;
        if (duration >= MIN_REP_MS && duration >= MIN_TRACKING_INTERVAL_MS) {
          if (complete) {
            this.count++;
            const isGoalAchieved = this.targetReps > 0 && this.count >= this.targetReps;
            const message = isGoalAchieved ? `🎉 达成目标！已完成 ${this.count} 次${this.exercise.name}！` : `完成第 ${this.count} 次${this.exercise.name}`;
            this.lastEvent = { type: 'success', message, isGoalAchieved, timestamp };
          } else {
            this.partialCount++;
            const message = legFaultReason || (armComplete ? '动作幅度未达标（不计数）' : '本次动作幅度未达到演示阈值（不计数）');
            this.lastEvent = { type: 'warning', message, timestamp };
          }
        }
        this.inRep = false;
        this.ready = true;
        this.phase = '已就绪';
        this.minAngle = 180;
        this.peakAngle = 0;
        const currentMetrics = getLegSpreadMetrics(landmarks);
        this.minLegSpread = currentMetrics?.ratio ?? Infinity;
        this.peakLegSpread = currentMetrics?.ratio ?? 0;
        this.minAnkleDist = currentMetrics?.ankleDist ?? Infinity;
        this.peakAnkleDist = currentMetrics?.ankleDist ?? 0;
        this.legTrackingLost = false;
        this.hadValidLegRatio = (currentMetrics !== null);
        this.armPeakLegSynchronized = false;
        this.armPeakTimestamp = null;
        this.legPeakTimestamp = null;
        this.legRatioAtArmPeak = null;
        this.legSpreadAtArmPeak = 0;
        this.ankleDistAtArmPeak = 0;
      }
    }
    return this.snapshot();
  }
  snapshot() {
    return { count: this.count, partialCount: this.partialCount, phase: this.phase,
      angle: this.lastAngle, visible: this.visible, event: this.lastEvent, samples: this.samples,
      side: this.activeSide, progress: this.depthProgress,
      minAngle: this.inRep ? Math.round(this.minAngle) : null,
      peakAngle: this.inRep ? Math.round(this.peakAngle) : null,
      fault: this.currentFault, faultCounts: { ...this.faultCounts },
      difficulty: this.exercise.difficulty, fullAngle: this.exercise.full, targetReps: this.targetReps };
  }
}
