# 移动端（手机 / 平板）测试与安全上下文配置指南

> **背景说明**：现代移动端浏览器（iOS Safari、Android Chrome、Edge）出于隐私安全考量，对 `navigator.mediaDevices.getUserMedia` 实施了严格的 **Secure Context（安全上下文）** 限制。  
> 只有 `https://` 协议或 `http://localhost` 允许访问摄像头；直接通过局域网 IP（如 `http://192.168.x.x:4173`）访问时，移动端系统会默认禁止开启摄像头。

---

## 方案一：推荐方案（免配置 · 本地视频评测）

如果仅仅需要在手机上检验页面响应式排版、骨架叠加效果与姿态模型推理：
1. 电脑端启动服务：
   ```bash
   HOST=0.0.0.0 npm start
   ```
2. 手机浏览器打开 `http://<电脑局域网IP>:4173`；
3. 进入「实时训练」，直接点击 **「🎞 本地视频评测」** 按钮；
4. 从手机相册选择任意一段预录的深蹲或开合跳视频；
5. 系统将在手机浏览器本地直接调用 MediaPipe 模型进行实时采样姿态分析（基于主线程吞吐自适应采样，非逐编码帧扫描）与动作计数，**无需摄像头安全上下文权限**！

---

## 方案二：Android 手机免证书开启真实摄像头（Chrome Flags）

在 Android 手机 Chrome 上，无需购买域名和 SSL 证书，即可通过官方开发者通道授权局域网 HTTP 访问摄像头：

1. 在 Android 手机 Chrome 地址栏输入：
   ```text
   chrome://flags/#unsafely-treat-insecure-origin-as-secure
   ```
2. 在该配置项中填入你的电脑服务地址，例如：
   ```text
   http://192.168.1.100:4173
   ```
3. 将下拉框状态切换为 **Enabled**；
4. 点击右下角 **Relaunch** 重启 Chrome；
5. 重新打开 `http://192.168.1.100:4173`，即可正常弹出摄像头授权对话框，支持前置与后置镜头切换！

---

## 方案三：本地自签名 HTTPS 服务

如果需要在支持自签名证书的环境（如局域网已信任根证书）运行 HTTPS：

> [!SECURITY] 安全准则（解决 R-001）
> 私钥与证书文件必须存放在项目根目录之外（例如项目父目录 `../ai-fit-coach-tls/`），静态服务器严禁通过 HTTP 直接访问 `.pem` 或 `.key` 文件，打包脚本也会主动拦截任何证书或私钥文件。

1. 在项目父目录下创建安全目录并生成自签名证书文件：
   - **Linux / macOS / Git Bash**：
     ```bash
     mkdir -p ../ai-fit-coach-tls
     openssl req -x509 -newkey rsa:2048 -nodes -sha256 \
       -keyout ../ai-fit-coach-tls/key.pem \
       -out ../ai-fit-coach-tls/cert.pem \
       -days 365 -subj "/CN=localhost"
     ```
   - **Windows PowerShell**：
     ```powershell
     New-Item -ItemType Directory -Force -Path ..\ai-fit-coach-tls
     # 生成后导出至 ..\ai-fit-coach-tls\key.pem 与 cert.pem
     ```
2. 启动 HTTPS 服务（支持环境变量自定义路径）：
   ```bash
   HOST=0.0.0.0 HTTPS=true TLS_KEY_PATH=../ai-fit-coach-tls/key.pem TLS_CERT_PATH=../ai-fit-coach-tls/cert.pem node server.mjs
   ```
3. 手机访问 `https://<电脑局域网IP>:4173`（首次访问需在手机上手动确认“继续前往不安全网站”）。

---

## 移动端常见问题与排错

| 现象 | 原因 | 解决方法 |
| :--- | :--- | :--- |
| 点击启动摄像头提示“移动设备在非安全上下文下禁用摄像头” | 手机直接通过局域网 HTTP IP 访问 | 采用方案一（本地视频）或方案二（Chrome Flag） |
| 后置摄像头画面上下颠倒或镜像 | 默认前置镜头开启了 CSS 水平镜像翻转 | 在动作设置中切换“后置”摄像头，系统将自动取消镜像 |
| 手机运行明显发热或掉帧（$<15\text{ FPS}$） | 手机省电模式限制了 CPU/WASM 性能 | 关闭手机省电模式；关闭其他后台 App；使用 Lite 模型 |

