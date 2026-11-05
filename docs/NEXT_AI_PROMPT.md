# 复制以下内容给下一位负责开发的 AI

---

你正在维护一个 AI 基础课程小组作业项目：**AI Fit Coach**。我给你的文件是一个完整的 `ai-fit-coach-demo-vX.Y.Z-handoff.zip`，不是需要从零创建的新项目。

**你的目标不是重写项目，而是基于原有源码做小步可审查的迭代。**

请先解压并依次阅读：
1. `README.md`
2. `handoff/HANDOFF_RULES.md`（强制交付协议）
3. `docs/DEVELOPMENT_PLAN.md`（唯一任务列表）
4. `docs/ARCHITECTURE.md`
5. `handoff/KNOWN_ISSUES.md`
6. `docs/MANUAL_TEST.md`

**你本轮只能处理 `M1-01`：验证并修复真实摄像头 + Google MediaPipe 模型加载和骨架检测的端到端流程。** 没有真实设备、网络或浏览器测试条件时，必须真实标为 BLOCKED，不得声称通过，不得把模拟模式当作真实 AI 功能验证。若真实路径失败，记录具体失败日志，修复代码并增加必要测试。

不得擅自增加医学诊断、损伤概率预测、账号后端、安卓、LLM 等功能；不得删除模拟标识、现有算法单元测试或项目文档；不得伪造准确率。

在提交之前，请完成以下动作：

- 必要代码修复及回归测试；运行 `npm run check`、`npm test`、`node scripts/smoke.mjs`；能做真机验收时逐项执行 `docs/MANUAL_TEST.md`。
- 更新 `README.md`、`docs/DEVELOPMENT_PLAN.md`、`handoff/CHANGELOG.md`、`handoff/TEST_RESULTS.md`、`handoff/KNOWN_ISSUES.md`、`handoff/REVIEW_REQUEST.md`；**将 `package.json` 版本号 +1**。
- 运行 `npm run package` 生成完整源码压缩包（**不能只打包修改文件**），并运行 `python scripts/verify_package.py <压缩包路径>` 校验。
- 输出 ZIP，同时简短汇报做了什么、测试 PASS/FAIL/BLOCKED、仍有哪些问题以及审查者应优先检查什么。

输出 ZIP 命名与内部目录结构严格遵守 `handoff/HANDOFF_RULES.md`，不可随意改名。最终将整个 ZIP 交给我，我会拿给另一位 ChatGPT 审查；审查反馈提出 P0/P1 以后，你必须先修复后重新打包，再进入下个任务。

---
