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
