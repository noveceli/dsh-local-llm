/**
 * dsh-local-llm — host half.
 *
 * Registers the /dsh-local-llm/api/* HTTP routes that the
 * settings page (browser half) drives. All state lives in the
 * profile directory; no model traffic goes through here.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { dshHome, defaultDownloadDir } from './util.ts'
import { mountRoutes, type RuntimeSettings } from './routes.ts'

export const name = 'local-llm'
export const inject = ['webServer']

export interface Config {
  profile: string
  downloadDir: string
  ollamaBin: string
}

export const Config = z.object({
  profile: z.string().default('web'),
  downloadDir: z.string().default(''),
  ollamaBin: z.string().default(''),
})

interface PersistedState {
  downloadDir?: string
  ollamaBin?: string
}

function stateFile(profile: string): string {
  return join(dshHome(), 'profiles', profile, '.dsh-local-llm', 'state.json')
}

async function loadState(profile: string): Promise<PersistedState> {
  try {
    return JSON.parse(await readFile(stateFile(profile), 'utf8')) as PersistedState
  } catch {
    return {}
  }
}

export function apply(ctx: any, config: Config): void {
  const settings: RuntimeSettings = {
    profile: config.profile ?? 'web',
    downloadDir: config.downloadDir || defaultDownloadDir(),
    ollamaBinOverride: config.ollamaBin || undefined,
  }

  let dispose: (() => void) | undefined

  ctx.effect(async () => {
    const persisted = await loadState(settings.profile)
    if (!settings.downloadDir && persisted.downloadDir) settings.downloadDir = persisted.downloadDir
    if (persisted.ollamaBin && !settings.ollamaBinOverride) settings.ollamaBinOverride = persisted.ollamaBin
    settings.persist = async () => {
      const dir = join(dshHome(), 'profiles', settings.profile, '.dsh-local-llm')
      await mkdir(dir, { recursive: true })
      const state: PersistedState = { downloadDir: settings.downloadDir, ollamaBin: settings.ollamaBinOverride }
      await writeFile(stateFile(settings.profile), JSON.stringify(state, null, 2), 'utf8')
    }
    dispose = mountRoutes(ctx.webServer, ctx.logger, settings)
    return () => dispose?.()
  }, 'local-llm: routes')
}
