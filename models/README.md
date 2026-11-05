# MediaPipe 离线模型目录

本项目默认在运行时自动连接 Google / jsDelivr 加载 MediaPipe 模型与 WASM。

若您需要在**完全离线或无外网环境**（例如内网评测、教室演示）下运行真实的姿态识别：
请在有网络时执行：

```bash
python scripts/download_models.py
```

该脚本将自动下载以下官方离线文件到本目录：
1. `pose_landmarker_lite.task`（约 9MB，Google MediaPipe Pose Landmarker Lite 模型，Apache 2.0 许可证）
2. `wasm/`（MediaPipe Tasks-vision WebAssembly 运行环境文件）

当本目录存在上述离线文件时，网页将**自动优先加载本地离线模型**，无需连接外部网络。
