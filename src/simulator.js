/** Clearly labelled synthetic coordinates for UI and algorithm testing; never described as AI inference. */
function blank() { return Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 })); }
function put(points, index, x, y) { points[index] = { x, y, visibility: 0.99 }; }

export function simulatedAngle(elapsedMs, exerciseId, options = {}) {
  const period = 4700;
  const cycle = Math.floor(elapsedMs / period);
  const t = (elapsedMs % period) / period;
  // Quintic ease keeps velocity AND acceleration zero at phase boundaries.
  // The small time warp preserves asymmetric eccentric/concentric momentum,
  // while smooth5 still makes each join C2-continuous.
  const easing = (u, skew) => smooth5(u + skew * 4 * u * u * (1 - u) * (1 - u));

  const diff = options.difficulty || 'standard';
  let full;
  if (exerciseId === 'squat') {
    full = diff === 'advanced' ? 90 : (diff === 'beginner' ? 115 : 91);
  } else if (exerciseId === 'curl') {
    full = diff === 'advanced' ? 45 : (diff === 'beginner' ? 70 : 48);
  } else if (exerciseId === 'jumping_jack') {
    full = diff === 'advanced' ? 173 : (diff === 'beginner' ? 160 : 168);
  } else if (exerciseId === 'lunge') {
    full = diff === 'advanced' ? 90 : (diff === 'beginner' ? 115 : 102);
    // Knee-drive needs deeper FLEXION when the shin advances. Keeping the
    // textbook knee angle while moving it past the toe forced the pelvis UP
    // (the visually implausible forward-lunge from v0.3.1).
    if (activeFault('lunge', options, cycle) === 0) full = Math.max(78, full - 22);
  } else if (exerciseId === 'pushup') {
    full = diff === 'advanced' ? 72 : (diff === 'beginner' ? 102 : 87);
  }
  const partial = exerciseId === 'squat' ? 128 : (exerciseId === 'jumping_jack' ? 85 : (exerciseId === 'curl' ? 108 : (exerciseId === 'pushup' ? 118 : 128)));

  let peak;
  if (options.mode === 'standard') {
    // Pure standard mode: every cycle reaches 100% full textbook target depth across all difficulties (MODE-02)
    peak = full;
  } else if (options.mode === 'fault') {
    // Fault mode: only squat, curl, lunge & pushup fault 1 are shallow reps; jumping jack faults keep full peak depth (MODE-01)
    const isShallow = options.faultId?.includes('shallow') ||
      ((exerciseId === 'squat' || exerciseId === 'curl' || exerciseId === 'lunge' || exerciseId === 'pushup') && options.faultIndex === 1);
    peak = isShallow ? partial : full;
  } else {
    // Backward compatibility for existing unit tests & automated benchmarks
    peak = cycle % 4 === 2 ? partial : (exerciseId === 'curl' ? 52 : (exerciseId === 'jumping_jack' ? 168 : (exerciseId === 'pushup' ? 87 : (exerciseId === 'lunge' ? 102 : 91))));
  }

  const standing = exerciseId === 'jumping_jack' ? 25 : (exerciseId === 'pushup' ? 165 : 174);
  if (exerciseId === 'jumping_jack') {
    if (t < .18) return standing;
    if (t < .46) return standing + (peak - standing) * smooth5((t - .18) / .28);
    if (t < .57) return peak;
    if (t < .86) return peak - (peak - standing) * smooth5((t - .57) / .29);
    return standing;
  }

  if (t < .18) return standing;
  if (t < .46) return standing - (standing - peak) * easing((t-.18)/.28, -0.28);
  if (t < .57) return peak;
  if (t < .86) return peak + (standing-peak) * easing((t-.57)/.29, 0.28);
  return standing;
}

// Use C2-continuous quintic interpolation for a natural build-up and recoil.
// Unlike a hard time gate, both displacement and velocity go to zero at the edges.
function smooth5(u) {
  const x = Math.max(0, Math.min(1, u));
  return x * x * x * (x * (6 * x - 15) + 10);
}

function faultEnvelope(t, onset, apexIn, apexOut, recovery) {
  return smooth5((t - onset) / (apexIn - onset)) *
    (1 - smooth5((t - apexOut) / (recovery - apexOut)));
}

function activeFault(exerciseId, options, cycle) {
  if (options.mode === 'standard') return null;
  if (options.mode !== 'fault') return options.simulateFault && cycle % 4 === 1 ? (exerciseId === 'jumping_jack' ? 1 : 0) : null;
  const known = {
    squat: { trunk_lean: 0, shallow_squat: 1 },
    curl: { arm_swing: 0, shallow_curl: 1 },
    jumping_jack: { asymmetry_or_desync: 0, arm_asymmetry: 1, static_legs: 2 },
    lunge: { knee_over_toes: 0, shallow_lunge: 1 },
    pushup: { sagging_hips: 0, shallow_pushup: 1 },
  };
  return options.faultIndex ?? known[exerciseId]?.[options.faultId] ?? 0;
}

// Every 2-D segment is solved using *real 960x540 projection pixels*, then
// normalized once when constructing the MediaPipe-style 33 landmarks.
const JACK = Object.freeze({
  width: 960, height: 540,
  centerX: 480,
  hipHalfWidth: 45, shoulderHalfWidth: 57,
  hipRestY: 285, shoulderAboveHip: 113, ankleRestY: 494,
  thigh: 101, shin: 110, upperArm: 76, forearm: 76,
  foot: 25, heel: 13,
  ankleHalfWidthClosed: 44, ankleAdditionalSpread: 91,
});

// A quintic rise and fall: no sudden positional / velocity / acceleration
// changes at either transition. All phases repeat identically every 4700 ms.
function jackPulse(t, start, riseEnd, fallStart, end) {
  return smooth5((t - start) / (riseEnd - start)) *
    (1 - smooth5((t - fallStart) / (end - fallStart)));
}

// 2-circle intersection: |root-joint|=L1 and |joint-target|=L2 *exactly*.
// bendSign selects the outward/anatomical knee or elbow branch, never stretches.
function rigidTwoLink(root, target, L1, L2, bendSign) {
  const vx = target.x - root.x, vy = target.y - root.y;
  const d = Math.hypot(vx, vy);
  // The simulator's dimensions guarantee a reachable target; explicit guard
  // catches accidental changes to envelope / amplitude in future edits.
  if (d < Math.abs(L1 - L2) + 1e-8 || d > L1 + L2 + 1e-8) {
    throw new RangeError(`Unreachable rigid limb target: distance ${d.toFixed(3)}, links ${L1}+${L2}`);
  }
  const ux = vx / d, uy = vy / d;
  const along = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const perpendicular = Math.sqrt(Math.max(0, L1 * L1 - along * along));
  return {
    x: root.x + along * ux - bendSign * perpendicular * uy,
    y: root.y + along * uy + bendSign * perpendicular * ux,
  };
}

function simulateJumpingJack(elapsedMs, options, activeFaultIndex, t, angleDeg) {
  const p = blank();
  const C = JACK;
  const isDesync = activeFaultIndex === 0;
  const isAsym = activeFaultIndex === 1;
  const isStatic = activeFaultIndex === 2;

  // Normal arms and legs travel together. In desync mode, the legs take off
  // after the arms are already high, then expand as the arms come down.
  const armProgress = jackPulse(t, 0.18, 0.46, 0.57, 0.86);
  const legProgress = isStatic ? 0 : isDesync
    ? jackPulse(t, 0.59, 0.77, 0.80, 0.97)
    : jackPulse(t, 0.18, 0.46, 0.54, 0.82);
  const lift = isStatic ? 0 : isDesync
    ? jackPulse(t, 0.60, 0.76, 0.80, 0.94)
    : jackPulse(t, 0.22, 0.46, 0.52, 0.79);
  // Gentle anticipation squat and landing absorption. In static-legs mode
  // this reads as an in-place weight shift with genuinely planted feet.
  const preparation = jackPulse(t, 0.11, 0.21, 0.25, 0.34);
  const landing = isStatic ? 0 : isDesync
    ? jackPulse(t, 0.89, 0.95, 0.96, 0.99)
    : jackPulse(t, 0.76, 0.83, 0.85, 0.90);
  const hipY = C.hipRestY + 6 * preparation + 5 * landing - 11 * lift;
  const shoulderY = hipY - C.shoulderAboveHip;
  const ankleY = C.ankleRestY - 31 * lift;
  const hipLeft = { x: C.centerX - C.hipHalfWidth, y: hipY };
  const hipRight = { x: C.centerX + C.hipHalfWidth, y: hipY };
  const shoulderLeft = { x: C.centerX - C.shoulderHalfWidth, y: shoulderY };
  const shoulderRight = { x: C.centerX + C.shoulderHalfWidth, y: shoulderY };
  const ankleLeft = { x: C.centerX - C.ankleHalfWidthClosed - C.ankleAdditionalSpread * legProgress, y: ankleY };
  const ankleRight = { x: C.centerX + C.ankleHalfWidthClosed + C.ankleAdditionalSpread * legProgress, y: ankleY };
  const kneeLeft = rigidTwoLink(hipLeft, ankleLeft, C.thigh, C.shin, +1);
  const kneeRight = rigidTwoLink(hipRight, ankleRight, C.thigh, C.shin, -1);

  // Only right arm lags in fault #1. Attenuation is a continuous envelope,
  // never a frame-gated jump or a replacement of the shoulder joint.
  const lag = isAsym ? faultEnvelope(t, 0.28, 0.45, 0.58, 0.80) : 0;
  const leftDeg = angleDeg;
  const rightDeg = 25 + (angleDeg - 25) * (1 - 0.52 * lag);
  // A modest elbow bend becomes visible when the arms rise. Wrist direction
  // is the exact shoulder-hip measurement angle in PIXEL space; both bones
  // retain constant lengths as the elbow is solved by analytic two-link IK.
  const putArm = (shoulder, deg, side, si, ei, wi) => {
    // The anatomical torso has 12px of lateral shoulder-to-hip offset.
    // Subtract this from the world-space sweep so that the *actual* pixel
    // shoulder angle against the shoulder-to-hip vector equals `deg`.
    const torsoOffset = Math.atan2(C.shoulderHalfWidth - C.hipHalfWidth, C.shoulderAboveHip);
    const theta = deg * Math.PI / 180 - torsoOffset;
    const bend = (170 - 6 * armProgress) * Math.PI / 180;
    const reach = Math.sqrt(C.upperArm ** 2 + C.forearm ** 2 -
      2 * C.upperArm * C.forearm * Math.cos(bend));
    const wrist = {
      x: shoulder.x + side * reach * Math.sin(theta),
      y: shoulder.y + reach * Math.cos(theta),
    };
    const elbow = rigidTwoLink(shoulder, wrist, C.upperArm, C.forearm, side);
    for (const [i, a] of [[si, shoulder], [ei, elbow], [wi, wrist]]) {
      put(p, i, a.x / C.width, a.y / C.height);
    }
  };
  putArm(shoulderLeft, leftDeg, -1, 11, 13, 15);
  putArm(shoulderRight, rightDeg, +1, 12, 14, 16);

  for (const [i, a] of [[23, hipLeft], [24, hipRight],
    [25, kneeLeft], [26, kneeRight], [27, ankleLeft], [28, ankleRight]]) {
    put(p, i, a.x / C.width, a.y / C.height);
  }
  // Local feet rotate gently outward through the kick, with 25px toes and
  // 13px heels kept rigid to each ankle. Never stretch a foot to the floor.
  const toeRad = (12 + 10 * legProgress) * Math.PI / 180;
  for (const [ankle, toeId, heelId, side] of [
    [ankleLeft, 29, 31, -1], [ankleRight, 30, 32, +1],
  ]) {
    const toe = { x: ankle.x + side * C.foot * Math.cos(toeRad), y: ankle.y + C.foot * Math.sin(toeRad) };
    const heel = { x: ankle.x - side * C.heel * Math.cos(toeRad), y: ankle.y + C.heel * Math.sin(toeRad) };
    put(p, toeId, toe.x / C.width, toe.y / C.height);
    put(p, heelId, heel.x / C.width, heel.y / C.height);
  }
  // The head and the two shoulder-to-hip segments translate together as one
  // rigid torso; its 59px neck offset is constant through the jump.
  put(p, 0, C.centerX / C.width, (shoulderY - 59) / C.height);
  return p;
}

// Side-view, planted-front-foot lunge. A real forward knee drive is ankle
// dorsiflexion plus additional knee flexion, NOT a hip teleported forwards at
// the same knee angle. The lead shank and femur are a rigid angle chain:
//   ankle -> knee (fixed SHIN), knee -> hip (fixed THIGH, measured angle).
// The back foot pivots on a planted TOE as its heel rises; its ankle and knee
// move rigidly via foot rotation and 2-link IK (a locked rear heel made the
// trailing leg fold sideways and left the pelvis floating in midair).
function simulateLunge(elapsedMs, options, activeFaultIndex, t, angleDeg, kneeDrive) {
  const p = blank();
  const W = 960, H = 540;
  const THIGH = 113.4, SHIN = 118.8, TORSO = 124.2;
  const UPPER = 76, FOREARM = 76;
  const RAD = Math.PI / 180;
  const isKneeDrive = activeFaultIndex === 0;
  const full = options.difficulty === 'advanced' ? 90 :
    (options.difficulty === 'beginner' ? 115 : 102);
  const peak = isKneeDrive ? Math.max(78, full - 22) :
    activeFaultIndex === 1 ? 128 : full;
  const depth = Math.max(0, Math.min(1, (174 - angleDeg) / (174 - peak)));

  // The FRONT foot lies flat and never slides. Shank orientation starts with
  // the knee slightly behind the ankle, advancing toward vertical on descent.
  // At the faulty peak, ~20° dorsiflexion places the knee only ~8 px beyond
  // the toe, as in a plausible exaggerated lunge (not an extreme lurch).
  const frontAnkle = { x: 626, y: 450 };
  const frontToe = { x: 658, y: 456 };
  const frontHeel = { x: 610, y: 454 };
  const shinTilt = (-35 + 29 * depth + 26 * kneeDrive) * RAD;
  const frontKnee = {
    x: frontAnkle.x + SHIN * Math.sin(shinTilt),
    y: frontAnkle.y - SHIN * Math.cos(shinTilt),
  };
  // Rotate the thigh around its REAL knee joint. The knee->ankle ray has
  // azimuth PI/2 + shinTilt, so the visible interior angle equals angleDeg.
  const femurDirection = Math.PI / 2 + shinTilt + angleDeg * RAD;
  const hip = {
    x: frontKnee.x + THIGH * Math.cos(femurDirection),
    y: frontKnee.y + THIGH * Math.sin(femurDirection),
  };

  // REAR toe remains planted. Its 35.36 px toe-to-ankle rigid foot rotates
  // from flat to a raised heel. No independent ankle or knee translation.
  const rearToe = { x: 395, y: 455 };
  const flatToeToAnkle = { x: -35, y: -5 };
  const heelRise = (52 * depth + 23 * kneeDrive) * RAD;
  const rearAnkle = {
    x: rearToe.x + flatToeToAnkle.x * Math.cos(heelRise) - flatToeToAnkle.y * Math.sin(heelRise),
    y: rearToe.y + flatToeToAnkle.x * Math.sin(heelRise) + flatToeToAnkle.y * Math.cos(heelRise),
  };
  // Human rear knee folds forward/down as the heel lifts. The other IK branch
  // would place it BEHIND the pelvis and up in the air.
  const rearKnee = rigidTwoLink(hip, rearAnkle, THIGH, SHIN, -1);
  const toeVector = { x: rearToe.x - rearAnkle.x, y: rearToe.y - rearAnkle.y };
  const footLen = Math.hypot(toeVector.x, toeVector.y);
  const rearHeel = {
    x: rearAnkle.x - 16 * toeVector.x / footLen,
    y: rearAnkle.y - 16 * toeVector.y / footLen,
  };

  // No unnatural 41° trunk collapse. The fault is led by the knee and ankle;
  // modest whole-torso lean follows the hips while the spine stays rigid.
  const torsoTilt = (3 + 6 * depth + 14 * kneeDrive) * RAD;
  const shoulder = {
    x: hip.x + TORSO * Math.sin(torsoTilt),
    y: hip.y - TORSO * Math.cos(torsoTilt),
  };
  const head = {
    x: shoulder.x + 50 * Math.sin(torsoTilt) + 8 * Math.cos(torsoTilt),
    y: shoulder.y - 50 * Math.cos(torsoTilt) + 8 * Math.sin(torsoTilt),
  };

  // Arms hang alongside the trunk with a small natural elbow bend.
  const upperTilt = (8 + 12 * depth + 6 * kneeDrive) * RAD;
  const foreTilt = (-32 - 13 * depth - 6 * kneeDrive) * RAD;
  const elbow = {
    x: shoulder.x + UPPER * Math.sin(upperTilt),
    y: shoulder.y + UPPER * Math.cos(upperTilt),
  };
  const wrist = {
    x: elbow.x + FOREARM * Math.sin(foreTilt),
    y: elbow.y + FOREARM * Math.cos(foreTilt),
  };

  const set = (id, pt, visibility = 0.99) => {
    p[id] = { x: pt.x / W, y: pt.y / H, visibility };
  };
  for (const [i, pt] of [
    [23, hip], [25, frontKnee], [27, frontAnkle],
    [11, shoulder], [13, elbow], [15, wrist],
    [29, frontHeel], [31, frontToe],
  ]) set(i, pt);
  // Model opposite-side body joints as one rigid offset in this side view.
  const FAR = { x: 16, y: -4 };
  for (const [i, pt] of [
    [24, hip], [26, rearKnee], [28, rearAnkle],
    [12, shoulder], [14, elbow], [16, wrist],
    [30, rearHeel], [32, rearToe],
  ]) set(i, { x: pt.x + FAR.x, y: pt.y + FAR.y }, 0.90);
  set(0, head);
  return p;
}

// Full-body side-view push-up. Two PLANTED contacts and a continuous 4-bar
// linkage define the movement: straight ankle-hip-shoulder body on a circle
// about the toe, and a real two-bone elbow about a fixed wrist. The hand is
// below the SHOULDER in full extension; elbows sweep toward the feet as the
// shoulders descend. Sag modifies only the body linkage, never bone lengths.
function simulatePushup(elapsedMs, options, activeFaultIndex, t, angleDeg, sagEnvelope) {
  const p = blank();
  const W = 960, H = 540;
  // Anatomical ratios: forearm slightly shorter than upper arm. The earlier
  // 92/88 px arms relative to the 370 px body made the chest hover high even
  // at 87° elbow flexion, visibly unlike the ground-facing movement.
  const UPPER = 84, FOREARM = 76, TORSO = 145, THIGH = 115, SHIN = 110;
  const LEG = THIGH + SHIN;
  const BODY = LEG + TORSO;
  const RAD = Math.PI / 180;
  const ankle = { x: 260, y: 459 }; // ball of the rear foot is planted
  const wrist = { x: 600, y: 459 }; // palm is directly beneath the top shoulder

  // Exact distance between shoulder and wrist for the target elbow angle.
  const armReach = Math.sqrt(UPPER * UPPER + FOREARM * FOREARM -
    2 * UPPER * FOREARM * Math.cos(angleDeg * RAD));
  // Sag compresses the ankle-to-shoulder span (NOT any individual bone).
  // 12.5px gives ~30.6deg of downward hip break at peak, past the 25deg
  // posture threshold while the pelvis remains visibly above the floor.
  // IMPORTANT: IK near the fully straight body has a square-root branch.
  // Squaring the quintic envelope makes the actual hip excursion O(envelope),
  // retaining C2 positional smoothness at both fade-in and fade-out.
  const bodyReach = BODY - 12.5 * sagEnvelope * sagEnvelope;
  const shoulder = rigidTwoLink(ankle, wrist, bodyReach, armReach, -1);
  const elbow = rigidTwoLink(shoulder, wrist, UPPER, FOREARM, +1);
  const hip = sagEnvelope < 1e-12
    ? { x: ankle.x + (LEG / BODY) * (shoulder.x - ankle.x),
        y: ankle.y + (LEG / BODY) * (shoulder.y - ankle.y) }
    : rigidTwoLink(ankle, shoulder, LEG, TORSO, +1);
  // Knee is fixed on the straight ankle-to-hip link. A small knee flexion can
  // later be introduced by another 2-link solve without moving the contacts.
  const knee = {
    x: ankle.x + (SHIN / LEG) * (hip.x - ankle.x),
    y: ankle.y + (SHIN / LEG) * (hip.y - ankle.y),
  };
  const torsoAxis = Math.atan2(shoulder.y - hip.y, shoulder.x - hip.x);
  const head = {
    x: shoulder.x + 45 * Math.cos(torsoAxis),
    y: shoulder.y + 45 * Math.sin(torsoAxis),
  };

  const set = (id, pt, v = 0.99) => {
    p[id] = { x: pt.x / W, y: pt.y / H, visibility: v };
  };
  const near = [[11, shoulder], [13, elbow], [15, wrist],
    [23, hip], [25, knee], [27, ankle]];
  for (const [id, pt] of near) set(id, pt);
  // Duplicate the far silhouette with ONE rigid view-depth transform for
  // every joint. This also fixes the original far-side limb-length drift.
  const FAR = { x: -12, y: -5 };
  for (const [i, pt] of [[12, shoulder], [14, elbow], [16, wrist],
    [24, hip], [26, knee], [28, ankle]]) {
    set(i, { x: pt.x + FAR.x, y: pt.y + FAR.y }, 0.90);
  }
  const toe = { x: ankle.x - 26, y: ankle.y + 13 };
  const heel = { x: ankle.x + 13, y: ankle.y - 6 };
  set(29, heel); set(31, toe);
  set(30, { x: heel.x + FAR.x, y: heel.y + FAR.y }, 0.90);
  set(32, { x: toe.x + FAR.x, y: toe.y + FAR.y }, 0.90);
  set(0, head);
  return p;
}

export function simulatePose(elapsedMs, exerciseId, options = {}) {
  const period = 4700;
  const cycle = Math.floor(elapsedMs / period);
  const t = (elapsedMs % period) / period;

  const activeFaultIndex = activeFault(exerciseId, options, cycle);
  const squatLean = activeFaultIndex === 0 && exerciseId === 'squat'
    ? faultEnvelope(t, 0.29, 0.46, 0.56, 0.73) : 0;
  const curlSwing = activeFaultIndex === 0 && exerciseId === 'curl'
    ? faultEnvelope(t, 0.30, 0.48, 0.54, 0.72) : 0;
  const lungeKneeOverToes = activeFaultIndex === 0 && exerciseId === 'lunge'
    ? faultEnvelope(t, 0.29, 0.46, 0.56, 0.73) : 0;
  const pushupSaggingHips = activeFaultIndex === 0 && exerciseId === 'pushup'
    ? faultEnvelope(t, 0.29, 0.46, 0.56, 0.73) : 0;

  const points = blank();
  const angleDeg = simulatedAngle(elapsedMs, exerciseId, options);
  const angle = angleDeg * Math.PI / 180;

  if (exerciseId === 'jumping_jack') {
    return simulateJumpingJack(elapsedMs, options, activeFaultIndex, t, angleDeg);
  } else if (exerciseId === 'lunge') {
    return simulateLunge(elapsedMs, options, activeFaultIndex, t, angleDeg, lungeKneeOverToes);
  } else if (exerciseId === 'pushup') {
    return simulatePushup(elapsedMs, options, activeFaultIndex, t, angleDeg, pushupSaggingHips);
  } else if (exerciseId === 'squat') {
    const squatRatio = Math.max(0, Math.min(1, (174 - angleDeg) / (174 - 91)));
    const W = 960, H = 540;
    const L_SHIN = 118.8, L_THIGH = 113.4, L_TORSO = 124.2, L_ARM = 91.8;
    const ankleX = W * 0.52, ankleY = H * 0.86;

    // Inverse kinematics from the fixed supporting foot. Each child is defined
    // with cos/sin from its *parent*, never by independently moving endpoints.
    const shinTilt = (3 + 17 * squatRatio) * Math.PI / 180;
    const kneeX = ankleX - L_SHIN * Math.sin(shinTilt);
    const kneeY = ankleY - L_SHIN * Math.cos(shinTilt);
    const directionKneeToAnkle = Math.atan2(ankleY - kneeY, ankleX - kneeX);
    const directionKneeToHip = directionKneeToAnkle - angle;
    const hipX = kneeX + L_THIGH * Math.cos(directionKneeToHip);
    const hipY = kneeY + L_THIGH * Math.sin(directionKneeToHip);

    // The normal bottom position retains the 20°/22° double-parallel law.
    // In the fault, the *same rigid torso* folds progressively to 60°:
    // shoulder drops and travels forward around the hip instead of teleporting.
    const normalTorsoTilt = 3 + 19 * squatRatio;
    const faultyTorsoTilt = normalTorsoTilt + (60 - normalTorsoTilt) * squatLean;
    const torsoRad = faultyTorsoTilt * Math.PI / 180;
    const shoulderX = hipX - L_TORSO * Math.sin(torsoRad);
    const shoulderY = hipY - L_TORSO * Math.cos(torsoRad);

    // Arms counterbalance from a fixed shoulder with exactly 91.8 px reach.
    // More forward pointing at the fold reads naturally without elbow stretch.
    const armRad = (25 + 65 * squatRatio + 7 * squatLean) * Math.PI / 180;
    const elbowX = shoulderX - 0.5 * L_ARM * Math.sin(armRad);
    const elbowY = shoulderY + 0.5 * L_ARM * Math.cos(armRad);
    const wristX = shoulderX - L_ARM * Math.sin(armRad);
    const wristY = shoulderY + L_ARM * Math.cos(armRad);

    // Head follows torso rotation, with a constant 2D neck length (50,8).
    const headX = shoulderX - 50 * Math.sin(torsoRad) - 8 * Math.cos(torsoRad);
    const headY = shoulderY - 50 * Math.cos(torsoRad) + 8 * Math.sin(torsoRad);

    const far = 19.2; // far-side silhouette offset; preserves both limb lengths
    put(points, 23, hipX/W, hipY/H); put(points, 24, (hipX+far)/W, hipY/H);
    put(points, 25, kneeX/W, kneeY/H); put(points, 26, (kneeX+far)/W, kneeY/H);
    put(points, 27, ankleX/W, ankleY/H); put(points, 28, (ankleX+far)/W, ankleY/H);
    put(points, 29, (ankleX+24)/W, (ankleY+5.4)/H);
    put(points, 30, (ankleX+24+far)/W, (ankleY+5.4)/H);
    put(points, 31, (ankleX-38.4)/W, (ankleY+5.4)/H);
    put(points, 32, (ankleX-38.4+far)/W, (ankleY+5.4)/H);
    put(points, 11, shoulderX/W, shoulderY/H); put(points, 12, (shoulderX+far)/W, shoulderY/H);
    put(points, 13, elbowX/W, elbowY/H); put(points, 14, (elbowX+far)/W, elbowY/H);
    put(points, 15, wristX/W, wristY/H); put(points, 16, (wristX+far)/W, wristY/H);
    put(points, 0, headX/W, headY/H);
  } else {
    // Curl is now solved in actual 960x540 pixel space, matching the squat.
    // A 0.13 normalized horizontal drift is 124.8 px, not 0.13*540 px.
    const W = 960, H = 540;
    const shoulderX = 0.52 * W, shoulderY = 0.28 * H;
    const L_UPPER = 150.0, L_FOREARM = 128.0, L_TORSO = 145.8;
    const oppositeX = shoulderX - 36;
    const hipY = shoulderY + L_TORSO;
    const kneeY = 0.72 * H, ankleY = 0.88 * H;

    put(points, 11, shoulderX/W, shoulderY/H);
    put(points, 12, oppositeX/W, shoulderY/H);
    put(points, 0, (shoulderX-18)/W, (shoulderY-54)/H);
    put(points, 23, shoulderX/W, hipY/H); put(points, 24, oppositeX/W, hipY/H);
    put(points, 25, shoulderX/W, kneeY/H); put(points, 26, oppositeX/W, kneeY/H);
    put(points, 27, shoulderX/W, ankleY/H); put(points, 28, oppositeX/W, ankleY/H);
    put(points, 29, (shoulderX-20)/W, (ankleY+7)/H);
    put(points, 30, (oppositeX-20)/W, (ankleY+7)/H);
    // Resting opposite arm: fixed upper arm and forearm lengths.
    put(points, 14, oppositeX/W, (shoulderY + L_UPPER)/H);
    put(points, 16, oppositeX/W, (shoulderY + L_UPPER + L_FOREARM)/H);

    // Cheating curl: shoulder-to-elbow bone rotates as a rigid 150px link.
    // Neutral ~5.5° -> peak ~55°, elbow drifts ~123px, passing 0.11 threshold.
    // Curl angular ROM still controls shoulder-elbow-wrist articulation exactly.
    const upperTilt = (5.5 + 49.5 * curlSwing) * Math.PI / 180;
    const elbowX = shoulderX + L_UPPER * Math.sin(upperTilt);
    const elbowY = shoulderY + L_UPPER * Math.cos(upperTilt);
    const fromElbowToShoulder = Math.atan2(shoulderY - elbowY, shoulderX - elbowX);
    const forearmDirection = fromElbowToShoulder + angle;
    const wristX = elbowX + L_FOREARM * Math.cos(forearmDirection);
    const wristY = elbowY + L_FOREARM * Math.sin(forearmDirection);
    put(points, 13, elbowX/W, elbowY/H);
    put(points, 15, wristX/W, wristY/H);
  }
  return points;
}
