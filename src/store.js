const KEY = 'aifit-demo-sessions-v1';
const MAX = 40;

export function loadSessions(storage = globalThis.localStorage) {
  try {
    const records = JSON.parse(storage.getItem(KEY) || '[]');
    if (!Array.isArray(records)) return [];
    return records.filter(r => typeof r === 'object' && r &&
      Number.isFinite(r.count) && Number.isFinite(r.durationSeconds) &&
      typeof r.id === 'string' && ['squat', 'curl'].includes(r.exercise))
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
  if (record.partialCount > record.count && record.partialCount > 0) return '这次有较多未达到演示幅度阈值的动作。建议先确认拍摄机位、降低练习难度，再逐步提高动作控制能力。';
  if (record.count === 0) return '这次没有记录到完整动作。请先检查全身或目标上肢是否入镜，并用慢节奏尝试几次完整动作。';
  const goals = { habit: '保持规律练习', strength: '优先掌握稳定、可重复的动作', endurance: '逐步建立可持续的运动习惯' };
  return `本次记录 ${record.count} 次完整动作。建议下次继续${goals[goal] || goals.habit}；可维持相近训练量，根据实际感受逐步调整。视频检测并非专业动作诊断。`;
}
