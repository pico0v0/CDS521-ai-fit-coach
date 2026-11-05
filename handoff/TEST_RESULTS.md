# TEST_RESULTS — 本轮已执行与未执行（v0.2.1-r3）

> **坚守学术诚实与证据原则**：本文件记录实际执行与未执行内容。算法模拟通过绝不代表真实 AI 摄像头通过。

## 一、自动化验收执行记录（执行环境：Node 22.16.0 / Python 3.13 / Windows 11）

| 命令 | 预期与测试目标 | 实际结果 | 核心指标 / 证据摘要 |
| :--- | :--- | :--- | :--- |
| `npm run check` | 检查 6 个 ES 核心模块语法有效性 | **PASS** | 6/6 模块语法检查通过，无任何语法、导入或引用错误 |
| `npm test` | 执行全量单元测试（含 R-002 异常自愈单测） | **PASS** | **26/26 项测试全部通过**，耗时 125ms |
| `node scripts/smoke.mjs` | 静态服务白名单、目录符号链接防御与敏感路径阻断 | **PASS** | `/server.mjs`, `/package.json`, `private_notes.json`, 外部文件符号链接与内部目录符号链接全部 403 Forbidden；测试完成后无悬垂符号链接残留 |
| `python scripts/test_package_security.py` | 验证零豁免扫描与 6 大安全注入场景 | **PASS** | **6/6 场景全量通过**（Markdown、JS、.pem 后缀、package.py 自身注入、verify_package.py 自身注入、冒烟后连续打包通过） |
| `npm run benchmark` | 9 组跨 FPS 采样率时序状态机稳定性 | **PASS** | 合成状态机闭环 MAE = 0.000，纯算法吞吐 > 50,000 FPS |
| `python scripts/package.py` | 自动化前置扫描、全套自动化核验与 ZIP 打包 | **PASS** | 39 个文件零豁免全量无私钥头扫描，打包生成 `release/ai-fit-coach-demo-v0.2.1-handoff.zip` |
| `python scripts/verify_package.py <zip>` | 独立解包审计、零豁免私钥扫描与 SHA-256 清单核对 | **PASS** | 39 文件哈希与 100% 逐文件私钥扫描完全通过 |
| `python audit/AI_Fit_Coach_v0.2.1-r2_Review/reproduce_r2.py <zip>` | 执行第二轮审查 AI 留存的复现套件验证 | **PASS** | 4 大审查项（package_exemption 阻断, smoke_cleanup 无悬垂且打包成功, key_formats 7 种格式 100% 阻断, MAE 统计隔离与异常重算）全部通过 |

### 单测明细（26 项全部绿色通过）
1. `2D angle geometry, invalid and degenerate landmarks` (0.64ms)
2. `synthetic landmarks have measurable joint angles` (0.42ms)
3. `low visibility and missing landmarks do not produce fake measurements` (0.09ms)
4. `squat: counts 3 complete and flags one shallow in 4 synthetic cycles` (4.12ms)
5. `curl: counts 3 complete and flags one shallow in 4 synthetic cycles` (2.31ms)
6. `jumping_jack: counts 3 complete and flags one shallow in 4 synthetic cycles` (1.85ms)
7. `squat: static pose never counts` (0.35ms)
8. `squat: loss of pose interrupts rep` (0.26ms)
9. `squat: long gap does not complete an unfinished rep` (0.19ms)
10. `curl: static pose never counts` (0.28ms)
11. `curl: loss of pose interrupts rep` (0.35ms)
12. `curl: long gap does not complete an unfinished rep` (0.69ms)
13. `jumping_jack: static pose and interrupted rep handling` (0.19ms)
14. `timestamps must be increasing; invalid exercise rejected` (0.25ms)
15. `simulated angle exercises have planned shallow cycles` (0.07ms)
16. `side hysteresis prevents flickering when confidences are close` (0.14ms)
17. `analyzer tracks depth progress and retains active side during rep` (0.08ms)
18. `checkPostureFault detects excessive trunk forward lean in squat` (0.29ms)
19. `checkPostureFault detects upper arm swinging during curl` (0.08ms)
20. `checkPostureFault detects arm asymmetry in jumping jacks` (0.09ms)
21. `analyzer supports difficulty presets and target rep goal achievement` (0.14ms)
22. `session persistence is local, bounded, and clearable` (2.55ms)
23. `corrupted and untrusted local records are ignored` (0.18ms)
24. `advice depends on fatigue, incomplete reps, no reps and goal` (0.28ms)
25. `session export generates valid CSV with BOM and JSON` (0.87ms)
26. `computeMaeStats strictly isolates real AI sessions from simulation data` (0.38ms，含来源标签逻辑隔离与异常值自愈纠偏)

---

## 二、未执行 / 未验证项（必须明确标注，不得谎称通过）

1. **真实真人动作识别准确率：未验证（NOT RUN）**。
   - `npm run benchmark` 输出的 MAE = 0.000 仅代表确定性生物力学仿真序列下有限状态机与过滤器的闭环能力；
   - 真人受试者在不同机位、光照、服装及真实 MediaPipe 波动下的 MAE 必须按照 `docs/EXPERIMENT_PROTOCOL.md` 规范由人工对照实测得出。
2. **真机物理摄像头（Webcam）及浏览器端到端：未验证（BLOCKED）**。
   - 开发与审查环境缺乏物理摄像头硬件及 GUI 桌面，未通过真实用户按键点击测试；真实摄像头需在答辩演示笔记本上走查。
3. **真实断网离线加载 MediaPipe：未验证（保留至 P1 轮次 R-008）**。
   - 目前模型文件支持本地缓存，但 ESM 运行时仍需首次加载网络资源或利用浏览器缓存。
