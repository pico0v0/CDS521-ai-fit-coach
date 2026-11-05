# REVIEW_REQUEST — v0.2.1-r9 第九轮 P1 专项彻底闭环交接审查说明

**交付版本**：v0.2.1-r9  
**交付包**：`release/ai-fit-coach-demo-v0.2.1-handoff.zip` (39 个文件，完整哈希与逐文件零私钥扫描通过)  
**本轮目标**：根据审查 AI 第八轮独立复审报告（`AI Fit Coach v0.2.1-r8 — 第八轮 P1 专项复审`）及返修指令（`NEXT_AI_R9_FIX_PROMPT.md`），定向修复旧视频异步初始化取消后的生命周期竞态问题（P1-R003-03），实现全套 P1 专项彻底结案闭环：
1. **P1-R003-03**：在 `begin('video')` 与 `begin('camera')` 外层 `catch` 中严格添加 `if (run !== state.activeRunId) return;` 运行令牌拦截，杜绝旧任务的迟到错误回调误杀已启动的新会话；
2. **测试补充**：在 `tests/store.test.mjs` 中新增端到端取消后迟到 error 回调与延迟 model reject 注入断言，验证新会话不受任何干扰持续运行；
3. **审查对齐**：审查 AI 提供的独立审计脚本 `REPRO_R8_VIDEO.mjs` 4 项测试场景全部绿灯转正。

---

## 一、本轮重点加固与验收点（生命周期竞态彻底闭环）

1. **P1-R003-03 [P1/生命周期] 消除旧会话取消后的延迟异常穿透与新会话误杀**：
   - **源码位置**：`src/app.js:501–510, 540–549`、`tests/store.test.mjs:325–395`；
   - **加固措施**：
     - 在 `begin('video')` 外层 `catch (error)` 首行加入 `if (run !== state.activeRunId) return;`；
     - 在 `begin('camera')` 外层 `catch (error)` 首行加入 `if (run !== state.activeRunId) return;`；
     - 当旧视频/旧摄像头任务在加载等待期间被用户取消（`finishSession` / `stopRealtime` 递增 `activeRunId`）并切换到新会话（如 `demo`）后，旧任务延迟触发的错误事件或模型异常绝不执行 `stopRealtime()`，绝不重置新会话的 `state.mode`、`running` 状态与活跃动画循环；
     - `toast` 定时器添加 `unref()`，彻底消除测试环境下残留定时器对事件循环的无谓挂起。

2. **独立审查脚本验证（`REPRO_R8_VIDEO.mjs`）**：
   - 运行针对 r8 竞态的插桩审计流程，输出如下：
     ```json
     {"case":"one-human","inferred":1,"tracked":1,"mode":"video","ready":true,"plays":1}
     {"case":"no-human","inferred":1,"tracked":0,"mode":"video","ready":true,"plays":1}
     {"case":"initial-inference-error","inferred":0,"tracked":0,"mode":null,"ready":false,"plays":0,"close":1,"revoke":1,"activeRAF":0}
     {"case":"cancel-pending-video-then-new-demo","expectedMode":"demo","actualMode":"demo","running":true,"activeRAF":1}
     ```
   - 原先在 r8 中失败的第 4 场景 `cancel-pending-video-then-new-demo` 准确断言 `actualMode: "demo", running: true, activeRAF: 1`，全部 4 项 100% 绿灯通过。

3. **全部既往结案项持续稳定保持通过**：
   - **P0 安全**：静态服务白名单与目录符号链接防御、全量无豁免私钥打包扫描（7/7 PASS）持续稳定结案；
   - **R-005**：开合跳初学者动态达标阈值（115°/118° 达标）与双臂达峰瞬间下肢开合比锁死在第七轮已正式结案通过；
   - **R-009**：1-to-1 周期事件级真值匹配（TP/FP/FN/Precision/Recall/F1）及重复告警注入测试持续保持结案通过；
   - **R-003-01 / R-003-02**：首帧单一入口检出计数（inferred=1/tracked=1）与首帧推理异常严格阻断播放（play=0, mode=null）在第八轮已通过独立验证结案。

---

## 二、本地全套自动化验证指令

```bash
npm run check                                                         # 6 个核心 ES 模块语法检查 (PASS)
npm test                                                              # 34/34 项全量单测 (PASS, ~150ms)
python scripts/test_package_security.py                               # 7 项安全注入与负向防假阳性自动化回归 (PASS)
node scripts/smoke.mjs                                                # 包含目录符号链接与非客户端路径 403 拦截的冒烟测试 (PASS)
npm run benchmark                                                     # 9 组跨 FPS 动作基准测试与严格 1-to-1 事件匹配 (PASS)
python scripts/package.py                                             # 自动化零豁免前置扫描与 ZIP 打包 (PASS)
python scripts/verify_package.py release/ai-fit-coach-demo-v0.2.1-handoff.zip # 独立解包审计与 SHA-256 完整性校验 (PASS)
```

---

## 🤖 供直接复制发给复审 AI 的提示词（Prompt for Reviewer AI）

```markdown
请你扮演资深代码安全与计算机视觉审查专家，对本次提交的 AI Fit Coach v0.2.1-r9 进行第九轮 P1 缺陷专项复审。

【本次交付背景与任务】
第八轮独立复审报告（AI Fit Coach v0.2.1-r8 — 第八轮 P1 专项复审）确认：P0 安全保持结案，R-005 开合跳保持结案，R-009 浅动作匹配保持结案，R-003-01 首帧单计数与 R-003-02 首帧失败阻断正式结案。
本轮开发者严格根据第八轮报告中的返修指令（NEXT_AI_R9_FIX_PROMPT.md），仅针对旧视频异步初始化取消后迟到回调误杀新会话的竞态问题（P1-R003-03）进行最小定向攻坚，未改动任何已结案模块：

1. P1-R003-03 旧视频异步初始化取消竞态彻底消除：
   - 源码：`src/app.js` 约 501–510 行与约 540–549 行；
   - 在 `begin('video')` 与 `begin('camera')` 的外层 `catch (error)` 处理块首行，严格添加 `if (run !== state.activeRunId) return;` 运行令牌生命周期检查；
   - 任何已被取消或超期的旧任务，其内部抛出的迟到错误将被严格丢弃，绝不会调用全局 `stopRealtime()`，绝不清理属于新会话的资源、模式或活跃动画帧；
   - `toast` 定时器添加 `unref()`，彻底消除测试环境下残留定时器对事件循环的无谓挂起。

2. 审查复现脚本 100% 绿色转正：
   - 执行第八轮审查附带的独立复现脚本 `REPRO_R8_VIDEO.mjs`，第 4 场景 `cancel-pending-video-then-new-demo` 准确输出：
     `{"case":"cancel-pending-video-then-new-demo","expectedMode":"demo","actualMode":"demo","running":true,"activeRAF":1}`；
   - 结合前三项场景（one-human, no-human, initial-inference-error），全部 4 项 100% PASS。

3. 真实业务路径端到端测试扩充：
   - 在 `tests/store.test.mjs` 测试 34 中扩充 Subtest 5（取消挂起视频后启动 demo，迟到错误事件不破坏 demo）与 Subtest 6（旧模型延迟拒绝不破坏新会话）；
   - 全套 34/34 项单元测试在约 150ms 内极速绿色通过。

【请重点审查】
1. 检查 `src/app.js` 中的外层 catch 运行令牌生命周期防护（`if (run !== state.activeRunId) return;`）；
2. 运行 `REPRO_R8_VIDEO.mjs`，确认 `cancel-pending-video-then-new-demo` 输出 `actualMode: "demo", running: true, activeRAF: 1`；
3. 执行全套自动化验收指令：
   npm run check
   npm test
   python scripts/test_package_security.py
   node scripts/smoke.mjs
   npm run benchmark
   python scripts/package.py
   python scripts/verify_package.py release/ai-fit-coach-demo-v0.2.1-handoff.zip
   确认全部通过且无任何警告，ZIP 包 39 个文件哈希与零私钥扫描全量绿灯。

请给出本次 P1 专项闭环的最终复审决议。
```
