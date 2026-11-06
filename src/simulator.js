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
  if (options.mode !== 'fault') return options.simulateFault && cycle % 4 === 1 ? 0 : null;
  const known = {
    squat: { trunk_lean: 0, shallow_squat: 1 },
    curl: { arm_swing: 0, shallow_curl: 1 },
    jumping_jack: { asymmetry_or_desync: 0, arm_asymmetry: 1, static_legs: 2 },
  };
  return options.faultIndex ?? known[exerciseId]?.[options.faultId] ?? 0;
}

export function simulatePose(elapsedMs, exerciseId, options = {}) {
  const period = 4700;
  const cycle = Math.floor(elapsedMs / period);
  const t = (elapsedMs % period) / period;

  const activeFaultIndex = activeFault(exerciseId, options, cycle);
  // Continuous, repeatable compensation envelope. Peaks at t=0.48..0.55;
  // no step jumps at 0.38 or 0.65. Kept separate from knee/elbow ROM.
  const squatLean = activeFaultIndex === 0 && exerciseId === 'squat'
    ? faultEnvelope(t, 0.29, 0.46, 0.56, 0.73) : 0;
  const curlSwing = activeFaultIndex === 0 && exerciseId === 'curl'
    ? faultEnvelope(t, 0.30, 0.48, 0.54, 0.72) : 0;
  // Unedited jumping-jack fault semantics.
  const injectFault = activeFaultIndex !== null && t >= 0.38 && t <= 0.65;

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
