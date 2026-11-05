# FIX_REPORT — v0.2.1-r3 P0 缺陷最终闭环与交付可靠性报告

> **目标版本**：v0.2.1-r3  
> **修复范围**：严格限定于第二轮 P0 复审报告（P0_R2_REVIEW_REPORT.md）指出的两项剩余安全阻断缺陷与一项交付残留缺陷：  
> 1. **R-001-A 逐级目录符号链接防御与分区授权真实路径校验**；  
> 2. **R-001-B 移除所有打包与验签代码的整文件扫描豁免**；  
> 3. **P1-NEW 修复 smoke.mjs 清理顺序，保障交付流程可重复打包**。  
> 严格未动产品功能，未扩张 MediaPipe/训练逻辑，未添加多余 npm 依赖。

---

## 1. 缺陷 A：目录符号链接绕过客户端白名单（P0 / R-001-A）

### 1.1 复现反例与根因
在第二轮复审中，审查方在 `src/` 下创建了一个指向项目根目录的相对目录符号链接 `src/internal-alias -> ..`。
- **根因**：
  1. `isAllowedClientPath` 仅检查了请求的表面前缀 `/src/`；
  2. 原代码中的 `lstat(filename)` 仅检查了请求的最终叶子文件，而未能检测路径中间的各级父目录是否为符号链接；
  3. `realpath(filename)` 原逻辑仅要求真实路径位于项目根目录 `root`，未能约束其必须位于对应的授权子目录 `/src/`。
- **造成后果**：
  请求 `GET /src/internal-alias/server.mjs`、`GET /src/internal-alias/package.json` 及 `GET /src/internal-alias/teaching_results.json` 返回 HTTP 200，原本受保护的根目录服务端与配置信息被越权读取。

### 1.2 实际修复措施
在 `server.mjs` 中进行两处根本性强化：
1. **逐级父目录符号链接检查**：
   拆解请求的所有路径片段（`relParts`），从 `root` 开始逐级递进，对每一级实际存在的目录或文件执行 `lstat`。若任一层是符号链接（`segStat.isSymbolicLink()`），立即阻断并响应 **HTTP 403 Forbidden**。
2. **专属授权分区物理路径强校验**：
   解析最终真实路径 `realFilePath = await realpath(filename)`，并按分区严格检验：
   - 若请求属于 `/src/**`，`realFilePath` 必须物理处于 `root/src/` 之内；
   - 若请求属于 `/models/**`，`realFilePath` 必须物理处于 `root/models/` 之内；
   - 若请求属于 `/` 或 `/index.html`，`realFilePath` 必须等于物理 `index.html`；
   - 若请求属于 `/favicon.ico`，`realFilePath` 必须等于物理 `favicon.ico`。
   若真实路径越界脱离其指定分区，立即阻断并响应 **HTTP 403 Forbidden**。
3. **GET 与 HEAD 统一防护**：
   所有阻断路径对于 HEAD 请求同样严格返回 403 且无任何响应体。

### 1.3 验证证据
- 在 `scripts/smoke.mjs` 中加入了创建内部目录符号链接 `src/internal-alias -> ..` 及外部文件符号链接的测试：
  - `GET /src/internal-alias/server.mjs` → **403 Forbidden**
  - `GET /src/internal-alias/package.json` → **403 Forbidden**
  - `GET /src/internal-alias/teaching_results.json` → **403 Forbidden**，且响应正文绝无测试金丝雀泄露；
  - `HEAD` 请求上述所有路径均返回 **403 Forbidden**；
  - 合法 `/`、`/index.html`、`/src/app.js`、`/src/exercise.js`、`/src/styles.css` 正常返回 **200 OK**。

---

## 2. 缺陷 B：打包与验签代码的整文件扫描豁免（P0 / R-001-B）

### 2.1 复现反例与根因
在第二轮复审中，审查方在 `scripts/package.py` 注释末尾追加了测试用的 RSA PEM 私钥头。
- **根因**：
  为避免正则表达式模式自身被误报，代码在 `scripts/package.py` 和 `scripts/verify_package.py` 中设置了整文件跳过豁免（`if posix_rel not in {'scripts/package.py', ...}`），导致工具脚本本身存在携带私钥进入 ZIP 的漏洞。
- **造成后果**：
  打包脚本退出码为 0 并生成了包含私钥头的 ZIP，且 `verify_package.py` 也返回 0。

### 2.2 实际修复措施
1. **彻底取消任何整文件扫描豁免**：
   删除所有针对自身脚本的跳过检查，`scan_for_secrets` 和 `verify_package.py` 对所有拟入包文件 100% 逐字节扫描。
2. **正则模式与测试头动态拆分拼接**：
   将正则表达式中的匹配关键字在定义时拆解为字符串片段拼接：
   ```python
   DASH_BEGIN = b'-----' + b'BEGIN'
   PRIV_KEY = b'PRIVATE' + b' KEY'
   KEY_BLK = b'KEY' + b' BLOCK'
   PEM_KEY_REGEX = re.compile(
       DASH_BEGIN + rb'\s+(?:[A-Z0-9_\-\s]+)?(?:' + PRIV_KEY + rb'|' + KEY_BLK + rb')[^-]*-----',
       re.IGNORECASE
   )
   ```
   工具源码本身在静态文本上绝不包含任何完整的 PEM 私钥头字面量，因此在全量扫描自身时不会触发误报。
3. **入包前二次扫描**：
   在真正将文件字节写入 `zipfile` 归档之前，再次执行正则与后缀检查，杜绝前置扫描与归档之间的竞态窗口。
4. **覆盖全品类 PEM 格式**：
   包含通用 PRIVATE KEY、RSA、EC、DSA、OPENSSH、ENCRYPTED 以及 PGP PRIVATE KEY BLOCK。

### 2.3 验证证据
- 在 `scripts/test_package_security.py` 中新增专门测试：
  - 场景 4：向 `scripts/package.py` 注入 RSA PEM 私钥头，断言打包失败并阻断（`exit code 1`）；
  - 场景 5：向 `scripts/verify_package.py` 注入 EC PEM 私钥头，断言打包失败并阻断（`exit code 1`）；
- 审查方独立复现脚本 `reproduce_r2.py` 实际运行输出：
  ```json
  "package_exemption": {
    "package_exit_code": 1,
    "release_exists": false,
    "package_stderr": "SECURITY VIOLATION: Embedded PEM private key header detected in scripts\\package.py\n"
  }
  ```
  向 `scripts/package.py` 注入测试头被 100% 阻断，发布包无法生成。
- 7 种 PEM 私钥头格式全量拦截测试结果（来源于 `reproduce_r2.py` 执行报告）：
  - `PRIVATE KEY in docs/test.md` → blocked (exit code 1)
  - `RSA PRIVATE KEY in src/test.js` → blocked (exit code 1)
  - `EC PRIVATE KEY in docs/test.txt` → blocked (exit code 1)
  - `DSA PRIVATE KEY in models/test.json` → blocked (exit code 1)
  - `OPENSSH PRIVATE KEY in docs/test.md` → blocked (exit code 1)
  - `ENCRYPTED PRIVATE KEY in src/test.js` → blocked (exit code 1)
  - `PGP PRIVATE KEY BLOCK in docs/test.txt` → blocked (exit code 1)

---

## 3. 缺陷 C：`smoke.mjs` 清理顺序导致不可重复打包（P1-NEW）

### 3.1 复现与根因
- **根因**：原 `smoke.mjs` 先删除了临时目标文件 `outsideTarget`，然后使用 `existsSync(symlinkFile)` 检查是否删除符号链接。对于悬空的符号链接，`existsSync()` 返回 `false`，导致符号链接未被 unlink，遗留残留在 `src/` 中。当随后执行 `package.py` 时，被 `path.is_symlink()` 拦截而导致打包失败。

### 3.2 实际修复措施
在 `scripts/smoke.mjs` 中实现 `safeRemoveSymlink(p)`：
- 使用 `lstatSync` 优先检测符号链接并执行 `unlinkSync` / `rmdirSync`，在删除目标文件之前先将符号链接本体安全解除；
- 同时安全清理测试期间建立的任何内部目录符号链接。

### 3.3 验证证据
- 执行 `python scripts/test_package_security.py`（场景 6）：
  执行 `node scripts/smoke.mjs` 后检查 `src/outside-demo.js`，断言 `is_symlink()` 为 `false`，无悬空残留；
- 连续执行两次 `python scripts/package.py`：均成功以 0 退出，交付包顺利可重复生成。
- 审查方 `reproduce_r2.py` 实际实测输出：
  ```json
  "smoke_cleanup": {
    "smoke_exit_code": 0,
    "left_dangling_symlink": false,
    "subsequent_package_exit_code": 0
  }
  ```

---

## 4. R-002 学术 MAE 统计复核确认

- 在 `src/store.js` 中保留了上一轮加固的 `computeMaeStats`，不直接信任持久化的 `absError`，而是强制由非负整数 `count` 与 `manualCount` 在内存重算 `verifiedAbsError = Math.abs(count - manualCount)`；
- 审查方 `reproduce_r2.py` 实际实测输出完全匹配：
  - `demoOnly`: `realMae: null`（模拟记录不伪造真人指标）
  - `realOnly`: `realMae: 53.5`（异常 absError 被正确纠偏为 `(99 + 8)/2 = 53.5`）
  - `mixed`: `realMae: 53.5`（真实与 10 条模拟记录混合，真实指标未被稀释）
  - `invalid`: `realMae: null`（字符串 `'20'` 被严格拦截）

---

## 5. 交付产物统计与说明

- **发布包文件计数**：待打包源码、单测、文档及测试脚本共 **39 个文件**，经 `scripts/verify_package.py` 独立解包审计，39 个文件 SHA-256 校验 100% 匹配；
- **排他性声明**：发布包中绝对未包含任何 `.pem` / `.key` 文件、`audit/` 目录或符号链接；
- **学术诚实声明**：基准测试报告中的 MAE = 0.000 仅代表确定性生物力学动力学仿真序列下的状态机检验，绝不等同于真人实测准确率。
