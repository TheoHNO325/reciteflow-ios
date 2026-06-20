# AI 代理部署

## 作用

前端不再直接持有 DeepSeek key，而是请求你自己的后端接口。

## 当前接法

- 前端环境变量：`EXPO_PUBLIC_QUESTION_API_URL`
- 后端私密环境变量：`DEEPSEEK_API_KEY`
- 后端接口文件：`api/generate-questions.js`

## 部署到 Vercel

1. 把仓库导入 Vercel
2. 在项目环境变量中添加：

```text
DEEPSEEK_API_KEY=你的 DeepSeek key
```

3. 部署完成后，你会得到：

```text
https://你的域名/api/generate-questions
```

4. 前端构建时配置：

```text
EXPO_PUBLIC_QUESTION_API_URL=https://你的域名/api/generate-questions
```

## 结果

- key 只保存在 Vercel
- 网页和 APK 都不会内置真实 key
- 若未配置 `EXPO_PUBLIC_QUESTION_API_URL`，前端会回退到本地问题生成
