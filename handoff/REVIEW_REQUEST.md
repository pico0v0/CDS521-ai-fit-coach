# REVIEW_REQUEST — v0.2.1-r6 第六轮 P1 专项彻底闭环交接审查说明

**交付版本**：v0.2.1-r6  
**交付包**：`release/ai-fit-coach-demo-v0.2.1-handoff.zip` (39 个文件，完整哈希与逐文件零私钥扫描通过)  
**本轮目标**：根据审查 AI 第五轮独立复审报告（`AI Fit Coach v0.2.1-r5 — 第五轮 P1 专项独立复审报告`）及返修指令（`NEXT_AI_R6_FIX_PROMPT.md`），全面定向攻坚并彻底闭环最后三个尚未结案的 P1 项：
1. **R-005**：开合跳严格双肢时序协同（高位同窗展开断言）与脚踝真实物理位移增量核验（彻底封堵 `hips_move_ankles_static` 与 `legs_out_of_sync`）；
2. **R-003**：视频首帧就绪严格保证（`readyState >= 2`、先注册监听后 seeked、中断防护）、取消杜撰的 24 FPS 覆盖率分母，独立分离 `inferFrames` 与 `trackedFrames` 计数，全项目 6 处文档统一修正为“实时采样姿态分析”；
3. **R-009**：浅动作识别召回率重构为严格一对一（1-to-1）事件级真值匹配，全面输出 TP/FP/FN/Precision/Recall/F1，并加入重复告警负向注入单测；
4. **P2**：`src/store.js` 完善 `trackedFrames` 非负整数资格过滤。

---

## 一、本轮重点加固与验收点（P1 专项彻底闭环）

1. **R-005 [P1/规则判定] 开合跳严格双肢时序协同与脚踝真实位移核验**：
   - **源码位置**：`src/exercise.js:35–70, 205–235, 290–330, 360–415`、`tests/exercise.test.mjs:240–300`；
   - **加固措施**：
     - 引入 `getLegSpreadMetrics`，统一输出开合比、脚踝绝对间距与髋部绝对间距；
     - **脚踝位移增量门控**：断言脚踝绝对跨度发生实质性物理展开（`peakAnkleDist >= 1.35 * minAnkleDist` 且绝对增量达标），彻底封堵“双脚不动、仅靠髋关节收缩产生伪峰值”（`hips_move_ankles_static`）；
     - **双肢时序严格协同**：在双臂处于高位展开区间（`measured >= 125°`）时，强制断言下肢必须处于同步展开状态（`armPeakLegSynchronized = true`），彻底封堵“双腿提前开合并收拢、双臂随后上举”（`legs_out_of_sync`）；
     - 单测覆盖全部 6 大反例与正常动作：`closed: 0`、`wide: 0`、`occluded: 0`、`hips_move_ankles_static: 0`、`legs_out_of_sync: 0`、`normal: 3 有效 + 1 浅动作`；
     - 审查 AI 提供的 `R5_INDEPENDENT_REPRO.mjs` 全部 7 种测试场景 100% 符合预期。

2. **R-003 [P1/视频评测] 视频首帧就绪严格保证、取消杜撰覆盖率并分离推理/跟踪计数**：
   - **源码位置**：`src/app.js:390–445, 530–545`；
   - **加固措施**：
     - 废除 `setTimeout(r, 150)` 假定成功等待逻辑；严格等待视频首帧已解码就绪（`readyState >= 2`，即 `HAVE_CURRENT_DATA`）；
     - 若 `currentTime !== 0`，先注册 `seeked` 事件监听器再触发 `video.currentTime = 0`，确保首帧真正物理就绪；异步阶段增加 `activeRunId` 中断保护；
     - 彻底废除按固定 24 FPS 计算的编造“覆盖率”，改为如实输出：`AI 实际采样推理 X 帧，有效检出人体姿态 Y 帧（平均单帧推理耗时约 Z ms）`；会话记录同步保存 `inferredFrames` 与 `trackedFrames`；
     - 全项目 6 处文档（`README-demo.md`、`docs/DEVELOPMENT_PLAN.md`、`docs/EXPERIMENT_PROTOCOL.md`、`docs/MOBILE_TESTING.md`、`docs/PRESENTATION_20MIN.md`）中的“逐帧推理”全部统一修正为“实时采样姿态分析（基于主线程吞吐自适应采样，非逐编码帧扫描）”。

3. **R-009 [P1/基准评测] 浅动作识别重构为严格一对一事件匹配（TP/FP/FN/Precision/Recall/F1）**：
   - **源码位置**：`scripts/benchmark.mjs:30–105, 145–195`、`tests/exercise.test.mjs:310–365`；
   - **加固措施**：
     - 重构为严格 1-to-1 周期时间戳事件级真值匹配；
     - 每个真实浅动作（GT）最多只能消耗一个预测事件；同一窗口内出现的多余重复告警严格计入假阳性（FP），漏检计入假阴性（FN）；
     - 终端与报告全面输出 TP、FP、FN、Precision、Recall、F1 指标及真值标注来源说明；
     - 单测覆盖正常 1-to-1 匹配与注入 2 次重复预测负向测试：精准识别出 2 个 FP，精确率如实下降至 50% 且召回率保持 100%。

4. **P2 [数据兼容] 完善 `trackedFrames` 过滤与会话结构**：
   - `src/store.js`：`getSessionMaeEligibility` 采用 `Math.floor(tf) >= 5` 处理，向后兼容旧有浮点记录并安全过滤非整数和不足 5 帧的脏会话。

---

## 二、本地全套自动化验证指令

```bash
npm run check                                                         # 6 个核心 ES 模块语法检查 (PASS)
npm test                                                              # 32/32 项全量单测 (PASS)
python scripts/test_package_security.py                               # 7 项安全注入与负向防假阳性自动化回归 (PASS)
node scripts/smoke.mjs                                                # 包含目录符号链接与非客户端路径 403 拦截的冒烟测试 (PASS)
npm run benchmark                                                     # 9 组跨 FPS 动作基准测试与严格 1-to-1 事件匹配 (PASS)
python scripts/package.py                                             # 自动化零豁免前置扫描与 ZIP 打包 (PASS)
python scripts/verify_package.py release/ai-fit-coach-demo-v0.2.1-handoff.zip # 独立解包审计与 SHA-256 完整性校验 (PASS)
```

---

## 🤖 供直接复制发给复审 AI 的提示词（Prompt for Reviewer AI）

```markdown
请你扮演资深代码安全与计算机视觉审查专家，对本次提交的 AI Fit Coach v0.2.1-r6 进行第六轮 P1 缺陷专项复审。

【本次交付背景与任务】
第五轮独立复审报告（AI Fit Coach v0.2.1-r5 — 第五轮 P1 专项独立复审报告）确认：P0 安全持续结案，P1 中的 P1-DATA-CSV / CSV 纳入资格与历史展示纠偏、R-004、R-006、R-010、R-013 均已验收通过。
本轮开发者严格根据审查报告中的返修指令（NEXT_AI_R6_FIX_PROMPT.md），全面完成了最后三个尚未结案的 P1 项定向返修并统一了全套学术措辞：

1. R-005 开合跳双肢严格时序协同与脚踝真实位移核验：
   - 源码：`src/exercise.js`；
   - 引入 getLegSpreadMetrics，增加 peakAnkleDist >= 1.35 * minAnkleDist 真实物理位移增量门控，彻底解决双脚不动单纯髋距变化产生的伪开合（hips_move_ankles_static）；
   - 在双臂处于上举峰值区间（measured >= 125°）时，强制核验双腿必须处于同步展开状态（armPeakLegSynchronized = true），彻底解决双腿提前开合并收拢、双臂随后上举的异步伪开合（legs_out_of_sync）；
   - 在 `tests/exercise.test.mjs` 中补充 hips_move_ankles_static 与 legs_out_of_sync 独立单测，断言有效计数严格为 0；
   - 运行上一轮审查 AI 提供的 `R5_INDEPENDENT_REPRO.mjs` 场景实测已全部转绿（全部 7 个场景 100% 符合预期）。

2. R-003 视频首帧就绪保证、取消杜撰覆盖率并分离推理/跟踪计数：
   - 源码：`src/app.js`；
   - 废除 setTimeout 假定成功逻辑，严格等待 video.readyState >= 2（HAVE_CURRENT_DATA 首帧已物理解码就绪）；
   - 若 currentTime !== 0，先挂载 seeked 事件监听器再触发 video.currentTime = 0；
   - 异步加载阶段增加 activeRunId 中断保护，防止中途取消或模式切换时的悬挂任务；
   - 彻底废除按固定 24 FPS 估算的覆盖率，改为如实汇报：AI 实际采样推理 X 帧，有效检出人体姿态 Y 帧（平均单帧推理耗时约 Z ms）；会话记录独立保存 inferredFrames 与 trackedFrames；
   - 全项目 6 处文档（README-demo.md, DEVELOPMENT_PLAN.md, EXPERIMENT_PROTOCOL.md, MOBILE_TESTING.md, PRESENTATION_20MIN.md）中的“逐帧推理”全部统一修正为“实时采样姿态分析（基于主线程吞吐自适应采样，非逐编码帧扫描）”。

3. R-009 浅动作识别重构为严格一对一事件级真值匹配：
   - 源码：`scripts/benchmark.mjs`；
   - 废除时间窗布尔有无判定，重构为基于单动作周期时间戳窗口的严格一对一（1-to-1）事件级匹配；
   - 每个真实浅动作（GT）最多只能消耗一个预测事件；同一窗口内出现的多余重复告警严格计入假阳性（FP），漏检计入假阴性（FN）；
   - 终端与报告全面输出 TP、FP、FN、Precision、Recall、F1 指标及真值标注来源说明；
   - 单元测试增设一对一匹配与重复注入负向断言：注入 2 次多余告警精准识别出 2 个 FP，精确率如实下降至 50% 且召回率保持 100%；
   - 运行 `R5_INDEPENDENT_REPRO.mjs` 中的 monkeypatch 重复注入测试，输出精准报告 expected: 18, observed: 54, tp: 18, fn: 0, fp: 36。

4. P2 数据兼容性：
   - `src/store.js`：trackedFrames 采用 Math.floor(tf) >= 5 处理，安全兼容历史浮点数据并过滤脏数据。

【请重点审查】
1. 运行 `tests/exercise.test.mjs`（32/32 PASS）或审查 AI 的 `R5_INDEPENDENT_REPRO.mjs`，验证 R-005 的两项新反例（hips_move_ankles_static, legs_out_of_sync）有效计数已彻底清零；
2. 验证 R-003 视频首帧 readyState >= 2 等待与 seeked 监听顺序，以及视频结束提示与文档措辞规范；
3. 验证 R-009 浅动作 1-to-1 事件级匹配算法（TP/FP/FN/Precision/Recall/F1），运行重复告警注入确认准确报告 FP=36；
4. 执行全套自动化核验命令（npm run check, npm test, python scripts/test_package_security.py, node scripts/smoke.mjs, npm run benchmark, python scripts/package.py, python scripts/verify_package.py <zip>），确认全部绿灯。

请给出本次 P1 专项闭环的复审结论。
```
