/**
 * Ollama CLI wrapper: discovery, model listing, pull (streamed
 * progress), and importing downloaded GGUF files via `ollama create`.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { IS_WINDOWS } from './util.ts'

export interface OllamaModel {
  name: string
  size: number
  digest?: string
  modifiedAt?: string
}

/** Locate the ollama executable: explicit env, PATH, then common install paths. */
export function resolveOllamaBin(override?: string): string {
  if (override && existsSync(override)) return override
  if (existsSync('ollama')) return 'ollama'
  const candidates: string[] = []
  if (IS_WINDOWS) {
    candidates.push(
      join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Programs', 'Ollama', 'ollama.exe'),
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Ollama', 'ollama.exe'),
    )
  } else {
    candidates.push('/usr/local/bin/ollama', '/opt/homebrew/bin/ollama')
  }
  const found = candidates.find((p) => existsSync(p))
  if (found) return found
  return IS_WINDOWS ? 'ollama.exe' : 'ollama'
}

function run(bin: string, args: string[], timeoutMs = 30_000): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true })
    let out = ''
    let err = ''
    const timer = setTimeout(() => { child.kill(); resolve({ code: -1, out, err: err + '\n[timeout]' }) }, timeoutMs)
    child.stdout?.on('data', (d) => { out += d.toString() })
    child.stderr?.on('data', (d) => { err += d.toString() })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }) })
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out, err: err + '\n' + e.message }) })
  })
}

export async function ollamaVersion(bin: string): Promise<string> {
  const r = await run(bin, ['--version'], 10_000)
  const m = (r.out + r.err).match(/ollama version is\s+(\S+)/i)
  return m?.[1] ?? (r.code === 0 ? 'unknown' : '')
}

export async function ollamaList(bin: string): Promise<OllamaModel[]> {
  const r = await run(bin, ['list'], 15_000)
  if (r.code !== 0) throw new Error((r.err || r.out || 'ollama list failed').trim())
  // Newer ollama supports `list --format json`; this build (0.34) does not,
  // so parse the human table. JSON is recognised heuristically when present.
  if (r.out.trimStart().startsWith('[')) {
    try {
      const arr = JSON.parse(r.out) as Array<{ name?: string; size?: number; digest?: string; modified_at?: string }>
      return arr
        .filter((m) => typeof m.name === 'string')
        .map((m) => ({ name: m.name!, size: m.size ?? 0, digest: m.digest, modifiedAt: m.modified_at }))
    } catch {
      // fall through to table parsing
    }
  }
  return r.out.split(/\r?\n/).slice(1).map((line) => {
    const parts = line.trim().split(/\s{2,}/).map((p) => p.trim()).filter(Boolean)
    const name = parts[0] ?? ''
    const sizeCell = parts.find((p) => /^[\d.]+\s*(B|KB|MB|GB|TB|KiB|MiB|GiB|TiB)$/i.test(p))
    return { name, size: sizeCell ? parseSize(sizeCell) : 0 }
  }).filter((m) => m.name.length > 0 && m.name !== 'NAME')
}

function parseSize(cell: string): number {
  const m = cell.match(/^([\d.]+)\s*(B|KB|MB|GB|TB|KiB|MiB|GiB|TiB)$/i)
  if (!m) return 0
  const units: Record<string, number> = {
    b: 1, kb: 1024, kib: 1024, mb: 1024 ** 2, mib: 1024 ** 2,
    gb: 1024 ** 3, gib: 1024 ** 3, tb: 1024 ** 4, tib: 1024 ** 4,
  }
  return Math.round(Number(m[1]) * (units[m[2].toLowerCase()] ?? 1))
}

export interface PullHandle {
  child: ChildProcess
  cancel: () => void
}

/**
 * Stream `ollama pull`; progress is parsed from carriage-return lines
 * like "pulling 4321... 12% ▕▏".
 */
export function ollamaPull(
  bin: string,
  model: string,
  onUpdate: (pct: number, line: string) => void,
): PullHandle {
  const child = spawn(bin, ['pull', model], { windowsHide: true })
  let buffer = ''
  const handleChunk = (chunk: Buffer): void => {
    buffer += chunk.toString()
    const parts = buffer.split(/[\r\n]/)
    buffer = parts.pop() ?? ''
    let maxPct = -1
    for (const raw of parts) {
      const line = raw.trim()
      if (!line) continue
      const m = line.match(/(\d{1,3})%/)
      if (m) maxPct = Math.max(maxPct, Number(m[1]))
    }
    if (maxPct >= 0) onUpdate(maxPct, buffer.trim())
  }
  child.stdout?.on('data', handleChunk)
  child.stderr?.on('data', handleChunk)
  return { child, cancel: () => child.kill() }
}

/**
 * Import a downloaded GGUF into Ollama. `fromPath` is the (first) blob;
 * split siblings next to it are picked up automatically by ollama.
 */
export async function ollamaCreateFromGguf(
  bin: string,
  name: string,
  fromPath: string,
  modelfilePath: string,
): Promise<{ code: number | null; out: string; err: string }> {
  return await run(bin, ['create', name, '-f', modelfilePath], 10 * 60_000)
}

/**
 * Read the runtime `num_ctx` ollama actually serves for a model.
 * `ollama show <model>` prints a "Parameters" block; `num_ctx` is
 * present when the Modelfile pins it. When absent, ollama falls back
 * to its built-in default (4096 as of 0.34). The returned value is
 * what `n_ctx` will be in serve logs — must match the patch's
 * contextWindow or Harness sends prompts ollama rejects.
 */
export async function ollamaContextWindow(bin: string, model: string): Promise<number> {
  const r = await run(bin, ['show', model], 15_000)
  if (r.code !== 0) return 4096
  const m = r.out.match(/num_ctx\s+(\d+)/)
  return m ? Number(m[1]) : 4096
}
