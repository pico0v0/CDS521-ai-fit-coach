import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateLocalDeterministicPlan,
  PRESET_PROFILES,
  VISION_MAP,
  STATIC_EXERCISES,
  STATIC_FOODS,
  formatExplanationMarkdown
} from '../src/planner.js';

test('planner: static catalog and vision map sanity', () => {
  assert.ok(STATIC_EXERCISES.length >= 10, 'Exercises catalog should have at least 10 exercises');
  assert.ok(STATIC_FOODS.length >= 10, 'Foods catalog should have at least 10 foods');
  assert.ok(VISION_MAP.squat, 'Squat must be in vision map');
  assert.ok(VISION_MAP.pushup, 'Pushup must be in vision map');
  assert.ok(VISION_MAP.lunge, 'Lunge must be in vision map');
  assert.ok(VISION_MAP.jumping_jacks, 'Jumping jacks must be in vision map');
});

test('planner: deterministic plan generates full 7-day schedule with exact session count', () => {
  const profile = {
    age: 25,
    height_cm: 175,
    weight_kg: 68.0,
    goal: '减脂',
    experience: '初学者',
    equipment: '徒手',
    available_days: ['周一', '周三', '周五'],
    sessions: 3,
    allergies: [],
    exclude_foods: []
  };

  const plan = generateLocalDeterministicPlan(profile);
  assert.equal(plan.week.length, 7, 'Week plan must contain 7 days');

  const workoutDays = plan.week.filter(d => d.workout !== null);
  assert.equal(workoutDays.length, 3, 'Must have exactly 3 workout days');

  const restDays = plan.week.filter(d => d.workout === null);
  assert.equal(restDays.length, 4, 'Must have exactly 4 rest days');

  // Verify all workout days belong to available_days
  workoutDays.forEach(d => {
    assert.ok(profile.available_days.includes(d.day), `${d.day} should be an available day`);
    assert.ok(d.workout.exercise_ids.length >= 3, 'Workout should have at least 3 exercises');
  });

  // Verify all days have 3 meals with valid macros
  plan.week.forEach(d => {
    assert.ok(d.meals['早餐'], 'Must have 早餐');
    assert.ok(d.meals['午餐'], 'Must have 午餐');
    assert.ok(d.meals['晚餐'], 'Must have 晚餐');
    const dayKcal = Object.values(d.meals).reduce((sum, m) => sum + m.nutrition.kcal, 0);
    assert.ok(dayKcal > 1000, `Day kcal (${dayKcal}) should be greater than 1000`);
  });
});

test('planner: equipment filtering respects user environment (徒手)', () => {
  const profile = {
    age: 22,
    height_cm: 165,
    weight_kg: 55.0,
    goal: '塑形',
    experience: '初学者',
    equipment: '徒手',
    available_days: ['周二', '周四'],
    sessions: 2,
    allergies: [],
    exclude_foods: []
  };

  const plan = generateLocalDeterministicPlan(profile);
  const exMap = Object.fromEntries(STATIC_EXERCISES.map(e => [e.id, e]));

  plan.week.filter(d => d.workout).forEach(d => {
    d.workout.exercise_ids.forEach(eid => {
      const ex = exMap[eid];
      assert.ok(ex, `Exercise ${eid} should exist in catalog`);
      assert.equal(ex.equipment, '徒手', `Exercise ${ex.name} must be 徒手`);
    });
  });
});

test('planner: allergen exclusion strictly filters out banned allergens', () => {
  const profile = {
    age: 30,
    height_cm: 180,
    weight_kg: 75.0,
    goal: '减脂',
    experience: '初学者',
    equipment: '哑铃',
    available_days: ['周一', '周三', '周五'],
    sessions: 3,
    allergies: ['乳制品', '鸡蛋'],
    exclude_foods: []
  };

  const plan = generateLocalDeterministicPlan(profile);
  const foodMap = Object.fromEntries(STATIC_FOODS.map(f => [f.id, f]));

  plan.week.forEach(d => {
    Object.values(d.meals).forEach(m => {
      m.ingredients.forEach(ing => {
        const food = foodMap[ing.food_id];
        assert.ok(food, `Food ${ing.food_id} should exist in catalog`);
        const hasDairy = food.allergens.includes('乳制品');
        const hasEgg = food.allergens.includes('鸡蛋');
        assert.ok(!hasDairy, `Food ${food.name} must not contain dairy`);
        assert.ok(!hasEgg, `Food ${food.name} must not contain egg`);
      });
    });
  });
});

test('planner: formatExplanationMarkdown trims and preserves markdown', () => {
  const text = '### 🏋️ 训练计划\n- 动作要领';
  const formatted = formatExplanationMarkdown(text);
  assert.equal(formatted, text);
});
