import { EXERCISES, ExerciseAnalyzer, extractJointAngle, DIFFICULTY_PRESETS, EXERCISE_GUIDES } from './exercise.js';
import { loadSessions, saveSession, clearSessions, makeAdvice, exportSessionsCSV, exportSessionsJSON, computeMaeStats, deriveVerifiedAbsError } from './store.js';
import { createPoseLandmarker } from './pose.js';
import { drawPose, drawIdle } from './draw.js';
import { simulatePose } from './simulator.js';

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const root = document.querySelector('#app');
const state = {
  view: 'home', exercise: 'squat', goal: 'habit', fatigue: 'normal', facing: 'user',
  difficulty: 'standard', targetReps: 10, targetAchieved: false,
  demoType: 'standard', selectedFaultIndex: 0,
  voice: false, mode: null, running: false, paused: false,
  analyzer: new ExerciseAnalyzer('squat', { difficulty: 'standard', targetReps: 10 }),
  stream: null, detector: null, frame: 0, lastFrame: 0, lastVideoTime: -1,
  startWall: 0, startPerf: 0, pauseAt: 0, pauseDuration: 0, warningLogs: [],
  lastSession: null, toast: '', activeRunId: 0, modelReady: false, trackedFrames: 0,
  fps: 0, latencyMs: 0, latencySumMs: 0, fpsFrames: 0, fpsLastTime: 0, totalInferredFrames: 0, inferFramesWindow: 0, currentHighlightJoints: null
};
let trainingNodes = null;
const TRAINING_IDS = ['poseCanvas','repsCount','partialCount','angleValue','phaseStat','clock','targetDepthLabel','depthBar','depthPercent','activeSideBadge','stageHint'];
const icons = {
  home:'⌂', training:'◉', reports:'▥', about:'◇', camera:'▣', close:'×',
};
const escapeText = (v) => String(v).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const int = n => String(Math.max(0, n | 0)).padStart(2, '0');
const formatTime = sec => `${int(Math.floor(sec/60))}:${int(sec%60)}`;
const formatDate = iso => {try {return new Date(iso).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}catch{return '未知日期';}};

function shell() {
  root.innerHTML = `<div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-icon">A<span>·</span></div><div><strong>AI FIT COACH</strong><small>VISION FITNESS LAB</small></div></div>
      <div class="nav-caption">WORKSPACE <span>01 / 04</span></div>
      <nav class="nav-list" aria-label="主导航">
        ${[['home','工作台','⌂'],['training','实时训练','◉'],['reports','训练报告','▦'],['about','项目说明','◇']].map(([view,name,symbol])=>`<button type="button" class="nav-btn ${state.view===view?'active':''}" data-view="${view}" aria-current="${state.view===view?'page':'false'}"><span class="nav-symbol">${symbol}</span><span>${name}</span>${view==='training'?'<span class="small-glow"></span>':''}</button>`).join('')}
      </nav>
      <div class="sidebar-bottom"><div class="device-icon">✦</div><div><strong>AI Foundations</strong><small>Course project · v0.1.0</small></div></div>
    </aside>
    <div class="workspace">
      <header class="topbar"><div class="breadcrumb">AI FIT COACH <span>/</span> ${escapeText(({home:'概览',training:'实时训练',reports:'训练报告',about:'项目说明'})[state.view])}</div><div class="topbar-right"><span class="status-dot"></span> 本地运行 · 隐私优先 <span class="top-avatar">AI</span></div></header>
      <main id="page-content" tabindex="-1"></main>
      <footer class="footer"><span>© AI FIT COACH / COURSE DEMO</span><span>非医疗工具 · 不进行损伤诊断</span></footer>
    </div>
  </div><div id="toast" class="toast" role="status" aria-live="polite"></div>`;
  renderPage();
}
function renderPage() {
  trainingNodes = null;
  const page = document.querySelector('#page-content');
  if (!page) return;
  if (state.view === 'home') page.innerHTML = homePage();
  if (state.view === 'training') { page.innerHTML = trainingPage(); drawIdle(document.querySelector('#poseCanvas')); updateTrainingUI(); }
  if (state.view === 'reports') page.innerHTML = reportsPage();
  if (state.view === 'about') page.innerHTML = aboutPage();
}
function setView(view) {
  if (view === state.view) return;
  if (state.view === 'training' && view !== 'training' && state.mode) finishSession();
  state.view = view;
  shell();
  window.scrollTo({top:0, behavior:'instant'});
}
function latest() { return loadSessions()[0] || null; }
function homePage() {
  const sessions = loadSessions();
  const total = sessions.reduce((a,s)=>a+s.count,0);
  return `<div class="page">
    <section class="hero">
      <div class="hero-copy"><div class="eyebrow"><span class="eyebrow-line"></span> COMPUTER VISION × FITNESS</div>
        <h1>让镜头，成为<br/><em>你的训练搭档。</em></h1>
        <p>无需穿戴设备，只用一个摄像头。基于真实人体姿态估计，体验动作计数、即时反馈与个性化训练总结。</p>
        <div class="hero-actions"><button class="btn btn-primary" data-action="open-training">进入实时训练 <span>↗</span></button><button class="btn btn-outline" data-action="quick-demo">体验模拟演示 <span>↗</span></button></div>
        <div class="hero-meta"><span><i></i> MediaPipe Pose Landmarker</span><span><i></i> 33 个人体关键点</span></div>
      </div><div class="hero-art" aria-hidden="true"><div class="art-circle circle-one"></div><div class="art-circle circle-two"></div><svg viewBox="0 0 300 330" class="hero-person"><g fill="none" stroke="#c9ff72" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><circle cx="148" cy="50" r="25"/><path d="M146 77 139 174 115 239 92 305 M140 174 183 235 205 308 M144 98 98 135 69 186 M145 98 203 134 238 179"/><path d="M125 172 164 174" stroke="#eaffce"/></g><g fill="#fff"><circle cx="139" cy="174" r="6"/><circle cx="115" cy="239" r="6"/><circle cx="183" cy="235" r="6"/><circle cx="98" cy="135" r="6"/><circle cx="203" cy="134" r="6"/></g></svg><div class="art-tag tag-top">33 LANDMARKS <span>● TRACKING</span></div><div class="art-tag tag-bottom">POSE DETECTED <span class="spark">✳</span></div></div>
    </section>
    <div class="section-label">概览数据 <span>OVERVIEW / LOCAL DATA</span></div>
    <section class="metrics"><div class="metric-card"><span>累计训练</span><strong>${sessions.length.toString().padStart(2,'0')} <small>次</small></strong><div class="metric-foot">保存在本机浏览器</div></div><div class="metric-card"><span>累计有效动作</span><strong>${total.toString().padStart(2,'0')} <small>次</small></strong><div class="metric-foot">基于当前演示规则</div></div><div class="metric-card"><span>已支持动作</span><strong>03 <small>种</small></strong><div class="metric-foot">深蹲 / 弯举 / 开合跳</div></div><div class="metric-card accent-card"><span>核心算法</span><strong class="metric-word">姿态估计</strong><div class="metric-foot">预训练 AI + 状态机</div></div></section>
    <div class="section-label">三阶段智能训练 <span>THE WORKFLOW</span></div>
    <section class="feature-grid"><article class="feature-card"><span class="feature-number">01 / BEFORE</span><div class="feature-icon">◎</div><h3>训练前 · 做好准备</h3><p>选择训练目标和动作，按照机位建议调整拍摄位置。</p></article><article class="feature-card"><span class="feature-number">02 / DURING</span><div class="feature-icon">⌁</div><h3>训练中 · 实时反馈</h3><p>AI 提取骨架关键点，规则算法判断动作阶段、计数与幅度。</p></article><article class="feature-card"><span class="feature-number">03 / AFTER</span><div class="feature-icon">▥</div><h3>训练后 · 复盘优化</h3><p>生成基础训练报告，根据主观疲劳和目标给出非医疗性建议。</p></article></section>
    <section class="callout"><div><span class="chip">COURSE DEMO</span><h3>无需配置服务端，即可开始探索。</h3><p>模拟模式不运行 AI；真实识别需要摄像头权限及首次加载模型的网络连接。演示时请明确区分。</p></div><button class="btn btn-secondary" data-action="open-training">开始使用 →</button></section>
  </div>`;
}
function renderDemoGuideHTML() {
  const guide = EXERCISE_GUIDES[state.exercise] || EXERCISE_GUIDES.squat;
  const isDemoActive = state.mode === 'demo';
  const activeTab = state.demoType || 'standard';
  const faultCount = guide.faults ? guide.faults.length : 0;
  const safeFaultIdx = Math.min(Math.max(0, state.selectedFaultIndex || 0), Math.max(0, faultCount - 1));
  const curFault = guide.faults?.[safeFaultIdx] || guide.faults?.[0];

  return `<div class="demo-guide-card ${isDemoActive ? 'guide-demo-active' : ''}">
    <div class="guide-header">
      <div class="guide-title-box">
        <span class="guide-badge ${activeTab === 'fault' ? 'badge-fault' : 'badge-std'}">
          ${activeTab === 'fault' ? '⚠ 动作代偿与常见错误剖析' : '✓ 动作标准与生物力学示范'}
        </span>
        <strong class="guide-subtitle">${escapeText(guide.standard.title)}</strong>
      </div>
      <div class="guide-tabs" role="tablist">
        <button type="button" class="guide-tab-btn ${activeTab === 'standard' ? 'active' : ''}" data-action="switch-demo-tab" data-tab="standard">
          ✓ 正确姿势示范
        </button>
        <button type="button" class="guide-tab-btn ${activeTab === 'fault' ? 'active' : ''}" data-action="switch-demo-tab" data-tab="fault">
          ⚠ 常见错误姿势 (${faultCount})
        </button>
      </div>
    </div>

    ${activeTab === 'standard' ? `
      <div class="guide-content guide-content-std">
        <div class="guide-summary-line">
          <span class="guide-summary-tag">动作核心要领</span>
          <strong>${escapeText(guide.standard.summary)}</strong>
        </div>
        <div class="std-cues-grid">
          ${guide.standard.cues.map((cue, idx) => `
            <div class="cue-item">
              <span class="cue-num">0${idx + 1}</span>
              <div class="cue-body">
                <strong>${escapeText(cue.label)}</strong>
                <p>${escapeText(cue.desc)}</p>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="guide-footer-tip">
          ${isDemoActive && state.demoType === 'standard'
            ? '▶ 正在以标准生物力学轨迹循环演示：大腿下潜达标、躯干稳定、双线平行，每次动作完整计入有效次数。'
            : '💡 提示：点击上方「▷ 正确姿势示范」按钮可随时开启纯净标准动作合成骨架演示。'}
        </div>
      </div>
    ` : `
      <div class="guide-content guide-content-fault">
        <div class="fault-selector-row">
          <span class="fault-sel-label">选择典型错误：</span>
          <div class="fault-pills">
            ${guide.faults.map((f, idx) => `
              <button type="button" class="fault-pill ${idx === safeFaultIdx ? 'active' : ''}" data-action="select-fault" data-fault-index="${idx}">
                ${escapeText(f.tag)} · ${escapeText(f.shortName)}
              </button>
            `).join('')}
          </div>
        </div>

        ${curFault ? `
          <div class="fault-detail-box">
            <div class="fault-detail-title">
              <span class="fault-badge-tag">${escapeText(curFault.tag)}</span>
              <h4>${escapeText(curFault.name)}</h4>
            </div>

            <div class="fault-breakdown-grid">
              <div class="breakdown-card card-where">
                <div class="b-head"><span class="b-icon">📍</span><strong>错在哪（代偿位置）</strong></div>
                <p>${escapeText(curFault.where)}</p>
              </div>

              <div class="breakdown-card card-why">
                <div class="b-head"><span class="b-icon">⚠️</span><strong>为什么错（损伤隐患）</strong></div>
                <p>${escapeText(curFault.why)}</p>
              </div>

              <div class="breakdown-card card-fix">
                <div class="b-head"><span class="b-icon">💡</span><strong>如何纠正（动作要领）</strong></div>
                <p>${escapeText(curFault.correction)}</p>
              </div>

              <div class="breakdown-card card-ai">
                <div class="b-head"><span class="b-icon">🤖</span><strong>AI 判定规则（检测逻辑）</strong></div>
                <p>${escapeText(curFault.aiRule)}</p>
              </div>
            </div>

            <div class="guide-footer-tip">
              ${isDemoActive && state.demoType === 'fault'
                ? `▶ 正在模拟「${escapeText(curFault.shortName)}」错误动作：请观察上方骨架关键点异常轨迹与右侧 AI 状态机警报。`
                : '💡 提示：点击上方「⚠ 常见错误演示」按钮可模拟此类代偿动作，便于观察系统如何识别并拦截错误。'}
            </div>
          </div>
        ` : ''}
      </div>
    `}
  </div>`;
}

function updateDemoGuideUI() {
  const guideSec = document.querySelector('#demoGuideSection');
  if (guideSec) {
    guideSec.innerHTML = renderDemoGuideHTML();
  }
}

function trainingPage() {
  const ex = EXERCISES[state.exercise];
  return `<div class="page training-page">
    <div class="page-heading"><div><div class="eyebrow">LIVE SESSION / MOVEMENT ANALYSIS</div><h2>实时训练 <span>WORKOUT STUDIO</span></h2><p>姿态模型识别关键点，独立规则判断动作阶段；角度阈值仅供课程演示。</p></div><span class="page-tag">● v0.1 · BETA</span></div>
    <div class="training-layout"><section class="camera-column">
      <div class="module-heading"><div><span class="section-index">01</span><strong>视觉训练区域</strong></div><span id="modePill" class="mode-pill">● 等待开始</span></div>
      <div class="camera-stage" id="cameraStage"><video id="liveVideo" autoplay muted playsinline></video><canvas id="poseCanvas" width="960" height="540" aria-label="人体骨架叠加画布"></canvas><div class="scan-corner tl"></div><div class="scan-corner tr"></div><div class="scan-corner bl"></div><div class="scan-corner br"></div><div class="stage-top"><span class="stage-tag">POSE TRACKING / ${ex.english}</span><span id="perfIndicator" class="perf-tag">-- FPS</span><span id="stageIndicator">STANDBY</span></div><div class="stage-bottom" id="stageHint">请使用下方按钮开启摄像头或模拟演示（空格键暂停/继续）</div><div class="sim-label" id="simLabel">模拟数据 · 非真实 AI 识别</div></div>
      <div class="camera-actions"><button class="btn btn-primary" data-action="start-camera" id="startCamera">◉ &nbsp; 启动 AI 摄像头</button><button class="btn btn-outline" data-action="select-video" id="startVideo">🎞 &nbsp; 本地视频评测</button><button class="btn btn-outline" data-action="start-demo-standard" id="startDemoStandard" title="展示 100% 达标深度的标准动作规范示范">▷ &nbsp; 正确姿势示范</button><button class="btn btn-outline" data-action="start-demo-fault" id="startDemoFault" title="展示常见代偿动作与 AI 警报判定">⚠ &nbsp; 常见错误演示</button><button class="btn btn-muted" data-action="pause" id="pauseBtn" disabled>暂停</button><button class="btn btn-danger" data-action="end" id="endBtn" disabled>结束训练</button><input type="file" id="videoFileInput" accept="video/mp4,video/webm,video/ogg,video/quicktime" style="display:none"></div>
      <div id="modelMessage" class="model-message" role="status">真实模式首次启动将从 Google / jsDelivr 加载模型与运行库，需要联网；模拟模式不使用 AI。</div>
      <div class="instruction"><span class="info-dot">i</span><div><strong>机位建议</strong><p id="cameraGuidance">${ex.guidance}</p></div></div>
      <div id="demoGuideSection" class="demo-guide-section">${renderDemoGuideHTML()}</div>
    </section><aside class="analysis-column">
      <div class="module-heading"><div><span class="section-index">02</span><strong>动作设置与分析</strong></div><span class="mini-sub">REAL-TIME</span></div>
      <div class="settings-card"><div class="input-label">选择动作 <span>EXERCISE</span></div><div class="exercise-switch"><button type="button" data-exercise="squat" class="exercise-btn ${state.exercise==='squat'?'selected':''}">深蹲 <small>SQUAT</small></button><button type="button" data-exercise="curl" class="exercise-btn ${state.exercise==='curl'?'selected':''}">弯举 <small>CURL</small></button><button type="button" data-exercise="jumping_jack" class="exercise-btn ${state.exercise==='jumping_jack'?'selected':''}">开合跳 <small>JACK</small></button></div><div class="select-grid"><label>训练目标<select id="goalInput"><option value="habit" ${state.goal==='habit'?'selected':''}>培养习惯</option><option value="strength" ${state.goal==='strength'?'selected':''}>力量训练</option><option value="endurance" ${state.goal==='endurance'?'selected':''}>提高耐力</option></select></label><label>目前疲劳<select id="fatigueInput"><option value="normal" ${state.fatigue==='normal'?'selected':''}>一般</option><option value="low" ${state.fatigue==='low'?'selected':''}>较低</option><option value="high" ${state.fatigue==='high'?'selected':''}>较高</option></select></label></div><div class="select-grid" style="margin-top:10px"><label>动作难度<select id="difficultySelect"><option value="beginner" ${state.difficulty==='beginner'?'selected':''}>初学 (幅度阈值较低)</option><option value="standard" ${state.difficulty==='standard'?'selected':''}>标准 (推荐)</option><option value="advanced" ${state.difficulty==='advanced'?'selected':''}>进阶 (更高幅度要求)</option></select></label><label>目标次数<select id="targetRepsSelect"><option value="0" ${state.targetReps===0?'selected':''}>自由练习 (不限)</option><option value="5" ${state.targetReps===5?'selected':''}>5 次 (体验组)</option><option value="10" ${state.targetReps===10?'selected':''}>10 次 (标准组)</option><option value="15" ${state.targetReps===15?'selected':''}>15 次 (耐力组)</option></select></label></div><div class="minor-options"><label class="voice-option"><input type="checkbox" id="voiceToggle" ${state.voice?'checked':''}> <span>语音反馈</span><button type="button" class="btn-text-test" data-action="test-voice" title="测试播报">试听 🔊</button></label><label>摄像头 <select id="facingSelect"><option value="user" ${state.facing==='user'?'selected':''}>前置</option><option value="environment" ${state.facing==='environment'?'selected':''}>后置</option></select></label></div></div>
      <div class="stat-large"><div><span class="stat-label">有效次数</span><div class="big-number" id="repsCount">00</div></div><div class="stat-side"><div><span>进行时间</span><strong id="clock">00:00</strong></div><div><span>未达演示幅度</span><strong id="partialCount">00</strong></div></div></div>
      <div class="stat-row"><div class="stat-small"><span>关节角度 <small>2D EST.</small></span><strong id="angleStat"><span id="angleValue">--</span> <small>°</small></strong></div><div class="stat-small"><span>动作状态</span><strong id="phaseStat" class="phase-text">等待站稳</strong></div></div>
      <div class="depth-card"><div class="depth-head"><span>动作深度完成度</span><strong id="depthPercent">0%</strong></div><div class="depth-meter-track"><div class="depth-meter-bar" id="depthBar"></div></div><div class="depth-labels"><span>起始准备 (${ex.extended}°)</span><span id="activeSideBadge" class="side-badge">待识别肢体</span><span id="targetDepthLabel">达标幅度 (${state.analyzer.exercise.full}°)</span></div></div>
      <div class="feedback-card"><div class="feedback-head"><span class="feedback-indicator"></span><strong>教练反馈</strong><span>LIVE FEEDBACK</span></div><p id="feedbackText" aria-live="polite">准备就绪。请先选择摄像头或模拟演示。</p><div class="feedback-bottom">基于动作规则，不用于医学诊断</div></div>
    </aside></div>
    <section class="notes-line"><div>✧ <strong>真实 AI 模式</strong>：姿态识别由 MediaPipe 完成</div><div>◇ <strong>模拟演示</strong>：合成骨架测试算法，不代表真实模型表现</div></section>
  </div>`;
}
function reportsPage() {
  const sessions = loadSessions();
  const current = state.lastSession || latest();
  const totalCount = sessions.reduce((a,s)=>a+s.count,0);
  const mean = sessions.length ? Math.round(totalCount/sessions.length) : 0;
  const chart = sessions.slice(0, 8).reverse();
  const max = Math.max(...chart.map(s=>s.count), 1);
  const maeStats = computeMaeStats(sessions);

  return `<div class="page"><div class="page-heading"><div><div class="eyebrow">SESSION REVIEW / LOCAL RECORDS</div><h2>训练报告 <span>PROGRESS TRACKER</span></h2><p>只在浏览器本地保存次数等统计信息，不保存摄像头视频。</p></div><button class="btn btn-secondary" data-action="open-training">+ 新训练</button></div>
    <section class="report-metrics"><article><span>训练记录</span><strong>${sessions.length}</strong><small>SESSIONS</small></article><article><span>累计有效次数</span><strong>${totalCount}</strong><small>REPS</small></article><article><span>平均每次记录</span><strong>${mean}</strong><small>REPS / SESSION</small></article><article><span>真实 AI 对照 MAE</span>${maeStats.realMae !== null ? `<strong style="color:${maeStats.realMae<=0.5?'#86efac':'#fde047'}">${maeStats.realMae.toFixed(2)}</strong><small>REAL AI MAE (N=${maeStats.realCount})</small>` : `<strong style="font-size:12px;color:#94a3b8;line-height:2.4">暂无有效真人对照数据</strong><small>需真实AI实测 + 人工核验</small>`}</article>${maeStats.demoCount > 0 ? `<article><span>模拟算法回归误差</span><strong style="color:#cbd5e1">${maeStats.demoMae.toFixed(2)}</strong><small>SIMULATION (N=${maeStats.demoCount}, 非AI)</small></article>` : ''}</section>
    <div class="report-grid"><section class="panel"><div class="panel-heading"><h3>最近一次训练</h3><span>LATEST SESSION</span></div>
      ${current ? (() => {
        const curErr = deriveVerifiedAbsError(current);
        return `<div class="latest-title">${escapeText(EXERCISES[current.exercise]?.name || current.exercise)} <span class="report-chip ${current.mode==='demo'?'demo-chip':(current.mode==='video'?'video-chip':'')}">${current.mode==='demo'?'模拟数据':(current.mode==='video'?'本地视频AI':(current.trackedFrames?'真实摄像头':'摄像头（未跟踪到人体）'))}</span></div><div class="latest-date">${formatDate(current.startedAt)}</div><div class="session-numbers"><div><strong>${current.count}</strong><small>有效次数</small></div><div><strong>${current.partialCount}</strong><small>未达幅度</small></div><div><strong>${(current.faultCounts?.trunk_lean || 0) + (current.faultCounts?.arm_swing || 0) + (current.faultCounts?.arm_asymmetry || 0)}</strong><small>姿态提示</small></div>${curErr !== null ? `<div><strong>${current.manualCount}</strong><small>人工核验</small></div><div><strong style="color:${curErr===0?'#86efac':'#f59e0b'}">${curErr}</strong><small>绝对误差</small></div>` : ''}<div><strong>${formatTime(current.durationSeconds)}</strong><small>训练时长</small></div></div><div class="advice-box"><span>✦ 个性化建议 · 规则模板</span><p>${escapeText(makeAdvice(current, current.goal || state.goal, current.fatigue || state.fatigue))}</p></div>`;
      })() : `<div class="empty-state"><span>◎</span><h3>暂无训练记录</h3><p>进入训练页，开启真实摄像头或模拟演示，结束训练后会自动生成报告。</p><button class="btn btn-primary" data-action="open-training">立即开始 →</button></div>`}
    </section><section class="panel"><div class="panel-heading"><h3>最近训练次数</h3><span>LAST 8 SESSIONS</span></div><div class="chart-wrap">${chart.length ? `<div class="bar-chart">${chart.map((s,i)=>`<div class="bar-cell"><span>${s.count}</span><div class="bar ${s.mode==='demo'?'bar-sim':(s.mode==='video'?'bar-video':'')}" style="height:${Math.max(5, Math.round(s.count/max*185))}px"></div><small>${i+1}</small></div>`).join('')}</div><div class="legend"><span class="legend-dot"></span>实时AI <span class="legend-dot dot-video"></span>视频AI <span class="legend-dot sim"></span>模拟</div>` : `<div class="empty-chart">暂无数据，请先完成训练</div>`}</div></section></div>
    <section class="panel history-panel"><div class="panel-heading"><h3>历史记录</h3><div class="history-actions"><button class="btn btn-sm btn-outline" data-action="export-csv" ${sessions.length?'':'disabled'} title="导出用于 Excel 对照分析的 CSV 表格">⤓ 导出 CSV</button><button class="btn btn-sm btn-outline" data-action="export-json" ${sessions.length?'':'disabled'} title="导出完整 JSON 数据">⤓ 导出 JSON</button><button class="text-danger" data-action="clear-history" ${sessions.length?'':'disabled'}>清空记录</button></div></div><div class="history-table"><div class="history-head"><span>训练日期</span><span>动作</span><span>模式</span><span>系统有效</span><span>人工/误差</span><span>用时</span></div>${sessions.length ? sessions.map(s => {
      const sErr = deriveVerifiedAbsError(s);
      return `<div class="history-row"><span>${formatDate(s.startedAt)}</span><span>${escapeText(EXERCISES[s.exercise]?.name || s.exercise)}</span><span>${s.mode==='demo'?'模拟':(s.mode==='video'?'视频AI':'实时')}</span><strong>${s.count}</strong><span>${sErr !== null ? `${s.manualCount} / 误${sErr}${s.mode==='demo'?'(模)':''}` : '--'}</span><span>${formatTime(s.durationSeconds)}</span></div>`;
    }).join('') : '<p class="empty-records">暂无记录</p>'}</div></section>
    <div class="subtle-warning">注意：模拟模式生成的记录会明确标注为「模拟」，不可用作真实 AI 识别准确率实验数据。</div>
  </div>`;
}
function aboutPage() {
  return `<div class="page"><div class="page-heading"><div><div class="eyebrow">ABOUT THE PROJECT / 课程设计</div><h2>项目说明 <span>HOW IT WORKS</span></h2><p>该演示面向 AI 基础课程，重在清楚呈现 AI 模型、规则算法和可复现实验。</p></div><span class="page-tag">OPEN SOURCE DEMO</span></div><div class="about-grid"><section class="panel"><div class="panel-heading"><h3>系统如何运作</h3><span>DATA PIPELINE</span></div><div class="pipeline"><div><b>01</b><span>浏览器摄像头 / 本地视频<small>视频帧输入</small></span></div><i>↓</i><div><b>02</b><span>MediaPipe AI 模型<small>提取 33 个姿态关键点</small></span></div><i>↓</i><div><b>03</b><span>动作规则状态机<small>角度 · 阶段 · 完整动作</small></span></div><i>↓</i><div><b>04</b><span>训练报告与建议<small>次数统计 · 非医疗性提示</small></span></div></div></section><section class="panel"><div class="panel-heading"><h3>已实现 / 未实现</h3><span>RELEASE V0.1.0</span></div><div class="checklist"><div><span>✓</span> 深蹲、弯举与开合跳动作计数</div><div><span>✓</span> 实时摄像头识别与本地视频评测</div><div><span>✓</span> 演示用幅度阈值、姿态纠错与反馈</div><div><span>✓</span> 规则训练建议、本地记录与 CSV 导出</div><div><span>✓</span> 独立标注的模拟演示模式</div><div class="pending"><span>○</span> 真实设备大样本准确率评测</div><div class="pending"><span>○</span> 专用模型训练与安卓原生端</div><div class="pending"><span>○</span> 医学损伤预测（不做）</div></div></section></div><section class="panel limitations"><div class="panel-heading"><h3>技术边界与隐私</h3><span>PLEASE READ</span></div><div class="limitation-columns"><div><strong>摄像头与模型</strong><p>真实模式需要摄像头授权和首次加载远程模型资源。单目 2D 角度受机位、遮挡与人体差异影响。</p></div><div><strong>模拟模式</strong><p>使用合成关键点而非 AI 检测；仅用于页面展示、回归测试和网络故障时演示流程。</p></div><div><strong>一般健身辅助</strong><p>不估算真实损伤概率，不诊断骨盆、脊柱或关节疾病。疼痛或不适时停止相应运动。</p></div></div></section><div class="source-links"><a href="https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js" target="_blank" rel="noopener noreferrer">MediaPipe Web 官方文档 ↗</a><a href="https://github.com/google-ai-edge/mediapipe" target="_blank" rel="noopener noreferrer">MediaPipe 开源仓库 ↗</a></div></div>`;
}

function refreshModeUI() {
  const stage = document.querySelector('#cameraStage'); if (!stage) return;
  stage.classList.toggle('simulating', state.mode === 'demo');
  stage.classList.toggle('camera-live', state.mode === 'camera' || state.mode === 'video');
  const pill = document.querySelector('#modePill');
  pill.textContent = state.mode === 'demo' ? (state.demoType === 'fault' ? '● 模拟错误演示 · 非 AI' : '● 模拟标准示范 · 非 AI')
    : state.mode === 'video' ? (state.modelReady ? '● 本地视频 · 真实 AI 识别' : '◌ AI 模型加载中')
    : state.mode === 'camera' ? (state.modelReady ? '● 真实 AI 识别' : '◌ AI 模型加载中')
    : '● 等待开始';
  pill.className = `mode-pill ${state.mode==='demo'?(state.demoType==='fault'?'pill-fault':'pill-demo'):''} ${(state.mode==='camera'||state.mode==='video')?'pill-live':''}`;
  const startCamBtn = document.querySelector('#startCamera');
  if (startCamBtn) {
    startCamBtn.disabled = !!state.mode;
    startCamBtn.innerHTML = state.mode === 'camera' && !state.modelReady ? '⏳ 正在连接…' : '◉ &nbsp; 启动 AI 摄像头';
  }
  const startVideoBtn = document.querySelector('#startVideo');
  if (startVideoBtn) {
    startVideoBtn.disabled = !!state.mode;
    startVideoBtn.innerHTML = state.mode === 'video' && !state.modelReady ? '⏳ 正在载入…' : '🎞 &nbsp; 本地视频评测';
  }
  const demoStdBtn = document.querySelector('#startDemoStandard');
  if (demoStdBtn) {
    demoStdBtn.disabled = state.mode === 'camera' || state.mode === 'video';
    const isStdActive = state.mode === 'demo' && state.demoType === 'standard';
    demoStdBtn.classList.toggle('active', isStdActive);
    demoStdBtn.innerHTML = '▷ &nbsp; 正确姿势示范';
    demoStdBtn.title = isStdActive ? '正在演示标准规范（点击可退出演示）' : '展示 100% 达标深度的标准动作规范示范';
  }
  const demoFaultBtn = document.querySelector('#startDemoFault');
  if (demoFaultBtn) {
    demoFaultBtn.disabled = state.mode === 'camera' || state.mode === 'video';
    const isFaultActive = state.mode === 'demo' && state.demoType === 'fault';
    demoFaultBtn.classList.toggle('active-fault', isFaultActive);
    demoFaultBtn.innerHTML = '⚠ &nbsp; 常见错误演示';
    demoFaultBtn.title = isFaultActive ? '正在演示常见错误（点击可退出演示）' : '展示常见代偿动作与 AI 警报判定';
  }
  const oldDemoBtn = document.querySelector('#startDemo');
  if (oldDemoBtn) oldDemoBtn.disabled = !!state.mode;
  document.querySelector('#pauseBtn').disabled = !state.mode;
  document.querySelector('#pauseBtn').textContent = state.paused ? '继续' : '暂停';
  const endBtn = document.querySelector('#endBtn');
  if (endBtn) {
    endBtn.disabled = !state.mode;
    if (state.mode === 'demo') {
      endBtn.innerHTML = '⏹ &nbsp; 退出演示';
      endBtn.className = 'btn btn-stop-demo';
    } else {
      endBtn.innerHTML = '结束训练';
      endBtn.className = 'btn btn-danger';
    }
  }
  document.querySelectorAll('[data-exercise]').forEach(b=>b.disabled=!!state.mode);
  document.querySelector('#facingSelect').disabled = !!state.mode;
  const diffSelect = document.querySelector('#difficultySelect');
  const targetSelect = document.querySelector('#targetRepsSelect');
  if (diffSelect) diffSelect.disabled = !!state.mode;
  if (targetSelect) targetSelect.disabled = !!state.mode;
  document.querySelector('#stageIndicator').textContent = state.mode === 'demo'
    ? (state.demoType === 'fault' ? 'FAULT DEMO' : 'STANDARD')
    : state.mode === 'video' ? (state.modelReady ? 'VIDEO AI' : 'LOADING MODEL')
    : state.mode === 'camera' ? (state.modelReady ? 'AI CAMERA' : 'LOADING MODEL')
    : 'STANDBY';
  const perfTag = document.querySelector('#perfIndicator');
  if (perfTag) {
    if (state.mode && state.renderFps !== undefined) {
      const modeLabel = state.mode === 'demo' ? (state.demoType === 'fault' ? '错误演示' : '标准示范') : 'AI推理';
      perfTag.textContent = `渲染 ${state.renderFps} FPS · ${modeLabel} ${state.inferFps || 0} FPS · 耗时 ${state.latencyMs ? state.latencyMs + 'ms' : '0ms'}`;
    } else {
      perfTag.textContent = state.mode ? '正在测速…' : '-- FPS';
    }
  }
}
function getTrainingNodes() {
  if (trainingNodes) return trainingNodes;
  const nodes = Object.fromEntries(TRAINING_IDS.map(id => [id, document.querySelector('#' + id)]));
  if (!nodes.poseCanvas || !nodes.repsCount) return null;
  trainingNodes = nodes;
  return nodes;
}
function updateTrainingUI(snapshot = state.analyzer.snapshot()) {
  if (state.view !== 'training') return;
  const ui = getTrainingNodes();
  if (!ui) return;
  const setText = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };
  const setClass = (node, value) => { if (node && node.className !== value) node.className = value; };
  const setStyle = (node, key, value) => { if (node && node.style[key] !== value) node.style[key] = value; };
  setText(ui.repsCount, int(snapshot.count));
  setStyle(ui.repsCount, 'color', state.targetAchieved ? 'rgb(253, 224, 71)' : '');
  setText(ui.partialCount, int(snapshot.partialCount));
  setText(ui.angleValue, snapshot.angle === null ? '--' : String(snapshot.angle));
  setText(ui.phaseStat, snapshot.phase);
  setText(ui.clock, formatTime(activeSeconds()));
  setText(ui.targetDepthLabel, `达标幅度 (${state.analyzer.exercise.full}°)`);
  const progress = Math.min(100, snapshot.progress || 0);
  setStyle(ui.depthBar, 'width', `${progress}%`);
  setClass(ui.depthBar, `depth-meter-bar ${progress >= 100 ? 'bar-achieved' : (progress > 20 ? 'bar-active' : '')}`);
  setText(ui.depthPercent, `${snapshot.progress || 0}%`);
  setText(ui.activeSideBadge, snapshot.side ? `● ${snapshot.side}跟踪` : '待识别肢体');
  setClass(ui.activeSideBadge, `side-badge ${snapshot.side ? 'side-active' : ''}`);
  if (state.mode) setText(ui.stageHint, state.paused ? '训练已暂停（按空格键继续）' :
    snapshot.visible ? `${snapshot.side || ''}${EXERCISES[state.exercise].joint}估计角度 ${snapshot.angle}° · ${snapshot.phase}` : '关键点不可见 · 请重新调整机位');
}

function inform(message, kind = 'info') {
  const feedback = document.querySelector('#feedbackText');
  if (feedback) { feedback.textContent = message; feedback.dataset.kind = kind; }
}
function modelMessage(message, kind = 'info') {
  const node = document.querySelector('#modelMessage');
  if (node) { node.textContent = message; node.dataset.kind = kind; }
}
function activeSeconds() {
  if (!state.mode) return 0;
  return Math.max(0, Math.floor((performance.now() - state.startPerf - state.pauseDuration - (state.paused ? performance.now() - state.pauseAt : 0)) / 1000));
}
function playChime(isGoal = false) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const now = ctx.currentTime;
    if (isGoal) {
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      osc.frequency.setValueAtTime(783.99, now + 0.2);
      osc.frequency.setValueAtTime(1046.50, now + 0.3);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.8);
    } else {
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.35);
    }
  } catch {}
}

function onResult(landmarks, time) {
  const joint = extractJointAngle(landmarks, state.exercise, {
    preferredSide: state.analyzer.activeSide,
    hysteresis: 0.12
  });
  state.currentHighlightJoints = joint?.ids || null;
  if ((state.mode === 'camera' || state.mode === 'video') && landmarks?.length) state.trackedFrames++;
  const snapshot = state.analyzer.update({
    angle: joint?.angle ?? null,
    visible: !!joint,
    timestamp: time,
    side: joint?.side ?? null,
    landmarks
  });
  updateTrainingUI(snapshot);
  if (snapshot.event) {
    if (snapshot.event.type === 'success') {
      playChime(snapshot.event.isGoalAchieved);
    }
    if (snapshot.event.isGoalAchieved) {
      state.targetAchieved = true;
      toast('🎉 恭喜达成目标！已完成本次设定的训练次数！');
    }
    state.warningLogs.push(snapshot.event);
    inform(snapshot.event.message, snapshot.event.type);
    if (state.voice && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const phrase = new SpeechSynthesisUtterance(snapshot.event.message);
      phrase.lang = 'zh-CN'; phrase.rate = 1.1; window.speechSynthesis.speak(phrase);
    }
  } else if (!joint) inform('暂时无法可靠看到目标关节，请保持入镜并调整拍摄位置。', 'warning');
  else if (!state.warningLogs.length) inform('已识别动作轮廓。保持平稳节奏，完成一次完整往返动作。', 'info');
  return snapshot;
}
function renderFrame(now) {
  if (!state.running || state.view !== 'training') return;
  state.frame = requestAnimationFrame(renderFrame);
  if (state.paused) return;

  // Real-time FPS monitoring (R-013: separate render FPS and AI inference FPS)
  if (!state.fpsLastTime) state.fpsLastTime = now;
  state.fpsFrames++;
  if (now - state.fpsLastTime >= 1000) {
    state.renderFps = Math.round((state.fpsFrames * 1000) / (now - state.fpsLastTime));
    state.inferFps = Math.round(((state.inferFramesWindow || 0) * 1000) / (now - state.fpsLastTime));
    state.fpsFrames = 0;
    state.inferFramesWindow = 0;
    state.fpsLastTime = now;
    const perfTag = document.querySelector('#perfIndicator');
    if (perfTag && state.mode) {
      perfTag.textContent = state.mode === 'demo'
        ? `渲染 ${state.renderFps} FPS · 模拟（非 AI）`
        : `渲染 ${state.renderFps} FPS · AI推理 ${state.inferFps} FPS · 耗时 ${state.latencyMs ? state.latencyMs + 'ms' : '0ms'}`;
    }
  }

  // Demo has no model inference: draw at the display refresh rate.
  // Keep the 65ms inference throttle for camera and local video modes.
  if (state.mode !== 'demo' && now - state.lastFrame < 65) return;
  state.lastFrame = now;
  const canvas = getTrainingNodes()?.poseCanvas;
  if (!canvas) return;

  if (state.mode === 'demo') {
    state.inferFramesWindow = (state.inferFramesWindow || 0) + 1;
    state.totalInferredFrames = (state.totalInferredFrames || 0) + 1;
    const elapsed = now - state.startPerf - state.pauseDuration;
    const landmarks = simulatePose(elapsed, state.exercise, {
      mode: state.demoType || 'standard',
      faultIndex: state.selectedFaultIndex || 0,
      difficulty: state.difficulty || 'standard',
      simulateFault: true
    });
    const snapshot = onResult(landmarks, now);
    drawPose(canvas, landmarks, {
      width: 960, height: 540,
      label: state.demoType === 'fault' ? 'FAULT DEMO · 错误姿势演示' : 'STANDARD DEMO · 正确姿势示范',
      demoExercise: state.exercise,
      highlightJoints: state.currentHighlightJoints,
      angle: snapshot?.angle ?? null,
      depthProgress: snapshot?.progress ?? 0,
      time: elapsed
    });
  } else if ((state.mode === 'camera' || state.mode === 'video') && state.detector) {
    const video = document.querySelector('#liveVideo');
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;
    if (video.currentTime === state.lastVideoTime) return;
    state.lastVideoTime = video.currentTime;
    try {
      const t0 = performance.now();
      const result = state.detector.detectForVideo(video, now);
      const cost = performance.now() - t0;
      state.latencyMs = Math.round(cost);
      state.latencySumMs = (state.latencySumMs || 0) + cost;
      state.totalInferredFrames = (state.totalInferredFrames || 0) + 1;
      state.inferFramesWindow = (state.inferFramesWindow || 0) + 1;
      const landmarks = result.landmarks?.[0] || null;
      const snapshot = onResult(landmarks, now);
      drawPose(canvas, landmarks, {
        width: video.videoWidth,
        height: video.videoHeight,
        highlightJoints: state.currentHighlightJoints,
        angle: snapshot?.angle ?? null,
        depthProgress: snapshot?.progress ?? 0
      });
    } catch (error) {
      inform(`姿态分析暂时失败：${String(error.message || error).slice(0,120)}`, 'warning');
      console.error('Pose inference error', error);
    }
  }
}
function stopRealtime() {
  state.running = false;
  state.activeRunId++;
  if (state.frame) cancelAnimationFrame(state.frame);
  state.frame = 0;
  if (state.stream) { state.stream.getTracks().forEach(track=>track.stop()); state.stream=null; }
  if (state.detector) { try { state.detector.close(); } catch {} state.detector=null; }
  if (state.videoUrl) { URL.revokeObjectURL(state.videoUrl); state.videoUrl = null; }
  state.videoFile = null;
  const video = document.querySelector('#liveVideo');
  if (video) {
    video.srcObject = null;
    video.src = '';
    video.onended = null;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}
async function begin(mode, file = null, options = {}) {
  if (state.mode) return;
  state.mode = mode; state.running = true; state.paused = false;
  if (options.demoType) state.demoType = options.demoType;
  if (options.faultIndex !== undefined) state.selectedFaultIndex = options.faultIndex;
  state.startWall = Date.now(); state.startPerf = performance.now();
  state.pauseDuration = 0; state.lastFrame = 0; state.lastVideoTime = -1;
  state.fpsFrames = 0; state.totalInferredFrames = 0; state.inferFramesWindow = 0; state.fpsLastTime = 0;
  state.renderFps = undefined; state.inferFps = undefined; state.latencyMs = 0; state.latencySumMs = 0;
  state.warningLogs = []; state.modelReady = false; state.trackedFrames = 0; state.targetAchieved = false;
  state.analyzer.configure(state.exercise, { difficulty: state.difficulty, targetReps: state.targetReps });
  const run = ++state.activeRunId;
  refreshModeUI(); updateTrainingUI(); updateDemoGuideUI();
  if (mode === 'demo') {
    const guide = EXERCISE_GUIDES[state.exercise] || EXERCISE_GUIDES.squat;
    if (state.demoType === 'fault') {
      const f = guide.faults[state.selectedFaultIndex] || guide.faults[0];
      modelMessage(`当前运行的是「常见错误演示 · ${f.shortName}」，不调用 AI 模型。用于直观展示代偿动作与 AI 警报判定。`, 'demo');
      inform(`常见错误演示已启动：正在演示【${f.name}】，请观察下方代偿机理与为什么错。`);
    } else {
      modelMessage('当前运行的是「正确姿势规范示范」，不调用 AI 模型。用于展示标准生物力学动作深度与计数闭环。', 'demo');
      inform('标准姿势示范已启动：双平行线力矩平衡、充分下潜幅度，全程稳定计数。');
    }
    state.frame = requestAnimationFrame(renderFrame);
    return;
  }
  if (mode === 'video') {
    if (!file) {
      stopRealtime(); state.mode = null; refreshModeUI();
      return;
    }
    state.videoFile = file;
    state.videoUrl = URL.createObjectURL(file);
    inform('正在载入本地视频文件并初始化 MediaPipe 模型…');
    modelMessage('正在加载本地视频与人体姿态识别模型…');
    try {
      const video = document.querySelector('#liveVideo');
      if (!video) throw new Error('训练页面已关闭');
      video.srcObject = null;
      video.src = state.videoUrl;
      video.loop = false;
      video.pause();

      // Wait for loadeddata / readyState >= 2 (HAVE_CURRENT_DATA) so frame 0 is decodeable (R-003)
      await new Promise((resolve, reject) => {
        if (video.readyState >= 2) return resolve();
        let timer = null;
        const cleanup = () => {
          clearTimeout(timer);
          video.removeEventListener('loadeddata', onLoaded);
          video.removeEventListener('error', onError);
        };
        const onLoaded = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error('视频元数据或首帧解析失败，请检查文件格式')); };
        timer = setTimeout(() => {
          cleanup();
          reject(new Error('视频首帧加载超时，请检查视频文件是否有效'));
        }, 10000);
        video.addEventListener('loadeddata', onLoaded, { once: true });
        video.addEventListener('error', onError, { once: true });
      });
      if (run !== state.activeRunId) return;

      // Register seek listener BEFORE setting currentTime = 0, with non-blind error handling
      video.pause();
      if (video.currentTime !== 0) {
        const seekPromise = new Promise((resolve, reject) => {
          let timer = null;
          const onSeeked = () => {
            clearTimeout(timer);
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked, { once: true });
          timer = setTimeout(() => {
            video.removeEventListener('seeked', onSeeked);
            if (video.currentTime === 0 && video.readyState >= 2) resolve();
            else reject(new Error('视频无法跳转至第 0 秒首帧，请检查文件格式'));
          }, 1000);
        });
        video.currentTime = 0;
        await seekPromise;
      }
      if (run !== state.activeRunId) return;

      modelMessage('本地视频已就绪，正在加载姿态估计 AI 模型…');
      const { detector, isLocalModel } = await createPoseLandmarker();
      if (run !== state.activeRunId) { detector.close(); return; }
      state.detector = detector;

      // Pre-analyze paused frame 0 so frame 0 is verified to pass through model inference
      const t0 = performance.now();
      let firstResult;
      try {
        firstResult = state.detector.detectForVideo(video, performance.now());
      } catch (firstFrameErr) {
        throw new Error(`视频首帧 AI 姿态分析失败（${firstFrameErr?.message || firstFrameErr}），无法启动评测`);
      }
      const cost = performance.now() - t0;
      state.latencyMs = Math.round(cost);
      state.latencySumMs = (state.latencySumMs || 0) + cost;
      state.totalInferredFrames = (state.totalInferredFrames || 0) + 1;
      state.inferFramesWindow = (state.inferFramesWindow || 0) + 1;
      const firstLandmarks = firstResult?.landmarks?.[0] || null;
      // onResult handles state.trackedFrames increment uniformly when landmarks are present
      onResult(firstLandmarks, performance.now());
      const canvas = document.querySelector('#poseCanvas');
      if (canvas && video.videoWidth > 0) {
        drawPose(canvas, firstLandmarks, {
          width: video.videoWidth,
          height: video.videoHeight,
          highlightJoints: state.currentHighlightJoints,
          angle: null,
          depthProgress: 0
        });
      }

      state.modelReady = true;

      state.startWall = Date.now(); state.startPerf = performance.now();
      refreshModeUI();
      const sourceText = isLocalModel ? '真正的 MediaPipe 姿态模型（本地离线模型）已就绪。' : '真正的 MediaPipe 姿态模型已从网络加载就绪。';
      modelMessage(`${sourceText}正在从 0s 启动实时帧采样 AI 动作评测。`, 'success');
      inform('已从 0s 启动实时采样姿态分析（基于主线程吞吐自适应采样，非逐编码帧扫描）。');
      const stage = document.querySelector('#cameraStage');
      stage?.classList.remove('mirror');

      // Register video.onended BEFORE playback starts
      video.onended = () => {
        const avgLatency = (state.totalInferredFrames > 0 && state.latencySumMs > 0)
          ? Math.round(state.latencySumMs / state.totalInferredFrames)
          : (state.latencyMs || 0);
        inform(`视频播放完毕：AI 实际采样推理 ${state.totalInferredFrames || 0} 帧，有效检出人体姿态 ${state.trackedFrames || 0} 帧（平均单帧推理耗时约 ${avgLatency}ms）。可点击「结束训练」查看本次评测报告。`, 'info');
      };

      // Start the render loop before starting playback
      state.frame = requestAnimationFrame(renderFrame);
      await video.play();
      return;
    } catch (error) {
      if (run !== state.activeRunId) return;
      console.error('Video / MediaPipe evaluation startup failure', error);
      stopRealtime(); state.mode = null; state.paused = false; state.modelReady = false;
      refreshModeUI();
      modelMessage(`视频评测启动失败：${String(error.message || error)}`, 'error');
      inform('无法分析视频文件。请确认格式支持（建议 MP4/WebM）或使用模拟演示模式。', 'warning');
      drawIdle(document.querySelector('#poseCanvas'));
      return;
    }
  }
  inform('正在申请摄像头权限，并加载真正的人体姿态模型…');
  modelMessage('初始化中：需要 HTTPS/localhost、摄像头授权及可访问模型的网络连接。');
  try {
    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      throw new Error('移动设备在非安全上下文（局域网 HTTP）下会禁用摄像头。建议使用 localhost、开启 HTTPS、使用「本地视频评测」模式，或在手机 Chrome 设置 chrome://flags/#unsafely-treat-insecure-origin-as-secure。');
    }
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器环境不支持摄像头访问，请在 localhost 或 HTTPS 安全上下文中打开。');
    const stream = await navigator.mediaDevices.getUserMedia({ audio:false,
      video:{ facingMode:{ ideal:state.facing }, width:{ideal:960}, height:{ideal:540}, frameRate:{ideal:24} } });
    if (run !== state.activeRunId) { stream.getTracks().forEach(t=>t.stop()); return; }
    state.stream = stream;
    const video = document.querySelector('#liveVideo');
    if (!video) throw new Error('训练页面已关闭');
    video.srcObject = stream;
    await video.play();
    modelMessage('摄像头已开启，正在加载 Google MediaPipe 模型…');
    const { detector, isLocalModel } = await createPoseLandmarker();
    if (run !== state.activeRunId) { detector.close(); return; }
    state.detector = detector; state.modelReady = true;
    // Exclude model downloading time from the reported workout length.
    state.startWall = Date.now(); state.startPerf = performance.now();
    refreshModeUI();
    const sourceText = isLocalModel ? '真正的 MediaPipe 姿态模型（本地离线模型）已加载。' : '真正的 MediaPipe 姿态模型已从网络加载。';
    modelMessage(`${sourceText}请根据机位指引调整身体位置。`, 'success');
    inform('模型就绪，站稳后进行完整动作。单人侧面机位效果通常更稳定。');
    const stage = document.querySelector('#cameraStage');
    stage?.classList.toggle('mirror', state.facing==='user');
    state.frame = requestAnimationFrame(renderFrame);
  } catch (error) {
    if (run !== state.activeRunId) return;
    console.error('Camera / MediaPipe startup failure', error);
    stopRealtime(); state.mode=null; state.paused=false; state.modelReady=false;
    refreshModeUI();
    modelMessage(`真实 AI 启动失败：${String(error.message || error)}。可检查网络、权限后重试，或使用独立的模拟模式。`, 'error');
    inform('摄像头或模型无法启动。请检查权限与网络。模拟模式不等同于 AI 推理。', 'warning');
    drawIdle(document.querySelector('#poseCanvas'));
  }
}
function togglePause() {
  if (!state.mode) return;
  const video = document.querySelector('#liveVideo');
  if (!state.paused) {
    state.paused = true;
    state.pauseAt = performance.now();
    if (video && state.mode === 'video') video.pause();
    inform('已暂停分析和计数（按空格键继续）。');
  } else {
    state.pauseDuration += performance.now() - state.pauseAt;
    state.paused = false;
    state.lastFrame = 0;
    if (video && state.mode === 'video') video.play();
    inform('已继续训练。');
  }
  refreshModeUI();
}
function finishSession(manualCount = null) {
  if (!state.mode) return;
  if ((state.mode === 'camera' || state.mode === 'video') && !state.modelReady) {
    stopRealtime(); state.mode = null; state.paused = false; state.modelReady = false;
    toast('模型尚未加载完成，本次未保存为训练记录');
    return null;
  }
  const seconds = activeSeconds();
  const snapshot = state.analyzer.snapshot();
  const hasManual = Number.isInteger(manualCount) && manualCount >= 0;
  const record = {
    id: `${state.startWall}-${Math.round(Math.random()*100000)}`,
    startedAt: new Date(state.startWall).toISOString(),
    exercise: state.exercise, mode: state.mode,
    count: snapshot.count, partialCount: snapshot.partialCount,
    durationSeconds: seconds, goal: state.goal, fatigue: state.fatigue,
    trackedFrames: (state.mode === 'camera' || state.mode === 'video') ? state.trackedFrames : 0,
    inferredFrames: (state.mode === 'camera' || state.mode === 'video') ? (state.totalInferredFrames || 0) : 0,
    warningCount: state.warningLogs.filter(e=>e.type==='warning').length,
    faultCounts: snapshot.faultCounts,
    manualCount: hasManual ? manualCount : null,
    absError: hasManual ? Math.abs(snapshot.count - manualCount) : null
  };
  stopRealtime(); state.mode=null; state.paused=false; state.modelReady=false;
  saveSession(record); state.lastSession = record;
  updateDemoGuideUI();
  return record;
}
function toast(message) {
  const element = document.querySelector('#toast'); if (!element) return;
  element.textContent = message; element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(()=>element.classList.remove('show'),3500);
  if (toast.timer?.unref) toast.timer.unref();
}

document.addEventListener('click', async event => {
  const nav = event.target.closest('[data-view]');
  if (nav) { setView(nav.dataset.view); return; }
  const exBtn = event.target.closest('[data-exercise]');
  if (exBtn) {
    if (state.mode) { toast('请结束当前训练后再切换动作'); return; }
    state.exercise = exBtn.dataset.exercise;
    state.selectedFaultIndex = 0;
    state.analyzer.configure(state.exercise, { difficulty: state.difficulty, targetReps: state.targetReps });
    renderPage();
    return;
  }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  switch(action) {
    case 'open-training': setView('training'); break;
    case 'quick-demo': setView('training'); await begin('demo', null, { demoType: 'standard' }); break;
    case 'start-demo': await begin('demo', null, { demoType: state.demoType || 'standard' }); break;
    case 'start-demo-standard': {
      if (state.mode === 'demo') {
        if (state.demoType === 'standard') {
          // Already running standard demo -> clicking it cleanly ends demonstration
          stopRealtime();
          state.mode = null;
          state.paused = false;
          state.analyzer?.resetIncompleteRep();
          refreshModeUI();
          updateTrainingUI();
          inform('已结束动作示范。点击下方「启动 AI 摄像头」或「本地视频评测」可开始正式训练。');
          modelMessage('动作示范已结束。请选择启动 AI 摄像头或本地视频进行正式训练。', 'info');
          drawIdle(document.querySelector('#poseCanvas'));
          toast('已结束姿势示范');
          break;
        }
        state.demoType = 'standard';
        state.analyzer?.resetIncompleteRep();
        state.startPerf = performance.now();
        state.pauseDuration = 0;
        updateDemoGuideUI();
        refreshModeUI();
        inform('已切换为：正确姿势规范示范（100% 达标深度）。');
        modelMessage('当前运行的是「正确姿势规范示范」，不调用 AI 模型。用于展示标准生物力学动作深度与计数闭环。', 'demo');
      } else if (!state.mode) {
        await begin('demo', null, { demoType: 'standard' });
      } else {
        toast('请先结束当前训练');
      }
      break;
    }
    case 'start-demo-fault': {
      if (state.mode === 'demo') {
        if (state.demoType === 'fault') {
          // Already running fault demo -> clicking it cleanly ends demonstration
          stopRealtime();
          state.mode = null;
          state.paused = false;
          state.analyzer?.resetIncompleteRep();
          refreshModeUI();
          updateTrainingUI();
          inform('已结束错误演示。点击下方「启动 AI 摄像头」或「本地视频评测」可开始正式训练。');
          modelMessage('常见错误演示已结束。请选择启动 AI 摄像头或本地视频进行正式训练。', 'info');
          drawIdle(document.querySelector('#poseCanvas'));
          toast('已结束错误演示');
          break;
        }
        state.demoType = 'fault';
        state.analyzer?.resetIncompleteRep();
        state.startPerf = performance.now();
        state.pauseDuration = 0;
        updateDemoGuideUI();
        refreshModeUI();
        const guide = EXERCISE_GUIDES[state.exercise] || EXERCISE_GUIDES.squat;
        const f = guide.faults[state.selectedFaultIndex] || guide.faults[0];
        inform(`已切换为常见错误演示：【${f.name}】。`);
        modelMessage(`当前运行的是「常见错误演示 · ${f.shortName}」，不调用 AI 模型。用于直观展示代偿动作与 AI 警报判定。`, 'demo');
      } else if (!state.mode) {
        await begin('demo', null, { demoType: 'fault' });
      } else {
        toast('请先结束当前训练');
      }
      break;
    }
    case 'switch-demo-tab': {
      const tab = event.target.closest('[data-tab]')?.dataset.tab || 'standard';
      state.demoType = tab;
      if (state.mode === 'demo') {
        state.analyzer?.resetIncompleteRep();
        state.startPerf = performance.now();
        state.pauseDuration = 0;
      }
      updateDemoGuideUI();
      refreshModeUI();
      if (state.mode === 'demo') {
        if (tab === 'fault') {
          const guide = EXERCISE_GUIDES[state.exercise] || EXERCISE_GUIDES.squat;
          const f = guide.faults[state.selectedFaultIndex] || guide.faults[0];
          inform(`已切换为常见错误演示：【${f.name}】。`);
          modelMessage(`当前运行的是「常见错误演示 · ${f.shortName}」，不调用 AI 模型。`, 'demo');
        } else {
          inform('已切换为：正确姿势规范示范。');
          modelMessage('当前运行的是「正确姿势规范示范」，不调用 AI 模型。', 'demo');
        }
      }
      break;
    }
    case 'select-fault': {
      const idx = parseInt(event.target.closest('[data-fault-index]')?.dataset.faultIndex, 10) || 0;
      state.selectedFaultIndex = idx;
      state.demoType = 'fault';
      if (state.mode === 'demo') {
        state.analyzer?.resetIncompleteRep();
        state.startPerf = performance.now();
        state.pauseDuration = 0;
      }
      updateDemoGuideUI();
      refreshModeUI();
      const guide = EXERCISE_GUIDES[state.exercise] || EXERCISE_GUIDES.squat;
      const f = guide.faults[idx] || guide.faults[0];
      if (state.mode === 'demo') {
        inform(`已切换演示错误：【${f.name}】。`);
        modelMessage(`当前演示错误：【${f.name}】。`, 'demo');
      } else {
        toast(`已选择错误剖析：${f.shortName}`);
      }
      break;
    }
    case 'start-camera': await begin('camera'); break;
    case 'select-video': {
      const fileInput = document.querySelector('#videoFileInput');
      if (fileInput) fileInput.click();
      break;
    }
    case 'pause': togglePause(); break;
    case 'end': {
      if (state.mode === 'demo') {
        const label = state.demoType === 'fault' ? '错误演示' : '动作示范';
        stopRealtime();
        state.mode = null;
        state.paused = false;
        state.analyzer?.resetIncompleteRep();
        refreshModeUI();
        updateTrainingUI();
        inform(`已结束${label}。点击下方「启动 AI 摄像头」或「本地视频评测」可开始正式训练。`);
        modelMessage(`${label}已结束。请选择启动 AI 摄像头或本地视频进行正式训练。`, 'info');
        drawIdle(document.querySelector('#poseCanvas'));
        toast(`已结束${label}`);
        break;
      }
      let manualCount = null;
      try {
        const input = window.prompt('本次训练结束。如需记录课程对照实验，请输入人工核验的实际有效达标次数（必须为非负整数，留空或取消则不记录）：', '');
        if (input !== null && input.trim() !== '') {
          const trimmed = input.trim();
          if (/^\d+$/.test(trimmed)) {
            const val = parseInt(trimmed, 10);
            if (val >= 0 && val <= 10000) {
              manualCount = val;
            }
          }
        }
      } catch {}
      finishSession(manualCount);
      setView('reports');
      break;
    }
    case 'test-voice': {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance('AI 健身教练语音助手已就绪，将在动作达标或姿态异常时即时提醒。');
        u.lang = 'zh-CN'; u.rate = 1.05;
        window.speechSynthesis.speak(u);
        toast('正在播放测试语音…');
      } else {
        toast('当前浏览器环境不支持语音合成');
      }
      break;
    }
    case 'export-csv': {
      const sessions = loadSessions();
      if (!sessions.length) { toast('暂无记录可导出'); break; }
      const csv = exportSessionsCSV(sessions);
      downloadFile(csv, `aifit-sessions-${new Date().toISOString().slice(0,10)}.csv`, 'text/csv;charset=utf-8;');
      toast('已导出实验数据 CSV 表格');
      break;
    }
    case 'export-json': {
      const sessions = loadSessions();
      if (!sessions.length) { toast('暂无记录可导出'); break; }
      const json = exportSessionsJSON(sessions);
      downloadFile(json, `aifit-sessions-${new Date().toISOString().slice(0,10)}.json`, 'application/json');
      toast('已导出实验数据 JSON');
      break;
    }
    case 'clear-history':
      if (window.confirm('确定清空本机所有训练记录吗？这个操作不能撤销。')) {
        clearSessions(); state.lastSession=null; renderPage(); toast('本机记录已清空');
      } break;
  }
});
document.addEventListener('change', event=>{
  const id=event.target.id; const value=event.target.value;
  if(id==='goalInput') state.goal=value;
  if(id==='fatigueInput') state.fatigue=value;
  if(id==='voiceToggle') state.voice=event.target.checked;
  if(id==='facingSelect') state.facing=value;
  if(id==='difficultySelect') {
    state.difficulty = value;
    state.analyzer.configure(state.exercise, { difficulty: state.difficulty, targetReps: state.targetReps });
    updateTrainingUI();
  }
  if(id==='targetRepsSelect') {
    state.targetReps = Number(value);
    state.analyzer.configure(state.exercise, { difficulty: state.difficulty, targetReps: state.targetReps });
    updateTrainingUI();
  }
  if(id==='videoFileInput') {
    const file = event.target.files?.[0];
    if (file) begin('video', file);
    event.target.value = '';
  }
});
window.addEventListener('keydown', event => {
  if (event.code === 'Space' && state.view === 'training' && state.mode) {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    event.preventDefault();
    togglePause();
  }
});
window.addEventListener('beforeunload',stopRealtime);
shell();
