/**
 * FitMind AI — 原生智能健身与饮食规划子系统
 * 纯原生单页应用集成：用户画像输入、多模型/确定性规则规划、7天周排期总览、AI视觉一键跟练联动、自然语言局部重排 (Replanner)。
 */

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export const PRESET_PROFILES = {
  'custom': {
    title: '自定义输入',
    age: 24, height_cm: 172, weight_kg: 66.0, goal: '减脂',
    experience: '初学者', equipment: '哑铃', sessions: 3,
    available_days: ['周一', '周三', '周五'], allergies: [], exclude_foods: []
  },
  'P01': {
    title: '【预设】P01: 徒手/初学减脂 (无过敏)',
    age: 21, height_cm: 161, weight_kg: 56.0, goal: '减脂',
    experience: '初学者', equipment: '徒手', sessions: 2,
    available_days: ['周一', '周三'], allergies: [], exclude_foods: []
  },
  'P05': {
    title: '【预设】P05: 健身房/减脂进阶',
    age: 25, height_cm: 165, weight_kg: 60.0, goal: '减脂',
    experience: '初学者', equipment: '健身房', sessions: 3,
    available_days: ['周一', '周三', '周五'], allergies: [], exclude_foods: []
  },
  'P15': {
    title: '【预设】P15: 健身房/增肌进阶 (高频次)',
    age: 35, height_cm: 175, weight_kg: 70.0, goal: '增肌',
    experience: '有经验', equipment: '健身房', sessions: 4,
    available_days: ['周一', '周二', '周四', '周六'], allergies: [], exclude_foods: []
  },
  'E01': {
    title: '【预设】E01: 乳制品过敏特殊样本',
    age: 21, height_cm: 161, weight_kg: 56.0, goal: '减脂',
    experience: '初学者', equipment: '徒手', sessions: 2,
    available_days: ['周一', '周三'], allergies: ['乳制品'], exclude_foods: []
  },
  'E06': {
    title: '【预设】E06: 鸡蛋过敏 + 排除鸡肉与牛肉',
    age: 26, height_cm: 166, weight_kg: 61.0, goal: '减脂',
    experience: '有经验', equipment: '健身房', sessions: 2,
    available_days: ['周一', '周三'], allergies: ['鸡蛋'], exclude_foods: ['chicken', 'beef']
  }
};

export const VISION_MAP = {
  'squat': { id: 'squat', name: '徒手深蹲' },
  'pushup': { id: 'pushup', name: '标准俯卧撑' },
  'lunge': { id: 'lunge', name: '弓步蹲' },
  'jumping_jacks': { id: 'jumping_jack', name: '开合跳' },
  'jumping_jack': { id: 'jumping_jack', name: '开合跳' },
  'bicep_curl': { id: 'curl', name: '哑铃弯举' },
  'curl': { id: 'curl', name: '哑铃弯举' }
};

export const HEALTH_TIPS = [
  { title: '💡 减脂能量赤字法则', text: '减脂的核心是创造温和的热量缺口（300-500 kcal）。绝不可盲目零碳水断食，优质复合碳水能保护甲状腺代谢率与瘦素分泌，预防代谢适应性下降。' },
  { title: '🏋️ 动作质量与离心张力', text: '在力量训练中，离心阶段保持 2-3 秒受控下落对肌原纤维的机械张力刺激提升 40% 以上，同时极大降低关节与韧带的代偿损伤。' },
  { title: '🥩 蛋白质代谢黄金窗口', text: '单餐摄入 20-35g 优质蛋白（含充足亮氨酸）即可充分触发肌肉蛋白合成通路 (MPS)，分摊至三餐摄入比单次大量暴饮暴食更利于吸收。' },
  { title: '💧 细胞水合与肌糖原', text: '人体每储存 1g 肌糖原需要结合约 3g 水分。每日保持充足饮水（约 30-35ml/kg），不仅能优化细胞饱满度，还能提升力量耐力约 15%。' },
  { title: '🛌 深度睡眠与荷尔蒙修复', text: '健身房里的训练只是向肌体发出破坏与超量恢复信号，真正的肌纤维微创修复和体脂分解发生在深度睡眠中的生长激素分泌高峰期。' },
  { title: '⏱️ 组间休息的生理机制', text: '复合多关节动作建议间歇 75-90 秒，既能保证三磷酸腺苷 (ATP) 与磷酸肌酸 (CP) 充分再合成，又能维持高密度荷尔蒙刺激。' },
  { title: '🥑 必需脂肪酸的内分泌作用', text: '脂肪摄入不应低于每日总热量的 20%。优质不饱和脂肪酸（来自坚果、橄榄油等）是维持睾酮、雌激素及细胞膜流动性的关键物质。' }
];

export const THINKING_STAGES = [
  [0, 10, '⚡ [生理建模] 正在计算 BMR 基础代谢率与目标能量赤字比率...'],
  [10, 25, '🏋️ [周期规划] 正在根据可用训练日构建推/拉/蹲周期化负荷链条...'],
  [25, 45, '🥗 [饮食构筑] 正在按宏量比例组合三餐食谱并严格排查过敏原...'],
  [45, 75, '📈 [负荷精调] 正在基于渐进超负荷原理规划动作组数、次数与组歇节奏...'],
  [75, 110, '🛡️ [全局整合] 正在生成 7 天结构化方案与运动科学指导建议...'],
  [110, 9999, '✨ [收敛对齐] 模型正在输出完整多维周计划数据流，即将就绪...']
];

// 内置轻量静态字典，保障离线或服务唤醒期间无阻塞立即渲染
export const STATIC_EXERCISES = [
  { id: 'squat', name: '徒手深蹲', muscle: '下肢/臀腿', equipment: '徒手', description: '屈髋屈膝下蹲，保持背部平直，双膝与脚尖同向。' },
  { id: 'pushup', name: '标准俯卧撑', muscle: '胸肌/三头', equipment: '徒手', description: '核心紧绷呈直线，屈肘使胸部接近地面后推起。' },
  { id: 'lunge', name: '弓步蹲', muscle: '下肢/臀腿', equipment: '徒手', description: '单腿向前迈出下蹲，前膝不超过脚尖，后膝接近地面。' },
  { id: 'jumping_jacks', name: '开合跳', muscle: '全身心肺', equipment: '徒手', description: '双脚开合起跳，双臂头顶拍合，膝盖微屈缓冲。' },
  { id: 'plank', name: '平板支撑', muscle: '核心肌群', equipment: '徒手', description: '肘部撑地，腹部收紧，躯干保持一条直线。' },
  { id: 'glute_bridge', name: '臀桥', muscle: '臀大肌/后链', equipment: '徒手', description: '仰卧屈膝，臀部发力顶起至髋关节充分伸展。' },
  { id: 'dumbbell_bench_press', name: '哑铃卧推', muscle: '胸肌', equipment: '哑铃', description: '仰卧推举哑铃，下落时小臂垂直地面，收紧肩胛骨。' },
  { id: 'dumbbell_row', name: '哑铃划船', muscle: '背阔肌', equipment: '哑铃', description: '俯身支撑，肘部贴紧身体后拉，感受背部肌肉收缩。' },
  { id: 'dumbbell_overhead_press', name: '哑铃推肩', muscle: '三角肌', equipment: '哑铃', description: '坐姿或站姿向上推举哑铃至手臂近乎伸直。' },
  { id: 'dumbbell_squat', name: '哑铃深蹲', muscle: '下肢/臀腿', equipment: '哑铃', description: '双手持哑铃放于体侧或胸前，规范下蹲起立。' },
  { id: 'lat_pulldown', name: '高位下拉', muscle: '背部', equipment: '健身房', description: '双手宽握把手向下拉至锁骨处，背阔肌主动收缩。' },
  { id: 'barbell_squat', name: '杠铃深蹲', muscle: '下肢/股四头肌', equipment: '健身房', description: '负重下蹲，强化核心刚性与下肢最大力量。' },
  { id: 'cable_crossover', name: '绳索夹胸', muscle: '胸肌内侧', equipment: '健身房', description: '保持肘部微屈向前环抱，维持胸肌持续张力。' }
];

export const STATIC_FOODS = [
  { id: 'oats', name: '全谷燕麦片', allergens: [], kcal: 389, protein: 16.9, carb: 66.3, fat: 6.9 },
  { id: 'milk', name: '低脂纯牛奶', allergens: ['乳制品'], kcal: 43, protein: 3.4, carb: 4.8, fat: 1.5 },
  { id: 'egg', name: '水煮鸡蛋', allergens: ['鸡蛋'], kcal: 143, protein: 12.6, carb: 0.8, fat: 9.5 },
  { id: 'chicken_breast', name: '香煎鸡胸肉', allergens: [], kcal: 133, protein: 31.0, carb: 0.0, fat: 1.0 },
  { id: 'beef', name: '牛里脊肉', allergens: [], kcal: 143, protein: 22.0, carb: 0.0, fat: 6.0 },
  { id: 'salmon', name: '三文鱼柳', allergens: ['鱼类'], kcal: 208, protein: 20.0, carb: 0.0, fat: 13.0 },
  { id: 'tofu', name: '北豆腐', allergens: ['大豆'], kcal: 84, protein: 8.1, carb: 1.9, fat: 4.2 },
  { id: 'broccoli', name: '水煮西兰花', allergens: [], kcal: 35, protein: 2.8, carb: 7.2, fat: 0.4 },
  { id: 'brown_rice', name: '蒸糙米饭', allergens: [], kcal: 111, protein: 2.6, carb: 23.0, fat: 0.9 },
  { id: 'sweet_potato', name: '清蒸红薯', allergens: [], kcal: 86, protein: 1.6, carb: 20.1, fat: 0.1 },
  { id: 'almond', name: '原味巴旦木', allergens: ['坚果'], kcal: 579, protein: 21.2, carb: 21.6, fat: 49.9 }
];

// 本地离线确定性方案构造器
export function generateLocalDeterministicPlan(profile) {
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const available = days.filter(d => profile.available_days.includes(d));
  const sessions = Math.min(profile.sessions || 3, available.length || 1);
  const workoutDays = new Set(available.slice(0, sessions));

  const rank = { '徒手': 0, '哑铃': 1, '健身房': 2 };
  const userRank = rank[profile.equipment] || 1;
  const eligibleEx = STATIC_EXERCISES.filter(e => (rank[e.equipment] || 0) <= userRank);

  const allergies = new Set(profile.allergies || []);
  const excludes = new Set(profile.exclude_foods || []);
  const safeFoods = STATIC_FOODS.filter(f => !excludes.has(f.id) && !f.allergens.some(a => allergies.has(a)));

  const safeCarbs = safeFoods.filter(f => ['oats', 'brown_rice', 'sweet_potato'].includes(f.id));
  const safeProteins = safeFoods.filter(f => ['egg', 'milk', 'chicken_breast', 'beef', 'salmon', 'tofu'].includes(f.id));
  const safeVeggies = safeFoods.filter(f => ['broccoli'].includes(f.id));

  const week = days.map((day, idx) => {
    let workout = null;
    if (workoutDays.has(day)) {
      const e1 = eligibleEx[idx % eligibleEx.length];
      const e2 = eligibleEx[(idx + 1) % eligibleEx.length];
      const e3 = eligibleEx[(idx + 2) % eligibleEx.length];
      workout = {
        exercise_ids: [e1.id, e2.id, e3.id],
        minutes: profile.experience === '初学者' ? 35 : 45,
        sets: profile.experience === '初学者' ? 3 : 4,
        notes: `${profile.goal}周期专项：注重动作离心收缩节奏，组间保持 75-90 秒间歇。`
      };
    }

    const carb = safeCarbs[idx % safeCarbs.length] || safeFoods[0];
    const protein = safeProteins[idx % safeProteins.length] || safeFoods[1];
    const veg = safeVeggies[0] || safeFoods[2];
    const nutFood = safeFoods.find(f => f.id === 'almond') || safeFoods[0];

    const makeMeal = (slot, name, cG, pG, vG, nG = 15) => {
      const ing = [
        { food_id: carb.id, grams: cG },
        { food_id: protein.id, grams: pG },
        { food_id: veg.id, grams: vG }
      ];
      if (nG > 0 && nutFood) {
        ing.push({ food_id: nutFood.id, grams: nG });
      }
      let kcal = 0, p = 0, c = 0, f = 0;
      ing.forEach(item => {
        const food = safeFoods.find(x => x.id === item.food_id) || carb;
        kcal += (food.kcal * item.grams) / 100;
        p += (food.protein * item.grams) / 100;
        c += (food.carb * item.grams) / 100;
        f += (food.fat * item.grams) / 100;
      });
      return {
        id: `${slot}_${idx}`,
        name,
        ingredients: ing,
        nutrition: {
          kcal: Math.round(kcal),
          protein: Math.round(p * 10) / 10,
          carb: Math.round(c * 10) / 10,
          fat: Math.round(f * 10) / 10
        }
      };
    };

    return {
      day,
      workout,
      meals: {
        '早餐': makeMeal('breakfast', '活力复合能量早膳', 100, 150, 80, 15),
        '午餐': makeMeal('lunch', '均衡高蛋白优质午餐', 180, 200, 150, 15),
        '晚餐': makeMeal('dinner', '低卡轻盈修护晚餐', 150, 180, 150, 10)
      }
    };
  });

  return {
    mode: 'local_rule_demo',
    profile: JSON.parse(JSON.stringify(profile)),
    week,
    explanation: `### 🏋️ 训练周期化设计与负荷策略\n- 本周共排期 **${sessions} 次训练**，重点针对 ${profile.equipment} 环境进行动作编排。\n- 建议训练日遵循 **热身 5 分钟 ➔ 主项复合动作 ➔ 离心受控 ➔ 拉伸放松** 流程。\n\n### 🥗 营养与热量赤字策略\n- 目标定位为 **【${profile.goal}】**，每日总热量控制在建议代谢窗口内。\n- 蛋白质全天均匀分布于三餐，有效触发肌原纤维超量合成 (MPS)。\n\n### 🍳 食材称重与烹饪执行口径\n- 荤素食材克重均为生重净重口径。\n- 推荐少油少盐水煮、清蒸或慢火轻煎，严格避免油炸与高糖调味。\n\n### 🛌 身体恢复与安全提示\n- 非训练日为肌肉神经超量恢复期，保证每日 7-8 小时深度睡眠，充足饮水 2000ml 以上。`
  };
}

export function formatExplanationMarkdown(text) {
  if (!text) return '';
  return text.trim();
}
