# REVIEW_REQUEST — v0.2.1-r10 动作动力学重构、标准示范与常见错误独立拆分及错误成因剖析交接审查说明

**交付版本**：v0.2.1-r10  
**交付包**：`release/ai-fit-coach-demo-v0.2.1-handoff.zip` (完整哈希与逐文件零私钥扫描通过)  
**本轮目标**：根据用户最新产品与教学需求，对合成骨架动力学模型进行全面生物力学修正，将原先混杂的演示完全拆分为独立的「正确姿势示范」与「常见错误演示」，并上线结构化动作代偿教学剖析系统：
1. **生物力学动力学修正**：
   - 彻底修复深蹲折叠反人类与 16:9 画布长宽比横向拉伸橡皮筋效应（引入踝屈、屈髋、小腿-脊柱双平行线模型与 $R=960/540$ 水平缩放补偿）；
   - 彻底修复弯举大臂甩动瞬移与小臂伸缩变形（锁定大臂欧式几何长度 $L_{upper}=0.20$ 垂直贴身，小臂以真实生物力学弧线绕肘旋转）；
2. **标准示范与常见错误演示彻底独立拆分**：
   - `▷ 正确姿势示范`：100% 达标深度的纯净教科书级动作规范，零代偿零错误，稳定计数 1, 2, 3... 闭环；
   - `⚠ 常见错误演示`：定向注入典型错误动作，支持在界面中自由点选不同错误胶囊标签（Pills），骨架动画与 AI 警报即时联动；
3. **常见错误结构化教学解析面板**：
   - 引入 `EXERCISE_GUIDES` 结构化教学字典，针对深蹲、弯举、开合跳每个典型错误提供四维硬核剖析（错在哪、为什么错、如何纠正、AI 判定规则）；
4. **自动化质量与无回归保障**：
   - 全套单元测试由 34 项扩充至 37 项（全部 PASS，~150ms）；
   - 自动化基准测试 9/9 PASS，Overall MAE = 0.000，浅动作召回率 100.0%，精确率 100.0%。

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
