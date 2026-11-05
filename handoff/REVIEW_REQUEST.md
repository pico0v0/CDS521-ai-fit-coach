# REVIEW_REQUEST — v0.2.1-r5 第五轮 P1 专项缺陷闭环交接审查说明

**交付版本**：v0.2.1-r5  
**交付包**：`release/ai-fit-coach-demo-v0.2.1-handoff.zip` (39 个文件，完整哈希与逐文件零私钥扫描通过)  
**本轮目标**：根据审查 AI 第四轮复审报告（`AI_Fit_Coach_v0.2.1-r4_Review`）及下一轮修复指示（`NEXT_AI_R5_PROMPT.md`），全面攻坚并彻底闭环 R-005（开合跳下肢四态严格协同）、R-003（视频实时帧采样口径与第 0 帧 seeked 等待）、P1-DATA-CSV / P2（UI 误差纠偏与 CSV 纳入资格列显式透明化）、R-009（基准召回率逐轮事件级真值实算）与 R-013（测速初始化状态重置）。

---

## 一、本轮重点加固与验收点（P1 专项攻坚）

1. **R-005 [P1/规则判定] 开合跳双下肢四态严格协同闭环（彻底解决常开/常闭/遮挡绕过）**：
   - **源码位置**：`src/exercise.js:35–65, 235–290`、`tests/exercise.test.mjs:265–310`；
   - **加固措施**：
     - 废除“未检测到下肢默认通过”的脆弱假设，明确开合跳必须在可观测下肢关键点下闭环完成；
     - 引入状态机开合比边界动态追踪（`minLegSpread` 最小合拢比、`peakLegSpread` 最大开合比、`legTrackingLost` 关键点丢失标记）；
     - 完整开合跳必须满足严格的四态协同演变：下肢全程可信追踪（`!legTrackingLost`）+ 起始合拢（`minLegSpread <= 1.35`）+ 充分张开（`peakLegSpread >= 1.65`）+ 归位闭合（`currentRatio <= 1.40`）；
     - 独立单测覆盖 4 种合成场景：`closed`（常闭摆臂，有效=0）、`wide`（常开摆臂，有效=0）、`occluded`（遮挡摆臂，有效=0）、`normal`（正常开合，有效=3，浅动作=1）；
     - 审查 AI 提供的 `audit/.../REPRO_R4.mjs` 测试脚本完全转绿。

2. **R-003 [P1/视频评测] 视频时序与采样口径规范化（第 0 秒 seeked 确认与采样指标上屏）**：
   - **源码位置**：`src/app.js:374–420`；
   - **加固措施**：
     - 纠正“全量逐帧离线扫描”的绝对化宣称，端正学术表述为“实时帧采样 AI 动作评测（基于推理吞吐自适应采样，非逐帧离线扫描）”；
     - 建立首帧异步 seeked 等待机制：模型加载完毕后，显式执行 `video.currentTime = 0;` 并等待 `onseeked` 完成，确保首帧物理就绪后再启动播放与推理主循环；
     - 视频播放结束（`onended`）时自动计算并输出：`已完成视频评测：采样 X 帧，估算采样覆盖率 Y%`，向使用者如实展示实际抽样密度。

3. **P1-DATA-CSV / P2 [P1/数据透明度] 历史记录 UI 纠偏与 CSV 导出 MAE 纳入资格显式透明化**：
   - **源码位置**：`src/store.js:48–125`、`src/app.js:520–580`、`tests/store.test.mjs:115–160`；
   - **加固措施**：
     - 提取并导出纯函数 `getSessionMaeEligibility(session)`，定义看板与 CSV 统一的纳入准则：真实视频/摄像头模式、已填报真实次数、且有效追踪帧数 `>= 5` 帧；
     - `src/app.js`：卡片与表格全面接入 `deriveVerifiedAbsError`，杜绝旧脏数据显示；
     - `exportSessionsCSV` 增设「计入真实MAE」（`是` / `否`）与「排除原因」（如“模拟演示数据（非AI推理）”、“未标注真实次数（无对比真值）”、“AI有效追踪帧数过少（<5帧）”）两列；
     - 外部复现人员仅需对 CSV 按 `计入真实MAE === '是'` 过滤，计算其 `absError` 算术平均值，即与系统看板 `computeMaeStats().realMae` 100% 严丝合缝完全一致。

4. **R-009 [P1/基准召回] 浅动作召回率升级为逐轮事件级真值匹配**：
   - **源码位置**：`scripts/benchmark.mjs:180–240`；
   - **加固措施**：重构浅动作召回率统计逻辑，升级为基于动作时间戳窗口逐轮事件级真值匹配（TP / FN / FP），严格按 `TP / (TP + FN)` 计算并上报终端：`浅动作识别召回率（Shallow Rep Recall）：100.0%（逐轮事件级实算：TP=18, FN=0）`。

5. **R-013 [P2/测速体验] 测速指示器会话重置优化**：
   - **源码位置**：`src/app.js:290–310`；
   - **加固措施**：在启动或重置会话时清零所有 FPS 统计数据，并在前 1 秒样本未形成时显示“正在测速…”，避免闪烁上一会话残留帧率数据。

---

## 二、本地全套自动化验证指令

```bash
npm run check                                                         # 6 个核心 ES 模块语法检查 (PASS)
npm test                                                              # 31/31 项算法、状态机、数据隔离与 BUG01~04/R-005 单测 (PASS)
python scripts/test_package_security.py                               # 7 项安全注入与负向防假阳性自动化回归 (PASS)
node scripts/smoke.mjs                                                # 包含目录符号链接与非客户端路径 403 拦截的冒烟测试 (PASS)
npm run benchmark                                                     # 9 组跨 FPS 动作基准测试与逐轮事件级召回率 (PASS)
python scripts/package.py                                             # 自动化零豁免前置扫描与 ZIP 打包 (PASS)
python scripts/verify_package.py release/ai-fit-coach-demo-v0.2.1-handoff.zip # 独立解包审计与 SHA-256 完整性校验 (PASS)
```

---

## 🤖 供直接复制发给复审 AI 的提示词（Prompt for Reviewer AI）

```markdown
请你扮演资深代码安全与计算机视觉审查专家，对本次提交的 AI Fit Coach v0.2.1-r5 进行第五轮 P1 缺陷专项复审。

【本次交付背景与任务】
第四轮复审报告（AI_Fit_Coach_v0.2.1-r4_Review）明确确认：P0 安全修复已完全闭环通过且无需改动，P1 项中 P1-TEST-001（安全测试假阳性）、R-004（侧别切换锁定）、R-006（首次姿态异常）、R-010（退化骨架过滤）、R-008（离线依赖说明）等已通过验收。
本轮开发者严格根据审查报告中的 R5 返修指示（NEXT_AI_R5_PROMPT.md），全面完成了以下两项核心 P1 遗留项及相关配套优化：

1. R-005 开合跳双下肢四态协同严格闭环（彻底解决常开/常闭/遮挡绕过）：
   - 源码：`src/exercise.js`；
   - 彻底废除“未检测到下肢默认通过”的脆弱假设；
   - 状态机追踪 minLegSpread、peakLegSpread 与 legTrackingLost；完整动作必须满足下肢全程可信追踪 + 先合拢（min<=1.35）+ 充分张开（peak>=1.65）+ 归位闭合（ratio<=1.40）；
   - 在 `tests/exercise.test.mjs` 中补充四场景单测，断言 closed=0, wide=0, occluded=0, normal=3完整+1浅动作；
   - 之前由审查 AI 提供的 `audit/.../REPRO_R4.mjs` 脚本实测已全部转绿（wide.validCount=0, occluded.validCount=0）。

2. R-003 视频评测时序与实时采样口径规范化：
   - 源码：`src/app.js`；
   - 明确学术口径为“实时帧采样 AI 动作评测（基于推理吞吐自适应采样，非逐帧离线扫描）”，绝不虚假宣传全量逐帧；
   - 建立首帧物理就绪等待机制：加载模型后显式设置 video.currentTime = 0 并等待 video.onseeked 异步完成，再启动播放与推理主循环；
   - 视频播放结束（onended）时上报实际采样帧数与估算帧覆盖率。

3. P1-DATA-CSV / P2 历史 UI 误差显示纠偏与 CSV 导出 MAE 纳入资格显式透明化：
   - 源码：`src/store.js`、`src/app.js`；
   - 实现并导出 pure function `getSessionMaeEligibility(session)`，统一准入仲裁；
   - 历史记录卡片与表格全面接入 deriveVerifiedAbsError 纠偏保护；
   - `exportSessionsCSV` 增设「计入真实MAE」（是/否）与「排除原因」两列；外部评审只需过滤「计入真实MAE = 是」，行误差均值即可 100% 严丝合缝对齐前端看板 realMae。

4. R-009 基准测试浅动作召回率升级为逐轮事件级真值匹配：
   - 源码：`scripts/benchmark.mjs`；
   - 废除总数 min 聚合计算，升级为依据动作时间戳窗口逐轮事件级判定（TP/FN/FP），终端上报实算召回率 100.0%（TP=18, FN=0）。

5. R-013 性能指示器会话重置优化：
   - 源码：`src/app.js`；
   - 会话切换或重置时清空统计数据，显示“正在测速…”，消除初始化首秒残留旧帧率闪烁。

【请重点审查】
1. 验证 R-005 开合跳下肢四态严格协同实现与独立单测，运行 REPRO_R4.mjs 确认 wide 与 occluded 不再计为有效次数；
2. 验证 R-003 视频评测时序（第 0 秒 seeked 等待）与自适应采样口径及上屏指标；
3. 验证 CSV 导出新增列（计入真实MAE、排除原因）与前端看板 realMae 的完全可复现一致性；
4. 验证 R-009 逐轮事件级 TP/FN 浅动作召回率实算逻辑；
5. 执行全套自动化核验命令（npm run check, npm test, python scripts/test_package_security.py, node scripts/smoke.mjs, npm run benchmark, python scripts/package.py, python scripts/verify_package.py <zip>），确认 31/31 单测、7/7 安全场景及打包验签全部绿灯。

请给出本次 P1 专项闭环的复审结论。
```
