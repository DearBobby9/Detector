# Detector 安装指南 / Installation Guide

## 下载 / Download

### 方式一：从 GitHub Actions 下载最新构建

1. 打开 [Actions 页面](https://github.com/DearBobby9/Detector/actions/workflows/build-mac.yml)
2. 点击最新一次 **绿色 ✅** 的构建记录
3. 页面底部找到 **Artifacts** 区域，点击 **Detector-mac-arm64** 下载 ZIP

> 需要登录 GitHub 账号才能下载 Artifacts

### 方式二：从 Releases 下载正式版本

打开 [Releases 页面](https://github.com/DearBobby9/Detector/releases)，下载最新版本的 `.zip` 文件。

> Releases 不需要登录即可下载

---

## 安装 / Install

### 1. 解压

双击下载的 ZIP 文件解压，得到 `Detector.app`。

### 2. 移动到 Applications

将 `Detector.app` 拖到 `/Applications` 文件夹。

### 3. 解除隔离（重要！）

因为这不是 App Store 应用，macOS 会阻止运行。打开 **终端 (Terminal)**，粘贴以下命令：

```bash
xattr -dr com.apple.quarantine /Applications/Detector.app
```

然后按回车。

### 4. 首次运行

双击 `Detector.app` 打开。首次启动需要授权以下权限（会弹窗提示）：

| 权限 | 用途 | 在哪开启 |
|------|------|---------|
| **Screen Recording** | 截屏分析 | System Settings → Privacy & Security → Screen Recording |
| **Accessibility** | 检测当前窗口信息 | System Settings → Privacy & Security → Accessibility |
| **Automation** | 读取浏览器标签页 | System Settings → Privacy & Security → Automation |

> 💡 打开 app 后进入 **Settings → General**，点击 **"Run All Checks"** 可以一键检查所有权限状态。

### 5. 配置 API

进入 **Settings → Providers**：
- 填入 API Key（OpenAI 或兼容 API）
- 设置 Base URL（如使用自定义服务）
- 点击 **Test Connection** 确认连通

---

## 使用 / Usage

- **快捷键 `Cmd+Shift+.`**：截屏 + AI 分析当前屏幕内容
- **菜单栏图标**：点击打开主界面，查看历史记录、聊天、记忆

---

## 常见问题 / FAQ

**Q: 提示 "Detector.app is damaged and can't be opened"**
A: 没有运行解除隔离命令。打开终端执行：
```bash
xattr -dr com.apple.quarantine /Applications/Detector.app
```

**Q: 提示 "Detector.app cannot be opened because the developer cannot be verified"**
A: 右键点击 app → 选择 **Open** → 弹窗中点击 **Open**。或执行上面的 `xattr` 命令。

**Q: 截屏没反应 / 报错**
A: 检查 Screen Recording 权限是否已授权。如果刚授权，需要重启 app。

**Q: API 报错 "fetch failed"**
A: 进入 Settings → Providers 检查 API Key 和 Base URL，点击 Test Connection 测试。

---

## 系统要求 / Requirements

- macOS 14+ (Sonoma 或更新)
- Apple Silicon (M1/M2/M3/M4)
- 约 300MB 磁盘空间
