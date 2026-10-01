/** Locale dictionaries owned by this plugin. */
export type LocaleKey =
  | 'title'
  | 'subtitle'
  | 'status'
  | 'refresh'
  | 'localModels'
  | 'noModels'
  | 'setDefault'
  | 'isDefault'
  | 'catalog'
  | 'pull'
  | 'modelscopeTitle'
  | 'modelscopeHint'
  | 'queryFiles'
  | 'importName'
  | 'download'
  | 'job'
  | 'cancel'
  | 'downloadDir'
  | 'save'
  | 'saved'
  | 'toggles'
  | 'searchBing'
  | 'searchDeepseek'
  | 'scheduleOn'
  | 'searchLabel'
  | 'scheduleLabel'
  | 'size'
  | 'currentDefault'
  | 'ollamaUnavailable'
  | 'selectFiles'
  | 'jobRunning'

export const zh: Record<LocaleKey, string> = {
  title: '本地模型中心',
  subtitle: 'Ollama 部署 · 魔搭下载 · 模型切换 · 本地能力开关',
  status: '运行状态',
  refresh: '刷新',
  localModels: '本地已安装模型',
  noModels: '还没有本地模型，从下方下载一个吧',
  setDefault: '设为默认',
  isDefault: '当前默认',
  catalog: '推荐模型（ollama 官方库，一键拉取）',
  pull: '拉取',
  modelscopeTitle: '从魔搭 ModelScope 下载 GGUF',
  modelscopeHint: '填写魔搭仓库 ID，如 Qwen/Qwen3-0.6B-GGUF',
  queryFiles: '查询文件',
  importName: '导入 Ollama 的模型名',
  download: '下载并导入',
  job: '任务进度',
  cancel: '取消任务',
  downloadDir: '模型下载目录',
  save: '保存',
  saved: '已保存',
  toggles: '本地能力开关',
  searchBing: '免 Key 搜索（360+Bing）',
  searchDeepseek: 'DeepSeek 云端搜索（需 Key）',
  scheduleOn: '定时任务（schedule）',
  searchLabel: '搜索引擎',
  scheduleLabel: '定时任务',
  size: '大小',
  currentDefault: '当前默认模型',
  ollamaUnavailable: 'Ollama 未运行或未安装',
  selectFiles: '选择要下载的 GGUF 文件',
  jobRunning: '有任务进行中',
}

export const en: Record<LocaleKey, string> = {
  title: 'Local Models',
  subtitle: 'Ollama · ModelScope GGUF downloads · model switch · local toggles',
  status: 'Status',
  refresh: 'Refresh',
  localModels: 'Installed models',
  noModels: 'No local models yet — download one below',
  setDefault: 'Set default',
  isDefault: 'Default',
  catalog: 'Recommended (ollama registry, one-click pull)',
  pull: 'Pull',
  modelscopeTitle: 'Download GGUF from ModelScope',
  modelscopeHint: 'Repo id, e.g. Qwen/Qwen3-0.6B-GGUF',
  queryFiles: 'List files',
  importName: 'Import name in Ollama',
  download: 'Download & import',
  job: 'Job progress',
  cancel: 'Cancel',
  downloadDir: 'Download folder',
  save: 'Save',
  saved: 'Saved',
  toggles: 'Local capability toggles',
  searchBing: 'Keyless search (360+Bing)',
  searchDeepseek: 'DeepSeek cloud search (API key)',
  scheduleOn: 'Scheduled tasks',
  searchLabel: 'Search provider',
  scheduleLabel: 'Schedule',
  size: 'Size',
  currentDefault: 'Current default model',
  ollamaUnavailable: 'Ollama is not running or installed',
  selectFiles: 'Select GGUF files to download',
  jobRunning: 'A job is running',
}
