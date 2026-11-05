# FIX_REPORT — v0.2.1-r9 P1 最终全面闭环与审查验收对齐报告

> **目标版本**：v0.2.1-r9  
> **修复范围**：基于第八轮复审报告（`AI Fit Coach v0.2.1-r8 — 第八轮 P1 专项复审`）及返修指令（`NEXT_AI_R9_FIX_PROMPT.md`），定向修复 R-003 遗留的最后两项竞态缺陷，实现全套 P1 专项彻底闭环：  
> 1. **P1-R003-03：旧视频异步初始化取消后的延迟异常穿透与新会话误杀防范（全流程严格执行运行令牌校验）**；  
> 2. **测试补充：在 `tests/store.test.mjs` 中新增端到端取消后迟到异常注入与旧模型延迟失败隔离断言**；  
> 3. **审查对齐：外部审查脚本 `REPRO_R8_VIDEO.mjs` 4 项测试场景 100% 绿色转正**。  
> 
> *说明：P0 安全保持结案；R-005 开合跳动态协同保持结案；R-009 一对一事件匹配保持结案；R-003-01 首帧单计数与 R-003-02 首帧失败阻断在 r8 已正式结案通过。*

---

## 1. P1-R003-03：消除旧视频异步初始化取消后的生命周期竞态

### 1.1 根因与复现
- **根因**：在 `src/app.js` 约 501–509 行的 `begin('video')` 外层 `catch (error)` 处理块中，原代码未校验当前任务的运行标识 `run` 是否等于全局最新的 `state.activeRunId`，便直接调用了全局 `stopRealtime()` 并将 `state.mode` 重置为 `null`。
- **复现步骤**：
  1. 用户选择本地视频，系统开始等待视频首帧解码（挂起状态）；
  2. 用户中途点击“结束训练”取消该次视频评测（`finishSession()` 将 `activeRunId` 递增）；
  3. 用户立即点击启动新的演示训练（`begin('demo')` 将 `activeRunId` 再次递增，`state.mode = 'demo'` 开始运行）；
  4. 旧视频异步操作由于解析失败或被销毁触发了延迟的 `error` 回调，使旧的 `begin('video')` Promise 进入 `catch`；
  5. 旧任务的 `catch` 盲目执行 `stopRealtime()`，错误地将新启动的 demo 演示会话清理，导致 `state.mode = null`、`running = false`、活跃动画帧归零。

### 1.2 修复措施
1. **严格运行令牌生命周期检查**：
   - 在 `begin('video')` 与 `begin('camera')` 的外层 `catch (error)` 处理块首行，强制加入：
     ```javascript
     if (run !== state.activeRunId) return;
     ```
   - 任何已被用户取消或失效的旧任务，其内部抛出的迟到错误将被严格丢弃，绝不会调用 `stopRealtime()` 清理新会话，绝不篡改新会话的 `state.mode` 与 `running` 状态。
2. **定时器 Node 兼容优化**：
   - 为 `toast` 提示定时器补充 `unref()` 调用，防止测试环境下未退出的定时器无谓延长事件循环生命周期。

### 1.3 验证证据
1. **独立审查脚本验证**：
   - 运行审查 AI 提供的 `audit/AI_Fit_Coach_v0.2.1-r8_REVIEW/AI_Fit_Coach_v0.2.1-r8_Review/REPRO_R8_VIDEO.mjs`，输出为：
     ```json
     {"case":"one-human","inferred":1,"tracked":1,"mode":"video","ready":true,"plays":1}
     {"case":"no-human","inferred":1,"tracked":0,"mode":"video","ready":true,"plays":1}
     {"case":"initial-inference-error","inferred":0,"tracked":0,"mode":null,"ready":false,"plays":0,"close":1,"revoke":1,"activeRAF":0}
     {"case":"cancel-pending-video-then-new-demo","expectedMode":"demo","actualMode":"demo","running":true,"activeRAF":1}
     ```
     原先失败的 `cancel-pending-video-then-new-demo` 准确断言 `actualMode: "demo", running: true, activeRAF: 1`，全部 4 项 100% 通过。
2. **项目单测覆盖（`tests/store.test.mjs` 测试 34）**：
   - **Subtest 5**：真实模拟旧视频首帧等待中被取消并切换至 demo，注入旧视频延迟 `error` 回调，断言新 demo 会话保持 `state.mode === 'demo'` 与 `state.running === true` 持续运行；
   - **Subtest 6**：真实模拟旧模型异步加载延迟拒绝，断言其异常被令牌拦截，绝不破坏新会话。

---

# FIX_REPORT — v0.2.1-r8 P1 最终全面闭环与审查验收对齐报告

> **目标版本**：v0.2.1-r8  
> **修复范围**：基于第七轮复审报告（`AI Fit Coach v0.2.1-r7 — 第七轮 P1 专项复审`）及返修指令（`NEXT_AI_R8_FIX_PROMPT.md`），定向修复 R-003 遗留的最后两项 P1 缺陷：  
> 1. **P1-R003-01：首帧 `trackedFrames` 重复累加缺陷（消除首帧手动增量，统一由 `onResult` 单一入口处理）**；  
> 2. **P1-R003-02：首帧推理失败不可伪成功（消除静默 warn 漏洞，抛出异常并阻断 `video.play()`、清空状态并向用户报错）**；  
> 3. **P2-R003-03：视频 `loadeddata` 增加 10 秒超时防护与事件清理，杜绝悬挂 Promise**；  
> 4. **测试补充：在 `tests/store.test.mjs` 中新增真实 `begin('video')` 业务路径端到端测试（涵盖检出 1 人、无人体、推理抛错、多帧时序等 4 种真实场景）**。  
> 
> *说明：P0 安全保持结案；R-005 开合跳动态阈值与峰值锁定在 r7 正式结案；R-009 一对一事件匹配保持结案。*

---

## 1. P1-R003-01：消除首帧 `trackedFrames` 重复累加缺陷

### 1.1 根因与复现
- **根因**：在 `src/app.js` 约 456 行，首帧预推理检测到人体后，原代码先手动执行了一次 `state.trackedFrames = (state.trackedFrames || 0) + 1;`，随后立即调用 `onResult(firstLandmarks, ...)`；而在 `onResult()` 内部（第 259 行），只要 `(state.mode === 'camera' || state.mode === 'video') && landmarks?.length` 为真，便会再次执行 `state.trackedFrames++`。
- **复现结果**：首帧仅推理了 1 帧且画面中只有 1 个人，系统却记录了 `totalInferredFrames: 1, trackedFrames: 2`，出现了 `trackedFrames > totalInferredFrames` 的逻辑矛盾，且会干扰 MAE 的有效帧数门槛判定。

### 1.2 修复措施
- 移除 `src/app.js` 首帧处理中的手动递增代码行，统一交由核心入口 `onResult()` 负责 `state.trackedFrames` 的有效检出累加；
- 首帧检出 1 个人时，严格满足 `totalInferredFrames = 1, trackedFrames = 1`；首帧无人体时，严格满足 `totalInferredFrames = 1, trackedFrames = 0`。

---

## 2. P1-R003-02：首帧推理失败严格阻断视频播放与状态就绪

### 2.1 根因与复现
- **根因**：在 `src/app.js` 约 447–470 行，对首帧执行 `state.detector.detectForVideo(video, ...)` 时使用了局部的 `try { ... } catch (firstFrameErr) { console.warn(...) }` 结构。若检测器在首帧阶段抛出异常，错误被局部静默吸收，后续流程依然把 `state.modelReady` 设为 `true`、打印“从 0s 启动成功”消息，并调用 `await video.play()` 正常播放视频。
- **复现结果**：假姿态检测器在首帧抛出异常时，系统未中断退出，反而继续启动视频播放，违背了“首帧成功通过 AI 模型推理作为进入视频训练必要前置条件”的强验收要求。

### 2.2 修复措施
- 消除局部吞噬异常的 `console.warn`，当 `detectForVideo()` 抛出异常时，重新抛出 `new Error(...)` 传递至外层统一的 `catch (error)` 处理块；
- 延迟设置 `state.modelReady = true`，必须在首帧预推理彻底成功后才置位；
- 失败时外层 `catch` 执行完整清理：调用 `stopRealtime()` 关闭检测器并清理视频元素、置 `state.mode = null`、置 `state.modelReady = false`、更新错误提示 UI，且绝不调用 `video.play()` 和 `requestAnimationFrame`。

---

## 3. P2-R003-03：视频首帧加载 10 秒超时防护

- 在 `video.readyState >= 2` 的等待 Promise 中，增设 10 秒定时器 `setTimeout`，超时即执行清理并 reject 明确报错，彻底杜绝异常媒体文件或空事件导致的 Promise 永久悬挂。

---

## 4. 测试与验证结果

1. **真实业务路径单测（`tests/store.test.mjs` 测试 34）**：
   - 场景 1（首帧 1 人）：`inferredFrames = 1, trackedFrames = 1, mode = 'video', modelReady = true, play = true` (PASS)；
   - 场景 2（首帧 0 人）：`inferredFrames = 1, trackedFrames = 0, mode = 'video', modelReady = true, play = true` (PASS)；
   - 场景 3（首帧抛错）：`inferredFrames = 0, trackedFrames = 0, mode = null, modelReady = false, play = false` (PASS)；
   - 场景 4（35 帧多帧模拟）：`inferredFrames = 35, trackedFrames = 17`，全程满足 `totalInferredFrames >= trackedFrames` (PASS)。
2. **审查 AI 复现脚本对齐**：
   - 运行针对 r7 缺陷的插桩流程，`cases[0]` 准确输出 `inferredFrames: 1, trackedFrames: 1`，`cases[1]` 准确输出 `mode: null, modelReady: false, inferredFrames: 0, trackedFrames: 0`。
3. **全套自动化测试全绿**：
   - `npm run check`：6/6 ES 模块 PASS；
   - `npm test`：34/34 PASS；
   - `python scripts/test_package_security.py`：7/7 PASS；
   - `node scripts/smoke.mjs`：PASS；
   - `npm run benchmark`：9 组确定性序列 PASS（MAE = 0.000）；
   - `python scripts/package.py`：PASS（39 个文件，完整 SHA-256 校验与零私钥扫描通过）。

---

# FIX_REPORT — v0.2.1-r7 P1 最终闭环与审查验收对齐报告

> **目标版本**：v0.2.1-r7  
> **修复范围**：基于第六轮复审报告（`AI Fit Coach v0.2.1-r6 — 第六轮 P1 专项复审`）及返修指令（`NEXT_AI_R7_FIX_PROMPT.md`），定向修复最后两个遗留 P1 问题：  
> 1. **R-005 开合跳初学者难度阈值动态协同与峰值同步容差加固（解决 115° 冲突与 `early_leg_close` 边界）**；  
> 2. **R-003 视频采样统计分离累计与窗口计数、修正平均推理耗时及首帧真实推理保证**。  
> 
> *说明：P0 安全保持结案，R-009 一对一事件级匹配在 r6 已正式通过结案。*

---

## 1. R-005：初学者开合跳难度阈值动态协同与峰值同步容差加固

### 1.1 根因与复现
- **初学者阈值冲突**：系统初学者开合跳预设角度为 115°。原代码在验证上下肢协同展开时硬编码了 `if (measured >= 125)`，导致初学者即使动作舒展达到 118°，也会被 125° 门槛强制拦截，输出 `count: 0, partial: 4`；
- **手臂最高峰已收腿边界（`early_leg_close`）**：受试者双腿在手臂即将上升前短暂张开，但在手臂持续处于最高角度时双腿已并拢；原代码由于曾经置位 `armPeakLegSynchronized = true`，导致该异步动作被误计为 3 次有效动作。

### 1.2 修复措施
1. 动态自适应协同门控：
   - 将固定 125° 改为与当前难度达标目标动态关联的 `overheadThreshold = Math.min(125, this.exercise.full - 5)`；
   - 初学者模式下（`full: 115`），`overheadThreshold` 自适应为 110°，输入 118° 时能够顺利达成 3 次有效动作与 1 次计划浅动作；
2. 双臂最高峰时刻腿部展开状态锁存：
   - 增加 `this.legRatioAtArmPeak` 记录手臂处于峰值最高点时刻的下肢开合比；
   - 在动作结束判定中，若手臂到达最高峰时下肢开合比已经低于 1.45（`this.legRatioAtArmPeak < 1.45`），坚决判定为未达标不计数；
3. 测试覆盖：
   - 运行审查 AI 提供的 `R6_INDEPENDENT_REPRO.mjs`，`beginner_118` 准确计入 3 次有效动作，`early_leg_close` 准确被阻断为 0 次；
   - `tests/exercise.test.mjs` 增设两项单测断言。

---

## 2. R-003：视频采样统计分离累计与窗口计数、修正平均推理耗时及首帧真实推理保证

### 2.1 根因与复现
- 原 `state.inferFrames` 每约 1 秒在滑动 FPS 窗口中被置为 0，导致视频结束提示与历史记录持久化读取到的只是最后一个不足 1 秒窗口的微小计数值（例如 60 帧视频报告显示 3 帧），甚至小于检出姿态的 `trackedFrames`；
- “平均单帧推理耗时”此前读取的是最近单帧的 `latencyMs`，而非真实平均值；
- 视频在播放前缺少暂停首帧的实质性推理检测，seek 超时时盲目成功放行。

### 2.2 修复措施
1. 彻底分离会话累计推理与滑动 FPS 窗口：
   - `state.totalInferredFrames`：会话生命周期累计总推理调用次数，持续递增永不被秒级重置；
   - `state.inferFramesWindow`：每秒滑动窗口计数，每秒用于计算 FPS 并清零；
   - 结束报告与会话持久化 `inferredFrames` 统一读取 `totalInferredFrames`，确保累计推理帧数严格 `>= trackedFrames`；
2. 真实平均单帧推理耗时：
   - 引入 `latencySumMs` 累计所有帧推理耗时总和；
   - 视频结束时按 `Math.round(latencySumMs / totalInferredFrames)` 报告真正的加权平均耗时；
3. 暂停状态首帧真实推理与严格 seek 校验：
   - 在 `video.play()` 之前，在暂停于 0 秒的状态下直接调用一次 `state.detector.detectForVideo(video, ...)`，确保第 0 帧真正进入模型分析；
   - 在启动播放前注册 `video.onended`，先启动 `requestAnimationFrame(renderFrame)` 再调用 `await video.play()`；
   - seek 监听若超时，必须核验目标帧已解码（`currentTime === 0 && readyState >= 2`），否则拒绝放行；
4. 测试覆盖：
   - `tests/store.test.mjs` 新增模拟 3.5 秒（跨越 3 个 1 秒窗口重置）的视频时间线单测，断言累计推理次数为 35 帧不被清零且 `>= trackedFrames`（17 帧），均值耗时严格准确；
   - 运行 `R6_INDEPENDENT_REPRO.mjs`，`appSourceFindings` 全部 6 项静态检测 100% 通过（全部为 `false`）。

---

# FIX_REPORT — v0.2.1-r6 P1 专项彻底闭环与审查验收对齐报告

> **目标版本**：v0.2.1-r6  
> **修复范围**：基于第五轮复审报告（`AI Fit Coach v0.2.1-r5 — 第五轮 P1 专项独立复审报告`）及返修指令（`NEXT_AI_R6_FIX_PROMPT.md`），定向解决三个尚未结案的 P1 项并更新全套学术措辞：  
> 1. **R-005 开合跳严格双肢时序协同与脚踝真实位移增量核验（彻底封堵异步摆臂与髋部伪开合）**；  
> 2. **R-003 视频首帧就绪严格保证、取消杜撰覆盖率分母并分离推理/跟踪计数**；  
> 3. **R-009 浅动作识别重构为严格一对一事件匹配（TP/FP/FN/Precision/Recall/F1 完整输出与负向注入验证）**；  
> 4. **P2 学术措辞规范化：全项目 6 处文档统一纠正“逐帧推理”为“实时采样姿态分析”**。

---

## 1. R-005：开合跳严格双肢时序协同与脚踝真实位移增量核验

### 1.1 根因与复现
- 外部审查 AI 在 `R5_INDEPENDENT_REPRO.mjs` 中构造了两项极具杀伤力的新反例：
  1. `hips_move_ankles_static`：受试者双脚踝固定不动，仅通过收紧髋部让髋宽减半，使得 `ankleDist / hipDist` 产生伪峰值（由 1.0 飙升至 2.0），在 r5 中被误计为 3 次有效动作；
  2. `legs_out_of_sync`：受试者提前跳开双腿并在手臂举起前收回；随后手臂举过头顶。虽然在动作周期内极值比率达标，但双臂和双腿从未在时间轴上同步展开，在 r5 中被误计为 3 次有效动作。

### 1.2 修复措施
1. `src/exercise.js` 扩展脚踝度量纯函数：
   - 实现 `getLegSpreadMetrics(landmarks)`，统一返回 `ratio`、`ankleDist`、`hipDist` 和可见度；
2. 脚踝实际物理位移增量校验（封堵 `hips_move_ankles_static`）：
   - 开合跳动作合格判定中强制增加：`this.peakAnkleDist >= 1.35 * this.minAnkleDist && (this.peakAnkleDist - this.minAnkleDist) >= 0.035`；
   - 若脚踝自身未发生实质性展开，即使髋关节变化产生比率峰值，亦坚决判定为未达标不予计数；
3. 双臂双腿高位同窗同步校验（封堵 `legs_out_of_sync`）：
   - 在双臂处于上举峰值区间（`measured >= 125°`，接近 145° 满分角度）时，强制断言下肢必须处于同步展开状态（`currentLegMetrics.ratio >= 1.55` 且脚踝展开），记录 `armPeakLegSynchronized = true`；
   - 若双腿提前展开收拢导致手臂到达最高点时双腿已并拢，坚决判定为未达标不予计数；
4. 自动化回归测试：
   - `tests/exercise.test.mjs` 增设两项独立反例断言，`closed: 0`、`wide: 0`、`occluded: 0`、`hips_move_ankles_static: 0`、`legs_out_of_sync: 0`、`normal: 3 有效 + 1 浅动作`；
   - 运行审查 AI 提供的 `R5_INDEPENDENT_REPRO.mjs`，新增的两项反例有效计数全部从 3 次彻底清零为 0 次，测试 100% 转绿。

---

## 2. R-003：视频首帧就绪严格保证、取消杜撰覆盖率并分离推理/跟踪计数

### 2.1 根因与改进
- 原代码使用了 `setTimeout(r, 150)` 粗暴释放，未真正确保视频首帧解码就绪；
- 原视频结束提示使用了 `state.trackedFrames / (duration * 24)`，将“检出人体的帧数”混同为“模型采样的帧数”，且硬编码 24 FPS 分母容易造成误解；
- 文档多处存在“逐帧推理”的不严谨表述。

### 2.2 修复措施
1. 真实首帧就绪监听与中断防护：
   - 严格等待 `video.readyState >= 2`（`HAVE_CURRENT_DATA`，首帧已物理解码就绪）；
   - 若需调整时间，先挂载 `seeked` 一次性监听器再设置 `video.currentTime = 0`；
   - 在各个异步阶段严格检验 `if (run !== state.activeRunId)`，防止中途取消或切换时的悬挂任务；
2. 分离统计与透明指标提示：
   - 独立追踪 `inferFrames`（实际推理调用次数）与 `trackedFrames`（检出有效姿态的次数）；
   - 废除编造的“覆盖率 %”，视频结束提示规范为：`AI 实际采样推理 X 帧，有效检出人体姿态 Y 帧（平均单帧推理耗时约 Z ms）`；
3. 全文措辞修正：
   - `README-demo.md`、`docs/DEVELOPMENT_PLAN.md`、`docs/EXPERIMENT_PROTOCOL.md`、`docs/MOBILE_TESTING.md`、`docs/PRESENTATION_20MIN.md` 全部统一为“实时采样姿态分析（基于主线程吞吐自适应采样，非逐编码帧扫描）”。

---

## 3. R-009：浅动作识别重构为严格一对一事件级真值匹配

### 3.1 根因与复现
- 原代码在统计浅动作召回率时，将一个周期时间窗内检测到的 1 次、2 次或多次告警全部归为“命中”，缺乏预测事件与真值（GT）事件的一对一消耗匹配；
- 外部审查 AI 在浅动作时间窗内故意注入 2 次多余告警（由 18 变为 54 次），系统仍上报 `FP=0`、召回率 100%，掩盖了假阳性漏洞。

### 3.2 修复措施
1. 时间戳预测事件集合记录：
   - 每次分析器触发未达幅度事件或 `partialCount` 递增时，记录独立带时间戳的预测事件；
2. 严格 1-to-1 窗口匹配算法：
   - 为合成动作序列中的每个浅动作定义 GT 周期事件窗口；
   - 每个预测事件尝试匹配当前未匹配的 GT 事件；一旦匹配，GT 标记为已消耗，计入 **TP**；
   - 任何同一窗口内多出的重复告警、或在正常动作窗口误发的告警，因无法匹配未消耗 GT，一律严格计入 **FP**；
   - 任何未被匹配到的 GT 事件计入 **FN**；
3. 完整指标输出：
   - 终端与报告全面输出 Precision、Recall、F1 分数以及 TP/FP/FN 混淆矩阵；
   - 正常基准测试下：TP=18, FP=0, FN=0, Recall=100.0%, Precision=100.0%, F1=1.000；
   - 故意注入 36 个重复告警时：TP=18, FP=36, FN=0, Precision=33.3%, Recall=100.0%, F1=0.500；精准捕获 36 个假阳性！
4. `tests/exercise.test.mjs` 新增一对一匹配与重复注入负向单测。

---

# FIX_REPORT — v0.2.1-r5 P1 专项闭环与审查验收对齐报告

> **目标版本**：v0.2.1-r5  
> **修复范围**：基于第四轮复审报告（`AI_Fit_Coach_v0.2.1-r4_Review`）及返修提示词（`NEXT_AI_R5_PROMPT.md`），定向彻底解决 P1 遗留项：  
> 1. **R-005 开合跳双下肢四态严格协同闭环（彻底解决常开/常闭/遮挡绕过）**；  
> 2. **R-003 视频分析启动时序与实时采样口径规范化（第 0 秒 seeked 确认与采样指标上屏）**；  
> 3. **P1-DATA-CSV / P2 历史 UI 误差显示纠偏与 CSV 导出 MAE 纳入资格显式透明化**；  
> 4. **R-009 基准测试浅动作召回率升级为逐轮事件级真值匹配（TP/FN/FP）**；  
> 5. **R-013 性能指示器会话重置优化（消除初始化残留帧率闪烁）**。

---

## 1. R-005：开合跳双下肢四态严格协同（彻底消除绕过）

### 1.1 根因与复现
- 外部审查 AI 在 `REPRO_R4.mjs` 中构造了 4 种合成动作场景：
  1. `closed`（双腿始终并拢，仅摆动双臂）：系统计为 0 次（符合预期）；
  2. `occluded`（双脚踝关键点不可见，仅摆动双臂）：系统误计为 3 次完整开合跳（**未通过**，根因是原代码做了“未检测到下肢则默认放行”的脆弱假设）；
  3. `wide`（双腿始终张开不动，仅摆动双臂）：系统误计为 3 次完整开合跳（**未通过**，根因是原代码仅检查了 `peakLegSpread >= 1.65`，未检查腿部是否有“先合拢、再张开、后合拢”的完整动作循环）。

### 1.2 修复措施
1. `src/exercise.js` 重构开合跳状态机：
   - 彻底废弃“下肢不可见默认通过”的假设，明确开合跳必须在可观测下肢关键点下闭环完成；
   - 引入动态开合比边界追踪：`this.minLegSpread`（动作周期内最小合拢比）、`this.peakLegSpread`（最大开合比）及 `this.legTrackingLost`（动作中下肢关键点丢失标记）；
   - 完整开合跳必须满足严格的四态协同演变：
     - **下肢全程可信追踪**：`!this.legTrackingLost`；
     - **双腿起始合拢**：`this.minLegSpread <= 1.35`；
     - **双腿充分张开**：`this.peakLegSpread >= 1.65`；
     - **双腿回位闭合**：`currentRatio <= 1.40`；
2. 反例与回归测试：
   - `tests/exercise.test.mjs` 新增四场景独立回归单测，断言 `closed: 0`、`wide: 0`、`occluded: 0`、`normal: 3 有效 + 1 浅动作`；
   - 运行审查 AI 提供的 `audit/.../REPRO_R4.mjs`，`wide.validCount` 与 `occluded.validCount` 均从 3 次彻底降为 0 次，测试完全转绿。

---

## 2. R-003：视频时序与采样口径规范化（第 0 秒 seeked 确认与采样指标上屏）

### 2.1 根因与改进目标
- 审查报告指出：浏览器端视频分析运行在 JS 主线程，属于依吞吐自适应的“实时帧采样”，而非确定性的“逐帧全量离线扫描”；宣称全量逐帧容易引发学术误解；
- 模型就绪后若直接 `play()`，视频解码器可能尚未渲染第 0 帧导致首个采样周期出现轻微时间戳偏差。

### 2.2 修复措施
1. `src/app.js` 规范学术与界面措辞：
   - 将模式切换与状态文本统一标注为“实时帧采样 AI 动作评测（基于推理吞吐自适应采样，非逐帧离线扫描）”；
2. 首帧异步 seeked 等待机制：
   - 模型加载完毕后，显式执行 `video.currentTime = 0;` 并注册一次性 `video.onseeked` 监听器，确保首帧物理就绪后再启动播放与推理主循环；
3. 采样指标上屏与结束报告：
   - 视频播放结束（`onended`）时自动计算并输出：`已完成视频评测：采样 X 帧，估算采样覆盖率 Y%`，向使用者如实展示实际抽样密度。

---

## 3. P1-DATA-CSV / P2：UI 误差纠偏与 CSV 导出 MAE 纳入资格显式透明化

### 3.1 根因与复现
- 外部审查者在核对 CSV 与看板数据时发现：部分未标注真实次数或追踪帧数过少（`< 5` 帧）的会话被看板排除在外，但 CSV 导出缺少字段解释为什么它们未纳入 `realMae` 计算，导致复现者误以为公式有偏差；
- 主界面卡片与历史列表部分位置未接入 `deriveVerifiedAbsError` 保护。

### 3.2 修复措施
1. `src/store.js` 统一准入机制：
   - 提取并导出纯函数 `getSessionMaeEligibility(session)`，返回 `{ eligible: boolean, reason: string }`；
   - 明确排除规则：① 非摄像头/视频真实模式（如模拟数据）；② 未人工标注真实次数（`manualCount` 为空）；③ 有效姿态追踪帧数不足 5 帧（无效/误触会话）；
2. 历史 UI 误差显示纠偏：
   - `src/app.js`：卡片与表格全面接入 `deriveVerifiedAbsError`，杜绝旧脏数据显示；
3. CSV 导出显式透明化：
   - `exportSessionsCSV` 新增两列：`计入真实MAE`（`是` / `否`）与 `排除原因`（中文说明）；
   - 外部复现人员仅需对 CSV 按 `计入真实MAE === '是'` 过滤，计算其 `absError` 算术平均值，即与系统看板 `computeMaeStats().realMae` 完全一致；
4. `tests/store.test.mjs` 增补单测断言准入仲裁与 CSV 过滤计算一致性。

---

## 4. R-009：基准召回率升级为逐轮事件级真值匹配

### 4.1 根因与优化
- 原 `scripts/benchmark.mjs` 计算浅动作召回率使用了整体聚合指标 `Math.min(detectedShallow, expectedShallow) / expectedShallow`，在误报（FP）过多时不能准确反映事件级真假阳性。

### 4.2 修复措施
- `scripts/benchmark.mjs` 改造为逐动作周期事件级真值匹配：
  - 针对每个合成动作周期的时间窗口，核查是否在指定窗口内准确命中浅动作判定；
  - 精确统计真阳性（`tpShallow`）、假阴性（`fnShallow`）与假阳性（`fpShallow`）；
  - 召回率严格按 `TP / (TP + FN)` 计算并上报终端：`浅动作识别召回率（Shallow Rep Recall）：100.0%（逐轮事件级实算：TP=18, FN=0）`。

---

## 5. R-013：测速指示器会话重置优化

- `src/app.js`：在启动或重置会话时，将 `fpsFrames`、`inferFrames`、`renderFps`、`inferFps`、`latencyMs` 全部清零，并显示“正在测速…”，杜绝首秒沿用上一会话残留帧率数据。

---

# FIX_REPORT — v0.2.1-r4 P1 专项缺陷修复与系统可靠性报告

> **目标版本**：v0.2.1-r4  
> **修复范围**：基于第三轮 P0 验收通过结论（`P0_R3_REVIEW_REPORT.md`），全面推进落实 P1 缺陷修复：  
> 1. **P1-TEST-001 安全测试假阳性与交互挂起修复**；  
> 2. **P1-DATA-CSV MAE 看板与 CSV 导出逐行绝对误差自愈与一致性**；  
> 3. **R-003 视频评测初始化竞态修复（第 0 秒等待模型就绪）**；  
> 4. **R-004 动作侧别硬锁定与跨侧跳变假动作阻断**；  
> 5. **R-005 开合跳双下肢开合协同约束（仅摆手不计入完整次数）**；  
> 6. **R-006 首次姿态异常提示免冷却即时触发（修复 <3000ms 被抑制）**；  
> 7. **R-010 提前过滤退化重合骨架（避免误算为 0°）**；  
> 8. **R-008 离线模型加载边界澄清（如实声明 ESM 运行时需公网）**；  
> 9. **R-009 基准召回率动态实算与消除无阻塞绝对宣称**；  
> 10. **R-013 分离页面渲染 FPS 与 AI 推理 FPS / 耗时指标**。

---

## 1. P1-TEST-001：安全测试假阳性与无交互挂起修复

### 1.1 根因与复现
- 原 `scripts/test_package_security.py:95` 使用 `subprocess.run(['node', 'scripts/smoke.mjs'], shell=True)`。在 POSIX 环境下，`shell=True` 与参数列表混用会将后续参数作为 shell 参数丢弃，导致 Node 未真正执行 `smoke.mjs`；
- 当测试脚本故意被破坏并抛出异常时，原测试套件仍错误报告 `Scenario 6 PASS`（假阳性）；在常规开放 stdin 终端中，部分子进程因未重定向 stdin 可能交互式挂起。

### 1.2 修复措施
1. `scripts/test_package_security.py`：场景 6 彻底移除 `shell=True`，改用 `shell=False`、显式 `stdin=subprocess.DEVNULL` 及 `timeout=20`，严格断言退出码为 0 且标准输出包含 `HTTP smoke PASS`；
2. 增设场景 7 负向回归测试（Negative Regression Test）：构造必然抛出 `INTENTIONAL_FAIL_FOR_REGRESSION_TEST` 的冒烟测试替身，断言测试套件能可靠捕获非零退出码并报错，杜绝假阳性；
3. `scripts/package.py`：`run(cmd)` 增加 `stdin=subprocess.DEVNULL` 与 `timeout=60`，杜绝任何子进程阻塞等待标准输入；避免递归打包。

---

## 2. P1-DATA-CSV：MAE 看板与 CSV 导出误差自愈与一致性

### 2.1 根因与复现
- `src/store.js` 的 `computeMaeStats()` 会通过 `count` 和 `manualCount` 重算绝对误差，但 `exportSessionsCSV()` 原本直接读取存储中旧的 `absError` 字段；若数据中存在异常脏数据（如 `absError: -8`），CSV 导出会显示负数；未标注会话若未严格处理可能误填为 0。

### 2.2 修复措施
1. 在 `src/store.js` 实现并导出纯函数 `deriveVerifiedAbsError(session)`：仅在 `count` 与 `manualCount` 均为非负有效整数时计算 `Math.abs(count - manualCount)`，其余情况返回 `null`；
2. `computeMaeStats` 与 `exportSessionsCSV` 全面改用 `deriveVerifiedAbsError`：未标注记录在 CSV 中输出空字符串 `""`（不伪造为 `0`），脏数据自愈计算正向误差；
3. `tests/store.test.mjs` 新增单测验证：未标注会话输出空字符串、脏数据纠偏为正确正误差，且导出行误差均值与 `computeMaeStats().realMae` 完全一致。

---

## 3. R-003：视频评测初始化竞态修复（第 0 秒等待模型就绪）

### 3.1 根因与复现
- 原 `src/app.js:379` 在 `await createPoseLandmarker()` 之前先调用了 `await video.play()`。当网络或本地加载 MediaPipe 模型耗时 3~5 秒时，短视频已播放过半甚至结束，导致开头帧漏分析。

### 3.2 修复措施
- 在加载模型前，将视频暂停在第 0 秒（`video.pause(); video.currentTime = 0;`），等待视频元数据就绪；
- 待 MediaPipe 模型完全下载并初始化就绪后，重置 `video.currentTime = 0`，再与推理循环同步启动播放，确保首帧及整个视频的所有动作帧均被完整分析。

---

## 4. R-004：动作侧别硬锁定与跨侧跳变假动作阻断

### 4.1 根因与复现（BUG02）
- 用户单侧（如左腿）屈曲未完成，跟踪丢失后切换至另一侧伸直的右腿；旧分析器仅锁定了标签侧别，未锁定角度测量数据，把左腿屈曲和右腿伸直拼接成 1 次完整深蹲（`BUG02_false_count_on_side_switch` 中 `count` 误计为 1）。

### 4.2 修复措施
- `src/exercise.js`：在动作进行中（`inRep === true`）引入动作侧别硬锁定校验。若检测到侧别跳变（`side !== this.activeSide` 且非开合跳），立即中断并重置当前动作（`inRep = false; ready = false;`），提示用户保持单侧面向镜头，严禁跨侧拼接角度；
- `extractJointAngle` 扩展支持兼容 `{ preferredSide, hysteresis }` 对象参数与历史字符串参数；
- `tests/exercise.test.mjs` 新增复现单测，验证侧别跳变时计数严格为 0。

---

## 5. R-005：开合跳双下肢协同开合约束（BUG03）

### 5.1 根因与复现（BUG03）
- 原开合跳仅计算双臂上举角度，未检验脚踝与双腿动作；当下肢关键点完全固定仅摆动手臂时，系统仍记录 3 次开合跳与 1 次浅动作（`BUG03_arm_only_counts_jacks`）。

### 5.2 修复措施
- `src/exercise.js` 实现 `getLegSpreadRatio` 提取双脚踝相对于髋关节宽度的归一化开合比；
- 在开合跳动作完成判定中，若追踪到下肢关键点，必须同时满足双臂充分上举（`peakAngle >= full`）与双腿充分展开（`peakLegSpread >= 1.65`）双重条件；腿部静止仅摆动手臂时判定为未达标（`partial`）而不予计数；
- `tests/exercise.test.mjs` 新增复现单测，验证 4 个周期腿部静止摆臂的开合跳计数严格为 0。

---

## 6. R-006：首次姿态异常提示免冷却即时触发（BUG04）

### 6.1 根因与复现（BUG04）
- `src/exercise.js:241` 原写为 `const lastTime = this.lastFaultTimes[fault.code] || 0;`。当会话前 3 秒（`timestamp < 3000`）发生姿态异常时，`timestamp - 0 < 3000` 导致首次异常被冷却逻辑错误压制吞掉（`BUG04_first_fault_suppressed`）。

### 6.2 修复措施
- 改为 `const lastTime = this.lastFaultTimes[fault.code]; if (lastTime === undefined || timestamp - lastTime >= 3000)`。首次发生立刻触发提示，后续发生才执行 3 秒冷却；
- `tests/exercise.test.mjs` 新增复现单测，验证 `timestamp = 100~2300ms` 下注入的姿态异常能够即时捕获触发。

---

## 7. R-010：提前过滤退化重合骨架（BUG01）

### 7.1 根因与复现（BUG01）
- 当手腕与肩膀重合时，`angleDegrees` 返回 `null`；原代码进行双臂平均计算 `(null + null) / 2 === 0`，导致 `extractJointAngle` 返回伪造的 `{ angle: 0, confidence: 0.99 }`。

### 7.2 修复措施
- `src/exercise.js`：在单侧或双侧角度为 `null` 或 `< 5°` 时，直接返回 `null`，不再将退化重合点包装为有效角度；
- `tests/exercise.test.mjs` 新增复现单测，验证重合退化骨架严格返回 `null`。

---

## 8. R-008：离线模型加载边界澄清

- `scripts/download_models.py` 与 `src/pose.js`：修正文档与终端提示，明确指出本地 `/models/` 离线缓存仅包含 `.task` 视觉模型与 WASM 算子；在未缓存浏览器首度加载时仍需公网下载 ESM 运行库；离线答辩推荐提前连网打开页面预热或使用模拟模式。

---

## 9. R-009：基准召回率动态实算与消除无阻塞绝对宣称

- `scripts/benchmark.mjs`：用动态实算的浅动作召回率（`shallowRecallPct`）替代硬编码的 "100%" 字符串；
- 将性能宣称规范为中性的“纯算法规则吞吐能力（CPU 状态机基准）”，并在结论中提示实机性能参考浏览器运行时面板。

---

## 10. R-013：分离页面渲染 FPS 与 AI 推理 FPS / 耗时指标

- `src/app.js`：实时性能标签独立统计并显示「渲染 FPS」（requestAnimationFrame 帧率）、「AI 推理 FPS」（模型实际推理帧率）和「推理耗时（ms）」，避免将 60 FPS 渲染帧率混淆为 AI 推理帧率。

---

## 自动化检验结果摘要

| 测试项 | 执行命令 | 实际结果 |
| :--- | :--- | :--- |
| ES 模块语法检查 | `npm run check` | 6/6 模块通过 |
| 全量单元测试 | `npm test` | **31/31 测试全部通过**（含 BUG01~BUG04 全部回归断言） |
| 打包安全回归测试 | `python scripts/test_package_security.py` | **7/7 场景全部通过**（含场景 7 负向防假阳性测试） |
| 静态服务与目录符号链接防御 | `node scripts/smoke.mjs` | PASS，无任何悬垂符号链接残留 |
| 基准测试 | `npm run benchmark` | 9 组通过，实算召回率 100.0%，MAE = 0.000 |
| 自动化打包 | `python scripts/package.py` | 零豁免逐字节扫描通过，生成交付 ZIP |
| 独立解包审计 | `python scripts/verify_package.py <zip>` | 39 文件 SHA-256 完整性核对通过 |
