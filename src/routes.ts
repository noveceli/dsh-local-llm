/**
 * HTTP API bridging the settings page to the host.
 * All routes live under /dsh-local-llm/api/* (same-origin, the
 * web server's loopback trust covers auth).
 */
import { stat, writeFile, statfs, mkdir } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { sendJson, readBody, ensureDir } from './util.ts'
import {
  resolveOllamaBin, ollamaVersion, ollamaList, ollamaPull, ollamaCreateFromGguf, ollamaContextWindow,
} from './ollama.ts'
import { listFiles, downloadFile, normalizeRepo } from './modelscope.ts'
import { activeJob, startJob, finishJob, listJobs, type Job } from './jobs.ts'
import { CATALOG } from './catalog.ts'
import { readPatchState, setDefaultModel, setSearchProvider, setSchedule, declareOllamaModel } from './patch.ts'

export interface RuntimeSettings {
  profile: string
  downloadDir: string
  ollamaBinOverride?: string
  persist?: () => Promise<void>
}

interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (request: any, response: any) => void
}

interface WebServerLike { register(route: WebRoute): () => void }
interface LoggerLike { info?: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void; error?: (...a: unknown[]) => void }

const PREFIX = '/dsh-local-llm/api'
const OLLAMA_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
// Runtime context pinned for every imported model so the patch's
// contextWindow declaration and ollama's actual n_ctx agree.
// (Without PARAMETER num_ctx, ollama defaults to 4096 and 32k-declared
// prompts are rejected with "exceeds the available context size".)
const CONTEXT_WINDOW = 32768
const MAX_TOKENS = 8192

function sanitizeModelName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[._-]+/, '')
}

export function mountRoutes(webServer: WebServerLike, logger: LoggerLike | undefined, settings: RuntimeSettings): () => void {
  const ollamaBin = (): string => resolveOllamaBin(settings.ollamaBinOverride)
  const disposers: Array<() => void> = []
  const on = (path: string, handler: (req: any, res: any) => unknown | Promise<unknown>): void => {
    const dispose = webServer.register({
      kind: 'exact',
      path: `${PREFIX}${path}`,
      handler: (request, response) => {
        Promise.resolve(handler(request, response)).catch((error: unknown) => {
          logger?.error?.(`[local-llm] ${path}`, error)
          if (!response.headersSent) sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        })
      },
    })
    disposers.push(() => { if (typeof dispose === 'function') dispose() })
  }

  /* ---------- status ---------- */
  on('/status', async (_req, res) => {
    const bin = ollamaBin()
    const version = await ollamaVersion(bin).catch(() => '')
    let models: unknown[] = []
    if (version) {
      try { models = await ollamaList(bin) } catch (error) { logger?.warn?.('[local-llm] list failed', error) }
    }
    const patch = await readPatchState(settings.profile).catch(() => ({ scheduleEnabled: false }))
    let disk: { path: string; free: number; total: number }
    try {
      let fsStat = await statfs(settings.downloadDir).catch(() => null)
      if (!fsStat) { await mkdir(settings.downloadDir, { recursive: true }); fsStat = await statfs(settings.downloadDir) }
      disk = { path: settings.downloadDir, free: fsStat.bavail * fsStat.bsize, total: fsStat.blocks * fsStat.bsize }
    } catch {
      disk = { path: settings.downloadDir, free: 0, total: 0 }
    }
    sendJson(res, 200, {
      ollama: { bin, version, models },
      disk,
      patch,
      activeJob: activeJob() ? publicJob(activeJob()!) : null,
    })
  })

  /* ---------- catalog ---------- */
  on('/catalog', (_req, res) => sendJson(res, 200, { catalog: CATALOG }))

  /* ---------- modelscope file list ---------- */
  on('/modelscope/list', async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const repo = url.searchParams.get('repo') ?? ''
    try {
      const files = await listFiles(repo)
      const gguf = files.filter((f) => /\.gguf$/i.test(f.path))
      sendJson(res, 200, { repo: normalizeRepo(repo), files, gguf })
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  /* ---------- jobs ---------- */
  on('/jobs', (_req, res) => sendJson(res, 200, { jobs: listJobs().map(publicJob) }))
  on('/jobs/cancel', async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
    const body = await readBody(req)
    const job = activeJob()
    if (!job || job.id !== body.id) { sendJson(res, 409, { error: '没有进行中的任务' }); return }
    job.cancel?.()
    sendJson(res, 200, { ok: true })
  })

  /* ---------- ollama pull ---------- */
  on('/download/pull', async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
    if (activeJob()) { sendJson(res, 409, { error: '已有下载任务进行中' }); return }
    const { model } = await readBody(req)
    if (typeof model !== 'string' || !model.trim()) { sendJson(res, 400, { error: '缺少 model' }); return }
    const job = startJob('ollama-pull', `ollama pull ${model}`)
    sendJson(res, 202, { job: publicJob(job) })
    try {
      await new Promise<void>((resolve, reject) => {
        const handle = ollamaPull(ollamaBin(), model, (pct, line) => {
          job.pct = pct
          job.detail = line
        })
        let stderr = ''
        handle.child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); job.detail = stderr.split(/[\r\n]/).filter(Boolean).pop() ?? job.detail })
        handle.child.on('close', (code) => {
          if (code === 0) { resolve(); return }
          // Killed by cancel: signal kills with non-zero code.
          if (job.status === 'running' && cancelRequested.has(job.id)) resolve()
          else reject(new Error((stderr || `ollama pull 退出码 ${code ?? '?'}`).trim()))
        })
        handle.child.on('error', reject)
        job.cancel = () => { cancelRequested.add(job.id); handle.cancel() }
      })
      if (cancelRequested.has(job.id)) { cancelRequested.delete(job.id); finishJob(job, 'canceled') }
      else finishJob(job, 'done', { pct: 100, modelName: model, detail: '拉取完成' })
    } catch (error) {
      finishJob(job, 'error', { error: error instanceof Error ? error.message : String(error) })
    }
  })

  /* ---------- modelscope GGUF download + import ---------- */
  on('/download/gguf', async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
    if (activeJob()) { sendJson(res, 409, { error: '已有下载任务进行中' }); return }
    const body = await readBody(req)
    const repo = typeof body.repo === 'string' ? body.repo : ''
    const wanted: string[] = Array.isArray(body.files) ? body.files.filter((f: unknown) => f === String(f)) : []
    const name = sanitizeModelName(typeof body.name === 'string' && body.name ? body.name : repo.split('/').pop() ?? '')
    if (!repo || wanted.length === 0 || !OLLAMA_NAME_RE.test(name)) {
      sendJson(res, 400, { error: '参数不完整（repo / files / 非法模型名）' })
      return
    }
    let targets
    try {
      const all = await listFiles(repo)
      targets = all.filter((f) => wanted.includes(f.path))
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      return
    }
    if (targets.length === 0) { sendJson(res, 400, { error: '仓库里找不到所选文件' }); return }
    sendJson(res, 202, { ok: true, name })
    const destDir = join(settings.downloadDir, ...normalizeRepo(repo).split('/'))
    const job = startJob('modelscope-gguf', `${repo} → ${name}`)
    const controller = new AbortController()
    job.cancel = () => controller.abort()
    try {
      const totalSize = targets.reduce((sum, f) => sum + f.size, 0)
      let doneBytes = 0
      for (const file of targets) {
        const base = totalSize > 0 ? doneBytes / totalSize * 100 : 0
        await downloadFile(file, destDir, (innerPct, detail) => {
          const fileBase = totalSize > 0 ? (file.size / totalSize) * innerPct : 0
          job.pct = Math.min(99, Math.round(base + fileBase))
          job.detail = detail
        }, controller.signal)
        doneBytes += file.size
      }
      // Build a Modelfile pointing at the first blob; ollama picks
      // up split siblings in the same directory automatically.
      // PARAMETER num_ctx is critical: without it ollama serves the
      // model at its 4096-token default, while our patch declares
      // contextWindow 32768 — Harness then sends oversized prompts
      // and ollama returns 400 "exceeds the available context size".
      const first = targets.slice().sort((a, b) => a.path.localeCompare(b.path))[0]
      const modelfile = join(destDir, 'Modelfile')
      const modelfileBody =
        `FROM ./${basename(first.path)}\n` +
        `PARAMETER num_ctx ${CONTEXT_WINDOW}\n` +
        `PARAMETER num_predict ${MAX_TOKENS}\n`
      await writeFile(modelfile, modelfileBody, 'utf8')
      job.detail = `导入 Ollama (${name})…`
      const created = await ollamaCreateFromGguf(ollamaBin(), name, first.path, modelfile)
      if (created.code !== 0) throw new Error((created.err || created.out || 'ollama create 失败').trim())
      // Register the model in llm-pi-ai's provider list with the same
      // context window we pinned in the Modelfile, so Harness never
      // sends a prompt larger than ollama will accept.
      await declareOllamaModel(settings.profile, name, { contextWindow: CONTEXT_WINDOW, maxTokens: MAX_TOKENS })
      finishJob(job, 'done', { pct: 100, modelName: name, detail: '已下载并导入 Ollama' })
    } catch (error) {
      const canceled = error instanceof Error && /canceled|aborted/i.test(error.message)
      finishJob(job, canceled ? 'canceled' : 'error', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  /* ---------- switch default model ---------- */
  on('/model', async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
    const { model } = await readBody(req)
    if (typeof model !== 'string' || !model.trim()) { sendJson(res, 400, { error: '缺少 model' }); return }
    const trimmed = model.trim()
    // Detect the actual ollama context window so the declaration
    // matches what ollama really serves (prevents 400 context errors).
    const contextWindow = await ollamaContextWindow(ollamaBin(), trimmed).catch(() => CONTEXT_WINDOW)
    await setDefaultModel(settings.profile, trimmed, { contextWindow, maxTokens: MAX_TOKENS })
    sendJson(res, 200, { ok: true, contextWindow })
  })

  /* ---------- download directory ---------- */
  on('/dir', async (req, res) => {
    if (req.method === 'GET') { sendJson(res, 200, { downloadDir: settings.downloadDir }); return }
    const { dir } = await readBody(req)
    if (typeof dir !== 'string' || !/^[a-zA-Z]:[\\/]/.test(dir.trim()) && !dir.trim().startsWith('/')) {
      sendJson(res, 400, { error: '请给一个绝对路径' })
      return
    }
    const target = dir.trim()
    await ensureDir(target)
    await stat(target)
    settings.downloadDir = target
    await settings.persist?.()
    sendJson(res, 200, { ok: true, downloadDir: target })
  })

  /* ---------- toggles: search / schedule ---------- */
  on('/toggle', async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
    const { key, value } = await readBody(req)
    if (key === 'search') {
      if (value !== 'bing' && value !== 'deepseek-official') { sendJson(res, 400, { error: 'value 只能是 bing / deepseek-official' }); return }
      await setSearchProvider(settings.profile, value)
    } else if (key === 'schedule') {
      await setSchedule(settings.profile, Boolean(value))
    } else {
      sendJson(res, 400, { error: '未知开关' })
      return
    }
    sendJson(res, 200, { ok: true })
  })

  logger?.info?.(`[local-llm] ${disposers.length} routes mounted under ${PREFIX}`)
  return () => disposers.forEach((d) => d())
}

const cancelRequested = new Set<string>()

function publicJob(job: Job): Record<string, unknown> {
  return {
    id: job.id, kind: job.kind, label: job.label, status: job.status, pct: job.pct,
    detail: job.detail, startedAt: job.startedAt, finishedAt: job.finishedAt, error: job.error, modelName: job.modelName,
  }
}
