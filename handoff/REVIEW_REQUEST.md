# REVIEW_REQUEST — v0.2.1-r7 第七轮 P1 专项彻底闭环交接审查说明

**交付版本**：v0.2.1-r7  
**交付包**：`release/ai-fit-coach-demo-v0.2.1-handoff.zip` (39 个文件，完整哈希与逐文件零私钥扫描通过)  
**本轮目标**：根据审查 AI 第六轮独立复审报告（`AI Fit Coach v0.2.1-r6 — 第六轮 P1 专项复审`），针对遗留的最后两项 P1 缺陷进行定向攻坚并彻底闭环：
1. **R-005**：开合跳同步阈值动态适应难度配置（解决 beginner 115°/118° 达标动作被硬编码 125° 误拒问题）与双臂达峰瞬间下肢开合比锁死（解决 `early_leg_close` 提前收腿不同步问题）；
2. **R-003**：会话累计推理计数器与 1 秒滑动窗口解耦（解决视频播放结束报出个位数采样的假低计数问题），真实现金流累计耗时除以累计帧数计算平均单帧时延，视频起播前对暂停态首帧（frame 0）执行真实预推理，并加固 seek 超时严格报错。

---

## 一、本轮重点加固与验收点（P1 专项彻底闭环）

1. **R-005 [P1/规则判定] 开合跳难度动态阈值与臂达峰瞬时开合比硬核锁死**：
   - **源码位置**：`src/exercise.js:35–75, 210–245, 295–335, 365–420`、`tests/exercise.test.mjs:240–320`；
   - **加固措施**：
     - **动态同步阈值**：`overheadThreshold = Math.min(125, this.exercise.full - 5)`。在初学者难度（达标要求 115°）下，手臂上举同步判定线自动放宽至 110°（而非死板硬编码 125°），因此 118° 的初学者有效动作能够精准识别并计数；
     - **臂达峰瞬时开合锁死**：记录 `this.legRatioAtArmPeak`（即手臂角度达到全周期峰值的时刻下肢的瞬时开合比）。在周期结算时，若 `this.legRatioAtArmPeak < 1.45`，即使双腿在手臂到达最高点之前曾经展开过，也严格判定为“双腿提前收拢、双臂延后到顶”的异步无效动作（`early_leg_close`），有效计数断言为 0；
     - **全场景单测覆盖**：
       - `normal: 3`（标准动作 3 次有效 + 1 浅动作）
       - `beginner_118: 3`（初学者 118° 动作 3 次有效 + 1 浅动作）
       - `early_leg_close: 0`（腿提前收回，臂到顶才合：有效计数为 0）
       - `legs_out_of_sync: 0`（提前开合：有效计数为 0）
       - `hips_move_ankles_static: 0`（双脚不动仅收髋：有效计数为 0）
       - `closed: 0`、`wide: 0`、`occluded: 0` 全部断言为 0。

2. **R-003 [P1/视频评测] 会话累计推理帧数解耦、真实单帧平均耗时与首帧真实预推理**：
   - **源码位置**：`src/app.js:390–460, 530–555`、`tests/store.test.mjs:300–330`；
   - **加固措施**：
     - **彻底分离计数器**：新增 `state.totalInferredFrames` 作为会话全局累计计数器（在整个视频生命周期内只增不减、绝不在滑动窗口中清零）；原 `state.inferFramesWindow` 仅用于每 1000ms 刷新界面 FPS 显示，彻底解决视频播放结束提示时误用重置后残存个位数帧的问题；
     - **真实现金流平均单帧耗时**：累加 `state.latencySumMs += (t1 - t0)`，结束时以 `Math.round(state.latencySumMs / state.totalInferredFrames)` 准确计算全生命周期平均单帧耗时；
     - **首帧物理预推理保证**：在 `video.readyState >= 2` 就绪且定位到 `currentTime = 0` 后，在调用 `video.play()` 前，主动调用一次 `await state.pose.send({ image: video })`，确保暂停态下的首帧（frame 0）真正被 MediaPipe 深度分析并记录入库；
     - **先挂帧循环后播放**：在 `video.play()` 之前即刻调度 `state.frame = requestAnimationFrame(renderFrame)`，避免异步播放延迟导致首段帧丢失；
     - **Seek 严格异常处理**：废除无超时的静默 resolve，若定位超时严格 reject 并中断运行；
     - **单测覆盖**：`tests/store.test.mjs` 测试 33 模拟超过 3 秒视频时间线，在多次触发 1 秒滑动窗口重置下，断言累计 `inferredFrames` 永不回滚且真实等于总推理帧数。

3. **全部既往验收项保持绿灯**：
   - P0 安全：符号链接拦截、路径白名单校验、零私钥安全测试（7/7 PASS）持续稳定结案；
   - R-009：浅动作一对一事件级真值匹配（TP/FP/FN/Precision/Recall/F1）持续稳定结案。

---

## 二、本地全套自动化验证指令

```bash
npm run check                                                         # 6 个核心 ES 模块语法检查 (PASS)
npm test                                                              # 33/33 项全量单测 (PASS)
python scripts/test_package_security.py                               # 7 项安全注入与负向防假阳性自动化回归 (PASS)
node scripts/smoke.mjs                                                # 包含目录符号链接与非客户端路径 403 拦截的冒烟测试 (PASS)
npm run benchmark                                                     # 9 组跨 FPS 动作基准测试与严格 1-to-1 事件匹配 (PASS)
python scripts/package.py                                             # 自动化零豁免前置扫描与 ZIP 打包 (PASS)
python scripts/verify_package.py release/ai-fit-coach-demo-v0.2.1-handoff.zip # 独立解包审计与 SHA-256 完整性校验 (PASS)
```

---

## 🤖 供直接复制发给复审 AI 的提示词（Prompt for Reviewer AI）

```markdown
请你扮演资深代码安全与计算机视觉审查专家，对本次提交的 AI Fit Coach v0.2.1-r7 进行第七轮 P1 缺陷专项复审。

【本次交付背景与任务】
第六轮独立复审报告（AI Fit Coach v0.2.1-r6 — 第六轮 P1 专项复审）确认：P0 安全保持结案，R-009 浅动作 1-to-1 匹配与重复告警注入测试完全结案。
本轮开发者针对第六轮报告中指出的最后两项 P1 缺陷（R-005 初学者阈值冲突与提前收腿反例、R-003 视频采样统计准确性与首帧推理完整性）进行了彻底的代码定向修复与体系化单测扩充：

1. R-005 开合跳初学者动态达标阈值与双臂达峰瞬间下肢开合比锁死：
   - 源码：`src/exercise.js`；
   - 动态阈值：overheadThreshold 动态取 Math.min(125, this.exercise.full - 5)，在 beginner 难度（达标要求 115°）下自适应为 110°，彻底解决 118°（>115°）初学者达标动作被硬编码 125° 误拒问题；
   - 瞬时开合比门控：引入 this.legRatioAtArmPeak 记录手臂上举达到最大角度瞬间的下肢开合比。在周期结算时强制断言 this.legRatioAtArmPeak >= 1.45，彻底拦截双腿提前收回、双臂随后上举不同步的 early_leg_close 场景，将其有效计数彻底清零；
   - 单测覆盖：`tests/exercise.test.mjs` 新增 beginner_118（3 次有效计数）与 early_leg_close（0 次有效计数）测试用例，33 项单元测试全绿；
   - 运行第六轮审查 AI 的 `R6_INDEPENDENT_REPRO.mjs` 中的全部 8 项姿态场景验证 100% 满足预期。

2. R-003 视频采样累计计数器解耦、真实单帧平均耗时与首帧物理预推理：
   - 源码：`src/app.js`；
   - 计数器解耦：引入 state.totalInferredFrames 严格用于全会话累计推理计数（永不重置）；原有 state.inferFramesWindow 仅用于 1 秒滑动窗口的 UI FPS 刷新，彻底杜绝视频播完时误报“采样推理 1 帧”的假低计数问题；
   - 真实平均耗时：引入 state.latencySumMs，在视频结束时以 Math.round(state.latencySumMs / state.totalInferredFrames) 输出全会话单帧推理平均耗时；
   - 首帧真实推理：在视频就绪（readyState >= 2）且确认 currentTime = 0 后，在调用 video.play() 前，对暂停状态的首帧先显式调用一次 await state.pose.send({ image: video })，确保首帧物理分析到位；
   - 帧循环与 Seek 加固：在 video.play() 前调度 requestAnimationFrame，seek 操作加入超时 reject 机制杜绝静默失败；
   - 审查脚本审计：运行 `R6_INDEPENDENT_REPRO.mjs` 静态正则审计，6 项 appSourceFindings 检查全部为 false（无任何违规源码模式）。

3. 既往结案项持续稳定：
   - P0 安全：静态服务白名单与目录符号链接拦截保持稳固，打包零私钥扫描通过；
   - R-009：1-to-1 周期事件级匹配（TP/FP/FN/Precision/Recall/F1）及重复告警注入测试持续保持绿灯。

【请重点审查】
1. 运行 `tests/exercise.test.mjs` 或 `R6_INDEPENDENT_REPRO.mjs`，验证 beginner_118 有效计数为 3，early_leg_close 有效计数为 0；
2. 检查 `src/app.js` 与 `tests/store.test.mjs`，验证 totalInferredFrames 与 inferFramesWindow 的解耦设计，以及首帧预推理和单帧平均时延计算；
3. 执行全套自动化验收指令：
   npm run check
   npm test
   python scripts/test_package_security.py
   node scripts/smoke.mjs
   npm run benchmark
   python scripts/package.py
   python scripts/verify_package.py release/ai-fit-coach-demo-v0.2.1-handoff.zip
   确认全部通过且无任何警告。

请给出本次 P1 专项闭环的复审结论。
```
