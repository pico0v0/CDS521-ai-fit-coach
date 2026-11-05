/** Clearly labelled synthetic coordinates for UI and algorithm testing; never described as AI inference. */
function blank() { return Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 })); }
function put(points, index, x, y) { points[index] = { x, y, visibility: 0.99 }; }

export function simulatedAngle(elapsedMs, exerciseId) {
  const period = 4700;
  const cycle = Math.floor(elapsedMs / period);
  const t = (elapsedMs % period) / period;
  const easing = u => u * u * (3 - 2 * u);

  if (exerciseId === 'jumping_jack') {
    const full = 138;
    const partial = 85;
    const peak = cycle % 4 === 2 ? partial : full;
    const standing = 25;
    if (t < .18) return standing;
    if (t < .46) return standing + (peak - standing) * easing((t - .18) / .28);
    if (t < .57) return peak;
    if (t < .86) return peak - (peak - standing) * easing((t - .57) / .29);
    return standing;
  }

  const full = exerciseId === 'squat' ? 91 : 52;
  const partial = exerciseId === 'squat' ? 128 : 108;
  const floor = cycle % 4 === 2 ? partial : full;
  const standing = 174;
  if (t < .18) return standing;
  if (t < .46) return standing - (standing - floor) * easing((t-.18)/.28);
  if (t < .57) return floor;
  if (t < .86) return floor + (standing-floor) * easing((t-.57)/.29);
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
    const ankleX = .54, ankleY = .88;
    const shinLen = .24, thighLen = .23, torsoLen = .26;

    // 1. Shin moves forward-up from ankle (dorsiflexion, 3° upright -> 21° at bottom)
    const shinTiltRad = (3 + 18 * squatRatio) * Math.PI / 180;
    const kneeX = ankleX - shinLen * Math.sin(shinTiltRad);
    const kneeY = ankleY - shinLen * Math.cos(shinTiltRad);

    // 2. Thigh folds backward from knee to maintain exact biomechanical angleDeg
    const vKA_x = ankleX - kneeX;
    const vKA_y = ankleY - kneeY;
    const alpha = Math.atan2(vKA_y, vKA_x);
    const hipAngle = alpha - angleDeg * Math.PI / 180;
    const hipX = kneeX + thighLen * Math.cos(hipAngle);
    const hipY = kneeY + thighLen * Math.sin(hipAngle);

    put(points, 23, hipX, hipY); put(points, 24, hipX + .025, hipY);
    put(points, 25, kneeX, kneeY); put(points, 26, kneeX + .025, kneeY);
    put(points, 27, ankleX, ankleY); put(points, 28, ankleX + .025, ankleY);
    put(points, 29, ankleX + .035, ankleY + .01); put(points, 30, ankleX + .060, ankleY + .01); // heels back
    put(points, 31, ankleX - .050, ankleY + .01); put(points, 32, ankleX - .025, ankleY + .01); // toes forward

    // 3. Torso: parallel to shin (biomechanical dual-parallel standard), plus fault lean
    const faultLean = injectFault ? 0.16 : 0;
    const torsoTiltRad = (3 + 20 * squatRatio) * Math.PI / 180;
    const shoulderX = hipX - torsoLen * Math.sin(torsoTiltRad) - faultLean;
    const shoulderY = hipY - torsoLen * Math.cos(torsoTiltRad) + (injectFault ? 0.04 : 0);
    put(points, 11, shoulderX, shoulderY); put(points, 12, shoulderX + .025, shoulderY);

    // 4. Arms: extended forward horizontally to counterbalance hips
    const armRise = squatRatio;
    const elbowX = shoulderX - 0.02 - 0.10 * armRise;
    const elbowY = shoulderY + 0.12 - 0.10 * armRise;
    const wristX = shoulderX - 0.03 - 0.21 * armRise;
    const wristY = shoulderY + 0.23 - 0.21 * armRise;
    put(points, 13, elbowX, elbowY); put(points, 14, elbowX + .025, elbowY);
    put(points, 15, wristX, wristY); put(points, 16, wristX + .025, wristY);

    // 5. Head: naturally aligned with spine looking forward-down
    const headX = shoulderX - 0.05 - 0.02 * squatRatio - (injectFault ? 0.05 : 0);
    const headY = shoulderY - 0.09;
    put(points, 0, headX, headY);
  } else {
    const elbowX = .57, elbowY = .51;
    // When fault is injected, shift shoulder backward relative to elbow
    const shoulderX = injectFault ? 0.42 : 0.54;
    put(points,11,shoulderX,.30);put(points,12,shoulderX-.03,.31);
    put(points,13,elbowX,elbowY);put(points,14,.48,.53);
    put(points,15,elbowX+.20*Math.sin(angle),elbowY-.20*Math.cos(angle));
    put(points,16,.48,.74);
    put(points,23,.53,.62);put(points,24,.49,.62);
    put(points,25,.53,.79);put(points,26,.49,.79);
    put(points,27,.53,.93);put(points,28,.49,.93);
    put(points,29,.52,.94);put(points,30,.48,.94);
    put(points,0,shoulderX-.01,.18);
  }
  return points;
}
