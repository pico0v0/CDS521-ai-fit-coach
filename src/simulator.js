/** Clearly labelled synthetic coordinates for UI and algorithm testing; never described as AI inference. */
function blank() { return Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 })); }
function put(points, index, x, y) { points[index] = { x, y, visibility: 0.99 }; }

export function simulatedAngle(elapsedMs, exerciseId, options = {}) {
  const period = 4700;
  const cycle = Math.floor(elapsedMs / period);
  const t = (elapsedMs % period) / period;
  // Asymmetric ease improves perceived momentum without moving any phase boundary
  // or changing standing/peak angles consumed by the counting state machine.
  const easing = (u, skew) => u * u * (3 - 2 * u) + skew * 4 * u * u * (1 - u) * (1 - u);

  const diff = options.difficulty || 'standard';
  let full;
  if (exerciseId === 'squat') {
    full = diff === 'advanced' ? 90 : (diff === 'beginner' ? 115 : 91);
  } else if (exerciseId === 'curl') {
    full = diff === 'advanced' ? 45 : (diff === 'beginner' ? 70 : 48);
  } else {
    // jumping_jack
    full = diff === 'advanced' ? 150 : (diff === 'beginner' ? 125 : 140);
  }
  const partial = exerciseId === 'squat' ? 128 : (exerciseId === 'jumping_jack' ? 85 : 108);

  let peak;
  if (options.mode === 'standard') {
    // Pure standard mode: every cycle reaches 100% full textbook target depth across all difficulties (MODE-02)
    peak = full;
  } else if (options.mode === 'fault') {
    // Fault mode: only squat & curl fault 1 are shallow reps; jumping jack faults keep full peak depth (MODE-01)
    const isShallow = options.faultId?.includes('shallow') || ((exerciseId === 'squat' || exerciseId === 'curl') && options.faultIndex === 1);
    peak = isShallow ? partial : full;
  } else {
    // Backward compatibility for existing unit tests & automated benchmarks
    peak = cycle % 4 === 2 ? partial : (exerciseId === 'curl' ? 52 : (exerciseId === 'jumping_jack' ? 138 : 91));
  }

  const standing = exerciseId === 'jumping_jack' ? 25 : 174;
  if (exerciseId === 'jumping_jack') {
    if (t < .18) return standing;
    if (t < .46) return standing + (peak - standing) * easing((t - .18) / .28, -0.28);
    if (t < .57) return peak;
    if (t < .86) return peak - (peak - standing) * easing((t - .57) / .29, 0.28);
    return standing;
  }

  if (t < .18) return standing;
  if (t < .46) return standing - (standing - peak) * easing((t-.18)/.28, -0.28);
  if (t < .57) return peak;
  if (t < .86) return peak + (standing-peak) * easing((t-.57)/.29, 0.28);
  return standing;
}

export function simulatePose(elapsedMs, exerciseId, options = {}) {
  const period = 4700;
  const cycle = Math.floor(elapsedMs / period);
  const t = (elapsedMs % period) / period;

  let injectFault = false;
  let activeFaultIndex = 0;

  if (options.mode === 'standard') {
    injectFault = false;
  } else if (options.mode === 'fault') {
    activeFaultIndex = options.faultIndex ?? 0;
    if (exerciseId === 'squat') {
      // 0: trunk_lean (injected at bottom)
      // 1: shallow_squat (depth handled by simulatedAngle)
      injectFault = activeFaultIndex === 0 && t >= 0.38 && t <= 0.65;
    } else if (exerciseId === 'curl') {
      // 0: arm_swing (elbow flare during curl)
      // 1: shallow_curl (depth handled by simulatedAngle)
      injectFault = activeFaultIndex === 0 && t >= 0.38 && t <= 0.65;
    } else if (exerciseId === 'jumping_jack') {
      // 0: asymmetry_or_desync (arms overhead, legs close early)
      // 1: arm_asymmetry (right arm restricted)
      // 2: static_legs (legs don't spread)
      injectFault = activeFaultIndex === 1 && t >= 0.38 && t <= 0.65;
    }
  } else {
    // Backward compatibility for existing unit tests & benchmarks
    injectFault = options.simulateFault && cycle % 4 === 1 && t >= 0.38 && t <= 0.65;
  }

  const points = blank();
  const angleDeg = simulatedAngle(elapsedMs, exerciseId, options);
  const angle = angleDeg * Math.PI / 180;

  if (exerciseId === 'jumping_jack') {
    const leftTheta = angle;
    const rightAngleDeg = injectFault ? angleDeg * 0.45 : angleDeg;
    const rightTheta = rightAngleDeg * Math.PI / 180;

    const shoulderY = 0.32;
    const leftShoulderX = 0.44;
    const rightShoulderX = 0.56;
    put(points, 11, leftShoulderX, shoulderY);
    put(points, 12, rightShoulderX, shoulderY);

    const hipY = 0.58;
    const leftHipX = 0.44;
    const rightHipX = 0.56;
    put(points, 23, leftHipX, hipY);
    put(points, 24, rightHipX, hipY);

    const armLen = 0.24;
    const elbowLen = 0.12;

    put(points, 13, leftShoulderX - elbowLen * Math.sin(leftTheta), shoulderY + elbowLen * Math.cos(leftTheta));
    put(points, 15, leftShoulderX - armLen * Math.sin(leftTheta), shoulderY + armLen * Math.cos(leftTheta));

    put(points, 14, rightShoulderX + elbowLen * Math.sin(rightTheta), shoulderY + elbowLen * Math.cos(rightTheta));
    put(points, 16, rightShoulderX + armLen * Math.sin(rightTheta), shoulderY + armLen * Math.cos(rightTheta));

    let legSpread = Math.max(0, (angleDeg - 25) / 113) * 0.10;
    if (options.mode === 'fault') {
      if (activeFaultIndex === 0) {
        // Desync: arms are overhead (t in 0.40..0.65), but legs close early to simulate desynchronization
        if (t >= 0.42 && t <= 0.62) legSpread = 0.01;
      } else if (activeFaultIndex === 2) {
        // Static legs: feet stay completely still
        legSpread = 0;
      }
    }
    const kneeY = 0.76;
    const ankleY = 0.92;
    put(points, 25, leftHipX - legSpread * 0.5, kneeY);
    put(points, 26, rightHipX + legSpread * 0.5, kneeY);
    put(points, 27, leftHipX - legSpread, ankleY);
    put(points, 28, rightHipX + legSpread, ankleY);
    put(points, 29, leftHipX - legSpread - 0.02, ankleY + 0.01);
    put(points, 30, rightHipX + legSpread + 0.02, ankleY + 0.01);
    put(points, 0, (leftShoulderX + rightShoulderX) / 2, shoulderY - 0.12);
  } else if (exerciseId === 'squat') {
    const angleDeg = simulatedAngle(elapsedMs, exerciseId, options);
    const squatRatio = Math.max(0, Math.min(1, (174 - angleDeg) / (174 - 91)));
    const W = 960, H = 540;
    const L_shin = 118.8, L_thigh = 113.4, L_torso = 124.2, L_arm = 91.8;
    const ankleX = 0.52 * W, ankleY = 0.86 * H;

    // 1. Shin in pixels: 3° standing -> 20° at full squat depth (constant 118.80px Euclidean length)
    const shinTiltRad = (3 + 17 * squatRatio) * Math.PI / 180;
    const kneeX = ankleX - L_shin * Math.sin(shinTiltRad);
    const kneeY = ankleY - L_shin * Math.cos(shinTiltRad);

    // 2. Thigh folds backward: exact angleDeg knee joint angle in pixel space (constant 113.40px Euclidean length)
    const phi_KA = Math.atan2(ankleY - kneeY, ankleX - kneeX);
    const phi_KH = phi_KA - angleDeg * Math.PI / 180;
    const hipX = kneeX + L_thigh * Math.cos(phi_KH);
    const hipY = kneeY + L_thigh * Math.sin(phi_KH);

    // 3. Torso: double-parallel line law in pixel space (constant 124.20px Euclidean length)
    // Standard form: 3° standing -> 22° at full squat depth (diff = 2.00° <= 3.00° parallel)
    // On trunk lean fault: 52° forward tilt (> 46° fault threshold)
    const torsoTiltRad = (injectFault ? 52 : (3 + 19 * squatRatio)) * Math.PI / 180;
    const shoulderX = hipX - L_torso * Math.sin(torsoTiltRad);
    const shoulderY = hipY - L_torso * Math.cos(torsoTiltRad);

    // 4. Arms: raise forward horizontally to counterbalance (constant 91.80px Euclidean length)
    const armAngle = (25 + 65 * squatRatio) * Math.PI / 180;
    const elbowX = shoulderX - L_arm * 0.5 * Math.sin(armAngle);
    const elbowY = shoulderY + L_arm * 0.5 * Math.cos(armAngle);
    const wristX = shoulderX - L_arm * Math.sin(armAngle);
    const wristY = shoulderY + L_arm * Math.cos(armAngle);

    // 5. Head: natural neck alignment
    const headX = shoulderX - 40 * Math.sin(torsoTiltRad);
    const headY = shoulderY - 40 * Math.cos(torsoTiltRad) - 20;

    put(points, 23, hipX / W, hipY / H); put(points, 24, (hipX + 19.2) / W, hipY / H);
    put(points, 25, kneeX / W, kneeY / H); put(points, 26, (kneeX + 19.2) / W, kneeY / H);
    put(points, 27, ankleX / W, ankleY / H); put(points, 28, (ankleX + 19.2) / W, ankleY / H);
    put(points, 29, (ankleX + 24) / W, (ankleY + 5.4) / H); put(points, 30, (ankleX + 43.2) / W, (ankleY + 5.4) / H);
    put(points, 31, (ankleX - 38.4) / W, (ankleY + 5.4) / H); put(points, 32, (ankleX - 19.2) / W, (ankleY + 5.4) / H);
    put(points, 11, shoulderX / W, shoulderY / H); put(points, 12, (shoulderX + 19.2) / W, shoulderY / H);
    put(points, 13, elbowX / W, elbowY / H); put(points, 14, (elbowX + 19.2) / W, elbowY / H);
    put(points, 15, wristX / W, wristY / H); put(points, 16, (wristX + 19.2) / W, wristY / H);
    put(points, 0, headX / W, headY / H);
  } else {
    const angleDeg = simulatedAngle(elapsedMs, exerciseId, options);
    const shoulderX = 0.52, shoulderY = 0.28;
    const L_upper = 0.20, L_fore = 0.18;

    // 1. Torso & lower body: upright, stable, anatomically grounded
    put(points, 11, shoulderX, shoulderY);
    put(points, 12, shoulderX - 0.025, shoulderY);
    put(points, 0, shoulderX, shoulderY - 0.10);

    put(points, 23, shoulderX, 0.55); put(points, 24, shoulderX - 0.025, 0.55);
    put(points, 25, shoulderX, 0.72); put(points, 26, shoulderX - 0.025, 0.72);
    put(points, 27, shoulderX, 0.88); put(points, 28, shoulderX - 0.025, 0.88);
    put(points, 29, shoulderX - 0.025, 0.89); put(points, 30, shoulderX - 0.045, 0.89);

    // Non-active arm hangs naturally by side
    put(points, 14, shoulderX - 0.025, shoulderY + 0.17);
    put(points, 16, shoulderX - 0.025, shoulderY + 0.33);

    // 2. Upper arm: pinned close to torso (drift = 0.03 <= 0.11); swings forward on fault (drift = 0.13 > 0.11)
    const swingOffset = injectFault ? 0.13 : 0.03;
    const elbowX = shoulderX + swingOffset;
    // Curl joints use one isotropic coordinate system; demo rendering uses the
    // same scale on both axes, so even the injected swing keeps a rigid upper arm.
    const dy = Math.sqrt(L_upper * L_upper - swingOffset * swingOffset);
    const elbowY = shoulderY + dy;
    put(points, 13, elbowX, elbowY);

    // 3. Forearm: rigid rotation about the elbow, preserving the analyzer angle
    const vES_x = shoulderX - elbowX;
    const vES_y = shoulderY - elbowY;
    const normAlpha = Math.atan2(vES_y, vES_x);
    const targetWristAngle = normAlpha + angleDeg * Math.PI / 180;
    const wristX = elbowX + L_fore * Math.cos(targetWristAngle);
    const wristY = elbowY + L_fore * Math.sin(targetWristAngle);
    put(points, 15, wristX, wristY);
  }
  return points;
}
