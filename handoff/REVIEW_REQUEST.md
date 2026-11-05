# REVIEW_REQUEST — v0.2.1-r4 第四轮 P1 专项缺陷修复交接审查说明

**交付版本**：v0.2.1-r4  
**交付包**：`release/ai-fit-coach-demo-v0.2.1-handoff.zip` (39 个文件，完整哈希与逐文件零私钥扫描通过)  
**本轮目标**：根据审查 AI 第三轮通过结论（`P0_R3_REVIEW_REPORT.md`）及下一轮修复指示（`NEXT_AI_P1_PROMPT.md`），全面完成以 P1-TEST-001、P1-DATA-CSV 和 R-003~R-010 为核心的 P1 缺陷修复与确定性回归单测。

---

## 一、本轮重点加固与验收点（P1 专项验收）

1. **P1-TEST-001 [P1/测试体系] 安全测试假阳性与交互挂起彻底修复**：
   - **源码位置**：`scripts/test_package_security.py:94–130`、`scripts/package.py:80–90`；
   - **加固措施**：
     - 场景 6 彻底移除 `shell=True`，改用 `shell=False`、显式 `stdin=subprocess.DEVNULL`、`timeout=20`，核验退出码 0 与 `HTTP smoke PASS` 输出标记；
     - 新增场景 7 负向回归测试：破坏冒烟测试替身抛出异常，断言安全测试套件必报错退出，彻底证明绝无假阳性；
     - 打包调用增加 `stdin=subprocess.DEVNULL` 与 `timeout=60`，消除任何子进程挂起风险。

2. **P1-DATA-CSV [P1/学术一致性] MAE 看板与 CSV 导出逐行绝对误差自愈与一致性**：
   - **源码位置**：`src/store.js:48–110`、`tests/store.test.mjs:115–150`；
   - **加固措施**：
     - 实现并导出 `deriveVerifiedAbsError(session)` 纯函数，仅在 `count` 与 `manualCount` 为合法非负整数时计算 `Math.abs(count - manualCount)`；
     - 未人工标注的会话在 CSV 中导出空字符串 `""`（绝不虚假填充 `0` 或 `null`）；
     - 脏数据（如旧持久化的 `absError: -8`）在导出时自愈重算为正误差，导出行误差均值与 `computeMaeStats().realMae` 完全一致。

3. **R-003 [P1/视频评测] 视频分析启动时序加固（第 0 秒等待模型就绪）**：
   - **源码位置**：`src/app.js:374–400`；
   - **加固措施**：加载视频后先暂停在第 0 秒并读取元数据，待 MediaPipe 模型完全下载并初始化就绪后，重置 `video.currentTime = 0`，再与推理循环同步启动播放，解决视频开头帧漏分析竞态。

4. **R-004 [P1/误计数] 动作侧别硬锁定与跨侧跳变阻断（BUG02）**：
   - **源码位置**：`src/exercise.js:65–115, 215–230`、`tests/exercise.test.mjs`；
   - **加固措施**：动作进行中检测到侧别突然跳变（如左腿屈曲未完成跳变到伸直右腿），立即中断重置当前动作（`inRep = false; ready = false;`），提示用户保持单侧面向镜头，严禁跨侧拼接虚假完成动作；单测覆盖 BUG02（不对称双腿+对侧恢复验证计数为 0）。

5. **R-005 [P1/规则定义] 开合跳双下肢协同开合约束（BUG03）**：
   - **源码位置**：`src/exercise.js:35–65, 230–280`、`tests/exercise.test.mjs`；
   - **加固措施**：实现 `getLegSpreadRatio` 计算双脚踝相对于髋宽度的归一化开合比；开合跳判定要求双臂与双腿协同展开（`peakLegSpread >= 1.65`）；单测覆盖 BUG03（腿部固定仅摆臂验证计数为 0）。

6. **R-006 [P1/提示时序] 首次姿态异常提示免冷却即时触发（BUG04）**：
   - **源码位置**：`src/exercise.js:255–270`、`tests/exercise.test.mjs`；
   - **加固措施**：修复 `|| 0` 导致前 3 秒首次异常被冷却抑制的问题；单测覆盖 BUG04（`timestamp < 3000ms` 下注入异常即刻触发）。

7. **R-010 / R-008 / R-009 / R-013 系列完善**：
   - R-010：提前过滤重合退化骨架，`BUG01` 验证返回 `null`；
   - R-008：如实修正离线说明，指明本地 `/models/` 缓存模型与 WASM，ESM 运行时需联网预热；
   - R-009：基准报告动态实算浅动作召回率（`shallowRecallPct`，100.0%），标明纯算法 CPU 吞吐；
   - R-013：分离显示「渲染 FPS」、「AI 推理 FPS」与「推理耗时」。

---

## 二、本地全套自动化验证指令

```bash
npm run check                                                         # 6 个核心 ES 模块语法检查 (PASS)
npm test                                                              # 31/31 项算法、状态机、数据隔离与 BUG01~04 单测 (PASS)
python scripts/test_package_security.py                               # 7 项安全注入与负向防假阳性自动化回归 (PASS)
node scripts/smoke.mjs                                                # 包含目录符号链接与非客户端路径 403 拦截的冒烟测试 (PASS)
npm run benchmark                                                     # 9 组跨 FPS 动作基准测试与实算召回率 (PASS)
python scripts/package.py                                             # 自动化零豁免前置扫描与 ZIP 打包 (PASS)
python scripts/verify_package.py release/ai-fit-coach-demo-v0.2.1-handoff.zip # 独立解包审计与 SHA-256 完整性校验 (PASS)
```

---

## 🤖 供直接复制发给复审 AI 的提示词（Prompt for Reviewer AI）

```markdown
请你扮演资深代码安全与计算机视觉审查专家，对本次提交的 AI Fit Coach v0.2.1-r4 进行第四轮 P1 缺陷专项复审。

【本次交付背景与任务】
第三轮独立复审报告（P0_R3_REVIEW_REPORT.md）已正式确认：R-001-A 与 R-001-B 两项 P0 修复结案通过，同意正式进入 P1 开发。
开发者本轮严格根据审查报告中的优先级指引，全面完成了以下 P1 与 P2 专项修复：
1. P1-TEST-001：修复安全测试假阳性与交互挂起（Scenario 6 移除 shell=True，显式指定 DEVNULL、超时与 HTTP smoke PASS 标志断言；新增 Scenario 7 故意破坏 smoke 的负向回归测试；package.py 子进程统一加入 DEVNULL 与超时）；
2. P1-DATA-CSV：统一导出与看板误差推导函数 deriveVerifiedAbsError，未标注记录导出空字符串 ""（绝不填 0），旧负数脏数据自愈纠偏，CSV 行均值与看板 realMae 严格一致；
3. R-003：视频评测起播时序加固，先暂停于第 0 秒等待 MediaPipe 模型就绪，再重置 currentTime=0 同步播放与推理，解决首帧漏分析竞态；
4. R-004：动作侧别硬锁定，单侧屈曲未完成跳变至对侧时强制中断重置本轮，单测覆盖 BUG02（不对称双腿+跨侧跳变计数严格为 0）；
5. R-005：开合跳下肢协同约束，引入 getLegSpreadRatio 归一化双脚踝间距门控，单测覆盖 BUG03（仅摆臂开合跳计数严格为 0）；
6. R-006：首次姿态异常提示免冷却即时触发，单测覆盖 BUG04（timestamp < 3000ms 首次注入即触发）；
7. R-010：重合退化骨架提前过滤，单测覆盖 BUG01（退化点严格返回 null，不伪造 0°）；
8. R-008 / R-009 / R-013：如实澄清 ESM 运行时需联网预热、基准报告动态实算浅动作召回率（100.0%）、界面独立分离渲染 FPS 与 AI 推理 FPS / 耗时。

【请重点审查】
1. 检查 `scripts/test_package_security.py`，确认 Scenario 6 与 Scenario 7 是否彻底消除了 shell=True 假阳性与挂起隐患；
2. 检查 `src/store.js` 与 `tests/store.test.mjs`，验证 CSV 导出与 computeMaeStats 是否严格一致，且未标注记录为空；
3. 执行 `node repro_regressions.mjs` 或运行 `npm test`（31/31 PASS），复核原审查报告中的 BUG01、BUG02、BUG03、BUG04 是否已全部被成功阻断与修复；
4. 查验全套自动化测试（`npm run check`、`npm test`、`python scripts/test_package_security.py`、`node scripts/smoke.mjs`、`npm run benchmark`、`python scripts/package.py`）。

请给出本次 P1 专项修复的复审结论。
```
