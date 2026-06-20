# 背过

背过是一个跨平台的 AI 助背应用，支持把 Markdown 学习材料拆成按章节组织的记忆卡片，并按多阶段复习节奏安排每日学习与回溯复习。

## 本地启动

```powershell
npm install
npm run web
```

浏览器打开：

```text
http://localhost:8081
```

## 导出 Web 静态站

普通静态导出：

```powershell
npm run web:export
```

GitHub Pages 导出：

```powershell
npm run web:export:gh
powershell -ExecutionPolicy Bypass -File .\scripts\prepare-gh-pages.ps1
```

导出结果在：

```text
dist/
```

## 部署到 GitHub Pages

项目已内置 GitHub Actions 工作流：

- 工作流文件：`.github/workflows/deploy-pages.yml`
- 推送到 `main` 分支后会自动构建并发布
- 默认发布地址会是：

```text
https://<你的 GitHub 用户名>.github.io/reciteflow-ios/
```

### 首次启用步骤

1. 把当前项目推到 GitHub 仓库 `reciteflow-ios`
2. 进入 GitHub 仓库 `Settings -> Pages`
3. 在 `Build and deployment` 中选择 `GitHub Actions`
4. 推送一次 `main` 分支，等待 Actions 跑完

发布后可访问：

- 主站：`https://<用户名>.github.io/reciteflow-ios/`
- 隐私政策：`https://<用户名>.github.io/reciteflow-ios/privacy.html`
- 服务条款：`https://<用户名>.github.io/reciteflow-ios/terms.html`

## Android 构建

测试 APK：

```powershell
npm run android:apk
```

商店 AAB：

```powershell
npm run android:aab
```

## iOS 构建

模拟器包：

```powershell
npm run ios:simulator
```

正式 IPA：

```powershell
npm run ios:ipa
```

提交 TestFlight / App Store：

```powershell
npm run ios:submit
```
