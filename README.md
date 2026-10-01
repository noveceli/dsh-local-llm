# dsh-local-llm

DeepSeek Harness 本地模型控制中心插件。在设置页一处管理全部本地能力：
Ollama 部署、魔搭 ModelScope GGUF 下载、模型切换、下载目录、免 Key 搜索/定时任务开关。

## 功能

- **本地模型列表**：查看 Ollama 已装模型，一键设为默认
- **魔搭下载**：填仓库 ID 列出 GGUF，勾选下载并自动 `ollama create` 导入
- **ollama pull**：内置 8 款适配 8GB 显存的精选模型，一键拉取
- **模型声明同步**：设为默认时自动把模型加入 `llm-pi-ai` 的 ollama provider 列表，
  `contextWindow` 读取 Ollama 实际 `num_ctx`，避免 "exceeds the available context size" 400 错误
- **下载目录**：可配置，持久化到 profile
- **搜索切换**：免 Key Bing(360+Bing) ↔ DeepSeek 云端搜索
- **定时任务**：schedule 插件开关

## 构建

```bash
npm install
npm run build      # tsdown，产物在 lib/
npm pack           # 生成 dsh-local-llm-<version>.tgz
```

## 安装方式

### 方式一：本地 tgz 直接安装

```bash
dsh plugin --profile web add ./dsh-local-llm-0.1.2.tgz
```

然后把 `dsh-local-llm` 加进 profile 的 `package.json` → `dsh.profile.bundles` 数组，重启 Harness。

### 方式二：从 Git 仓库安装

```bash
dsh plugin --profile web add github:<owner>/dsh-local-llm
```

### 方式三：从 npm 安装（发布后）

```bash
dsh plugin --profile web add dsh-local-llm
```

### 方式四：从插件市场

把 `catalog/plugins.json` 托管到任意 HTTPS（如 GitHub Pages / Gitee Pages / 仓库 raw 链接），
启动 Harness 前设置环境变量：

```bash
set DSHM_REGISTRY_URL=https://<your-host>/plugins.json
```

打开 dshmarket 即可搜到本插件并安装。

## 发布到插件市场

1. **发布到 npm**：`npm publish`（需先 `npm login`，包名全局唯一，可能需要改 scope）
2. **提交到官方 catalog**：向
   [awesome-dsh-plugin](https://github.com/...) 仓库提交 PR，把插件加入 `plugins.json`。
   通过后所有 dshmarket 用户都能搜到。

catalog 条目格式参考 `catalog/plugins.json`。

## 包结构

```
dsh-local-llm/
├── src/                    # 源码
│   ├── index.ts            # host 入口（Cordis apply）
│   ├── routes.ts           # /dsh-local-llm/api/* HTTP 路由
│   ├── ollama.ts           # ollama CLI 封装
│   ├── modelscope.ts       # 魔搭 HTTPS 下载（断点续传）
│   ├── patch.ts            # cordis.patch.yml 块级安全改写
│   ├── jobs.ts             # 下载任务注册表
│   ├── catalog.ts          # 精选模型列表
│   ├── util.ts             # 工具函数
│   └── client/             # 设置页 UI
│       ├── index.tsx
│       └── locales.ts
├── lib/                    # 构建产物（index.js host + client.js）
├── cordis.patch.yml        # bundle patch
├── tsdown.config.ts        # 复刻官方 closure-factory 构建
└── package.json
```

## 配置

| 字段 | 默认 | 说明 |
|------|------|------|
| profile | web | 目标 profile 名 |
| downloadDir | d:\ai\1\models | GGUF 下载目录 |
| ollamaBin | 自动探测 | ollama 可执行文件路径 |
