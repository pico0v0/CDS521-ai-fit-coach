# TEST_RESULTS — 本轮已执行与未执行（v0.2.1-r11）

> **坚守学术诚实与证据原则**：本文件记录实际执行与未执行内容。算法模拟通过绝不代表真实 AI 摄像头通过。

## 一、自动化验收执行记录（执行环境：Node 22.16.0 / Python 3.12 / Windows 11 / Linux POSIX）

| 命令 | 预期与测试目标 | 实际结果 | 核心指标 / 证据摘要 |
| :--- | :--- | :--- | :--- |
| `npm run check` | 检查 6 个 ES 核心模块语法有效性 | **PASS** | 6/6 模块语法检查通过，无任何语法、导入或引用错误 |
| `npm test` | 执行全量单元测试（含 GEO-01 像素几何骨骼长度、GEO-02 呼吸刚体不变、MODE-01 开合跳全幅不对称、MODE-02 3×3 难度矩阵 100% 达标、STATE-01 切换状态隔离断言） | **PASS** | **41/41 项测试全部通过**，耗时约 130ms |
| `node scripts/smoke.mjs` | 静态服务白名单、目录符号链接防御与敏感路径阻断 | **PASS** | `/server.mjs`, `/package.json`, `private_notes.json`, 外部文件符号链接与内部目录符号链接全部 403 Forbidden；测试完成后无悬垂符号链接残留 |
| `python scripts/test_package_security.py` | 验证零豁免扫描与 8 大安全注入/防假阳性/HTTPS 故障封闭场景 | **PASS** | **8/8 场景全量通过**（含 Scenario 8：HTTPS 缺失证书严格退出码 1 故障封闭断言） |
| `npm run benchmark` | 9 组跨 FPS 采样率时序状态机稳定性与严格一对一事件召回率 | **PASS** | 合成状态机闭环 MAE = 0.000，浅动作严格一对一实算：TP=18, FP=0, FN=0, Recall=100.0%, Precision=100.0%, F1=1.000 |
| `python scripts/package.py` | 自动化前置扫描、全套自动化核验与精简 ZIP 打包（排除模型二进制） | **PASS** | 零豁免全量逐字节无私钥头扫描，打包生成轻量 Handover ZIP（~183KB） |
| `python scripts/verify_package.py <zip>` | 独立解包审计、零豁免私钥扫描与 SHA-256 清单核对 | **PASS** | 39 个文件哈希与 100% 逐文件私钥扫描完全通过 |

### 单测明细（41 项全部绿色通过）
1. `2D angle geometry, invalid and degenerate landmarks`
2. `synthetic landmarks have measurable joint angles`
3. `low visibility and missing landmarks do not produce fake measurements`
4. `squat: counts 3 complete and flags one shallow in 4 synthetic cycles`
5. `curl: counts 3 complete and flags one shallow in 4 synthetic cycles`
6. `jumping_jack: counts 3 complete and flags one shallow in 4 synthetic cycles`
7. `squat: static pose never counts`
8. `squat: loss of pose interrupts rep`
9. `squat: long gap does not complete an unfinished rep`
10. `curl: static pose never counts`
11. `curl: loss of pose interrupts rep`
12. `curl: long gap does not complete an unfinished rep`
13. `jumping_jack: static pose and interrupted rep handling`
14. `timestamps must be increasing; invalid exercise rejected`
15. `simulated angle exercises have planned shallow cycles`
16. `side hysteresis prevents flickering when confidences are close`
17. `analyzer tracks depth progress and strictly resets rep if side switches mid-rep (R-004)`
18. `checkPostureFault detects excessive trunk forward lean in squat`
19. `checkPostureFault detects upper arm swinging during curl`
20. `checkPostureFault detects arm asymmetry in jumping jacks`
21. `analyzer supports difficulty presets and target rep goal achievement`
22. `R-010 regression: degenerate landmarks in jumping_jack return null instead of 0°`
23. `R-004 regression: side switch while tracked side stays bent does NOT count a rep`
24. `R-005 regression: jumping jacks require bidirectional leg coordination across all scenarios`
25. `R-006 regression: first posture fault within first 3000ms is immediately triggered`
26. `R-009 regression: 1-to-1 event-level shallow rep matching accurately detects duplicate false alarms (FP) under injection`
27. `EXERCISE_GUIDES schema: all exercises have standard cues and detailed faults breakdown`
28. `simulatePose in standard mode produces 100% full reps without shallow reps`
29. `simulatePose in fault mode triggers designated biomechanical fault`
30. `GEO-01 & GEO-02 regression: squat pixel Euclidean geometry, rigid bone lengths and double-parallel law`
31. `MODE-01 regression: jumping jack fault 1 (arm_asymmetry) preserves full amplitude without shallow rep reduction`
32. `MODE-02 regression: 3x3 difficulty matrix in standard demonstration achieves 100% full reps without shallow reps`
33. `STATE-01 regression: resetIncompleteRep clears active rep state on mode switch preventing cross-mode state bleeding`
34. `session persistence is local, bounded, and clearable`
35. `corrupted and untrusted local records are ignored`
36. `advice depends on fatigue, incomplete reps, no reps and goal`
37. `session export generates valid CSV with BOM and JSON`
38. `computeMaeStats strictly isolates real AI sessions from simulation data`
39. `exportSessionsCSV uses deriveVerifiedAbsError ensuring screen MAE matches CSV row-by-row (P1-DATA-CSV)`
40. `R-003 regression: video timeline simulation spanning >3s proves cumulative infer counts are never wiped by 1-sec FPS resets`
41. `R-003 integration: begin('video') path strictly verifies frame 0 single tracking count and error abort`
24. `R-005 regression: jumping jacks require bidirectional leg coordination across all scenarios`
25. `R-006 regression: first posture fault within first 3000ms is immediately triggered`
26. `R-009 regression: 1-to-1 event-level shallow rep matching accurately detects duplicate false alarms (FP) under injection`
27. `EXERCISE_GUIDES schema: all exercises have standard cues and detailed faults breakdown`
28. `simulatePose in standard mode produces 100% full reps without shallow reps`
29. `simulatePose in fault mode triggers designated biomechanical fault`
30. `session persistence is local, bounded, and clearable`
31. `corrupted and untrusted local records are ignored`
32. `advice depends on fatigue, incomplete reps, no reps and goal`
33. `session export generates valid CSV with BOM and JSON`
34. `computeMaeStats strictly isolates real AI sessions from simulation data`
35. `exportSessionsCSV uses deriveVerifiedAbsError ensuring screen MAE matches CSV row-by-row (P1-DATA-CSV)`
36. `R-003 regression: video timeline simulation spanning >3s proves cumulative infer counts are never wiped by 1-sec FPS resets`
37. `R-003 integration: begin('video') path strictly verifies frame 0 single tracking count and error abort`
19. `checkPostureFault detects upper arm swinging during curl`
20. `checkPostureFault detects arm asymmetry in jumping jacks`
21. `analyzer supports difficulty presets and target rep goal achievement`
22. **`R-010 regression: degenerate landmarks in jumping_jack return null instead of 0°` (BUG01 复现断言)**
23. **`R-004 regression: side switch while tracked side stays bent does NOT count a rep` (BUG02 复现断言)**
24. **`R-005 regression: jumping jacks require bidirectional leg coordination across all scenarios` (涵盖全部 8 大反例与难度模式断言：常开=0, 常合=0, 遮挡=0, 髋动脚踝不动=0, 异步开合=0, 早收腿=0, 初学者118°达标=3有效+1浅动作, 标准=3有效+1浅动作)**
25. **`R-006 regression: first posture fault within first 3000ms is immediately triggered` (BUG04 复现断言)**
26. **`R-009 regression: 1-to-1 event-level shallow rep matching accurately detects duplicate false alarms (FP) under injection` (严格一对一事件匹配与重复注入负向断言)**
27. `session persistence is local, bounded, and clearable`
28. `corrupted and untrusted local records are ignored`
29. `advice depends on fatigue, incomplete reps, no reps and goal`
30. `session export generates valid CSV with BOM and JSON`
31. `computeMaeStats strictly isolates real AI sessions from simulation data`
32. `exportSessionsCSV uses deriveVerifiedAbsError ensuring screen MAE matches CSV row-by-row (P1-DATA-CSV)`
33. **`R-003 regression: video timeline simulation spanning >3s proves cumulative infer counts are never wiped by 1-sec FPS resets` (模拟 3.5 秒跨越 3 个 FPS 周期，断言累计推理帧数持续递增且 >= trackedFrames，均值耗时严格准确)**
34. **`R-003 integration: begin('video') path strictly verifies frame 0 single tracking count and error abort` (真机业务路径全量覆盖：首帧检出 1 人满足 inferred=1/tracked=1 杜绝双计数；首帧 0 人满足 inferred=1/tracked=0；首帧推理抛错严密中断且 video.play() 绝不调用；35 帧多帧模拟满足 inferred=35/tracked=17；取消挂起视频后切换至 demo，延迟错误事件绝不误伤新会话；旧模型延迟拒绝异常绝不泄露并被运行令牌完全阻断)**

---

## 二、未执行 / 未验证项（必须明确标注，不得谎称通过）

1. **真实真人动作识别准确率：未验证（NOT RUN）**。
   - `npm run benchmark` 输出的 MAE = 0.000 仅代表确定性生物力学仿真序列下有限状态机与过滤器的闭环能力；
   - 真人受试者在不同机位、光照、服装及真实 MediaPipe 波动下的 MAE 必须按照 `docs/EXPERIMENT_PROTOCOL.md` 规范由人工对照实测得出。
2. **真机物理摄像头（Webcam）及浏览器端到端：未验证（BLOCKED）**。
   - 开发与审查环境缺乏物理摄像头硬件及 GUI 桌面，未通过真实用户按键点击测试；真实摄像头需在答辩演示笔记本上走查。
3. **真实断网离线首度加载 MediaPipe ESM 运行库：不支持（UNSUPPORTED）**。
   - 本地 `/models/` 离线缓存仅包含 `.task` 视觉模型与 WASM 算子；在未缓存浏览器首度加载时仍需公网下载 ESM 运行库；离线答辩推荐提前连网打开页面预热或使用模拟模式。

---

## 二、未执行 / 未验证项（必须明确标注，不得谎称通过）

1. **真实真人动作识别准确率：未验证（NOT RUN）**。
   - `npm run benchmark` 输出的 MAE = 0.000 仅代表确定性生物力学仿真序列下有限状态机与过滤器的闭环能力；
   - 真人受试者在不同机位、光照、服装及真实 MediaPipe 波动下的 MAE 必须按照 `docs/EXPERIMENT_PROTOCOL.md` 规范由人工对照实测得出。
2. **真机物理摄像头（Webcam）及浏览器端到端：未验证（BLOCKED）**。
   - 开发与审查环境缺乏物理摄像头硬件及 GUI 桌面，未通过真实用户按键点击测试；真实摄像头需在答辩演示笔记本上走查。
3. **真实断网离线首度加载 MediaPipe ESM 运行库：不支持（UNSUPPORTED）**。
   - 本地 `/models/` 离线缓存仅包含 `.task` 视觉模型与 WASM 算子；在未缓存浏览器首度加载时仍需公网下载 ESM 运行库；离线答辩推荐提前连网打开页面预热或使用模拟模式。

---

## 二、未执行 / 未验证项（必须明确标注，不得谎称通过）

1. **真实真人动作识别准确率：未验证（NOT RUN）**。
   - `npm run benchmark` 输出的 MAE = 0.000 仅代表确定性生物力学仿真序列下有限状态机与过滤器的闭环能力；
   - 真人受试者在不同机位、光照、服装及真实 MediaPipe 波动下的 MAE 必须按照 `docs/EXPERIMENT_PROTOCOL.md` 规范由人工对照实测得出。
2. **真机物理摄像头（Webcam）及浏览器端到端：未验证（BLOCKED）**。
   - 开发与审查环境缺乏物理摄像头硬件及 GUI 桌面，未通过真实用户按键点击测试；真实摄像头需在答辩演示笔记本上走查。
3. **真实断网离线首度加载 MediaPipe ESM 运行库：不支持（UNSUPPORTED）**。
   - 本地 `/models/` 离线缓存仅包含 `.task` 视觉模型与 WASM 算子；在未缓存浏览器首度加载时仍需公网下载 ESM 运行库；离线答辩推荐提前连网打开页面预热或使用模拟模式。

---

## 二、未执行 / 未验证项（必须明确标注，不得谎称通过）

1. **真实真人动作识别准确率：未验证（NOT RUN）**。
   - `npm run benchmark` 输出的 MAE = 0.000 仅代表确定性生物力学仿真序列下有限状态机与过滤器的闭环能力；
   - 真人受试者在不同机位、光照、服装及真实 MediaPipe 波动下的 MAE 必须按照 `docs/EXPERIMENT_PROTOCOL.md` 规范由人工对照实测得出。
2. **真机物理摄像头（Webcam）及浏览器端到端：未验证（BLOCKED）**。
   - 开发与审查环境缺乏物理摄像头硬件及 GUI 桌面，未通过真实用户按键点击测试；真实摄像头需在答辩演示笔记本上走查。
3. **真实断网离线首度加载 MediaPipe ESM 运行库：不支持（UNSUPPORTED）**。
   - 本地 `/models/` 离线缓存仅包含 `.task` 视觉模型与 WASM 算子；在未缓存浏览器首度加载时仍需公网下载 ESM 运行库；离线答辩推荐提前连网打开页面预热或使用模拟模式。
