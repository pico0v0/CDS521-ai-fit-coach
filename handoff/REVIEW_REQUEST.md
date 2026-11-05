# REVIEW_REQUEST — v0.2.1-r1 第一轮审查交接说明

**交付版本**：v0.2.1-r1  
**交付包**：`release/ai-fit-coach-demo-v0.2.1-handoff.zip`  
**本轮目标**：根据审查报告（REVIEW_REPORT.md），专职定向修复 2 项 P0 阻断性缺陷（R-001 安全暴露 与 R-002 统计混算），不扩大开发范围，保留原生零 npm 依赖架构。

---

## 一、本轮希望审查者优先复核的项（P0 验收）

1. **R-001 [P0/安全] 静态服务敏感文件拒绝与发布打包扫描**：
   - **源码位置**：`server.mjs:22–66`、`scripts/package.py:22,50–65`、`scripts/smoke.mjs:26–42`；
   - **审查点**：
     - 请求 `/dummy_probe_key.pem`、`/key.pem`、`/cert.pem` 或任何未在白名单的后缀，是否均返回 403 Forbidden 或 404，绝不泄露私钥内容；
     - 启动 HTTPS 时，私钥路径是否已移至项目外部 `../ai-fit-coach-tls/` 或通过环境变量指定；
     - `scripts/package.py` 是否能扫描拦截工作区内的 `.pem`、`.key` 文件或包含私钥特征码的内容，并在出现密钥时立即终止打包；
     - `audit` 目录是否已被排除在发布 ZIP 之外。

2. **R-002 [P0/学术数据] 真实 AI 对照 MAE 与模拟数据物理隔离**：
   - **源码位置**：`src/store.js:48–71`（`computeMaeStats`）、`src/app.js:111–130`（`reportsPage`）、`tests/store.test.mjs:61–105`；
   - **审查点**：
     - 纯函数 `computeMaeStats` 是否强制过滤 `mode ∈ {'camera', 'video'}`、`trackedFrames >= 5` 以及合法的非负整数 `manualCount`；
     - 混入 10 条模拟零误差会话时，真实 AI MAE 是否分毫不受影响（保持 1.50）；
     - 仅有模拟数据时，看板是否如实显示「暂无有效真人对照数据」，严禁伪造假 0.00；
     - `src/app.js` 弹窗录入是否采用 `/^\d+$/` 严格正则校验，拦截浮点数与负数。

3. **R-007 [P1/兼容性] 跨平台打包命令**：
   - `scripts/package.py` 中的 `run(cmd)` 是否已将命令单字符串化，可在 Linux/macOS POSIX 环境下直接运行 `python scripts/package.py`。

---

## 二、自动化检验与复现指令

```bash
npm run check                                                         # 6 个核心 ES 模块语法检查 (PASS)
npm test                                                              # 26/26 项算法、状态机与数据隔离单测 (PASS)
npm run benchmark                                                     # 9 组跨 FPS 动作基准测试 (PASS)
node scripts/smoke.mjs                                                # 包含 R-001 假私钥拦截的冒烟测试 (PASS)
python scripts/package.py                                             # 自动化生成交付 ZIP 并执行 SHA-256 完整性校验
python scripts/verify_package.py release/ai-fit-coach-demo-v0.2.1-handoff.zip # 验签完整性
```

---

## 🤖 供直接复制发给复审 AI 的提示词（Prompt for Reviewer AI）

```markdown
请你扮演资深代码安全与计算机视觉审查专家，复审本次提交的 AI Fit Coach v0.2.1-r1 修复包。

【本次修复任务】
开发者收到了第一轮审查意见（REVIEW_REPORT.md），本轮严格遵照指示，仅针对两项 P0 缺陷进行了修复，未新增其他功能：
1. R-001：静态服务防范私钥泄漏（强制白名单、拦截 .pem/.key、私钥路径移至项目外、打包脚本强制阻断检测）；
2. R-002：真实 AI MAE 与模拟演示数据物理隔离（实现 computeMaeStats 纯函数、无真实数据时显式拒绝输出假 0.00、强化非负整数真值校验、单测断言混合输入隔离性）。

【请重点审查】
1. 检查 `server.mjs` 和 `scripts/smoke.mjs`，验证对 `.pem`、`.key` 及未授权文件的访问是否彻底被 403 阻断；
2. 检查 `scripts/package.py`，确认工作区出现密钥时是否具备自动中止机制，且打包 ZIP 不包含任何私钥或 audit 目录；
3. 检查 `src/store.js` 的 `computeMaeStats` 及 `tests/store.test.mjs`，确认真实 AI MAE 是否无论在纯模拟数据还是混合数据下，都能保证 100% 物理隔离；
4. 检查 `handoff/FIX_REPORT.md`，评估缺陷根因、修复逻辑与证据链条是否完整真实。

请给出本次 P0 修复的复审结论（通过/未通过），并明确是否允许进入下一轮（P1 缺陷：R-003~R-009）的修复。
```
