# 背过 - 华为应用市场上架材料清单

最后更新：2026-06-19

## 1. 当前项目关键信息

- 应用名称：`背过`
- Android 包名：`com.reciteflow.app`
- Expo slug：`reciteflow`
- 网页主页：`https://reciteflow-ios.vercel.app`
- 隐私政策：`https://reciteflow-ios.vercel.app/privacy.html`
- 服务条款：`https://reciteflow-ios.vercel.app/terms.html`
- 当前建议分类：`教育`
- 当前建议定价：`免费`

## 2. 官方入口

- AppGallery 总入口：https://developer.huawei.com/consumer/en/appgallery/
- AppGallery Connect：https://developer.huawei.com/consumer/en/service/josp/agc/index.html
- 开发者注册与认证说明：
  https://developer.huawei.com/consumer/en/doc/app/agc-help-getstarted-0000001100316670

## 3. 你需要准备的材料

### 必备账号与后台

- 华为开发者账号
- 开发者实名认证/主体认证
- 在 AppGallery Connect 中创建应用

### 必备安装包

优先建议：

1. 测试安装包：`APK`
2. 正式提审安装包：`AAB`

本项目对应命令：

```powershell
npm run android:apk
npm run android:aab
```

官方说明 AppGallery 支持 APK/AAB；若上传 AAB，通常需要启用 App Signing：

- APK 发布说明：
  https://developer.huawei.com/consumer/en/doc/app/agc-help-releaseapkrpk-0000001106463276
- AAB 发布说明：
  https://developer.huawei.com/consumer/en/doc/app/agc-help-releasebundle-0000001100316672
- App Signing：
  https://developer.huawei.com/consumer/en/doc/AppGallery-connect-Guides/agc-appsigning-introduction-0000001051379577

### 必备公开链接

- 应用官网/介绍页：
  `https://reciteflow-ios.vercel.app`
- 隐私政策 URL：
  `https://reciteflow-ios.vercel.app/privacy.html`
- 服务条款 URL：
  `https://reciteflow-ios.vercel.app/terms.html`

华为审核要求隐私政策必须可公开访问，且信息清晰透明：

- 隐私要求：
  https://developer.huawei.com/consumer/en/doc/app/50104-07
- 隐私声明配置：
  https://developer.huawei.com/consumer/en/doc/app/agc-help-release-app-privacy-state-0000002278878296

### 必备视觉素材

按当前官方资料，审核层面至少需要 3 张不同截图；资产规格页当前建议准备 5 到 8 张截图，并符合尺寸要求。

- 审核指南（至少 3 张截图）：
  https://developer.huawei.com/consumer/en/doc/app/50104-01
- 视觉素材规格：
  https://developer.huawei.com/consumer/en/doc/app/agc-help-app-material-requirement-0000001146534651

建议你准备：

- 应用图标 1 张
- 手机截图 5 张
- 可选宣传图 1 套

建议截图内容：

1. 首页材料总览
2. 单份材料日程页
3. 每日背诵卡片页
4. 导入材料页
5. 提醒时间设置页

## 4. 后台填写建议

### 基本信息

- 应用名称：`背过`
- 默认语言：`简体中文`
- 分类：`教育`
- 子分类：优先选 `学习工具 / 备考 / 教育` 中最贴近项
- 定价：`免费`
- 支持地区：先从你计划覆盖的地区开始，若主要面向中文用户，可先聚焦中国大陆

### 一句话简介

可直接填写：

`按遗忘曲线安排背诵与复习的学习工具，支持多材料分组、每日打卡与提醒。`

### 详细介绍

可直接填写：

`背过是一款面向知识记忆场景的学习工具。用户可以导入或粘贴 Markdown/TXT 学习材料，按小节生成独立的背诵计划，并依据遗忘曲线安排每日学习与复习。`

`应用支持多份材料分开管理，适用于古诗词、政治考试、演讲稿、专业课知识点等多种背诵场景。每份材料都有自己的打卡日程、章节索引和复习节奏。`

`应用还支持每日提醒、记忆卡片问答、再来一组巩固练习，以及本地保存提醒时间与学习进度。`

### 关键词建议

如果后台有关键词或标签字段，可优先考虑：

- 背诵
- 记忆
- 复习
- 学习计划
- 遗忘曲线
- 考研
- 考试
- 古诗词

## 5. 审核与隐私说明建议

### 权限/功能说明

如果后台要求解释权限用途，可按下面填写：

- 通知权限：
  用于在用户开启提醒后，按设定时间发送学习提醒。
- 文件选择：
  用于用户主动导入 Markdown/TXT 学习材料。
- 本地存储：
  用于保存学习计划、提醒时间和本地学习进度。

### 数据处理说明

当前项目最稳妥的表述：

- 用户导入或粘贴的学习材料主要用于生成本地学习计划与记忆卡片
- 提醒时间与学习进度会保存在本地设备或浏览器中
- 当前版本不提供社交、支付、定位、通讯录等功能

### 隐私标签建议

华为当前要求在发版时配置隐私标签：

- 官方说明：
  https://developer.huawei.com/consumer/en/doc/app/privacy-label

建议你在填写时按真实功能谨慎选择，重点核对：

- 是否收集用户输入的学习文本
- 是否仅做本地处理
- 是否上传到第三方模型或服务端
- 是否收集设备标识或行为分析数据

如果你后续接入了云端 AI、统计分析、账号系统或日志服务，这一部分必须同步更新。

## 6. 资质与合规提醒

对教育类工具本身，通常不需要额外行业许可证；但如果未来涉及特定受监管内容、收费课程、出版内容或中国大陆备案要求，需要补充材料。

官方资质说明：

- 资质/证照要求：
  https://developer.huawei.com/consumer/en/doc/app/80301

## 7. 提审前自查

在提交前，建议逐项确认：

- 安装包名称、图标、截图、介绍内容一致
- 应用能正常安装、启动、使用
- 首页能正常进入材料列表、学习页、提醒设置页
- 提醒功能可开启/关闭/新增/删除
- 导入 Markdown/TXT 正常
- 隐私政策链接能打开
- 服务条款链接能打开
- 包名与 AppGallery Connect 创建应用时填写的包名完全一致

包名一致性是官方要求之一：

- 参考：
  https://developer.huawei.com/consumer/en/doc/app/FAQ-faq-05

## 8. 你还需要补的真实商业信息

在正式提审前，请把下面这些内容补成真实值：

- 官方支持邮箱
- 运营主体名称
- 著作权人名称
- 适用地区/法域
- 如有公司官网，补官网地址

## 9. 最推荐的提审顺序

1. 先跑 `npm run android:apk`
2. 在华为真机上完整测试
3. 再跑 `npm run android:aab`
4. 登录 AppGallery Connect 创建应用
5. 先填基础信息、隐私政策、截图
6. 上传 AAB
7. 配置隐私标签
8. 提交审核
