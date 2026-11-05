# REVIEW_REQUEST — 交付与代码审查说明

**版本**：v0.2.0  
**完成里程碑**：M0（可运行源码与模拟闭环）、M1（真实 MediaPipe AI 与本地视频评测）、M2（姿态异常纠错与健壮性防护）、M3（真值对照采录、自动 MAE 汇算与学术评测指南）

## 本轮交付核心特性

1. **实验对照真值录入与 MAE 汇算（M3）**：
   - 训练结束时支持即时录入人工核验实际计数 `manualCount`，自动计算单次会话 `absError`；
   - 训练报告页实时汇算实验记录的平均绝对误差（MAE）并展示；
   - CSV / JSON 导出扩展包含真值与误差列，带 UTF-8 BOM，方便导入 Excel/SPSS。
2. **多动作覆盖与双向状态机（M2）**：
   - 深蹲（Squat）、哑铃弯举（Bicep Curl）、开合跳（Jumping Jacks）；
   - 屈曲收缩（`bend`）与展角展开（`expand`）双向有限状态机；
   - 迟滞滤波锁定、躯干前倾、大臂晃动、双臂不对称 3 项姿态异常检测。
3. **真实 AI 评测与双重模式解耦（M1）**：
   - 严格分离真实 AI 摄像头/视频评测与算法模拟测试；
   - 「本地视频评测」模式支持在浏览器端使用官方 MediaPipe Pose Landmarker 模型逐帧分析 MP4 视频，解耦无摄像头或光照限制；
   - Canvas 实时 HUD 关节角度徽标与 Web Audio 清脆达标提示音。
4. **演示准备与答辩支撑**：
   - `docs/PRESENTATION_20MIN.md`：15 页 PPT 双语讲稿、分钟级时间线、现场 6 分钟演示 SOP 与 8 道经典答辩 Q&A；
   - `docs/EXPERIMENT_PROTOCOL.md`：严谨的学术对照实验协议、受试者标准、评测表格与 4 类典型失败用例归因。

## 自动化测试与复现指令

```bash
npm run check       # ES 模块语法检查 (6/6 PASS)
npm test            # 单元测试套件 (25/25 PASS)
npm run benchmark   # 算法状态机基准与 MAE 评测 (Overall MAE = 0.000)
npm run smoke       # 本地静态服务路由与安全检查 (PASS)
python scripts/package.py # 自动化打包为 release/ai-fit-coach-demo-v0.2.0-handoff.zip
```

---

## 🤖 可直接复制发给审查 AI 的提示词（Prompt for Reviewer AI）

```markdown
请你扮演资深计算机视觉与前端工程架构师，审查这份课程项目代码包（AI Fit Coach v0.2.0）。

【项目定位】
这是一个面向大学计算机视觉/AI 基础课程 20 分钟展示的零依赖原生 Web 应用（Zero-build ES Modules）。核心功能包括：MediaPipe Pose Landmarker 骨架提取、屈曲与展角双向时序有限状态机动作计数（深蹲、哑铃弯举、开合跳）、姿态异常诊断、人工真值比对与 MAE 误差自动汇算。

【重点审查维度】
1. 真实 AI 与模拟模式的边界清晰度：
   - 核查 `src/pose.js` 与 `src/simulator.js`，确认二者严格解耦，系统是否诚实披露模拟数据不代表真机 AI 准确率。
2. 生物力学几何计算与状态机健壮性：
   - 检查 `src/exercise.js` 中的 2D 关节角度计算、EMA 平滑滤波、侧别迟滞滤波（Hysteresis Locking）以及双向状态机（bend/expand），评估是否存在死循环、抖动误计或跳帧崩溃风险。
3. 真实视频推理与数据闭环：
   - 检查 `src/app.js` 与 `src/store.js` 中的本地视频逐帧评测、人工真值录入（manualCount）及 MAE 绝对误差汇算，验证数据流与 CSV（带 UTF-8 BOM）导出逻辑。
4. 架构与合规边界：
   - 确认项目严格保持零 npm 构建依赖；
   - 确认无过度医疗宣称（如疾病诊断、损伤预测），符合课程伦理规范。

请根据 `handoff/`、`docs/` 及 `src/` 中的源码，指出潜在代码异味（Code Smells）、边界异常风险以及改进建议。
```
