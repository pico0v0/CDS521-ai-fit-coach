# REVIEW_REQUEST — v0.2.1-r8 第八轮 P1 专项彻底闭环交接审查说明

**交付版本**：v0.2.1-r8  
**交付包**：`release/ai-fit-coach-demo-v0.2.1-handoff.zip` (39 个文件，完整哈希与逐文件零私钥扫描通过)  
**本轮目标**：根据审查 AI 第七轮独立复审报告（`AI Fit Coach v0.2.1-r7 — 第七轮 P1 专项复审`）及返修指令（`NEXT_AI_R8_FIX_PROMPT.md`），定向修复 R-003 遗留的最后两项 P1 缺陷，实现 P1 专项全量彻底闭环：
1. **P1-R003-01**：消除首帧 `trackedFrames` 重复累加缺陷（统一交由 `onResult` 单一入口计数）；
2. **P1-R003-02**：首帧预推理失败不可伪成功（消除静默 warn 漏洞，抛出异常阻断 `video.play()`、清空状态并向用户报错）；
3. **P2-R003-03**：视频首帧加载增设 10 秒超时防护与事件清理，杜绝悬挂 Promise；
4. **单测扩充**：在 `tests/store.test.mjs` 中新增测试 34，真实调用 `begin('video')` 业务路径（覆盖首帧 1 人、首帧 0 人、首帧抛错、35 帧多帧模拟等 4 大场景）。

---

## 一、本轮重点加固与验收点（R-003 专项彻底闭环）

1. **P1-R003-01 [P1/统计准确性] 消除首帧 `trackedFrames` 重复累加**：
   - **源码位置**：`src/app.js:450–475`、`tests/store.test.mjs:200–280`；
   - **加固措施**：
     - 移除首帧检测成功后手动的 `if (firstLandmarks?.length) state.trackedFrames = (state.trackedFrames || 0) + 1;`；
     - 统一交由 `onResult(firstLandmarks, performance.now())` 唯一入口处理人体有效姿态检出与计数；
     - **验收指标**：首帧检出 1 个人体时，严格满足 `totalInferredFrames = 1, trackedFrames = 1`；首帧无人体（空 landmarks）时，严格满足 `totalInferredFrames = 1, trackedFrames = 0`，彻底闭环“推理 1 帧、有效跟踪 2 帧”的反例。

2. **P1-R003-02 [P1/启动屏障] 首帧预推理失败严格阻断视频播放与状态就绪**：
   - **源码位置**：`src/app.js:440–495`、`tests/store.test.mjs:240–265`；
   - **加固措施**：
     - 移除首帧推理内部吞掉异常并仅输出 `console.warn` 的局部 catch 块；
     - 若 `detectForVideo()` 在首帧阶段抛出异常，立即抛出明确错误至外层 `catch (error)`；
     - `state.modelReady = true` 仅在首帧预推理成功后才置位；
     - 失败时外层 `catch` 执行完整资源清理与回退：调用 `stopRealtime()` 关闭检测器并清理视频元素、置 `state.mode = null`、置 `state.modelReady = false`、更新错误提示 UI，且绝不调用 `video.play()` 和 `requestAnimationFrame`。

3. **P2-R003-03 [P2/生命周期] 视频首帧加载 10 秒超时防护**：
   - **源码位置**：`src/app.js:405–420`；
   - **加固措施**：在视频首帧 `loadeddata` / `readyState >= 2` 的等待 Promise 中引入 10 秒定时器 `setTimeout`，超时即清理事件并 reject 报错，防止异常文件导致 Promise 永久悬挂。

4. **全部既往结案项持续稳定保持通过**：
   - **P0 安全**：静态服务白名单与目录符号链接防御、全量无豁免私钥打包扫描（7/7 PASS）持续稳定结案；
   - **R-005**：开合跳初学者动态达标阈值（115°/118° 达标）与双臂达峰瞬间下肢开合比锁死（`early_leg_close` 有效计数严格为 0）在第七轮已正式结案通过；
   - **R-009**：1-to-1 周期事件级真值匹配（TP/FP/FN/Precision/Recall/F1）及重复告警注入测试持续保持结案通过。

---

## 二、本地全套自动化验证指令

```bash
npm run check                                                         # 6 个核心 ES 模块语法检查 (PASS)
npm test                                                              # 34/34 项全量单测 (PASS)
python scripts/test_package_security.py                               # 7 项安全注入与负向防假阳性自动化回归 (PASS)
node scripts/smoke.mjs                                                # 包含目录符号链接与非客户端路径 403 拦截的冒烟测试 (PASS)
npm run benchmark                                                     # 9 组跨 FPS 动作基准测试与严格 1-to-1 事件匹配 (PASS)
python scripts/package.py                                             # 自动化零豁免前置扫描与 ZIP 打包 (PASS)
python scripts/verify_package.py release/ai-fit-coach-demo-v0.2.1-handoff.zip # 独立解包审计与 SHA-256 完整性校验 (PASS)
```

---

## 🤖 供直接复制发给复审 AI 的提示词（Prompt for Reviewer AI）

```markdown
请你扮演资深代码安全与计算机视觉审查专家，对本次提交的 AI Fit Coach v0.2.1-r8 进行第八轮 P1 缺陷专项复审。

【本次交付背景与任务】
第七轮独立复审报告（AI Fit Coach v0.2.1-r7 — 第七轮 P1 专项复审）确认：P0 安全保持结案，R-005 开合跳动态阈值与协同判定正式结案，R-009 浅动作 1-to-1 匹配保持结案。
本轮开发者严格根据第七轮报告中的返修指令（NEXT_AI_R8_FIX_PROMPT.md），仅针对遗留的 R-003 两项具体缺陷进行定向攻坚，未改动任何已结案模块：

1. P1-R003-01 首帧 trackedFrames 重复累加缺陷消除：
   - 源码：`src/app.js` 约 450–475 行；
   - 移除首帧检测成功后手动的 trackedFrames++，统一交由 onResult 唯一入口进行判定与累加；
   - 首帧检出 1 个人体时，严格满足 totalInferredFrames = 1, trackedFrames = 1；首帧无人体时，严格满足 totalInferredFrames = 1, trackedFrames = 0，彻底闭环“推理 1 帧、有效跟踪 2 帧”的反例。

2. P1-R003-02 首帧推理失败不可伪成功：
   - 源码：`src/app.js` 约 440–495 行；
   - 消除原先吞掉首帧推理异常并仅输出 console.warn 的静默 catch 块；
   - 若 detectForVideo() 抛出异常，立即抛出错误并由外层 catch 捕获处理：执行 stopRealtime() 释放资源、置 state.mode = null、置 state.modelReady = false、向用户展示错误提示，且绝对不调用 video.play() 与 requestAnimationFrame；
   - state.modelReady = true 仅在首帧预推理成功后才置位。

3. P2-R003-03 视频首帧 loadeddata 等待增设 10 秒超时防护与清理，杜绝悬挂 Promise。

4. 真实 begin('video') 业务路径端到端测试覆盖：
   - 在 `tests/store.test.mjs` 中新增测试 34，引入 mock DOM 与 mock detector，真实调用 begin('video') 业务路径，全量覆盖：
     - 场景 1（首帧 1 人）：inferredFrames = 1, trackedFrames = 1, mode = 'video', modelReady = true, play = true；
     - 场景 2（首帧 0 人）：inferredFrames = 1, trackedFrames = 0, mode = 'video', modelReady = true, play = true；
     - 场景 3（首帧抛错）：inferredFrames = 0, trackedFrames = 0, mode = null, modelReady = false, play = false；
     - 场景 4（35 帧多帧模拟）：inferredFrames = 35, trackedFrames = 17，全程保持 totalInferredFrames >= trackedFrames。
   - 34/34 项单元测试全部通过。

5. 审查复现脚本对齐：
   - 运行针对 r7 缺陷的插桩流程，cases[0] 准确输出 inferredFrames: 1, trackedFrames: 1，cases[1] 准确输出 mode: null, modelReady: false, inferredFrames: 0, trackedFrames: 0。

【请重点审查】
1. 检查 `src/app.js` 与 `tests/store.test.mjs`，验证首帧 trackedFrames 单一入口计数逻辑，以及首帧抛错时阻断 video.play() 并重置 mode 为 null 的控制流；
2. 执行全套自动化验收指令：
   npm run check
   npm test
   python scripts/test_package_security.py
   node scripts/smoke.mjs
   npm run benchmark
   python scripts/package.py
   python scripts/verify_package.py release/ai-fit-coach-demo-v0.2.1-handoff.zip
   确认全部通过且无任何警告，ZIP 包 39 个文件哈希与零私钥扫描全量绿灯。

请给出本次 P1 专项闭环的最终复审决议。
```
