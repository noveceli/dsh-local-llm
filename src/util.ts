/**
 * Shared helpers: paths, HTTP JSON, sizes.
 */
import { homedir, platform as osPlatform } from 'node:os'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

export const IS_WINDOWS = osPlatform() === 'win32'

/** Resolve the DSH home directory (profiles live under it). */
export function dshHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** Profile patch file (cordis.patch.yml). */
export function profilePatchPath(profile: string): string {
  return join(dshHome(), 'profiles', profile, 'cordis.patch.yml')
}

/** Default model download directory. */
export function defaultDownloadDir(): string {
  return join('d:', 'ai', '1', 'models')
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export async function readJson(url: string, signal?: AbortSignal): Promise<any> {
  const res = await fetch(url, { signal, headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function sendJson(response: any, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

export function readBody(request: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (c: Buffer) => chunks.push(c))
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) return resolve({})
      try { resolve(JSON.parse(text)) } catch (e) { reject(e) }
    })
    request.on('error', reject)
  })
}
