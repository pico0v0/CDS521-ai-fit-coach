# TEST_RESULTS — 本轮已执行与未执行（v0.2.1-r1）

> **坚守学术诚实与证据原则**：本文件记录实际执行与未执行内容。算法模拟通过绝不代表真实 AI 摄像头通过。

## 一、自动化验收执行记录（执行环境：Node 22.16.0 / Windows 11）

| 命令 | 预期与测试目标 | 实际结果 | 核心指标 / 证据摘要 |
| :--- | :--- | :--- | :--- |
| `npm run check` | 检查 6 个 ES 核心模块语法有效性 | **PASS** | 无任何语法、导入或引用错误 |
| `npm test` | 执行全量单元测试（包含 R-002 数据隔离） | **PASS** | **26/26 项测试 100% 通过**，耗时 166ms |
| `node scripts/smoke.mjs` | 本地服务路由、MIME、路径安全与假私钥拦截 | **PASS** | 假私钥 `dummy_probe_key.pem`、`key.pem` 请求返回 403/404，静态白名单生效 |
| `npm run benchmark` | 9 组跨 FPS 采样率时序状态机稳定性 | **PASS** | 合成状态机闭环 MAE = 0.000，纯算法吞吐 > 50,000 FPS |
| `python scripts/package.py` | 跨平台自动化测试、私钥扫描与 ZIP 打包 | **PASS** | 扫描 0 个私钥，成功打包含 37 个必要源文件的发布包 |
| `python scripts/verify_package.py <zip>` | 发布包 SHA-256 清单一致性与结构校验 | **PASS** | 37 文件哈希校验 100% 匹配 |

### 单测明细（26 项全部绿色通过）
1. `2D angle geometry, invalid and degenerate landmarks` (0.88ms)
2. `synthetic landmarks have measurable joint angles` (0.54ms)
3. `low visibility and missing landmarks do not produce fake measurements` (0.10ms)
4. `squat: counts 3 complete and flags one shallow in 4 synthetic cycles` (3.34ms)
5. `curl: counts 3 complete and flags one shallow in 4 synthetic cycles` (1.52ms)
6. `jumping_jack: counts 3 complete and flags one shallow in 4 synthetic cycles` (2.02ms)
7. `squat: static pose never counts` (0.16ms)
8. `squat: loss of pose interrupts rep` (0.10ms)
9. `squat: long gap does not complete an unfinished rep` (0.09ms)
10. `curl: static pose never counts` (0.13ms)
11. `curl: loss of pose interrupts rep` (0.08ms)
12. `curl: long gap does not complete an unfinished rep` (0.07ms)
13. `jumping_jack: static pose and interrupted rep handling` (0.13ms)
14. `timestamps must be increasing; invalid exercise rejected` (0.29ms)
15. `simulated angle exercises have planned shallow cycles` (0.07ms)
16. `side hysteresis prevents flickering when confidences are close` (0.13ms)
17. `analyzer tracks depth progress and retains active side during rep` (0.10ms)
18. `checkPostureFault detects excessive trunk forward lean in squat` (0.34ms)
19. `checkPostureFault detects upper arm swinging during curl` (0.10ms)
20. `checkPostureFault detects arm asymmetry in jumping jacks` (0.11ms)
21. `analyzer supports difficulty presets and target rep goal achievement` (0.17ms)
22. `session persistence is local, bounded, and clearable` (2.78ms)
23. `corrupted and untrusted local records are ignored` (0.19ms)
24. `advice depends on fatigue, incomplete reps, no reps and goal` (0.25ms)
25. `session export generates valid CSV with BOM and JSON` (0.28ms)
26. **`computeMaeStats strictly isolates real AI sessions from simulation data` (0.72ms，新增 R-002 物理隔离单测)**

---

## 二、未执行 / 未验证项（必须明确标注，不得谎称通过）

1. **真实真人动作识别准确率：未验证（NOT RUN）**。
   - `npm run benchmark` 输出的 MAE = 0.000 仅代表确定性生物力学仿真序列下有限状态机与过滤器的闭环能力；
   - 真人受试者在不同机位、光照、服装及真实 MediaPipe 波动下的 MAE 必须按照 `docs/EXPERIMENT_PROTOCOL.md` 规范由人工对照实测得出。
2. **真机物理摄像头（Webcam）及浏览器端到端：未验证（BLOCKED）**。
   - 开发与审查环境缺乏物理摄像头硬件及 GUI 桌面，未通过真实用户按键点击测试；真实摄像头需在答辩演示笔记本上走查。
3. **真实断网离线加载 MediaPipe：未验证（保留至 P1 轮次 R-008）**。
   - 目前模型文件支持本地缓存，但 ESM 运行时仍需首次加载网络资源或利用浏览器缓存。
