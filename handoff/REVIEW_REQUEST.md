# REVIEW_REQUEST — v0.2.1-r2 第二轮 P0 修复审查交接说明

**交付版本**：v0.2.1-r2  
**交付包**：`release/ai-fit-coach-demo-v0.2.1-handoff.zip`  
**本轮目标**：根据第二轮审查报告（P0_REVIEW_REPORT.md），专职定向加固解决 R-001 剩余的两项阻断性缺陷（R-001-A 静态服务真实边界与符号链接越界阻断，R-001-B 全格式 PEM 私钥头扫描与符号链接拒绝），并加固 R-002 数据一致性重算。

---

## 一、本轮希望审查者优先复核的项（P0 深度验收）

1. **R-001-A [P0/安全] 静态服务客户端路径白名单与符号链接越界阻断**：
   - **源码位置**：`server.mjs:38–140`、`scripts/smoke.mjs:15–85`；
   - **复核验证点**：
     - 发起 `GET /server.mjs`、`GET /package.json`、`GET /private_notes.json`：确认是否均返回 **403 Forbidden**，且响应正文绝不泄露；
     - 符号链接拦截：若请求指向根目录外部的 `.js` 符号链接（如 `linked-public.js`），确认 `lstat().isSymbolicLink()` 和 `realpath()` 双重防护直接响应 **403 Forbidden**；
     - 发起 `HEAD` 请求：针对上述所有受保护路径，确认 HEAD 请求同样返回 403 且无响应体；
     - 合法客户端路径：`/`、`/index.html`、`/src/**`、`/models/**` 依然能以正常 200 状态与正确 MIME 访问，不影响 MediaPipe 真实推理。

2. **R-001-B [P0/安全] 打包程序多格式 PEM 私钥头全量扫描与符号链接拒绝**：
   - **源码位置**：`scripts/package.py:27–80`、`scripts/verify_package.py:10–78`、`scripts/test_package_security.py`；
   - **复核验证点**：
     - 全格式 PEM 正则：覆盖通用、RSA、EC、DSA、OPENSSH、ENCRYPTED 等全部 PEM 私钥头；
     - 无文件后缀跳过：Markdown（`.md`）、文本（`.txt`）、源码（`.js`）、配置（`.json`）等全量逐字节扫描；
     - 遇到工作区待打包符号链接（`path.is_symlink()`）立即阻断中止并退出；
     - 独立回归测试 `python scripts/test_package_security.py`（已通过 3 项攻击性回归场景）。

3. **R-002 [P0/学术数据] 数据一致性与自愈非负绝对误差重算**：
   - **源码位置**：`src/store.js:48–78`、`tests/store.test.mjs:95–115`；
   - **复核验证点**：
     - 不再信任持久化存储中可能异常的 `absError`，而是强制由非负整数 `count` 与 `manualCount` 在内存中自愈重算 `verifiedAbsError = Math.abs(count - manualCount)`；
     - 严格要求 `typeof s.trackedFrames === 'number'`，拦截字符串；单测覆盖 `{count: 99, manualCount: 0, absError: 0}` 自愈为 99，`absError: -8` 自愈为 8。

---

## 二、自动化检验与复现指令

```bash
npm run check                                                         # 6 个核心 ES 模块语法检查 (PASS)
npm test                                                              # 26/26 项算法、状态机与数据隔离单测 (PASS)
npm run test:security                                                 # 3 项 PEM 私钥注入与后缀阻断自动化回归 (PASS)
node scripts/smoke.mjs                                                # 包含符号链接与非客户端路径 403 拦截的冒烟测试 (PASS)
npm run benchmark                                                     # 9 组跨 FPS 动作基准测试 (PASS)
python scripts/package.py                                             # 自动化前置扫描、测试并生成交付 ZIP
python scripts/verify_package.py release/ai-fit-coach-demo-v0.2.1-handoff.zip # 独立解包审计与 SHA-256 完整性校验
```

---

## 🤖 供直接复制发给复审 AI 的提示词（Prompt for Reviewer AI）

```markdown
请你扮演资深代码安全与计算机视觉审查专家，复审本次提交的 AI Fit Coach v0.2.1-r2 修复包。

【本次修复任务】
开发者收到了第二轮 P0 复审意见（P0_REVIEW_REPORT.md），本轮严格遵照指示，定向加固解决了剩余的两项 R-001 缺陷：
1. R-001-A：静态服务器真实权限边界（建立 isAllowedClientPath 客户端路径白名单，阻断 /server.mjs、/package.json 及根目录任意临时 JSON；通过 lstat 与 realpath 双重拦截符号链接越界读取）；
2. R-001-B：打包程序多格式 PEM 私钥头全量扫描与符号链接拒绝（全面正则匹配 RSA/EC/OPENSSH/ENCRYPTED 私钥头，全量无遗漏扫描包括 Markdown/TXT/JS/JSON 在内的所有入包文件，阻断符号链接）；
3. R-002：加固数据一致性防御（强制由 count 与 manualCount 内存自愈重算绝对误差，防御负数与异常 absError，严格校验 trackedFrames 为数字类型）。

【请重点审查】
1. 检查 `server.mjs` 和 `scripts/smoke.mjs`，复核对 `/server.mjs`、`/package.json`、`private_notes.json` 及外部符号链接的访问是否均返回 403 Forbidden（同时验证合法 `/src/` 与 `/models/` 是否正常可用）；
2. 检查 `scripts/package.py`、`scripts/verify_package.py` 及 `scripts/test_package_security.py`，确认多格式 PEM 私钥头是否在各类文件格式中均被可靠阻断；
3. 检查 `src/store.js` 的 `computeMaeStats` 及 `tests/store.test.mjs`，确认异常数据是否能自愈纠偏；
4. 检查 `handoff/FIX_REPORT.md`，确认所有 Windows 绝对路径已更正为相对路径，措辞准确客观。

请给出本次 P0 第二轮加固的复审结论，并确认是否允许正式进入下一轮（P1 缺陷：R-003~R-009）的修复。
```
