/** Clearly labelled synthetic coordinates for UI and algorithm testing; never described as AI inference. */
function blank() { return Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 })); }
function put(points, index, x, y) { points[index] = { x, y, visibility: 0.99 }; }

// C2-continuous joint actuation: zero velocity/acceleration at either end.
function smootherstep(x) {
  const u = Math.max(0, Math.min(1, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
}

// Fault is activated during approach, sustained through reversal and released
// after extension begins. No binary positional jump at t=.38/.65.
function faultEnvelope(t) {
  if (t <= 0.27 || t >= 0.76) return 0;
  if (t < 0.46) return smootherstep((t - 0.27) / 0.19);
  if (t <= 0.57) return 1;
  return 1 - smootherstep((t - 0.57) / 0.19);
}


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
      injectFault = activeFaultIndex === 0;
    } else if (exerciseId === 'curl') {
      // 0: arm_swing (elbow flare during curl)
      // 1: shallow_curl (depth handled by simulatedAngle)
      injectFault = activeFaultIndex === 0;
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
  const severity = injectFault ? faultEnvelope(t) : 0;

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

    // 3. Hip-driven torso hinge. The fault is a *rotation around the hip*;
    // projecting the entire shoulder separately would stretch the torso.
    // Standard depth: 20° shin versus 22° trunk (parallel tolerance 2°).
    // Fault peak: 60° forward trunk inclination, exceeding the 46° rule.
    const neutralTrunk = 3 + 19 * squatRatio;
    const torsoTiltRad = (neutralTrunk + 38 * severity) * Math.PI / 180;
    const shoulderX = hipX - L_torso * Math.sin(torsoTiltRad);
    const shoulderY = hipY - L_torso * Math.cos(torsoTiltRad);

    // 4. Forward reaching arms react to trunk pitch, with fixed segment lengths.
    // Keep the horizontal reach at depth but avoid wrist snapping on recovery.
    const armAngle = (25 + 65 * squatRatio + 3 * severity) * Math.PI / 180;
    const elbowX = shoulderX - L_arm * 0.5 * Math.sin(armAngle);
    const elbowY = shoulderY + L_arm * 0.5 * Math.cos(armAngle);
    const wristX = shoulderX - L_arm * Math.sin(armAngle);
    const wristY = shoulderY + L_arm * Math.cos(armAngle);

    // 5. Head: natural neck alignment
    const headX = shoulderX - 54 * Math.sin(torsoTiltRad);
    const headY = shoulderY - 54 * Math.cos(torsoTiltRad);

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
    // Curl is authored in isotropic units (one normalized unit = 540px).
    // draw.js then applies x'=0.5+(x-0.5)*540/960 for pixel-exact display.
    const shoulderX = 0.52, shoulderY = 0.28;
    const L_upper = 0.20, L_fore = 0.18;
    const L_torso = 0.27;

    // Realistic momentum compensation: slight posterior torso rocking while
    // shoulder and hip remain a single rigid segment (145.8px on display).
    // Torso tilt is modest; elbow swing is the diagnostic fault itself.
    const trunkRock = (6 * severity) * Math.PI / 180;
    const hipX = shoulderX + L_torso * Math.sin(trunkRock);
    const hipY = shoulderY + L_torso * Math.cos(trunkRock);
    put(points, 11, shoulderX, shoulderY);
    put(points, 12, shoulderX - 0.025, shoulderY);
    put(points, 0, shoulderX - 0.10 * Math.sin(trunkRock),
      shoulderY - 0.10 * Math.cos(trunkRock));

    put(points, 23, hipX, hipY);
    put(points, 24, hipX - 0.025, hipY);
    const kneeX = hipX + 0.005, kneeY = hipY + 0.17;
    put(points, 25, kneeX, kneeY); put(points, 26, kneeX - 0.025, kneeY);
    put(points, 27, kneeX, kneeY + 0.16); put(points, 28, kneeX - 0.025, kneeY + 0.16);
    put(points, 29, kneeX - 0.025, kneeY + 0.17);
    put(points, 30, kneeX - 0.045, kneeY + 0.17);

    // Inactive arm: preserve a fixed 0.17 + 0.16 length side chain.
    put(points, 14, shoulderX - 0.025, shoulderY + 0.17);
    put(points, 16, shoulderX - 0.025, shoulderY + 0.33);

    // Shoulder -> elbow stays at exactly 0.20 * 540 = 108px, even at
    // maximum momentum-driven anterior drift (0.145 normalized ≈ 78.3px).
    // This deliberately crosses the exercise.js strict >0.11 alarm threshold.
    const swingOffset = 0.025 + 0.12 * severity;
    const dy = Math.sqrt(L_upper * L_upper - swingOffset * swingOffset);
    const elbowX = shoulderX + swingOffset;
    const elbowY = shoulderY + dy;
    put(points, 13, elbowX, elbowY);

    // Exact elbow flexion by rotation of a constant-length forearm.
    // Angle is measured as shoulder-elbow-wrist (not horizontal orientation).
    const upperBackAngle = Math.atan2(shoulderY - elbowY, shoulderX - elbowX);
    const wristAngle = upperBackAngle + angle;
    put(points, 15,
      elbowX + L_fore * Math.cos(wristAngle),
      elbowY + L_fore * Math.sin(wristAngle));
  }
  return points;
}
