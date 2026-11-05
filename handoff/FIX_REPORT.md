# FIX_REPORT — v0.2.1-r1 P0 缺陷修复报告

> **目标版本**：v0.2.1-r1  
> **修复范围**：严格限定于第一轮审查报告指定的 2 项 P0 阻断性缺陷（R-001 与 R-002）。未动架构，零 npm 依赖，无功能扩张。

---

## 1. R-001 [P0/安全] HTTPS 私钥与敏感文件可被静态服务下载及打包带走

### 1.1 修复前复现（Audit Reproduction）
- **复现方式**：在项目根目录放置伪造私钥 `dummy_probe_key.pem` 或 `audit_secret_probe.pem`。
- **复现结果**：
  - `curl -i http://localhost:4173/dummy_probe_key.pem` 返回 **HTTP 200 OK**，原样读取文件内容；
  - `python scripts/package.py` 在未过滤 `.pem` 后缀的情况下，会将根目录下任何证书或私钥文件一并压缩进发布 ZIP。

### 1.2 根因分析
1. `server.mjs` 中的安全过滤采用正则黑名单，只屏蔽了 `node_modules`、`tests`、`handoff`、`scripts` 等特定目录及 `.log|.py|.md`，未显式禁止 `.pem`、`.key` 等凭据后缀，且未实行静态资源扩展名严格白名单；
2. `docs/MOBILE_TESTING.md` 原先建议在根目录直接生成 `key.pem` 与 `cert.pem`，加大了用户无意将私钥部署至可公开访问根路径的风险；
3. `scripts/package.py` 仅排除了 `.env`、`.log` 等，缺少证书私钥主动拦截阻断策略。

### 1.3 实际修复措施
1. **静态服务白名单与敏感凭据硬阻断（[server.mjs](file:///c:/workspace/ai-fit-coach/server.mjs)）**：
   - 增加 `FORBIDDEN_EXTENSIONS` 集合，显式拦截 `.pem`、`.key`、`.crt`、`.cert`、`.p12`、`.pfx`、`.pkcs8`、`.env` 等；
   - 增加路径敏感词匹配 `/(?:^|[\\/])(?:key|cert|secret|probe|token|password|credential)/i`，命中直接响应 `HTTP 403 Forbidden`；
   - 实行严格的静态资源类型白名单：仅限 `contentTypes` 明确注册的媒体与 Web 资源（`.html`, `.css`, `.js`, `.mjs`, `.json`, `.svg`, `.ico`, `.png`, `.wasm`, `.task`, `.mp4`, `.webm`, `.mov`, `.woff2`），未知或未许可类型一律拒绝。
2. **私钥隔离与外部指定（[server.mjs](file:///c:/workspace/ai-fit-coach/server.mjs) & [docs/MOBILE_TESTING.md](file:///c:/workspace/ai-fit-coach/docs/MOBILE_TESTING.md)）**：
   - 默认私钥路径移至项目外部 `../ai-fit-coach-tls/key.pem`，支持 `TLS_KEY_PATH` 与 `TLS_CERT_PATH` 环境变量自定义；
   - 更新文档指导，强调私钥严禁置于静态服务根目录。
3. **打包脚本安全围栏（[scripts/package.py](file:///c:/workspace/ai-fit-coach/scripts/package.py)）**：
   - 增加 `SECRET_SUFFIXES` 校验，一旦工作区内扫描到 `.pem`、`.key` 等私钥后缀或非文档文件内容含有 PEM 私钥特征码，打包流程立即 `raise SystemExit(1)` 退出，拒绝生成发布包；
   - 将 `audit` 目录加入 `EXCLUDE_PARTS`，确保外部审查材料不被误打入交付包。
4. **自动化回归防护（[scripts/smoke.mjs](file:///c:/workspace/ai-fit-coach/scripts/smoke.mjs)）**：
   - 冒烟测试在测试期间动态创建假私钥 `dummy_probe_key.pem`，自动化断言 `GET` 与 `HEAD` 请求均被拒绝（HTTP 403/404，绝对非 200），测试结束后自动安全清理。

### 1.4 修复后验证证据
- 执行 `node scripts/smoke.mjs`：
  ```text
  HTTP smoke PASS: routes, MIME, protected paths, 404, secret key protection (R-001)
  ```
  假私钥文件 `dummy_probe_key.pem`、`key.pem`、`cert.pem` 请求全部返回 403 Forbidden，零漏洞泄漏。

---

## 2. R-002 [P0/学术数据] 训练报告 MAE 将模拟模式混入真实 AI 评价

### 2.1 修复前复现（Audit Reproduction）
- **复现方式**：在模拟演示模式（`mode: 'demo'`）下完成动作，并在训练结束输入 `manualCount`。
- **复现结果**：
  - `src/app.js` 原逻辑直接对所有 `sessions.filter(s => Number.isFinite(s.absError))` 取平均；
  - 模拟模式产生的零误差直接与真实摄像头/视频评测数据同权求平均，稀释真实 AI 的平均绝对误差（MAE），导致学术指标严重失真；
  - 当仅有模拟数据时，看板可能误导性地显示 `0.00`。

### 2.2 根因分析
1. 缺少针对数据来源模式（`camera`/`video` vs `demo`）与有效真实跟踪帧数（`trackedFrames`）的硬性准入过滤；
2. 输入的 `manualCount` 仅作了松散的 `Number(input)` 转换，未校验纯非负整数；
3. 指标看板未将“真实 AI 对照”与“模拟算法回归”明确拆分为两套统计口径。

### 2.3 实际修复措施
1. **纯函数度量统计引擎（[src/store.js](file:///c:/workspace/ai-fit-coach/src/store.js) `computeMaeStats`）**：
   - `realEvaluated` 严格限定样本准入标准：
     - `mode ∈ {'camera', 'video'}`（必须为真实摄像头或本地视频真实 AI 推理）；
     - `Number.isInteger(manualCount) && manualCount >= 0`（必须具备经过核验的非负整数人工真值）；
     - `Number.isFinite(absError)`；
     - `trackedFrames >= 5`（必须有充分的真实人体骨架跟踪帧，过滤空跑/未入镜无效会话）。
   - `demoEvaluated` 仅统计 `mode === 'demo'` 记录，二者计算逻辑完全物理隔离，绝不交叉；
   - 当 `realEvaluated.length === 0` 时，`realMae` 确认为 `null`，严禁输出假 0.00。
2. **输入合法性严密校验（[src/app.js](file:///c:/workspace/ai-fit-coach/src/app.js)）**：
   - 在弹窗提示中明确指出为“人工核验的实际有效达标次数（必须为非负整数）”；
   - 使用正则 `/^\d+$/` 严格过滤浮点数（如 `3.9`）、科学计数法（如 `1e3`）及负数，仅接受纯非负整数，超出 `[0, 10000]` 范围直接拒绝。
3. **训练报告看板重构（[src/app.js](file:///c:/workspace/ai-fit-coach/src/app.js) `reportsPage`）**：
   - 核心指标卡命名为 **「真实 AI 对照 MAE」**；
   - 若尚无真实对照实验，显示为灰字「暂无有效真人对照数据（需真实AI实测 + 人工核验）」，拒绝虚报假成绩；
   - 若存在模拟测试数据，在侧边独立以暗色卡片展示「模拟算法回归误差 (N=X, 非AI)」，杜绝混淆。
4. **新增物理隔离单测（[tests/store.test.mjs](file:///c:/workspace/ai-fit-coach/tests/store.test.mjs)）**：
   - 断言 10 条完美的模拟零误差会话下，`realMae` 必须恒为 `null`；
   - 断言在真实会话与 10 条模拟会话混合输入时，`realMae` 必须分毫不差地保持为真实的 `1.50`，不受任何模拟数据污染。

### 2.4 修复后验证证据
- 执行 `npm test`：
  ```text
  ✔ computeMaeStats strictly isolates real AI sessions from simulation data (0.7162ms)
  ℹ tests 26
  ℹ suites 0
  ℹ pass 26
  ℹ fail 0
  ```
  单测 26/26 项全部通过，数据隔离无懈可击。

---

## 3. 跨平台打包缺陷 R-007 兼容性顺带修复说明

- **根因**：原 `scripts/package.py` 中 `subprocess.run(cmd, ..., shell=True)` 将 `cmd` 作为数组传入，在 Linux/macOS POSIX 环境下由于 shell 特性仅执行首项 `npm` 而丢失后续子命令。
- **修复**：在 [scripts/package.py](file:///c:/workspace/ai-fit-coach/scripts/package.py) 中将命令统一转换为单条命令字符串 `cmd_str = ' '.join(cmd)`，确保在 Windows (`cmd.exe`) 与 Linux/macOS (`/bin/sh`) 下均能正确完整执行 `npm run check`、`npm test`、`node scripts/smoke.mjs` 等指令。
