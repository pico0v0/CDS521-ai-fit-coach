# AI Fit Coach — 后续 AI 开发、审查与打包协议 v1

> **强制执行文件。** 目标：由能力较弱的 AI 完成小步迭代 → 生成完整可复现源码包 → 交由 ChatGPT 审查 → 修复问题 → 再进入下一个阶段。

## A. 接手前必须阅读（按顺序）

1. `README.md`：目前已经实现哪些功能、真实与模拟的区别。
2. `docs/DEVELOPMENT_PLAN.md`：本轮唯一目标，**从 M1 开始**。
3. `docs/ARCHITECTURE.md`：模块接口和不能破坏的系统边界。
4. `handoff/KNOWN_ISSUES.md`：已有的 Bug / 风险 / 未验证事项。
5. `docs/MANUAL_TEST.md`：真实设备验收计划。

## B. 开发规则（不可省略）

1. **一次只交付一个明确的里程碑**。现在优先完成 M1「实机真人摄像头 + MediaPipe 验收及修复」。不要同时加入姿态疾病预测、安卓 App、后端、社交功能等。
2. 源代码必须完整留在仓库目录，不可只发 diff、截图、`dist` 目录或几个修改后的文件。
3. 先复现问题再改代码。修改动作算法必须增加或更新 `tests/` 用例；不能为了通过测试偷偷降低安全阈值或将模拟算法标成 AI。
4. **不得伪造测试**：无法访问真实摄像头时，`REAL_CAMERA_E2E = BLOCKED`。自动单测/合成测试通过 ≠ 真实 AI 已通过。
5. **不得上传用户摄像头录像到云端或放进压缩包**。如展示证据需被摄者明确同意；优先附打码截图、日志或文字说明。不得包含密钥、Cookie、个人身份信息。
6. 新增外部依赖要说明理由、版本、安装步骤，并固定版本。修改 Node 启动命令需同步 README、打包脚本、测试说明。
7. 现有训练报告必须继续区分 `mode: demo`（模拟）与 `mode: camera`（真实）。**模拟记录不得混入真实模型准确率实验**。
8. 保持 `src/exercise.js` 可通过 Node 测试运行，不得直接导入浏览器 DOM 或 MediaPipe。
9. 当用户要求某项不可实现/需专业验证的功能，记录技术限制与替代设计，不能声称已实现。

## C. 每轮必须更新的文件

| 文件 | 写什么 | 必填 |
| --- | --- | --- |
| `package.json` | **版本号必须增加**，例如 0.1.0 → 0.1.1 | ✅ |
| `README.md` | 实际运行命令、当前功能完成度、已知依赖 | ✅ |
| `handoff/CHANGELOG.md` | 本轮做了什么、具体影响哪些文件、为什么修改 | ✅ |
| `handoff/TEST_RESULTS.md` | 自动测试输出摘要 + 真机手工验收 PASS/FAIL/BLOCKED + 环境 | ✅ |
| `handoff/KNOWN_ISSUES.md` | 剩余 bug、优先级、复现路径、限制与后续处理 | ✅ |
| `handoff/REVIEW_REQUEST.md` | 希望 ChatGPT 具体审查哪些风险、如何复现 | ✅ |
| `docs/DEVELOPMENT_PLAN.md` | 已完成任务勾选，未完成任务不得虚报 | ✅ |
| `docs/MANUAL_TEST.md` | 实际运行过的实机测试记录/结果和证据 | 推荐（M1 必填） |
| `tests/` | 对新增算法行为编写回归测试 | 修改算法时必填 |

打包脚本会自动生成 `handoff/AUTOMATED_CHECKS.txt` 和 `handoff/FILE_MANIFEST.sha256`，**不需要**人工填写哈希值。

## D. 交付前必须运行的命令

```bash
npm run check
npm test
node scripts/smoke.mjs
npm run package
# 将版本号替换成 package.json 中的实际版本：
python scripts/verify_package.py release/ai-fit-coach-demo-v<版本>-handoff.zip
```

- 任何失败都需先修复；如果有环境客观障碍，则在 `TEST_RESULTS.md` 写清楚，不得称为“已通过”。
- 生成包时脚本会再次执行前三项基础检查，并生成机器可验证的 SHA-256 清单；**严禁手动用截图或虚构文本代替命令输出**。
- 真实摄像头验收需要人工在本机运行 `docs/MANUAL_TEST.md`，无法自动替代。

## E. 打包规则（唯一推荐交付形式）

输出命名：

```text
release/ai-fit-coach-demo-v<package.json中的version>-handoff.zip
```

Zip 内必须存在**一个顶层文件夹** `ai-fit-coach-demo/`，至少包含：

```text
ai-fit-coach-demo/
├── README.md
├── package.json
├── index.html
├── server.mjs
├── src/                 # 全部源码（不是只有改动文件）
├── tests/               # 全部自动化测试
├── scripts/             # 打包、验包脚本
├── docs/                # 需求、开发计划、手工测试、答辩方案
└── handoff/
    ├── HANDOFF_RULES.md
    ├── CHANGELOG.md
    ├── TEST_RESULTS.md
    ├── KNOWN_ISSUES.md
    ├── REVIEW_REQUEST.md
    ├── AUTOMATED_CHECKS.txt       # 打包脚本生成
    └── FILE_MANIFEST.sha256      # 打包脚本生成
```

**严禁包含**：`node_modules/`、`.git/`、`release/`、`__pycache__/`、`.env` 与各类 Token、原始摄像头隐私录像，以及非必要的海量缓存文件。

**交审时附一句简短报告**：

```text
版本：vX.Y.Z
本轮完成：M1-01（或其他编号）
自动测试：PASS / FAIL（写通过数量）
真实摄像头：PASS / FAIL / BLOCKED（写设备与证据）
重点待审：3 项以内
交付：ai-fit-coach-demo-vX.Y.Z-handoff.zip
```

## F. ChatGPT 审查和返修循环

1. 下一位 AI 产出完整的 ZIP；用户上传给 ChatGPT。
2. ChatGPT 将对照基线、审查变更、测试、运行步骤、功能风险、手工证据，并输出 `P0 必修 / P1 应修 / P2 可选` 清单。
3. 下一位 AI **先修 P0**，更新对应测试和 handoff 文档，升版本号并重新打完整包。
4. 用户将新包再次交给 ChatGPT；**未通过审查则不得直接进入 M2**。
5. 确认本轮通过后，才在 `docs/DEVELOPMENT_PLAN.md` 开始下一个里程碑。

## G. 关于资源引用和许可

- 固定 MediaPipe 的运行库与模型版本，来源必须可查；引入本地二进制模型前先核查许可并记载 SHA256。
- 如未来增加 LLM，前端不放 API Key，必须由安全服务端代理。
- 若要使用用户图像进行模型训练，必须先取得明确授权、做好数据脱敏、说明用途与删除方式。
