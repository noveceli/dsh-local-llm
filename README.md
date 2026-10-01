# dsh-local-llm

> DeepSeek Harness (DSH) 本地模型控制中心插件 —— 在设置页一处管理全部本地能力。

在 DSH 设置页新增「本地模型中心」板块，提供 Ollama 模型管理、魔搭 ModelScope GGUF 下载导入、默认模型切换、下载目录配置、搜索/定时任务开关等功能。所有操作不经过云端，纯本地闭环。

## 功能一览

| 模块 | 说明 |
|------|------|
| **本地模型** | 列出 Ollama 已装模型，磁盘剩余空间，一键设为默认 |
| **精选模型一键拉取** | 内置 8 款适配 8GB 显存的模型（Qwen3 / Llama / DeepSeek-R1 / MiniCPM-V / bge-m3），直接 `ollama pull` |
| **魔搭 GGUF 下载** | 输入仓库 ID（如 `Qwen/Qwen3-0.6B-GGUF`），列出 GGUF 文件，勾选后 HTTPS 直连下载并自动 `ollama create` 导入 |
| **模型声明同步** | 设为默认时，自动把模型加入 `llm-pi-ai` 的 ollama provider 列表，`contextWindow` 读取 Ollama 实际 `num_ctx`，避免 400 context 超限错误 |
| **下载目录** | 可配置绝对路径，持久化到 profile 目录 |
| **搜索切换** | 免 Key Bing(360+Bing) ↔ DeepSeek 云端搜索 |
| **定时任务** | schedule 插件一键开关 |

## 环境要求

- Node.js ≥ 18
- [Ollama](https://ollama.com/) 已安装并启动（`ollama serve` 或桌面版）
- DeepSeek Harness 已安装（`dsh` 命令可用）

## 安装

### 方式一：下载 Release tgz 安装（推荐）

从 [GitHub Releases](https://github.com/noveceli/dsh-local-llm/releases) 下载 `dsh-local-llm-<version>.tgz`，然后：

```bash
dsh plugin --profile web add ./dsh-local-llm-0.1.2.tgz
```

### 方式二：从 Git 仓库安装

```bash
dsh plugin --profile web add github:noveceli/dsh-local-llm
```

> 此方式会自动执行 `prepare` 脚本构建 `lib/`，需要能访问 npm 镜像。

### 方式三：从插件市场

把仓库内的 `catalog/plugins.json` 托管到任意 HTTPS（GitHub Pages / 仓库 raw 链接），启动 Harness 前设置：

```bash
# Windows
set DSHM_REGISTRY_URL=https://<your-host>/plugins.json
# Linux/macOS
export DSHM_REGISTRY_URL=https://<your-host>/plugins.json
```

打开 dshmarket 即可搜到本插件。

---

安装完成后，把 `dsh-local-llm` 加入 profile 的 `bundles` 数组，重启 Harness：

```bash
# 编辑 C:\Users\<你>\.dsh\profiles\web\package.json
# 在 "dsh": { "profile": { "bundles": [...] } } 中加入 "dsh-local-llm"
```

重启后在 DSH 设置页即可看到「本地模型中心」。

## 使用

打开 DSH → 设置 → 本地模型中心。

### 1. 查看本地模型

页面顶部显示 Ollama 版本、已装模型列表、磁盘剩余空间。点击模型右侧「设为默认」即可切换默认模型。

### 2. 拉取精选模型

在「精选模型」卡片中，点击任意模型的「拉取」按钮，后台执行 `ollama pull`，进度条实时显示。

### 3. 从魔搭下载 GGUF 并导入

1. 输入魔搭仓库 ID，例如 `Qwen/Qwen3-0.6B-GGUF`
2. 点击「列出文件」，勾选需要的 `.gguf` 文件
3. 填入模型名（导入到 Ollama 的名字），点击「下载并导入」
4. 下载完成后自动执行 `ollama create`，并把模型注册到 `llm-pi-ai`

支持**断点续传**：中断后重新下载会从 `.part` 文件继续。

### 4. 配置下载目录

在「下载目录」中输入绝对路径，点击保存。配置持久化到 `~/.dsh/profiles/<profile>/.dsh-local-llm/state.json`。

### 5. 搜索 / 定时任务开关

- **搜索提供商**：Bing（免 Key，360+Bing 混合）或 DeepSeek 云端搜索
- **定时任务**：一键启用/禁用 `@deepseek-ai/dsh-schedule` 和 `dsh-time-context`

## 构建

```bash
# 安装依赖
npm install

# 构建 host + client，产物在 lib/
npm run build

# 打包成 tgz
npm pack
```

构建配置见 `tsdown.config.ts`：host 端输出 ESM，client 端输出 CJS closure-factory（带 `__ModuleLoader__.load` banner），复刻 DSH 官方插件构建方式。

## 项目结构

```
dsh-local-llm/
├── src/
│   ├── index.ts              # host 入口：Cordis apply，注册路由，加载持久化状态
│   ├── routes.ts             # HTTP 路由层 /dsh-local-llm/api/*（10 个接口）
│   ├── ollama.ts             # Ollama CLI 封装：探测/列表/pull/create/contextWindow
│   ├── modelscope.ts         # 魔搭 API：列出文件 + HTTPS 断点续传下载
│   ├── patch.ts              # cordis.patch.yml 块级安全改写
│   ├── jobs.ts               # 单活动任务注册表（内存，最多 20 条历史）
│   ├── catalog.ts            # 8 款精选模型目录
│   ├── util.ts               # 路径解析、JSON HTTP、字节格式化
│   └── client/
│       ├── index.tsx         # 设置页 React 组件（内联样式，无 UI-kit 耦合）
│       └── locales.ts        # 中/英文案
├── lib/                      # 构建产物（index.js host + client.js）
├── cordis.patch.yml          # bundle patch：插入 local-llm
├── catalog/plugins.json      # 私有市场 catalog 模板
├── tsdown.config.ts          # 构建配置
├── tsconfig.json             # ES2024 + NodeNext + react-jsx
└── package.json
```

## 架构说明

### 双端架构

DSH 插件分为 **host 端**（Node.js 运行时）和 **client 端**（浏览器设置页），通过同源 HTTP API 通信：

```
┌─────────────────────┐         ┌──────────────────────┐
│  client (React)     │  fetch  │  host (Cordis)        │
│  src/client/*.tsx   │ ──────► │  src/routes.ts        │
│  设置页 UI          │ ◄────── │  /dsh-local-llm/api/* │
└─────────────────────┘  JSON   └──────────┬───────────┘
                                           │ spawn / fetch
                              ┌────────────┼────────────┐
                              ▼            ▼            ▼
                         ollama CLI   modelscope.cn  cordis.patch.yml
```

- **host 端** `src/index.ts`：`inject: ['webServer']`，通过 `webServer.register` 挂载路由。状态持久化到 profile 目录下的 `.dsh-local-llm/state.json`。
- **client 端** `src/client/index.tsx`：纯 React + 内联样式，不依赖特定 UI 库版本，通过 `apply`/`inject` 接入设置页 slot。

### HTTP API

所有路由挂在 `/dsh-local-llm/api/` 下：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/status` | Ollama 状态、模型列表、磁盘、patch 状态、当前任务 |
| GET | `/catalog` | 精选模型列表 |
| GET | `/modelscope/list?repo=` | 列出魔搭仓库文件 |
| GET | `/jobs` | 任务历史 |
| POST | `/jobs/cancel` | 取消当前任务 |
| POST | `/download/pull` | `ollama pull` 精选模型 |
| POST | `/download/gguf` | 下载魔搭 GGUF 并 `ollama create` |
| POST | `/model` | 设为默认模型（同步 contextWindow 声明） |
| GET/POST | `/dir` | 读取/设置下载目录 |
| POST | `/toggle` | 切换搜索提供商 / 定时任务 |

### 关键设计：contextWindow 同步

Ollama 导入 GGUF 时，如果 Modelfile 没有 `PARAMETER num_ctx`，Ollama 默认 `n_ctx=4096`。而 DSH patch 中声明的 `contextWindow: 32768` 会让 Harness 发送超过 4096 token 的 prompt，导致 `400 exceeds the available context size`。

解决方案：
1. 导入 GGUF 时自动生成 Modelfile，写入 `PARAMETER num_ctx 32768` 和 `PARAMETER num_predict 8192`
2. 设为默认模型时，通过 `ollama show <model>` 读取真实 `num_ctx`
3. 把匹配的 `contextWindow` 写入 `llm-pi-ai` 的 provider 声明

### patch 安全改写

`cordis.patch.yml` 是用户拥有的 YAML 文件，直接序列化会破坏注释和格式。`patch.ts` 采用**块级文本操作**：
- 按顶层 `- ` 条目切分，只修改本插件拥有的 `id` 条目
- 保留用户注释、空行、缩进
- 定时任务用标记块 `# >>> dsh-local-llm schedule begin` / `# <<< ... end` 包裹，可安全增删

### 单任务队列

`jobs.ts` 维护内存任务表，同时只允许一个下载/pull 任务运行（`activeJob()` 检查），避免磁盘和网络争抢。任务进度通过 `/jobs` 接口轮询。

## 配置项

在 profile 的 `cordis.patch.yml` 中可配置（可选，都有默认值）：

```yaml
- id: local-llm
  name: dsh-local-llm
  config:
    profile: web                    # 目标 profile 名，默认 web
    downloadDir: D:\ai\1\models     # GGUF 下载目录，默认 d:\ai\1\models
    ollamaBin: C:\...\ollama.exe    # ollama 路径，默认自动探测
```

## License

MIT
