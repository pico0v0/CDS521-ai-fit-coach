/** Clearly labelled synthetic coordinates for UI and algorithm testing; never described as AI inference. */
function blank() { return Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 })); }
function put(points, index, x, y) { points[index] = { x, y, visibility: 0.99 }; }

export function simulatedAngle(elapsedMs, exerciseId) {
  const period = 4700;
  const cycle = Math.floor(elapsedMs / period);
  const t = (elapsedMs % period) / period;
  const full = exerciseId === 'squat' ? 91 : 52;
  const partial = exerciseId === 'squat' ? 128 : 108;
  const floor = cycle % 4 === 2 ? partial : full;
  const standing = 174;
  const easing = u => u * u * (3 - 2 * u);
  if (t < .18) return standing;
  if (t < .46) return standing - (standing - floor) * easing((t-.18)/.28);
  if (t < .57) return floor;
  if (t < .86) return floor + (standing-floor) * easing((t-.57)/.29);
  return standing;
}

export function simulatePose(elapsedMs, exerciseId) {
  const points = blank();
  const angle = simulatedAngle(elapsedMs, exerciseId) * Math.PI / 180;
  if (exerciseId === 'squat') {
    const kneeX = .6, kneeY = .66;
    const hipX = kneeX - .18*Math.sin(angle), hipY = kneeY + .18*Math.cos(angle);
    put(points,23,hipX,hipY); put(points,24,hipX+.025,hipY);
    put(points,25,kneeX,kneeY); put(points,26,kneeX+.026,kneeY);
    put(points,27,kneeX,.89); put(points,28,kneeX+.025,.89);
    put(points,29,kneeX-.025,.90);put(points,30,kneeX+.007,.90);
    put(points,11,hipX-.045,hipY-.25); put(points,12,hipX-.022,hipY-.25);
    put(points,13,hipX-.035,hipY-.13); put(points,14,hipX-.007,hipY-.13);
    put(points,15,hipX+.01,hipY-.05); put(points,16,hipX+.035,hipY-.05);
  } else {
    const elbowX=.57,elbowY=.51;
    put(points,11,.54,.30);put(points,12,.51,.31);
    put(points,13,elbowX,elbowY);put(points,14,.48,.53);
    put(points,15,elbowX+.20*Math.sin(angle),elbowY-.20*Math.cos(angle));
    put(points,16,.48,.74);
    put(points,23,.53,.62);put(points,24,.49,.62);
    put(points,25,.53,.79);put(points,26,.49,.79);
    put(points,27,.53,.93);put(points,28,.49,.93);
    put(points,29,.52,.94);put(points,30,.48,.94);
  }
  return points;
}
