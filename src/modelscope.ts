/**
 * ModelScope (魔搭) integration: list GGUF files of a model repo
 * and download them over plain HTTPS resolve URLs. No Python SDK needed.
 */
import { createWriteStream } from 'node:fs'
import { mkdir, rename, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { ensureDir, readJson } from './util.ts'

const API = 'https://www.modelscope.cn/api/v1/models'
const RESOLVE = 'https://www.modelscope.cn/models'

export interface MsFile {
  path: string
  size: number
  url: string
}

/** Validate/normalize a repo id ("owner/name"). */
export function normalizeRepo(repo: string): string {
  const trimmed = repo.trim().replace(/^https?:\/\/www\.modelscope\.cn\/(models|api\/v1\/models)\//, '').replace(/[\\/]+$/, '')
  if (!/^[\w.-]+\/[\w.-]+$/.test(trimmed)) {
    throw new Error('魔搭仓库 ID 格式应为 owner/name，例如 Qwen/Qwen3-0.6B-GGUF')
  }
  return trimmed
}

export async function listFiles(repo: string): Promise<MsFile[]> {
  const id = normalizeRepo(repo)
  const data = await readJson(`${API}/${id}/repo/files?Revision=master&Recursive=true`)
  const files: Array<{ Path?: string; Size?: number }> = data?.Data?.Files ?? []
  return files
    .filter((f) => typeof f.Path === 'string')
    .map((f) => ({
      path: f.Path as string,
      size: f.Size ?? 0,
      url: `${RESOLVE}/${id}/resolve/master/${(f.Path as string).replace(/^\.\//, '')}`,
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

export async function downloadFile(
  file: MsFile,
  destDir: string,
  onProgress: (pct: number, detail: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  await ensureDir(destDir)
  const dest = join(destDir, basename(file.path))
  const tmp = `${dest}.part`

  // Resume if a .part exists (server may honour Range).
  let start = 0
  try { start = (await stat(tmp)).size } catch { start = 0 }
  const headers: Record<string, string> = {}
  if (start > 0) headers.range = `bytes=${start}-`

  const res = await fetch(file.url, { signal, headers, redirect: 'follow' })
  if (!res.ok && res.status !== 206) throw new Error(`下载失败 HTTP ${res.status}`)
  // A server may ignore Range and answer 200 with the full body:
  // restart the file instead of appending a duplicate prefix.
  if (!(start > 0 && res.status === 206)) start = 0
  const total = Number(res.headers.get('content-length') ?? 0) + start || file.size
  let received = start
  onProgress(start > 0 && total ? Math.round((start / total) * 100) : 0, basename(file.path))

  const stream = createWriteStream(tmp, { flags: start > 0 ? 'a' : 'w' })
  if (!res.body) throw new Error('响应没有正文流')
  Readable.fromWeb(res.body as any).on('data', (chunk: Buffer) => {
    received += chunk.length
    if (total > 0) onProgress(Math.round((received / total) * 100), basename(file.path))
  }).pipe(stream)

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve())
    stream.on('error', reject)
    signal?.addEventListener('abort', () => stream.destroy(new Error('canceled')))
  })
  await rename(tmp, dest)
  return dest
}
