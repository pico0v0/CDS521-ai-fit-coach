# FIX_REPORT — v0.2.1-r2 P0 缺陷加固与安全复审闭环报告

> **目标版本**：v0.2.1-r2  
> **修复范围**：严格限定于第一轮复审报告（P0_REVIEW_REPORT.md）指出的两项剩余阻断性缺陷：  
> 1. **R-001-A 静态服务器真实权限边界**（路径白名单、非客户端文件拒绝、符号链接穿透阻断）；  
> 2. **R-001-B 打包程序多格式 PEM 私钥头全量扫描与符号链接拒绝**。  
> 同时根据审查建议，对 R-002 的异常持久化数据一致性与非负绝对误差计算进行了增强。

---

## 1. R-001-A [P0/安全] 静态服务器真实权限边界与符号链接越界阻断

### 1.1 复审指出问题与反例复现
在 v0.2.1-r1 中，静态服务器主要依据扩展名白名单（`contentTypes`）判断是否放行，但未能限制具体可访问的文件路径范围，且未校验符号链接真实指向，导致独立发起的以下请求可返回 HTTP 200：
- `GET /server.mjs` → 200（服务端代码文件泄露）
- `GET /package.json` → 200（包配置泄露）
- `GET /private_notes.json` → 200（根目录下临时 JSON 文件泄露）
- `GET /linked-public.js` → 200（符号链接指向项目外敏感文件被读取）

### 1.2 实际修复措施
1. **客户端公共资产路径白名单（`server.mjs`）**：
   - 增加 `isAllowedClientPath(pathname)` 严格判定：
     - 允许根入口：`/`、`/index.html`、`/favicon.ico`；
     - 允许客户端代码与样式：`/src/**`；
     - 允许模型资产与运行库：`/models/**`；
     - 任何其他根目录文件（包括 `/server.mjs`、`/package.json`、根目录下任意新建的 `.json` 或 `.js`、文档及测试目录）一律直接响应 **`HTTP 403 Forbidden`**。
2. **符号链接（Symlink）与物理真实路径双重拦截（`server.mjs`）**：
   - 引入 `lstat()` 预检：若请求目标本身是符号链接（`linkStat.isSymbolicLink()`），立即阻断并响应 **403 Forbidden**，杜绝跟随链接读取项目外数据；
   - 引入 `realpath()` 校验：解析最终真实物理路径，若解析路径未位于 `root + sep` 之内，立即阻断并响应 **403 Forbidden**；
   - 保证 `GET` 与 `HEAD` 方法均受到完全一致的安全约束，`HEAD` 统一返回 403 且无响应体。

### 1.3 验证证据（自动化回归覆盖）
在 `scripts/smoke.mjs` 中构造真实攻击用例：
- 创建包含 `FAKE_SECRET_CANARY_2026_DO_NOT_EXPOSE` 的 `private_notes.json`；
- 创建指向外部临时机密文件的符号链接 `linked-public.js`；
- 执行 `node scripts/smoke.mjs`，断言：
  - `/key.pem`、`/server.key`、`/.env`、`/server.mjs`、`/package.json`、`/private_notes.json`、`/linked-public.js` 针对 `GET` 与 `HEAD` **全部返回 403 Forbidden**；
  - 响应体断言：绝对不包含测试金丝雀字符串；
  - 合法路径 `/`、`/index.html`、`/src/app.js`、`/src/exercise.js`、`/src/styles.css` 正常返回 200 与正确 MIME 类型。

---

## 2. R-001-B [P0/安全] 打包程序多格式 PEM 私钥头全量扫描与符号链接拒绝

### 2.1 复审指出问题与反例复现
在 v0.2.1-r1 中：
- 内容扫描跳过了 `.md` 和 `.txt`，若私钥头被粘贴进 Markdown 文档会被打包入 ZIP；
- 扫描特征码只匹配 `BEGIN PRIVATE KEY`，遗漏了 `BEGIN RSA PRIVATE KEY`、`BEGIN EC PRIVATE KEY`、`BEGIN OPENSSH PRIVATE KEY`、`BEGIN ENCRYPTED PRIVATE KEY` 等格式。

### 2.2 实际修复措施
1. **全文件格式无遗漏字节扫描（`scripts/package.py`）**：
   - 取消对 `.md`、`.txt` 的跳过逻辑，对拟打入包的所有文本、代码、配置等全部文件进行逐字节扫描（仅排除定义扫描规则本身的工具脚本自身）；
   - 使用正则表达式匹配所有通用与专用 PEM 私钥头部：
     `re.compile(rb'-----\s*BEGIN\s+(?:[A-Z0-9_\-\s]+)?(?:PRIVATE\s+KEY|KEY\s+BLOCK)[^-]*-----', re.IGNORECASE)`；
   - 命中任何 PEM 私钥头直接输出安全违规日志并 `raise SystemExit(1)` 终止打包，绝不产生新 ZIP。
2. **符号链接主动拦截（`scripts/package.py`）**：
   - 遇到任何符号链接（`path.is_symlink()`），拒绝打包并立即终止退出，杜绝通过链接混入外部敏感文件。
3. **快速前置预检（Fast Pre-scan）**：
   - 打包脚本在执行昂贵的单测与基准之前优先执行 `scan_for_secrets()`，发现风险毫秒级快速失败退出。
4. **验证脚本独立审计层（`scripts/verify_package.py`）**：
   - 在 ZIP 解包校验工具中同样加入私钥格式、禁止后缀及 `audit/` 排除项校验，形成双重防线。

### 2.3 验证证据（自动化回归套件）
新增专用安全测试脚本 `scripts/test_package_security.py`（已接入 `npm run test:security` 及打包流程）：
- 场景 1：在 `docs/probe_test_key.md` 写入通用 PEM 私钥头，断言 `package.py` 退出码非 0 且阻断；
- 场景 2：在 `src/probe_test_key.js` 写入 RSA PEM 私钥头，断言 `package.py` 退出码非 0 且阻断；
- 场景 3：在根目录创建 `test_private.pem`，断言 `package.py` 退出码非 0 且阻断；
- 独立执行输出：
  ```text
  Running package security regression tests...
    ✔ Scenario 1 PASS: Markdown containing PEM private key header is blocked
    ✔ Scenario 2 PASS: JS containing RSA PEM private key header is blocked
    ✔ Scenario 3 PASS: Explicit .pem suffix file is blocked
  All package security regression tests PASSED!
  ```

---

## 3. R-002 学术 MAE 数据一致性与防御性计算增强

针对复审报告指出的“若持久化记录中 `absError` 异常或负数，可能影响计算”的问题，本轮在 `src/store.js` 的 `computeMaeStats` 中主动补强：
- **不直接信任持久化的 `absError` 字段**：
  直接根据经过校验的非负整数 `count` 与 `manualCount`，在内存中动态核算 `verifiedAbsError = Math.abs(s.count - s.manualCount)`；
- **严格类型校验**：
  要求 `typeof s.trackedFrames === 'number'`，拦截字符串 `'30'`；要求 `count >= 0` 且 `manualCount >= 0`；
- **异常恢复与单测覆盖**：
  单测增加断言：对恶意构造的 `{count: 99, manualCount: 0, absError: 0}` 和 `{count: 8, manualCount: 0, absError: -8}`，系统自动自愈纠偏为正确非负绝对误差 `(99 + 8)/2 = 53.50`，保证数学定义绝对守恒。

---

## 4. 统计与交接说明更正
1. **统一文件计数说明**：
   当前仓库在包含 `scripts/test_package_security.py` 与 `handoff/FIX_REPORT.md` 后，待打包源码及文档共 **39 个文件**（排除 `.git`、`node_modules`、`release`、`audit` 及私有视频），SHA-256 清单已由自动化打包脚本全量更新；
2. **措辞规范说明**：
   本报告已避免使用“零漏洞”“100% 物理隔离”等绝对宣称。真实与模拟会话根据来源标签进行逻辑隔离核算，不暗示防伪溯源功能；基准评测报告 MAE = 0.000 明确声明为确定性动力学仿真序列下的状态机检验，绝不等同于真人实测准确率。
