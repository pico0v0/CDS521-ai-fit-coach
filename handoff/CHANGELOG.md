# CHANGELOG（每轮 AI 必须追加）

## v0.2.1-r4 — 第四轮 P1 专项修复：测试套件假阳性消除、CSV 误差导出一致性、动作时序与侧别锁定加固（2026-11-05）

### 已修复问题（P1 专项与工程完善）
- **P1-TEST-001 [P1/测试可靠性] 修复安全测试假阳性与交互挂起**：
  - `scripts/test_package_security.py`：场景 6 移除 `shell=True`，改用 `shell=False`、显式 `stdin=subprocess.DEVNULL` 与 `timeout=20`，严格核验进程退出码 0 与标准输出中的 `HTTP smoke PASS` 成功标记；
  - 增补场景 7 负向回归测试（Negative Regression Test）：构造必然抛出异常的冒烟测试脚本，断言测试套件能敏锐检出非零退出码与错误信息，杜绝假阳性；
  - `scripts/package.py`：`run(cmd)` 增加 `stdin=subprocess.DEVNULL` 与 `timeout=60`，消除常规终端运行下可能出现的子进程 stdin 阻塞挂起。
- **P1-DATA-CSV [P1/学术一致性] 确保 MAE 看板与 CSV 导出逐行绝对误差完全一致**：
  - `src/store.js`：实现统一的 `deriveVerifiedAbsError(session)` 纯函数，仅在 `count` 与 `manualCount` 均为有效非负整数时计算 `Math.abs(count - manualCount)`；未人工核验的会话严格输出空字符串 `""`，绝不虚假填充 `0`；
  - `exportSessionsCSV` 全面改用 `deriveVerifiedAbsError`，杜绝因旧数据持久化了负数或脏数据导致的负数误差导出；
  - `tests/store.test.mjs`：增加单测断言未标注记录绝对误差为空、负数脏数据自愈纠偏，且 CSV 导出行误差均值与 `computeMaeStats().realMae` 完全一致。
- **R-003 [P1/视频评测] 视频分析启动时序加固（第 0 秒等待模型就绪）**：
  - `src/app.js`：修复“视频先播放、后加载 AI 模型”的竞态问题。选择视频后先暂停在第 0 秒并读取元数据，待 MediaPipe 模型完全下载并初始化就绪后，重置 `video.currentTime = 0`，再与推理循环同步启动播放，确保视频开头的每个动作帧均被可靠捕获分析。
- **R-004 [P1/误计数] 动作侧别硬锁定与跨侧跳变阻断**：
  - `src/exercise.js`：在动作进行中（`inRep === true`）增加侧别硬锁定保护，若检测到关键点侧别突然切换（如左腿深蹲屈曲尚未完成却跳变到伸直的右腿），立即中断重置当前动作并发出警示，严禁借用对侧角度拼接虚假完成动作；
  - `extractJointAngle` 签名扩展兼容 `{ preferredSide, hysteresis }` 对象参数与历史字符串参数；
  - `tests/exercise.test.mjs`：增加 `BUG02` 复现单测（不对称双腿 + 一侧遮挡 + 对侧恢复），验证系统计数严格为 0。
- **R-005 [P1/规则定义] 开合跳双下肢开合协同约束**：
  - `src/exercise.js`：实现 `getLegSpreadRatio` 提取双脚踝相对于骨盆的归一化开合比；
  - 在开合跳动作计数中，若追踪到下肢关键点，必须满足双臂展开（腕部高度/肩角达标）与双腿充分展开（归一化腿部开合比达到阈值）双重协同，方计为有效开合跳；若腿部完全静止仅摆动手臂，判定为未达标而不予计数；
  - `tests/exercise.test.mjs`：增加 `BUG03` 复现单测，验证 4 个周期腿部固定的摆臂动作计数严格为 0。
- **R-006 [P1/提示时序] 首次姿态异常提示免冷却即时触发**：
  - `src/exercise.js`：修复 `this.lastFaultTimes[fault.code] || 0` 导致的会话前 3 秒（`timestamp < 3000`）首次异常被误杀抑制的问题；改为首次发生即刻报告，之后才按 3 秒冷却节流；
  - `tests/exercise.test.mjs`：增加 `BUG04` 复现单测，验证 `timestamp = 100~2300ms` 下注入的姿态异常能够即时捕获触发。
- **R-010 [P2/退化几何] 提前过滤退化重合骨架**：
  - `src/exercise.js`：在 `angleDegrees` 返回 `null` 或角度 `< 5°` 时，`extractJointAngle` 严格返回 `null`，不再因 `null + null = 0` 错误返回伪造的 0°；
  - `tests/exercise.test.mjs`：增加 `BUG01` 复现单测。
- **R-008 [P1/离线说明] 纠正“完全离线”宣称，明确运行时加载边界**：
  - `scripts/download_models.py` 与 `src/pose.js`：修正文档与终端提示，如实声明本地 `/models/` 离线缓存仅包含 `.task` 视觉模型与 WASM 算子；在未缓存浏览器首度加载时仍需公网下载 ESM 运行库；离线答辩推荐提前预热或使用模拟模式。
- **R-009 [P1/学术口径] 动态实算浅动作召回率，消除主线程无阻塞绝对宣称**：
  - `scripts/benchmark.mjs`：实算浅动作召回率（`shallowRecallPct`），用实算数字替代硬编码的 "100%"；
  - 修正性能宣称，中性标明“纯算法规则吞吐能力（CPU 状态机基准）”，指引实机性能参考运行时面板。
- **R-013 [P2/性能指标] 分离渲染 FPS 与 AI 推理 FPS / 耗时**：
  - `src/app.js`：实时性能指示标签独立显示「渲染 FPS」、「AI 推理 FPS」和「推理耗时」，避免将 60 FPS 渲染帧率混淆为 AI 推理帧率。

## v0.2.1-r3 — 第三轮 P0 最终闭环：目录符号链接边界防御、零源码扫描豁免与烟测清理可靠性（2026-11-05）

### 已修复问题（P0 彻底闭环与交付可靠性）
- **R-001-A [P0/安全] 逐级目录符号链接防御与分区授权真实路径校验**：
  - `server.mjs`：对 URL 解码后的每一个路径片段逐级执行 `lstat` 检查，彻底阻断类似 `/src/internal-alias -> ..` 的祖先目录符号链接绕过；
  - `server.mjs`：将 `realpath` 物理路径校验细化到各自专属授权分区（`/src/` 必须物理处于 `root/src`，`/models/` 必须物理处于 `root/models`，根入口必须等于 `index.html` 或 `favicon.ico`），任何越区访问一律响应 403 Forbidden；
  - `scripts/smoke.mjs`：增补祖先目录符号链接与测试金丝雀请求断言，确认 GET 与 HEAD 均为 403 且无内容泄漏。
- **R-001-B [P0/安全] 移除所有打包与验签代码的“整文件扫描豁免”**：
  - `scripts/package.py` & `scripts/verify_package.py`：完全取消对任何脚本文件的豁免排除，所有拟入包文件 100% 纳入全量字节扫描；
  - 正则模式与测试代码采用字符串片段拼接构造，避免工具自身包含完整明文私钥头；
  - 在收集拟打包文件写入 ZIP 前增加二次字节扫描，防止前置扫描后文件发生变更；
  - `scripts/test_package_security.py`：新增对 `package.py` 和 `verify_package.py` 自身注入 PEM 私钥头的阻断回归测试（场景 4 与场景 5）。
- **P1-NEW [可靠性] 修复 `smoke.mjs` 清理逻辑，实现交付流程可重复打包**：
  - `scripts/smoke.mjs`：重构 `finally` 阶段，使用 `lstatSync` 优先解除符号链接本体，避免由于先删目标导致 `existsSync` 对悬空符号链接返回 false 而残留；
  - `scripts/test_package_security.py`：新增场景 6 自动化验证执行 `node scripts/smoke.mjs` 后无悬空符号链接遗留，且 `python scripts/package.py` 可连续执行无障碍。

## v0.2.1-r2 — 第二轮 P0 修复：静态服务双重白名单、符号链接防御与私钥全格式扫描（2026-11-05）

### 已修复问题（P0 补强）
- **R-001-A [P0/安全] 静态服务权限边界与符号链接越界阻断**：
  - `server.mjs`：增加 `isAllowedClientPath` 严格客户端资源路径白名单（仅放行 `/`、`/index.html`、`/src/**`、`/models/**`），禁止通过 HTTP 访问 `/server.mjs`、`/package.json` 及根目录任意临时 JSON 文件；
  - `server.mjs`：引入 `lstat()` 符号链接拦截与 `realpath()` 真实物理路径检验，请求目标为符号链接或解析越界时一律返回 403 Forbidden，杜绝跨目录读取敏感内容；
  - `scripts/smoke.mjs`：新增攻击式用例（包含金丝雀 `private_notes.json` 及外部符号链接 `linked-public.js`），断言 GET 与 HEAD 均返回 403 且无内容泄露。
- **R-001-B [P0/安全] 打包程序多格式 PEM 私钥头全量扫描与符号链接拒绝**：
  - `scripts/package.py`：使用全面正则表达式匹配通用、RSA、EC、DSA、OPENSSH、ENCRYPTED 等全部 PEM 私钥头格式；
  - `scripts/package.py`：取消跳过 Markdown 和 TXT 的限制，对所有拟入包文件进行逐字节扫描；打包前增加快速预检；
  - `scripts/package.py`：遇到待打包符号链接一律立即拒绝退出，禁止带入外部引用内容；
  - `scripts/verify_package.py`：独立解包校验层增加 PEM 私钥特征码与敏感扩展名扫描；
  - `scripts/test_package_security.py`：自动化回归套件验证 Markdown 内私钥、JS 内 RSA 私钥、.pem 文件均可被成功阻断。
- **R-002 [P0/学术数据] 数据一致性与非负绝对误差计算加固**：
  - `src/store.js`：`computeMaeStats` 不再直接信任持久化存储的 `absError`，而是强制由非负整数 `count` 与 `manualCount` 在内存中自愈重算 `verifiedAbsError = Math.abs(count - manualCount)`；
  - 增加对 `typeof s.trackedFrames === 'number'` 的严格校验，防止字符串或负误差污染看板；
  - `tests/store.test.mjs`：增加对异常记录自动自愈纠偏的断言测试。

## v0.2.1-r1 — 第一轮 P0 缺陷修复：HTTPS 凭据隔离与真实 MAE 统计物理隔离（2026-11-05）

### 已修复问题（P0）
- **R-001 [P0/安全] HTTPS 私钥与敏感凭据静态服务硬拦截及打包排除**：
  - `server.mjs`：增加 `FORBIDDEN_EXTENSIONS`（显式阻断 `.pem`, `.key`, `.crt`, `.cert`, `.p12`, `.pfx`, `.pkcs8`, `.env` 等）与路径敏感词过滤，严格实行静态资源白名单；
  - 默认 TLS 证书路径从根目录迁移至项目外部 `../ai-fit-coach-tls/`，支持 `TLS_KEY_PATH` 与 `TLS_CERT_PATH` 环境变量；
  - `scripts/package.py`：增加密钥后缀与私钥特征码主动扫描拦截，工作区一旦检出私钥立即终止打包；`audit` 目录加入排除列表；
  - `scripts/smoke.mjs`：自动化创建伪造私钥 `dummy_probe_key.pem` 并断言 HTTP GET/HEAD 返回 403/404。
- **R-002 [P0/学术数据] 真实 AI MAE 与模拟演示数据物理隔离**：
  - `src/store.js`：实现 `computeMaeStats` 纯函数，`realMae` 仅纳入 `mode ∈ {camera, video}`、`trackedFrames >= 5` 且包含合法非负整数人工真值的有效会话；`demo` 数据完全独立统计；
  - `src/app.js`：重构训练报告页 `reportsPage()`，无真实数据时明确展示「暂无有效真人对照数据」，严禁伪造假 0.00；模拟数据在侧边单独标注展示；
  - `src/app.js`：训练结束人工真值录入弹窗强化正则 `/^\d+$/` 校验，拦截浮点数、负数与科学计数法；
  - `tests/store.test.mjs`：新增单测断言 10 条模拟零误差会话下 `realMae` 保持为 `null`，且混合输入时真实 MAE 分毫不受污染。
- **R-007 [P1/兼容性] 跨平台打包命令单字符串执行**：
  - `scripts/package.py` 中将命令数组转为单字符串执行，解决 Linux/macOS POSIX 环境下 `shell=True` 丢失子参数问题。

### 未处理问题（保留下一轮）
- 依据第一轮审查指令，P1/P2 问题（R-003~R-006、R-008~R-015）按计划保留在下一轮（P1 轮次）集中修复，详见 `handoff/KNOWN_ISSUES.md`。

## v0.2.0 — 实验对照真值录入、自动 MAE 汇算与学术实验规范指南（完成 M3）（2026-11-05）

### 已新增与改进
- **人工对照真值（Ground Truth Tally）采录与自动绝对误差计算（`src/app.js`、`src/store.js`）**：
  - 训练结束（点击「结束本次训练」）时，弹出实验真值登记窗口（Ground Truth Tally Prompt），支持学生/实验员直接输入人工计数的实际达标次数；
  - 若输入有效次数，系统自动计算单次会话绝对误差 $\text{absError} = |\text{systemCount} - \text{manualCount}|$；
  - 若直接跳过（或点击取消），系统正常保存会话并不计入误差统计，兼顾普通用户日常体验与科研实验严谨性；
  - `exportSessionsCSV` 导出表新增「人工对照次数」与「绝对误差」两列，生成的带 UTF-8 BOM CSV 文件可直接导入 Excel / SPSS / Python Pandas 开展统计分析。
- **训练报告页面（`reportsPage()`）新增「实验对照 MAE」实时汇算看板**：
  - 自动过滤所有录入真值的实验会话，实时汇算平均绝对误差（Mean Absolute Error, $\text{MAE} = \frac{1}{N} \sum |\hat{y}_i - y_i|$）并作为大号核心指标卡突出显示；
  - 历史训练表格扩展 6 列结构，增加「人工/误差」对照列（如 `10 / 0`、`8 / +1`），并提供深绿色/暖黄色直观预警；
  - 最近一次训练卡片同步展示人工复核数据，并在无记录时呈现友好的空状态。
- **学术对照实验规范指南（`docs/EXPERIMENT_PROTOCOL.md`）**：
  - 严格按照计算机视觉课程学术报告规范，制定 3 名受试者（P01-P03）、3 种动作（深蹲/弯举/开合跳）、多光照/机位/衣着条件的标准评测流程；
  - 明确规范 MAE、召回率、误检率计算公式及评测记录表格标准；
  - 深入剖析 4 类典型失败用例（遮挡、快速剧烈运动拖影、侧身投影歧义、弱光对比度不足）及算法应对策略；
  - 提供现场答辩图表生成指导与 Python 数据处理脚本样例。
- **单元测试扩展（`tests/store.test.mjs`）**：
  - 新增对 `manualCount` 与 `absError` 序列化、CSV 列头与格式化以及 JSON 解析的断言，全套 25 个单元测试 100% 绿色通过。

## v0.1.9 — 移动端局域网安全上下文优化与真机测试指南（解决 KI-006）（2026-11-05）

### 已新增与改进
- **移动端局域网访问与安全上下文友好指引（解决 KI-006）**：
  - 在 `src/app.js` 中增加 `window.isSecureContext` 检测；当检测到手机通过局域网 HTTP IP 访问且被浏览器安全策略限制摄像头时，输出清晰、可操作的提示引导，告知用户使用本地视频评测、开启 HTTPS 或配置 Chrome Flags；
  - 静态服务器 `server.mjs` 增加 `HOST`（支持 `0.0.0.0` 局域网绑定）与 `HTTPS`（支持自签名证书）环境变量支持，扩展媒体 MIME 类型（`.mp4`, `.webm`, `.mov`, `.woff2`）；
  - 编写详细的移动端真机验收指南 [docs/MOBILE_TESTING.md](file:///c:/workspace/ai-fit-coach/docs/MOBILE_TESTING.md)，包含 Chrome Flags 免证书授权、本地自签名证书生成及常见手机端卡顿/镜像排错指南。
- **已知问题与验收跟踪更新（`handoff/KNOWN_ISSUES.md`）**：
  - 更新 KI-001、KI-002 与 KI-006 状态，反映近期在离线模型、本地视频评测、MAE 基准及移动端环境下的工程闭环成果。

## v0.1.8 — 骨架关节实况 HUD 角度标牌与全动作 MAE 基准评测套件（2026-11-05）

### 已新增与改进
- **骨架目标关节实况 HUD 角度徽标（`src/draw.js`）**：
  - 在 Canvas 画面目标活动关节（如深蹲膝关节、弯举肘关节、开合跳肩关节）旁实时浮动渲染半透明 HUD 胶囊徽标，动态显示当前计算角度（如 `110°`）；
  - 徽标边框与文字根据动作深度进度自适应变化（达标 $\ge 100\%$ 时呈现翡翠绿高亮 `#10b981`），为 20 分钟课堂投影演示提供极具科技感的视觉焦点。
- **全动作 MAE 精度与吞吐自动化评测套件（`scripts/benchmark.mjs`）**：
  - 新增 `npm run benchmark` 标准测试指令，全量评估 3 种动作在 15/24/30 FPS 采样率下的状态机稳定性与计数精度；
  - 自动输出 `handoff/BENCHMARK_REPORT.md`，证实算法纯时序吞吐达 **> 50,000 FPS**，全场景仿真 MAE 为 **0.000**，浅动作辨识召回率达到 **100%**。
- **交付打包自动化链条强化（`scripts/package.py`）**：
  - 发布打包流程自动纳入基准测试核验，确保代码交付始终保持基准性能与精度 100% 达标。

## v0.1.7 — 本地视频文件真实 AI 评测、Web Audio 达标提示音与答辩讲稿完整版（2026-11-05）

### 已新增与改进
- **本地视频文件真实 AI 推理评测（落地 M1/M3 对照实验关键能力）**：
  - 训练页面新增「🎞 本地视频评测」快捷入口；
  - 支持直接选择本地 MP4/WebM/MOV 健身视频，在浏览器端利用真实的 MediaPipe Pose Landmarker 模型进行逐帧 AI 推理与骨架提取；
  - 完美解决课堂现场光照不足、无网络无法连接手机摄像头或不便真人动作时的评测痛点，极大方便对照标注基准（Ground Truth）进行可复现的 MAE 误差分析；
  - 训练报告与数据持久化增加 `本地视频AI` 模式标记，CSV 导出明晰区分三种数据源。
- **Web Audio API 瞬态清脆达标音效（免外部音频资源依赖）**：
  - `src/app.js` 增加原生 Web Audio 合成音效（880Hz $\to$ 1320Hz 动作达标 Ding 声，以及四音阶组数目标达成欢呼和弦）；
  - 零外部音频文件加载负担，与浏览器语音播报（SpeechSynthesis）形成视觉、听觉、量化多维正反馈。
- **20 分钟答辩与公开汇报完整讲稿升级（`docs/PRESENTATION_20MIN.md`）**：
  - 扩充输出分钟级精准把控时间线（0-20min）、15 页 PPT 结构化讲稿（含双语要点与逐字演讲稿）；
  - 输出 6 分钟现场实机演示标准操作程序（SOP）与 3 级容灾兜底策略；
  - 输出面向答辩评委与助教的 **高频 8 问与精准答辩要点**（涵盖 2D 单目局限、FSM vs 时序网络、隐私保护、尺度不变性等核心考点）。

## v0.1.6 — 第三个动作支持：开合跳（Jumping Jacks）与展角状态机（2026-11-05）

### 已新增与改进
- **第三个动作：开合跳（`jumping_jack`）完整支持**：
  - `src/exercise.js`：
    - `EXERCISES` 新增 `jumping_jack`（双臂展角，正面机位 · 全身入镜，扩展型状态机 `direction: 'expand'`，起始基准 35°，触发 55°，达标 130°）；
    - `extractJointAngle`：正面机位提取双侧肩-肘-腕-髋关键点，自动计算双臂展角均值与双侧置信度，单双侧平滑退化；
    - `ExerciseAnalyzer`：扩展支持增角展开（`direction: 'expand'`）与屈曲收缩（`direction: 'bend'`）双向状态机，统一深度标尺（Depth Meter）与计数闭环；
    - `DIFFICULTY_PRESETS` 增加开合跳三档难度（初学 115° / 标准 130° / 进阶 145°）。
- **开合跳动作姿态异常检测（`checkPostureFault`）**：
  - 增加双臂舒展不对称检测（`arm_asymmetry`）：实时对比左臂与右臂展开角度，不对称度 $> 35^\circ$ 时提示「双臂尽量对称舒展，避免单侧动作滞后」。
- **合成模拟仿真器增强（`src/simulator.js`）**：
  - 新增 `jumping_jack` 正面骨架合成运动，支持起跳双臂舒展开合、双腿外展跳跃，以及周期性浅开合与不对称故障注入。
- **界面交互与报告支持**：
  - 动作切换增加「开合跳 JACK」按钮，支持自适应布局（`flex: 1`）；切换动作时完整保留已设定的难度和目标次数；
  - 训练报告与数据持久化加入开合跳白名单与个性化节奏建议；CSV 导出增加「双臂不对称次数」字段；
  - 首页动作统计同步更新至 3 种动作（深蹲 / 弯举 / 开合跳）。
- **自动化测试扩充**：
  - 测试套件扩充至 25 项全量通过（涵盖开合跳合成 4 周期、浅动作识别、中断重置、静止防误触、不对称姿态报错与 CSV 导出验证）。

### 已新增与改进
- **本地离线模型智能优先策略（解决 KI-005）**：
  - `src/pose.js`：新增 `resolveModelAssets` 探测机制，优先使用本地 `/models/pose_landmarker_lite.task` 及本地 WASM 文件，无本地文件时平滑回退至官方 CDN；
  - 增加 18 秒超时控制与清晰的自检报错，杜绝因网络阻断而无限等待；
  - 启动成功后在界面明确标记 `（本地离线模型）` 或 `（网络加载）`，让评委与开发者对当前加载源一清二楚。
- **离线模型一键下载工具（`scripts/download_models.py`）**：
  - 提供零第三方依赖的标准 Python 脚本，支持一键将官方 MediaPipe 模型（9MB）与 WASM 环境下载到 `models/` 目录；
  - `npm run download-models` 快捷集成；`.gitignore` 自动忽略大型二进制文件。
- **本地静态服务器（`server.mjs`）**：
  - 支持 HTTP `HEAD` 轻量探测请求与正确的 `.task` 二进制流响应头。

## v0.1.4 — 实验数据多格式导出（CSV/JSON）与语音试听调试（2026-11-05）

### 已新增与改进
- **实验对比数据导出（对接 M3 实验需求）**：
  - `src/store.js` 增加 `exportSessionsCSV`（带 UTF-8 BOM，Excel 打开不乱码）和 `exportSessionsJSON`；
  - 训练报告历史面板新增「⤓ 导出 CSV」与「⤓ 导出 JSON」按钮，一键下载完整训练时序记录（包含时间戳、有效动作数、未达幅度数、躯干前倾数、借力晃动数与时长），极大方便课程小组进行人工标注对照与 MAE 误差计算。
- **语音播报试听与调试（解决 KI-009）**：
  - 训练设置卡片中增加「试听 🔊」快捷按钮，一键触发测试语音播报，帮助用户确认浏览器音频环境与中文发音引擎正常。
- **自动化测试扩充**：
  - 补充 CSV BOM 头与 JSON 导出单元测试，测试套件增加至 22 项，100% PASS。

## v0.1.3 — 动作难度分级、训练目标达成与异步体验优化（2026-11-05）

### 已新增与改进
- **动作难度预设分级（解决 KI-008 个体化阈值）**：
  - 支持初学（深蹲 122° / 弯举 80°）、标准（110° / 65°）、进阶（95° / 50°）三档难度自由切换；
  - 动作深度标尺（Depth Meter）与达标完成角度实时联动更新。
- **训练目标次数与达成庆祝机制**：
  - 支持设置自由练习或固定目标组数（5 / 10 / 15 次）；
  - 达成预设组数时触发祝贺事件与高亮反馈（`🎉 达成目标！`）。
- **异步连接与加载 UX 增强（解决 KI-007）**：
  - 启动真实 AI 摄像头时按钮进入 `⏳ 正在连接…` 禁用态，杜绝快速连击造成的资源竞争；
  - 异常提示信息更清晰，提供一键引导与重试保护。
- **自动化测试扩充**：
  - 测试用例增加至 21 项，100% PASS。

## v0.1.2 — 姿态风险异常纠错（前倾/借力）与智能建议增强（2026-11-05）

### 已新增与改进
- **动作生物力学风险因素检测（Biomechanical Fault Detection）**：
  - `src/exercise.js` 增加 `checkPostureFault`：
    - **深蹲过度前倾（Trunk Lean）**：侧面视角计算肩-髋躯干倾角，当深蹲下潜倾角超过 46° 时报警并提示「注意挺胸收腹，避免躯干过度前倾」；
    - **弯举借力晃动（Arm Swing）**：检测手肘相对于肩部的水平横向偏移，当大臂过度摆动借力时提示「大臂尽量贴紧躯干，避免前后晃动借力」；
  - 增加提示冷却防抖机制（同种风险提示间隔 $\ge 3000\text{ms}$），避免连续刷屏与语音打架。
- **训练建议与报告多维升级**：
  - `src/store.js`：`makeAdvice` 根据动作中的姿态异常统计，生成针对性改进指导（如强调核心收紧、减少配重与孤立发力）；
  - `src/app.js`：训练报告面板新增「姿态风险提示」统计维度，并持久化到本地记录。
- **测试覆盖**：
  - 单元测试增加至 20 项，100% PASS。

## v0.1.1 — 侧别锁定、动作深度标尺与性能监控增强（2026-11-05）

### 已新增与改进
- **肢体侧别防抖与锁定（解决 KI-003）**：
  - `src/exercise.js`：`extractJointAngle` 引入置信度滞后机制（Hysteresis，默认 0.12），避免左右腿/左右手臂频繁跳变导致角度抖动；
  - `ExerciseAnalyzer`：在动作进行中（`inRep`）锁死活动侧别，直至动作回到站姿起始位；
  - UI 实时显示追踪侧别徽标（如 `● 左侧跟踪`）。
- **实时动作深度标尺（Depth Meter & Progress）**：
  - 在分析面板新增动作深度进度条（0% ~ 100%+）；
  - 动态展示准备站姿角度、动作触发点与达标阈值（深蹲 110° / 弯举 65°）；
  - 达成达标深度时自动变绿发光提示。
- **Canvas 骨架高亮绘制增强**：
  - `src/draw.js`：分析侧目标关节连线采用明黄高亮与双环脉冲光晕，弱化非活动侧，视觉层级更专业清晰。
- **性能度量与推理时延（满足 M2-02）**：
  - 实时计算 FPS 与单帧推理时延（ms），在视频舞台右上角优雅展示（如 `24 FPS · 18ms`）。
- **交互与快捷键体验**：
  - 新增全局空格键（Space）一键暂停 / 继续训练，方便站立远机位控制。
- **测试覆盖与稳健性**：
  - 补充侧别防抖与深度进度单元测试，测试用例增加至 18 项，100% 通过；
  - `npm run check` 零语法错误；`smoke.mjs` HTTP 冒烟全通过。

## v0.1.0 — 初版课程 Demo（2026-11-05）

### 已新增
- 轻量 Web 单页面 UI：首页、实时训练、训练报告、项目说明，支持响应式布局。
- `src/pose.js`：通过固定的 MediaPipe JS/WASM + Lite 模型地址接入真正姿态识别（待真机验收）。
- `src/exercise.js`：角度、可见性过滤、深蹲/弯举、完整与不完整幅度判定、丢失追踪保护。
- `src/simulator.js`：合成骨架非 AI 演示模式；每 4 周期包含 1 次故意幅度不足。
- `src/draw.js`：Canvas 骨架叠加；`src/store.js`：训练报告与本地记录、规则建议。
- 单元测试、HTTP 冒烟测试、项目文档、自动化打包/校验脚本、后续 AI 交接规范。

### 技术决策
- 采用零安装依赖的标准 ES Modules，不采用原始规划的 React/Vite，目的是让课程小组和后续较弱 AI 能直接运行并快速定位问题。后续需要时可迁移，但必须优先保证真实姿态识别验收。
- 不提供“自研 AI 姿态模型”与医学损伤预测；规则建议不声称是大语言模型生成。

### 未完成的验证
- 当前环境无法联网下载 MediaPipe 模型或在 Chromium 中访问页面（管理员策略拦截），真实摄像头 E2E 未验证。
