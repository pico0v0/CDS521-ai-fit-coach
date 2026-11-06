/** Clearly labelled synthetic coordinates for UI and algorithm testing; never described as AI inference. */
function blank() { return Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 })); }
function put(points, index, x, y) { points[index] = { x, y, visibility: 0.99 }; }

export function simulatedAngle(elapsedMs, exerciseId) {
  const period = 4700;
  const cycle = Math.floor(elapsedMs / period);
  const t = (elapsedMs % period) / period;
  // Asymmetric ease improves perceived momentum without moving any phase boundary
  // or changing standing/peak angles consumed by the counting state machine.
  const easing = (u, skew) => u * u * (3 - 2 * u) + skew * 4 * u * u * (1 - u) * (1 - u);

  if (exerciseId === 'jumping_jack') {
    const full = 138;
    const partial = 85;
    const peak = cycle % 4 === 2 ? partial : full;
    const standing = 25;
    if (t < .18) return standing;
    if (t < .46) return standing + (peak - standing) * easing((t - .18) / .28, -0.28);
    if (t < .57) return peak;
    if (t < .86) return peak - (peak - standing) * easing((t - .57) / .29, 0.28);
    return standing;
  }

  const full = exerciseId === 'squat' ? 91 : 52;
  const partial = exerciseId === 'squat' ? 128 : 108;
  const floor = cycle % 4 === 2 ? partial : full;
  const standing = 174;
  if (t < .18) return standing;
  if (t < .46) return standing - (standing - floor) * easing((t-.18)/.28, -0.28);
  if (t < .57) return floor;
  if (t < .86) return floor + (standing-floor) * easing((t-.57)/.29, 0.28);
  return standing;
}

export function simulatePose(elapsedMs, exerciseId, options = {}) {
  const period = 4700;
  const cycle = Math.floor(elapsedMs / period);
  const t = (elapsedMs % period) / period;
  const injectFault = options.simulateFault && cycle % 4 === 1 && t >= 0.38 && t <= 0.65;

  const points = blank();
  const angle = simulatedAngle(elapsedMs, exerciseId) * Math.PI / 180;

  if (exerciseId === 'jumping_jack') {
    const angleDeg = simulatedAngle(elapsedMs, exerciseId);
    const leftTheta = angleDeg * Math.PI / 180;
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

    const legSpread = Math.max(0, (angleDeg - 25) / 113) * 0.10;
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
    const angleDeg = simulatedAngle(elapsedMs, exerciseId);
    const squatRatio = Math.max(0, Math.min(1, (174 - angleDeg) / (174 - 91)));
    const R = 960 / 540; // 16:9 canvas aspect ratio for rigid, distortion-free pixel proportions
    const L_shin = 0.22, L_thigh = 0.21, L_torso = 0.23, L_arm = 0.17;
    const ankleX = 0.52, ankleY = 0.86;

    // 1. Shin moves forward-up from ankle (dorsiflexion, constant 119px pixel length)
    const shinTiltRad = (3 + 16 * squatRatio) * Math.PI / 180;
    const kneeX = ankleX - (L_shin * Math.sin(shinTiltRad)) / R;
    const kneeY = ankleY - L_shin * Math.cos(shinTiltRad);

    // 2. Thigh folds backward with aspect-ratio compensation (constant 113px pixel length, exact angleDeg)
    const vKA_x = ankleX - kneeX;
    const vKA_y = ankleY - kneeY;
    const normAlpha = Math.atan2(vKA_y, vKA_x);
    const targetHipAngle = normAlpha - angleDeg * Math.PI / 180;
    const c_h = Math.cos(targetHipAngle);
    const s_h = Math.sin(targetHipAngle);
    const denom_h = Math.hypot(c_h * R, s_h);
    const hipX = kneeX + (L_thigh * c_h) / denom_h;
    const hipY = kneeY + (L_thigh * s_h) / denom_h;

    put(points, 23, hipX, hipY); put(points, 24, hipX + .020, hipY);
    put(points, 25, kneeX, kneeY); put(points, 26, kneeX + .020, kneeY);
    put(points, 27, ankleX, ankleY); put(points, 28, ankleX + .020, ankleY);
    put(points, 29, ankleX + .025, ankleY + .01); put(points, 30, ankleX + .045, ankleY + .01); // heels back
    put(points, 31, ankleX - .040, ankleY + .01); put(points, 32, ankleX - .020, ankleY + .01); // toes forward

    // 3. Torso: parallel to shin (constant 124px pixel length, never elongates or collapses)
    const normTorsoAngle = (injectFault ? 52 : (5 + 17 * squatRatio)) * Math.PI / 180;
    const s_t = Math.sin(normTorsoAngle);
    const c_t = Math.cos(normTorsoAngle);
    const denom_t = Math.hypot(s_t * R, c_t);
    const shoulderX = hipX - (L_torso * s_t) / denom_t;
    const shoulderY = hipY - (L_torso * c_t) / denom_t;
    put(points, 11, shoulderX, shoulderY); put(points, 12, shoulderX + .020, shoulderY);

    // 4. Arms: raise forward smoothly to horizontal counterbalance (constant 92px pixel length)
    const armAngle = (25 + 65 * squatRatio) * Math.PI / 180;
    const s_a = Math.sin(armAngle);
    const c_a = Math.cos(armAngle);
    const denom_a = Math.hypot(s_a * R, c_a);
    const elbowX = shoulderX - (L_arm * 0.5 * s_a) / denom_a;
    const elbowY = shoulderY + (L_arm * 0.5 * c_a) / denom_a;
    const wristX = shoulderX - (L_arm * s_a) / denom_a;
    const wristY = shoulderY + (L_arm * c_a) / denom_a;
    put(points, 13, elbowX, elbowY); put(points, 14, elbowX + .020, elbowY);
    put(points, 15, wristX, wristY); put(points, 16, wristX + .020, wristY);

    // 5. Head: natural neck length, aligned on spine
    const headX = shoulderX - (0.04 * s_t) / R;
    const headY = shoulderY - (0.07 * c_t) - 0.02;
    put(points, 0, headX, headY);
  } else {
    const angleDeg = simulatedAngle(elapsedMs, exerciseId);
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
