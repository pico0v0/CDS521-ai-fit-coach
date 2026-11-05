# REVIEW_REQUEST — v0.2.1-r3 第三轮 P0 安全加固审查交接说明

**交付版本**：v0.2.1-r3  
**交付包**：`release/ai-fit-coach-demo-v0.2.1-handoff.zip` (39 个文件，完整哈希自校验通过)  
**本轮目标**：根据第三轮审查要求（针对 v0.2.1-r2 复审报告中所列的两处仍未封闭的安全边界及冒烟清理问题），定向彻底闭合 R-001 漏洞链，实现零豁免安全打包与逐级目录符号链接防御。

---

## 一、本轮重点加固与验收点（P0 彻底闭环）

1. **R-001-A [P0/安全] 静态服务逐级目录符号链接拦截与物理分区约束**：
   - **源码位置**：`server.mjs:51–142`、`scripts/smoke.mjs:30–95`；
   - **加固措施**：
     - **逐级遍历检查（Iterative Segment Check）**：对客户端规范化后的相对路径，自顶向下对每一级路径组件（如 `src`, `src/internal-alias` 等）执行 `lstat`，只要任意一级为符号链接（`isSymbolicLink()` 为 true），立即响应 **403 Forbidden**；
     - **物理分区真实路径约束（Per-Zone Physical Enclosure）**：不但校验 `realpath` 在项目根目录，而且对 `/src/**` 强制校验其实体必须严格位于 `project_root/src` 之内，对 `/models/**` 强制校验其实体必须位于 `project_root/models` 之内，根路径严格限制为 `index.html`；
     - **复核验证点**：即使攻击者在 `/src/` 内创建指向项目根目录或其它目录的目录符号链接（如 `src/internal-alias -> ..`），访问 `GET /src/internal-alias/server.mjs` 或 `GET /src/internal-alias/package.json` 均被双重安全拦截，返回 **403 Forbidden**，彻底杜绝目录别名逃逸。

2. **R-001-B [P0/安全] 打包扫描器“零豁免”与运行时字节拼接防御**：
   - **源码位置**：`scripts/package.py:27–85`、`scripts/verify_package.py:12–80`、`scripts/test_package_security.py`；
   - **加固措施**：
     - **彻底移除文件豁免**：完全删除了原本对 `package.py`、`verify_package.py`、`test_package_security.py` 的跳过逻辑，实现入包文件 100% 全量扫描；
     - **动态字节拼接正则（Dynamic Byte Construction）**：扫描器与校验器内部通过 `b'-----' + b'BEGIN'` 及 `b'PRIVATE' + b' KEY'` 动态拼装正则与特征码，使得脚本本身既不含有 PEM 私钥头字面量，又可扫描自身源码；
     - **复核验证点**：测试在 `scripts/package.py` 或 `scripts/verify_package.py` 中注入包含 `BEGIN RSA PRIVATE KEY` 等格式的注释或代码，打包程序均能敏锐检测并退出（Exit Code 1），杜绝扫描工具自身成为特权后门。

3. **P1-NEW [工程可靠性] 冒烟测试测试产物安全析构与可重复打包**：
   - **源码位置**：`scripts/smoke.mjs:130–165`；
   - **加固措施**：
     - 针对 Node.js / Windows 下 `existsSync` 跟随符号链接导致目标先删后无法安全识别悬垂符号链接的陷阱，改用 `lstatSync` 识别并**优先 unlink 符号链接，再删除外部目标文件**；
     - 冒烟测试执行完毕后不留任何残留或悬垂符号链接，确保连续执行 `python scripts/package.py` 100% 稳定通过。

4. **自动化回归与复现验证**：
   - `python scripts/test_package_security.py` 包含 6 大攻击场景（Markdown、JS、.pem、package.py 自身注入、verify_package.py 自身注入、冒烟后连续打包），全部通过；
   - 运行独立审查复现脚本 `audit/AI_Fit_Coach_v0.2.1-r2_Review/reproduce_r2.py`，全部 4 项指标（包豁免阻断、清理无悬垂、7种私钥格式阻断、MAE 统计隔离与异常修复）均获 **PASS**。

---

## 二、本地全套自动化验证指令

```bash
npm run check                                                         # 6 个核心 ES 模块语法检查 (PASS)
npm test                                                              # 26/26 项算法、状态机与数据隔离单测 (PASS)
python scripts/test_package_security.py                               # 6 项攻击性与自省打包安全自动化回归 (PASS)
node scripts/smoke.mjs                                                # 包含目录符号链接与非客户端路径 403 拦截的冒烟测试 (PASS)
npm run benchmark                                                     # 9 组跨 FPS 动作基准测试 (PASS)
python scripts/package.py                                             # 自动化零豁免前置扫描与 ZIP 打包 (PASS)
python scripts/verify_package.py release/ai-fit-coach-demo-v0.2.1-handoff.zip # 独立解包审计与 SHA-256 完整性校验 (PASS)
```

---

## 🤖 供直接复制发给复审 AI 的提示词（Prompt for Reviewer AI）

```markdown
请你扮演资深代码安全与系统架构审查专家，对本次提交的 AI Fit Coach v0.2.1-r3 修复包进行第三轮 P0 安全专项复审。

【本次修复背景与任务】
开发者在第二轮 P0 复审报告中收到了两项未封闭的边界缺陷：
1. 问题 A（R-001-A）：目录符号链接（如 `src/root-alias -> ..`）仍可绕过静态路径白名单读取工程敏感文件；
2. 问题 B（R-001-B）：打包扫描器对 `package.py`、`verify_package.py`、`test_package_security.py` 存在豁免名单，允许伪造的私钥头潜入。
此外，还修正了冒烟测试中外部符号链接析构顺序导致后续打包失败的问题。

【开发者在 v0.2.1-r3 中的落地措施】
1. 静态服务（server.mjs）：
   - 引入逐级路径 `lstat` 检查：对请求路径自顶向下每一层组件均校验 `isSymbolicLink()`，发现任意一级为符号链接即直接返回 403 Forbidden；
   - 强化物理分区约束：校验 realpath 必须严格局限于目标分区（如 `/src/**` 必须实体位于 `root/src/`，`/models/**` 必须实体位于 `root/models/`，根路径仅限 `index.html`）。
2. 打包与审计（package.py / verify_package.py）：
   - 彻底移除所有文件扫描豁免，对交付包中的 39 个文件（包含自身脚本与所有文本、Markdown、源码）100% 全量扫描；
   - 正则表达式与匹配逻辑采用动态字节拼接（`b'-----' + b'BEGIN'`），确保脚本本身无 PEM 字面量，不会误报自身，同时可靠阻断任何私钥头潜入。
3. 冒烟测试清理（smoke.mjs）：
   - 使用 `lstatSync` 优先解除符号链接，再删除外部 target，确保无悬垂符号链接残留，保障后续连续打包通过。

【请重点审查】
1. 构造类似 `src/root-alias -> ..` 或 `src/nested-dir-symlink` 的目录符号链接，尝试请求 `GET /src/root-alias/server.mjs` 或 `GET /src/root-alias/package.json`，验证是否均被严格拦截为 403 Forbidden；
2. 在 `scripts/package.py`、`scripts/verify_package.py` 或任意源码/文档文件中尝试写入包含 `BEGIN RSA PRIVATE KEY`、`BEGIN EC PRIVATE KEY` 等 PEM 私钥头，运行 `python scripts/package.py`，验证是否 100% 阻断且 Exit Code 为 1；
3. 运行 `node scripts/smoke.mjs` 后紧接着执行 `python scripts/package.py`，确认无任何悬垂符号链接残留，打包能否顺利通过；
4. 查验全套自动化测试（`npm run check`、`npm test`、`python scripts/test_package_security.py`）。

若上述测试全部通过且未发现新的 P0 安全与学术数据隐患，请给出本轮 P0 结案结论，并确认是否同意进入下一轮 P1 缺陷（R-003~R-009）的修复开发。
```
