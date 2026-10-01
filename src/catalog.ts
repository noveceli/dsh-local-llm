/**
 * Curated quick-pick catalog for `ollama pull`, sized for an
 * 8 GB laptop GPU. Users can also paste any ollama or
 * ModelScope repo id; this is just a starter shelf.
 */
export interface CatalogEntry {
  model: string
  label: string
  size: string
  note: string
  tags: string[]
}

export const CATALOG: CatalogEntry[] = [
  { model: 'qwen3:0.6b', label: 'Qwen3 0.6B', size: '~0.7 GB', note: '超轻量，2B 都跑不动时的保底', tags: ['qwen', '小模型'] },
  { model: 'qwen3:4b', label: 'Qwen3 4B Q4', size: '~2.5 GB', note: '中文强，8GB 显存舒适', tags: ['qwen', '推荐'] },
  { model: 'qwen2.5:3b', label: 'Qwen2.5 3B', size: '~1.9 GB', note: '稳定好用的上一代', tags: ['qwen'] },
  { model: 'minicpm-v:8b', label: 'MiniCPM-V 视觉版', size: '~5.5 GB', note: '多模态，看图问答', tags: ['minicpm', '视觉'] },
  { model: 'llama3.2:3b', label: 'Llama 3.2 3B', size: '~2.0 GB', note: '英文/代码，Meta 出品', tags: ['llama'] },
  { model: 'deepseek-r1:1.5b', label: 'DeepSeek-R1 1.5B', size: '~1.1 GB', note: '推理小模型', tags: ['deepseek', '推理'] },
  { model: 'deepseek-r1:7b', label: 'DeepSeek-R1 7B Q4', size: '~4.7 GB', note: '推理更强，紧巴巴可跑', tags: ['deepseek', '推理'] },
  { model: 'bge-m3', label: 'bge-m3 嵌入模型', size: '~1.2 GB', note: '本地知识库/向量检索', tags: ['embedding'] },
]
