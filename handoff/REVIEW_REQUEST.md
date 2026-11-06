# REVIEW_REQUEST — v0.2.1-r11 严格像素欧式几何、全难度达标、模式状态隔离与安全故障封闭交接审查说明

**交付版本**：v0.2.1-r11  
**交付包**：`release/ai-fit-coach-demo-v0.2.1-handoff.zip` (39 个文件，~183KB，排除模型二进制，完整哈希与逐文件零私钥扫描通过)  
**本轮目标**：基于专业复审报告《AI Fit Coach v0.2.1-r10 独立安全、几何与运动生物力学复审报告》，定向全面修复报告确认的 6 项 P1 级缺陷：
1. **GEO-01**：重构深蹲正向运动学为统一的 960×540 像素推导空间，严格保证小腿 $118.80\text{px}$、大腿 $113.40\text{px}$、躯干 $124.20\text{px}$、手臂 $91.80\text{px}$ 欧式刚体长度恒定；最低点小腿前倾角 $20.00^\circ$、躯干前倾角 $22.00^\circ$（偏差 $2.00^\circ \le 3.00^\circ$ 双平行线法则成立）；实测像素膝角与分析器、模拟器报告完全一致，均为 $91.00^\circ$（0.000° 绝对零偏差）；
2. **GEO-02**：彻底移除渲染呼吸动画，消除躯干长度在 121.32–126.58px 范围内的波动；
3. **MODE-01**：修复开合跳错误索引 1（`arm_asymmetry`），左臂保持头顶满额幅度（$140^\circ \ge 135^\circ$），右臂受限 $45\%$，两侧差值 $77^\circ > 35^\circ$ 触发不对称警报，不再错误降幅为浅动作；
4. **MODE-02**：标准规范示范全面自适应 3×3 难度矩阵，进阶难度下深蹲（$90^\circ \le 95^\circ$）、弯举（$45^\circ \le 50^\circ$）、开合跳（$150^\circ \ge 145^\circ$）均实现 100% 满额达标（3/3 有效）；
5. **STATE-01**：在演示切换 Tab 或点击错误胶囊按钮时，联动调用 `resetIncompleteRep()` 与重置周期计时原点，彻底杜绝混用前序动作周期的运动状态；
6. **SEC-01**：`server.mjs` 在显式开启 `HTTPS=true` 且缺少证书文件时，执行 `process.exit(1)` 严格故障封闭（Fail-Closed），彻底杜绝静默降级为明文 HTTP；
7. **交付包体积精简优化**：交付包排除二进制模型（`models/pose_landmarker_lite.task` 和 `models/wasm/`），本地保留完整模型以支持无网离线运行，交付包体积由 8.08MB 降至 183KB。

---

## 一、自动化测试与验收矩阵

```bash
npm run check                                                         # 6 个核心 ES 模块语法检查 (PASS)
npm test                                                              # 41/41 项全量单测 (PASS, ~130ms)
python scripts/test_package_security.py                               # 8 项安全注入/防假阳性/HTTPS 故障封闭回归 (PASS)
node scripts/smoke.mjs                                                # 包含目录符号链接与非客户端路径 403 拦截的冒烟测试 (PASS)
npm run benchmark                                                     # 9 组跨 FPS 动作基准测试与严格 1-to-1 事件匹配 (PASS, MAE=0.000)
python scripts/package.py                                             # 自动化零豁免前置扫描与精简 ZIP 打包 (PASS)
python scripts/verify_package.py release/ai-fit-coach-demo-v0.2.1-handoff.zip # 独立解包审计与 SHA-256 完整性校验 (PASS)
```

---

## 一、本轮重点加固与验收点

1. **深蹲与弯举动力学生物力学修复**：
   - **源码位置**：`src/simulator.js:125–215`；
   - **加固点**：
     - 深蹲：小腿倾角 `shinTiltRad = (3 + 16 * squatRatio) * PI / 180`，小腿位移应用 `R = 960/540` 补偿；躯干角平滑保持双平行线 `(5 + 17 * squatRatio) * PI / 180`，深度到达时大腿屈曲至与地面平行（估计角度 91°）；
     - 弯举：大臂紧贴身体固定，肘部内角 `normElbowAngle = (280 - angleDeg * 1.35) * PI / 180`，肘部与小臂位移均应用长宽比补偿，彻底消除横向拉伸。

2. **标准模式与错误模式解耦与无损兼容**：
   - **源码位置**：`src/simulator.js:45–80`、`src/exercise.js:25–140`、`src/app.js`；
   - **加固点**：
     - `simulatePose(elapsedMs, exerciseId, options)`：当 `options.mode === 'standard'` 时输出无代偿标准动作；当 `options.mode === 'fault'` 时按 `options.faultIndex` 输出对应代偿；无 `mode` 参数时默认保持既有 4 周期循环，100% 兼容历史测试与基准评测。

3. **四维结构化错误剖析教学卡片**：
   - **源码位置**：`src/exercise.js:EXERCISE_GUIDES`、`src/app.js:renderDemoGuideHTML`、`src/styles.css`；
   - **加固点**：
     - 包含：错在哪（代偿位置）、为什么错（损伤隐患）、如何纠正（动作要领）、AI 判定规则（检测逻辑）；
     - 界面提供胶囊标签实时切换错误，支持在动画播放中无缝切换并同步更新教练反馈文本与骨架高亮。

---

## 二、本地全套自动化验证指令

```bash
npm run check                                                         # 6 个核心 ES 模块语法检查 (PASS)
npm test                                                              # 37/37 项全量单测 (PASS, ~150ms)
python scripts/test_package_security.py                               # 7 项安全注入与防假阳性自动化回归 (PASS)
node scripts/smoke.mjs                                                # 包含目录符号链接与非客户端路径 403 拦截的冒烟测试 (PASS)
npm run benchmark                                                     # 9 组跨 FPS 动作基准测试与严格 1-to-1 事件匹配 (PASS)
python scripts/package.py                                             # 自动化零豁免前置扫描与 ZIP 打包 (PASS)
python scripts/verify_package.py release/ai-fit-coach-demo-v0.2.1-handoff.zip # 独立解包审计与 SHA-256 完整性校验 (PASS)
```

---

## 🤖 供直接复制发给复审 AI 的提示词（Prompt for Reviewer AI）

```markdown
请你扮演资深代码安全、计算机视觉与运动生物力学审查专家，对本次提交的 AI Fit Coach v0.2.1-r10 交付版本进行全方位严格复审。

【本次交付背景与任务】
在前期完成了 P0 安全防护（静态服务路径白名单、目录符号链接边界防护、零豁免私钥扫描）与 P1 业务时序加固（开合跳动态阈值协同、时钟累加与滑动窗口解耦、生命周期令牌消除取消竞态）的基础上，本轮针对用户提出的运动学合理性与教学演示清晰度需求进行了专项升级：
1. 动力学重构：消除深蹲折叠反人类与 16:9 画布长宽比横向拉伸橡皮筋效应；消除哑铃弯举大臂甩动瞬移与小臂伸缩变形；
2. 演示模式拆分：将原先混合在一起的演示彻底拆解为独立的「正确姿势示范」（100% 达标深度规范）与「常见错误演示」（代偿错误模拟）；
3. 结构化教学剖析系统：为三大动作定义四维错误剖析（错在哪、为什么错、如何纠正、AI 判定规则）并在训练界面提供实时交互卡片；
4. 测试套件扩充：单测从 34 项扩充至 37 项，基准测试 9/9 全场景通过，Overall MAE 严格保持 0.000。

【请重点审查以下核心模块】
1. 动力学与画布长宽比几何补偿（src/simulator.js）：
   - 检查深蹲（squat）与弯举（curl）是否正确引入了画布长宽比补偿系数（R = 960 / 540），确保小腿、大腿、躯干、大臂与前臂在任何屈伸角度下均维持严格固定的欧氏几何像素长度，无横向拉伸或压缩；
   - 检查深蹲双平行线法则（躯干前倾角与小腿前倾角平行）的实现。
2. 模式拆分与向后兼容性（src/simulator.js & src/exercise.js）：
   - 检查 options.mode: 'standard' 与 options.mode: 'fault'（结合 faultIndex）的分支逻辑；
   - 检查在未传递 options.mode 时，系统是否正确回退到旧版 4 周期循环，保障原有 34 项测试及自动化基准评测脚本无破坏。
3. 错误剖析结构化 Schema 与交互（src/exercise.js & src/app.js）：
   - 检查 EXERCISE_GUIDES 字典中三大动作的 standard 与 faults 字段是否完整规范；
   - 检查界面上切换错误标签（select-fault）与切换示范模式（switch-demo-tab）时的状态更新与渲染防护。
4. 全套自动化验收回归执行：
   请依次执行以下 7 条指令：
   1. npm run check
   2. npm test
   3. python scripts/test_package_security.py
   4. node scripts/smoke.mjs
   5. npm run benchmark
   6. python scripts/package.py
   7. python scripts/verify_package.py release/ai-fit-coach-demo-v0.2.1-handoff.zip
   确认全部通过且无任何警告，ZIP 包文件哈希清单与零私钥扫描 100% 绿灯。

请根据以上检查点，给出本次交付的专业复审报告与审查结论。
```
