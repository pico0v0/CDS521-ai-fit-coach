/** Transparent pose overlay; synthetic landmarks remain untouched by rendering. */
const EDGES = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[24,26],[26,28],[28,30],
];
const TAU = Math.PI * 2;
const MAX_PIXEL_SCALE = 3;
const MAX_CANVAS_PIXELS = 2500000;
const BREATH_SPEED = 0.0022;
const BREATH_LIFT = 0.0054;
const HEAD_DRIFT = 0.0025;
const CURL_SWING_THRESHOLD = 0.11;
const GROUND_RADIUS = 173;
const GROUND_PULSE_RADIUS = 12;
const GROUND_THICKNESS = 12;
const GROUND_PULSE_THICKNESS = 3;
const GROUND_ALPHA = 0.12;
const GROUND_PULSE_ALPHA = 0.11;
const BASE_COLOR = 'rgba(148, 224, 205, 0.57)';
const CORE_COLOR = 'rgba(216, 255, 224, 0.84)';
const ACCENT_COLOR = '#fef08a';
let layoutCanvas = null;
let layoutWidth = 0;
let layoutObserver = null;
let resizeListenerSet = false;

function canvasDisplayWidth(canvas, width) {
  if (layoutCanvas !== canvas) {
    layoutObserver?.disconnect();
    layoutCanvas = canvas;
    layoutWidth = canvas.clientWidth || width;
    if (typeof ResizeObserver !== 'undefined') {
      layoutObserver = new ResizeObserver(entries => {
        if (layoutCanvas === canvas) layoutWidth = entries[0]?.contentRect?.width || width;
      });
      layoutObserver.observe(canvas);
    } else if (typeof window !== 'undefined' && !resizeListenerSet) {
      window.addEventListener('resize', () => { layoutWidth = 0; }, { passive: true });
      resizeListenerSet = true;
    }
  }
  if (!layoutWidth) layoutWidth = canvas.clientWidth || width;
  return layoutWidth;
}

function prepareCanvas(canvas, width, height) {
  const dpr = typeof window === 'undefined' ? 1 : (window.devicePixelRatio || 1);
  const displayScale = Math.max(1, canvasDisplayWidth(canvas, width) / width);
  const pixelLimit = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
  const scale = Math.min(MAX_PIXEL_SCALE, Math.max(1, dpr * displayScale), pixelLimit);
  const pixelWidth = Math.max(1, Math.floor(width * scale));
  const pixelHeight = Math.max(1, Math.floor(height * scale));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return ctx;
}

function segment(ctx, x1, y1, x2, y2, color, lineWidth) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}


// Demo-only projection. It never changes the landmarks sent to the analyzer.
// The side-view samples overlap by design; separating their far limbs makes
// the synthetic figure readable while retaining the tracked joint geometry.
function displayPose(landmarks, exercise) {
  const pose = landmarks.map(p => p ? { ...p } : p);
  const has = i => pose[i] && (pose[i].visibility ?? 1) >= 0.35;
  const move = (i, x, y) => {
    if (has(i) && Number.isFinite(x) && Number.isFinite(y)) {
      pose[i].x = x;
      pose[i].y = y;
    }
  };
  if (exercise === 'curl') {
    // All far-side landmarks are moved by one rigid 2D translation only.
    // The near-side measured shoulder/elbow/wrist are NEVER altered.
    for (const i of [12, 14, 16, 24, 26, 28, 30]) {
      if (has(i)) move(i, pose[i].x - 0.055, pose[i].y);
    }
  } else if (exercise === 'squat' || exercise === 'lunge') {
    // Spread the far-side silhouette without changing either side's lengths.
    // Old independent offsets altered the shin and upper-arm pixel lengths.
    for (const i of [12, 14, 16, 24, 26, 28, 30, 32]) {
      if (has(i)) move(i, pose[i].x + 0.028, pose[i].y);
    }
  } else if (exercise === 'pushup') {
    for (const i of [12, 14, 16, 24, 26, 28, 30, 32]) {
      if (has(i)) move(i, pose[i].x - 0.035, pose[i].y);
    }
  }
  return pose;
}

function drawDemoSkeleton(ctx, landmarks, exercise, options) {
  const { width, height, highlightJoints, angle, depthProgress, time, label, backingScale } = options;
  const pts = displayPose(landmarks, exercise);
  const visible = p => p && (p.visibility ?? 1) >= 0.35 && Number.isFinite(p.x) && Number.isFinite(p.y);
  const xy = i => [pts[i].x * width, pts[i].y * height];
  const active = new Set(highlightJoints || []);
  const pulse = 0.5 + 0.5 * Math.sin(time * 0.004);
  const scale = width / 960;
  const has = i => visible(pts[i]);
  const injectedCurlSwing = exercise === 'curl' && visible(landmarks[11]) && visible(landmarks[13]) &&
    Math.abs(landmarks[13].x - landmarks[11].x) > CURL_SWING_THRESHOLD;
  const glowScale = Math.max(1, Math.min(MAX_PIXEL_SCALE, backingScale));

  // The floor gives the skeleton a grounded, full-body visual reference.
  // A jumping-jack athlete lifts off the floor. The floor/shadow must stay
  // fixed as the body moves; following the ankles made the demo look as if
  // the platform jumped with the figure.
  const footY = exercise === 'jumping_jack'
    ? height * (512 / 540)
    : (exercise === 'pushup'
      ? height * (475 / 540)
      : Math.max(...[27,28].filter(has).map(i => pts[i].y * height), height * 0.87) + 13);
  ctx.save();
  const groundPulse = 0.5 + 0.5 * Math.sin(time * BREATH_SPEED);
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(106, 213, 201, ${GROUND_ALPHA + groundPulse * GROUND_PULSE_ALPHA})`;
  ctx.beginPath(); ctx.ellipse(width * .5, footY, GROUND_RADIUS + GROUND_PULSE_RADIUS * groundPulse, GROUND_THICKNESS + GROUND_PULSE_THICKNESS * groundPulse, 0, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(width * .19, footY); ctx.lineTo(width * .81, footY);
  ctx.strokeStyle = 'rgba(106, 213, 201, 0.10)'; ctx.stroke();
  ctx.restore();

  // An understated torso form reads as a body rather than two parallel lines.
  if ([11,12,23,24].every(has)) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(...xy(11)); ctx.lineTo(...xy(12));
    ctx.lineTo(...xy(24)); ctx.lineTo(...xy(23)); ctx.closePath();
    const torsoGradient = ctx.createLinearGradient(...xy(12), ...xy(11));
    torsoGradient.addColorStop(0, 'rgba(69, 157, 161, 0.07)');
    torsoGradient.addColorStop(1, 'rgba(94, 219, 194, 0.22)');
    ctx.fillStyle = torsoGradient; ctx.fill();
    ctx.lineWidth = 1.2 * scale;
    ctx.strokeStyle = 'rgba(122, 242, 221, 0.25)'; ctx.stroke();
    ctx.restore();
  }

  const drawBone = (a, b) => {
    if (!has(a) || !has(b)) return;
    const [x1,y1] = xy(a), [x2,y2] = xy(b);
    const hot = active.has(a) && active.has(b);
    const far = [12,14,16,24,26,28,30,32].includes(a) && [12,14,16,24,26,28,30,32].includes(b);
    ctx.save();
    if (hot) {
      ctx.shadowColor = 'rgba(255, 198, 96, 0.37)';
      ctx.shadowBlur = (5 + 3 * pulse) * scale * glowScale;
      segment(ctx,x1,y1,x2,y2,'rgba(242, 174, 82, 0.22)', 10*scale);
      ctx.shadowBlur = 0;
      segment(ctx,x1,y1,x2,y2,'#f6c476',5*scale);
      segment(ctx,x1,y1,x2,y2,'#fff2c4',2*scale);
    } else {
      segment(ctx,x1,y1,x2,y2,far ? 'rgba(60, 155, 166, 0.16)' : 'rgba(67, 191, 178, 0.20)',(far ? 7 : 9)*scale);
      segment(ctx,x1,y1,x2,y2,far ? 'rgba(121, 198, 193, 0.53)' : 'rgba(175, 241, 220, 0.78)',(far ? 2.2 : 3.1)*scale);
    }
    ctx.restore();
  };

  // Draw distant anatomy first. Near-side limbs and their key joints remain legible.
  const farEdges = [[12,14],[14,16],[12,24],[24,26],[26,28],[28,30]];
  const nearEdges = [[11,12],[23,24],[11,23],[11,13],[13,15],[23,25],[25,27],[27,29]];
  for (const [a,b] of farEdges) drawBone(a,b);
  for (const [a,b] of nearEdges) drawBone(a,b);
  if (has(31)) drawBone(27,31);
  if (has(32)) drawBone(28,32);

  const head = pts[0];
  if (visible(head) && has(11) && has(12)) {
    const mx = (pts[11].x + pts[12].x) * width / 2;
    const my = (pts[11].y + pts[12].y) * height / 2;
    const hx = head.x * width, hy = head.y * height;
    segment(ctx,mx,my,hx,hy,'rgba(165, 226, 208, 0.62)',2.8*scale);
    ctx.save(); ctx.beginPath(); ctx.ellipse(hx,hy,15*scale,19*scale,0,0,TAU);
    ctx.fillStyle = 'rgba(91, 184, 172, 0.14)'; ctx.fill();
    ctx.strokeStyle = 'rgba(190, 249, 222, 0.85)'; ctx.lineWidth = 2.4*scale; ctx.stroke();
    ctx.restore();
  }

  for (const i of [11,12,13,14,15,16,23,24,25,26,27,28,29,30,31,32]) {
    if (!has(i)) continue;
    const [x,y] = xy(i);
    const hot = active.has(i);
    ctx.beginPath(); ctx.arc(x,y,(hot ? 5.1 : 3.4)*scale,0,TAU);
    ctx.fillStyle = hot ? '#ffe2a1' : '#c9f7e1'; ctx.fill();
    if (hot) {
      ctx.beginPath(); ctx.arc(x,y,(8.5 + 1.3*pulse)*scale,0,TAU);
      ctx.strokeStyle = 'rgba(255, 218, 155, 0.36)'; ctx.lineWidth = 1.2*scale; ctx.stroke();
    }
  }

  const apexId = highlightJoints?.length === 3 ? highlightJoints[1] :
    active.has(25) ? 25 : active.has(26) ? 26 : active.has(13) ? 13 : active.has(14) ? 14 : null;
  if (apexId !== null && has(apexId) && angle !== null && Number.isFinite(angle)) {
    const chain = highlightJoints?.length === 3 ? highlightJoints : null;
    const progressCol = depthProgress >= 100 ? '#8cf1bf' : '#f8d28d';
    if (chain?.every(has)) {
      const [ax,ay] = xy(chain[0]), [bx,by] = xy(chain[1]), [cx,cy] = xy(chain[2]);
      const a0 = Math.atan2(ay-by, ax-bx), a1 = Math.atan2(cy-by,cx-bx);
      const delta = Math.atan2(Math.sin(a1-a0),Math.cos(a1-a0));
      ctx.save();
      ctx.beginPath();ctx.arc(bx,by,24*scale,a0,a0+delta,delta < 0);
      ctx.strokeStyle = 'rgba(248, 210, 141, 0.75)';ctx.lineWidth = 1.8*scale;ctx.stroke();
      ctx.restore();
    }
    const [ax, ay] = xy(apexId);
    const tagX = Math.min(width - 79, Math.max(20, ax + 32 * scale));
    const tagY = Math.min(height - 40, Math.max(36, ay - 18 * scale));
    ctx.save(); ctx.fillStyle = 'rgba(10, 30, 39, 0.94)';
    ctx.strokeStyle = 'rgba(135, 217, 189, 0.5)'; ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(tagX,tagY,65,28,7);
    else ctx.rect(tagX,tagY,65,28);
    ctx.fill();ctx.stroke();
    ctx.font = '700 16px system-ui, sans-serif';ctx.fillStyle = progressCol;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(angle)}°`,tagX+32.5,tagY+14);
    ctx.restore();
  }

  // Mandatory synthetic disclaimer is legible, away from the stage title.
  ctx.save();
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(173, 218, 211, 0.92)';
  ctx.textBaseline = 'top';
  if (label) ctx.fillText(label,26,70);
  if (injectedCurlSwing) {
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillStyle = '#ffd38b';
    ctx.fillText('故意模拟错误动作 · 大臂借力', 26, 94);
  }
  ctx.restore();
}

export function drawPose(canvas, landmarks, options = {}) {
  if (!canvas) return;
  const { width = 960, height = 540, active = true, label = '', highlightJoints = null, angle = null, depthProgress = 0, time = 0, demoExercise = null } = options;
  const ctx = prepareCanvas(canvas, width, height);
  if (!ctx || !landmarks?.length) return;
  if (demoExercise) {
    drawDemoSkeleton(ctx, landmarks, demoExercise, { width, height, highlightJoints, angle, depthProgress, time, label, backingScale: canvas.width / width });
    return;
  }
  const highlightSet = new Set(highlightJoints || []);
  const unit = Math.max(0.8, width / 960);
  const pulse = 0.5 + 0.5 * Math.sin(time * 0.0045);
  const visible = p => p && (p.visibility ?? 1) >= 0.35 && Number.isFinite(p.x) && Number.isFinite(p.y);

  // Head / neck use the same lighting as the body, with a softer silhouette.
  const head = landmarks[0], p11 = landmarks[11], p12 = landmarks[12];
  if (visible(p11) && visible(p12)) {
    const nx = (p11.x + p12.x) * width / 2;
    const ny = (p11.y + p12.y) * height / 2;
    const hx = visible(head) && (head.x !== 0 || head.y !== 0) ? head.x * width : nx;
    const hy = visible(head) && (head.x !== 0 || head.y !== 0) ? head.y * height : ny - Math.max(30, height / 16);
    segment(ctx, nx, ny, hx, hy, active ? BASE_COLOR : 'rgba(148,163,184,.3)', 3 * unit);
    ctx.beginPath();
    ctx.arc(hx, hy, Math.max(16, width / 55), 0, TAU);
    ctx.fillStyle = active ? 'rgba(94, 222, 180, 0.07)' : 'rgba(148,163,184,.06)';
    ctx.fill();
    ctx.strokeStyle = active ? CORE_COLOR : 'rgba(148,163,184,.4)';
    ctx.lineWidth = 2.6 * unit;
    ctx.stroke();
  }

  for (const [a, b] of EDGES) {
    const p = landmarks[a], q = landmarks[b];
    if (!visible(p) || !visible(q)) continue;
    const x1 = p.x * width, y1 = p.y * height, x2 = q.x * width, y2 = q.y * height;
    const target = active && highlightSet.has(a) && highlightSet.has(b);
    if (target) {
      ctx.save();
      ctx.shadowColor = 'rgba(250, 221, 99, 0.65)';
      ctx.shadowBlur = (12 + 7 * pulse) * unit;
      segment(ctx, x1, y1, x2, y2, 'rgba(250, 211, 99, 0.38)', 11 * unit);
      ctx.restore();
      segment(ctx, x1, y1, x2, y2, 'rgba(255, 222, 128, 0.75)', 6 * unit);
      segment(ctx, x1, y1, x2, y2, ACCENT_COLOR, 2.8 * unit);
    } else {
      const core = a === 11 && b === 12 || a === 11 && b === 23 || a === 12 && b === 24 || a === 23 && b === 24;
      segment(ctx, x1, y1, x2, y2, active ? 'rgba(72, 169, 155, 0.13)' : 'rgba(148,163,184,.09)', (core ? 9 : 7) * unit);
      segment(ctx, x1, y1, x2, y2, active ? (core ? CORE_COLOR : BASE_COLOR) : 'rgba(148,163,184,.42)', (core ? 3.5 : 2.8) * unit);
    }
  }

  for (let i = 11; i <= 30; i++) {
    const p = landmarks[i];
    if (!visible(p)) continue;
    const target = active && highlightSet.has(i);
    const x = p.x * width, y = p.y * height;
    const radius = (target ? 6.8 : 4.5) * unit;
    if (target) {
      ctx.save();
      ctx.shadowBlur = (11 + 8 * pulse) * unit;
      ctx.shadowColor = 'rgba(254,240,138,.9)';
      ctx.beginPath(); ctx.arc(x, y, radius + 1, 0, TAU);
      ctx.fillStyle = 'rgba(255,223,130,.55)'; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(x, y, radius + 5 * unit + 2.5 * unit * pulse, 0, TAU);
      ctx.strokeStyle = `rgba(254, 240, 138, ${0.20 + 0.18 * (1 - pulse)})`;
      ctx.lineWidth = 1.6 * unit; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU);
    ctx.fillStyle = target ? '#fff9d6' : (active ? '#d9fff0' : '#94a3b8');
    ctx.fill();
    ctx.strokeStyle = target ? '#ad842c' : 'rgba(52, 120, 105, .85)';
    ctx.lineWidth = 1.6 * unit; ctx.stroke();
  }

  if (angle !== null && Number.isFinite(angle) && highlightJoints?.length) {
    const apexId = highlightJoints.length === 3 ? highlightJoints[1]
      : (highlightJoints.includes(25) ? 25 : (highlightJoints.includes(26) ? 26 : (highlightJoints.includes(13) ? 13 : (highlightJoints.includes(14) ? 14 : highlightJoints[0]))));
    const apex = landmarks[apexId];
    if (visible(apex)) {
      const bx = Math.min(width - 68, Math.max(10, apex.x * width + 17 * unit));
      const by = Math.min(height - 36, Math.max(25, apex.y * height - 13 * unit));
      const strokeCol = depthProgress >= 100 ? '#6ee7b7' : (depthProgress > 25 ? '#fbbf24' : '#fcd34d');
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 12 * unit;
      ctx.fillStyle = 'rgba(9, 27, 39, 0.9)';
      ctx.strokeStyle = strokeCol; ctx.lineWidth = 1.1 * unit;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(bx, by, 57, 26, 8) : ctx.rect(bx, by, 57, 26);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = '700 13px sans-serif';
      ctx.fillStyle = depthProgress >= 100 ? '#a7f3d0' : '#fff9e9';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${angle}°`, bx + 28.5, by + 13);
      ctx.restore();
    }
  }

  if (label) {
    ctx.save();
    ctx.font = `700 ${Math.max(13, width / 65)}px sans-serif`;
    ctx.fillStyle = '#fef3c7';
    ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 8 * unit;
    ctx.fillText(label, 26, 40);
    ctx.restore();
  }
}

export function drawIdle(canvas) {
  if (!canvas) return;
  const width = 960, height = 540;
  const ctx = prepareCanvas(canvas, width, height);
  if (!ctx) return;
  const g = ctx.createRadialGradient(480, 230, 36, 480, 260, 480);
  g.addColorStop(0, '#244c54'); g.addColorStop(1, '#0b1b2b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(160,240,211,.055)'; ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 48) segment(ctx, x, 0, x, height, 'rgba(160,240,211,.055)', 1);
  for (let y = 0; y < height; y += 48) segment(ctx, 0, y, width, y, 'rgba(160,240,211,.055)', 1);
  ctx.beginPath(); ctx.arc(480, 270, 180, 0, TAU);
  ctx.strokeStyle = 'rgba(174,255,210,.11)'; ctx.lineWidth = 1.5; ctx.stroke();
  const points = [[480,205,480,150],[480,205,450,285],[480,205,515,285],[480,205,480,355],[480,355,445,445],[480,355,520,445]];
  ctx.save(); ctx.shadowBlur = 12; ctx.shadowColor = 'rgba(129, 230, 178, .25)';
  for (const [x1,y1,x2,y2] of points) segment(ctx, x1, y1, x2, y2, '#87bda9', 4);
  ctx.beginPath(); ctx.arc(480,120,26,0,TAU); ctx.strokeStyle = '#87bda9'; ctx.lineWidth = 4; ctx.stroke();
  ctx.restore();
  ctx.textAlign = 'center'; ctx.fillStyle = '#d1e5df'; ctx.font = '20px sans-serif';
  ctx.fillText('等待开启摄像头或模拟演示', 480, 500);
  ctx.textAlign = 'left';
}
