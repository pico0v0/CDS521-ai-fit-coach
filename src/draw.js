/** Draws a transparent overlay. Canvas & video are mirrored together for front camera. */
const EDGES = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[24,26],[26,28],[28,30],
];
export function drawPose(canvas, landmarks, options = {}) {
  if (!canvas) return;
  const { width = 960, height = 540, active = true, label = '', highlightJoints = null } = options;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  if (!landmarks?.length) return;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  const highlightSet = new Set(highlightJoints || []);

  // 1. Draw base skeleton edges
  for (const [a, b] of EDGES) {
    const p = landmarks[a], q = landmarks[b];
    if (!p || !q || (p.visibility ?? 1) < 0.35 || (q.visibility ?? 1) < 0.35) continue;
    const isTargetEdge = highlightSet.has(a) && highlightSet.has(b);
    ctx.beginPath();
    ctx.moveTo(p.x * width, p.y * height);
    ctx.lineTo(q.x * width, q.y * height);

    if (isTargetEdge) {
      // Glow effect for target exercise limb
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = Math.max(5, width / 150);
      ctx.stroke();
    } else {
      ctx.strokeStyle = active ? 'rgba(198, 255, 114, 0.45)' : '#94a3b840';
      ctx.lineWidth = Math.max(2.5, width / 260);
      ctx.stroke();
    }
  }

  // 2. Draw normal landmarks
  for (let i = 11; i <= 30; i++) {
    const p = landmarks[i];
    if (!p || (p.visibility ?? 1) < 0.35) continue;
    const isTarget = highlightSet.has(i);
    const radius = isTarget ? Math.max(5.5, width / 140) : Math.max(3.2, width / 200);

    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, radius, 0, Math.PI * 2);
    ctx.fillStyle = isTarget ? '#fef08a' : '#f8fff1';
    ctx.fill();
    ctx.strokeStyle = isTarget ? '#ca8a04' : '#527c24';
    ctx.lineWidth = isTarget ? 2.5 : 1.5;
    ctx.stroke();

    if (isTarget) {
      // Pulsing outer ring on target joints
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  if (label) {
    ctx.font = `600 ${Math.max(13, width / 55)}px sans-serif`;
    ctx.fillStyle = '#dcfce7';
    ctx.fillText(label, 26, 40);
  }
}
export function drawIdle(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = 960; canvas.height = 540;
  const g = ctx.createRadialGradient(480, 250, 30, 480, 250, 450);
  g.addColorStop(0, '#1d3445'); g.addColorStop(1, '#0c1826');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 960, 540);
  ctx.strokeStyle = '#ffffff10'; ctx.lineWidth = 1;
  for(let x=0;x<960;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,540);ctx.stroke();}
  for(let y=0;y<540;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(960,y);ctx.stroke();}
  ctx.lineWidth = 5; ctx.strokeStyle = '#648b79'; ctx.lineCap = 'round';
  const points = [[480,205,480,150],[480,205,450,285],[480,205,515,285],[480,205,480,355],[480,355,445,445],[480,355,520,445]];
  for (const [x1,y1,x2,y2] of points) {ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
  ctx.beginPath();ctx.arc(480,120,26,0,Math.PI*2);ctx.stroke();
  ctx.textAlign = 'center';ctx.fillStyle='#c5d1df';ctx.font='20px sans-serif';
  ctx.fillText('等待开启摄像头或模拟演示', 480, 500);
  ctx.textAlign = 'left';
}
