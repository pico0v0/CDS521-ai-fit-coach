const KEY = 'aifit-demo-sessions-v1';
const MAX = 40;

export function loadSessions(storage = globalThis.localStorage) {
  try {
    const records = JSON.parse(storage.getItem(KEY) || '[]');
    if (!Array.isArray(records)) return [];
    return records.filter(r => typeof r === 'object' && r &&
      Number.isFinite(r.count) && Number.isFinite(r.durationSeconds) &&
      typeof r.id === 'string' && ['squat', 'curl', 'jumping_jack'].includes(r.exercise))
      .slice(0, MAX);
  } catch { return []; }
}
export function saveSession(record, storage = globalThis.localStorage) {
  const records = [record, ...loadSessions(storage)].slice(0, MAX);
  try { storage.setItem(KEY, JSON.stringify(records)); return true; }
  catch { return false; }
}
export function clearSessions(storage = globalThis.localStorage) {
  try { storage.removeItem(KEY); return true; }
  catch { return false; }
}
export function makeAdvice(record, goal, fatigue) {
  if (fatigue === 'high') return '你反馈当前较疲劳。建议先休息和恢复，下一次训练不增加训练量；若有疼痛或不适，应停止相关动作并寻求专业帮助。';
  if (record.count === 0) return '这次没有记录到完整动作。请先检查全身或目标肢体是否入镜，并用慢节奏尝试几次完整动作。';

  const faultNotes = [];
  if (record.faultCounts?.trunk_lean > 0) {
    faultNotes.push('训练中检测到躯干前倾倾向，建议练习时收紧腹背核心、目视前方');
  }
  if (record.faultCounts?.arm_swing > 0) {
    faultNotes.push('训练中检测到手肘前后借力，建议减轻负重并让大臂紧贴肋侧');
  }
  if (record.faultCounts?.arm_asymmetry > 0) {
    faultNotes.push('训练中检测到双臂起落不对称，建议起跳时控制双臂同步向上舒展');
  }

  if (record.partialCount > record.count && record.partialCount > 0) {
    const note = faultNotes.length ? `同时${faultNotes.join('，')}。` : '';
    return `这次有较多未达到演示幅度阈值的动作。建议先确认拍摄机位、降低练习难度，再逐步提高动作控制能力。${note}`;
  }

  const goals = { habit: '保持规律练习', strength: '优先掌握稳定、可重复的动作', endurance: '逐步建立可持续的运动习惯' };
  const faultSuffix = faultNotes.length ? `【姿态优化建议】${faultNotes.join('；')}。` : '';
  return `本次记录 ${record.count} 次完整动作。建议下次继续${goals[goal] || goals.habit}；可维持相近训练量，根据实际感受逐步调整。${faultSuffix}视频检测并非专业动作诊断。`;
}

export function computeMaeStats(sessions = []) {
  const realEvaluated = (sessions || []).filter(s =>
    (s.mode === 'camera' || s.mode === 'video') &&
    typeof s.count === 'number' && Number.isInteger(s.count) && s.count >= 0 &&
    typeof s.manualCount === 'number' && Number.isInteger(s.manualCount) && s.manualCount >= 0 &&
    typeof s.trackedFrames === 'number' && Number.isFinite(s.trackedFrames) && s.trackedFrames >= 5
  ).map(s => ({
    ...s,
    // Strictly compute verified non-negative absolute error from verified count and manualCount
    verifiedAbsError: Math.abs(s.count - s.manualCount)
  }));

  const demoEvaluated = (sessions || []).filter(s =>
    s.mode === 'demo' &&
    typeof s.count === 'number' && Number.isInteger(s.count) && s.count >= 0 &&
    typeof s.manualCount === 'number' && Number.isInteger(s.manualCount) && s.manualCount >= 0
  ).map(s => ({
    ...s,
    verifiedAbsError: Math.abs(s.count - s.manualCount)
  }));

  const realMae = realEvaluated.length
    ? Number((realEvaluated.reduce((sum, s) => sum + s.verifiedAbsError, 0) / realEvaluated.length).toFixed(2))
    : null;
  const demoMae = demoEvaluated.length
    ? Number((demoEvaluated.reduce((sum, s) => sum + s.verifiedAbsError, 0) / demoEvaluated.length).toFixed(2))
    : null;

  return {
    realMae,
    realCount: realEvaluated.length,
    demoMae,
    demoCount: demoEvaluated.length
  };
}

export function exportSessionsCSV(sessions) {
  const headers = ['ID', '训练时间', '动作名称', '动作代码', '运行模式', '跟踪有效帧数', '系统有效次数', '未达幅度次数', '人工核验达标次数', '绝对误差', '躯干前倾次数', '大臂借力次数', '双臂不对称次数', '训练时长(秒)', '训练目标', '主观疲劳'];
  const rows = (sessions || []).map(s => [
    s.id,
    s.startedAt,
    s.exercise === 'squat' ? '深蹲' : (s.exercise === 'curl' ? '哑铃弯举' : '开合跳'),
    s.exercise,
    s.mode === 'demo' ? '模拟演示' : (s.mode === 'video' ? '本地视频AI' : '真实摄像头'),
    s.trackedFrames || 0,
    s.count,
    s.partialCount || 0,
    Number.isFinite(s.manualCount) ? s.manualCount : '',
    Number.isFinite(s.absError) ? s.absError : '',
    s.faultCounts?.trunk_lean || 0,
    s.faultCounts?.arm_swing || 0,
    s.faultCounts?.arm_asymmetry || 0,
    s.durationSeconds,
    s.goal || 'habit',
    s.fatigue || 'normal'
  ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));

  // Prepend UTF-8 BOM so Excel opens Chinese text properly
  return '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
}

export function exportSessionsJSON(sessions) {
  return JSON.stringify(sessions || [], null, 2);
}
