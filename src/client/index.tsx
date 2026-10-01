/**
 * Browser half: the "本地模型中心" settings section.
 *
 * Plain React (shell-seeded), inline styles — no UI-kit version
 * coupling. Talks to the host over same-origin /dsh-local-llm/*.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { en, zh, type LocaleKey } from './locales.ts'

type T = (key: LocaleKey) => string

const API = '/dsh-local-llm/api'

interface ModelRow { name: string; size: number; digest?: string }
interface Status {
  ollama: { bin: string; version: string; models: ModelRow[] }
  disk: { path: string; free: number; total: number }
  patch: { defaultModel?: string; defaultProvider?: string; searchProvider?: string; scheduleEnabled: boolean }
  activeJob: JobState | null
}
interface JobState {
  id: string; kind: string; label: string; status: string; pct: number
  detail?: string; error?: string; modelName?: string
}
interface CatalogEntry { model: string; label: string; size: string; note: string; tags: string[] }
interface MsFile { path: string; size: number; url: string }

async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0 24px', fontSize: 13, color: 'var(--dsh-text, #e6e6e6)' },
  card: { border: '1px solid var(--dsh-border, #333)', borderRadius: 10, padding: '12px 14px', background: 'var(--dsh-surface, rgba(255,255,255,0.03))' },
  h: { margin: '0 0 10px', fontSize: 14, fontWeight: 600 },
  sub: { margin: '0 0 12px', opacity: 0.65, fontSize: 12 },
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  btn: { padding: '4px 12px', borderRadius: 7, border: '1px solid var(--dsh-border, #444)', background: 'var(--dsh-button, #2a2a2a)', color: 'inherit', cursor: 'pointer', fontSize: 12 },
  btnPrimary: { padding: '4px 14px', borderRadius: 7, border: 'none', background: '#4f7cff', color: '#fff', cursor: 'pointer', fontSize: 12 },
  input: { flex: 1, minWidth: 200, padding: '5px 9px', borderRadius: 7, border: '1px solid var(--dsh-border,#444)', background: 'transparent', color: 'inherit', fontSize: 12 },
  pill: { fontSize: 11, padding: '1px 8px', borderRadius: 999, border: '1px solid #4f7cff55', color: '#7ea2ff' },
  bar: { height: 8, borderRadius: 99, background: '#333', overflow: 'hidden', flex: 1 },
  barFill: { height: '100%', background: 'linear-gradient(90deg,#4f7cff,#7ea2ff)', transition: 'width .3s' },
  err: { color: '#ff7676', fontSize: 12 },
  ok: { color: '#5fd28a', fontSize: 12 },
  label: { fontSize: 12, opacity: 0.8, minWidth: 88 },
  list: { display: 'flex', flexDirection: 'column', gap: 6 },
  item: { display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' },
  check: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 },
}

function fmtSize(bytes: number): string {
  if (!bytes) return '-'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes; let i = 0
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${u[i]}`
}

/** Ollama prints names with an explicit :latest tag; the config omits it. */
function modelBase(name: string): string {
  return name.replace(/:latest$/, '')
}
function isDefault(name: string, def?: string): boolean {
  return def === name || def === modelBase(name)
}

export interface SectionProps { t: T }

export function Section({ t }: SectionProps): React.ReactElement {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [job, setJob] = useState<JobState | null>(null)
  const [busy, setBusy] = useState(false)

  // ModelScope form
  const [repo, setRepo] = useState('Qwen/Qwen3-0.6B-GGUF')
  const [files, setFiles] = useState<MsFile[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [importName, setImportName] = useState('')
  const [dir, setDir] = useState(status?.disk.path ?? '')
  const [saved, setSaved] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const s = await api('/status') as Status
      setStatus(s)
      setJob(s.activeJob)
      setDir(s.disk.path)
      setError('')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [])

  useEffect(() => {
    void refresh()
    api('/catalog').then((c) => setCatalog(c.catalog ?? [])).catch(() => {})
    const timer = setInterval(() => {
      api('/jobs').then((r) => {
        const running = (r.jobs as JobState[]).find((j) => j.status === 'running')
        setJob(running ?? null)
        if (running) void refresh()
        else if (job?.status === 'running') void refresh()
      }).catch(() => {})
    }, 1500)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const act = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true); setError('')
    try { await fn(); await refresh() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const queryFiles = (): void => { void act(async () => {
    const r = await api(`/modelscope/list?repo=${encodeURIComponent(repo)}`)
    setFiles(r.gguf as MsFile[])
    setPicked(new Set((r.gguf as MsFile[]).map((f) => f.path)))
    setImportName(repo.split('/').pop()!.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-gguf$/, ''))
  }) }

  const toggleFile = (p: string): void => {
    const next = new Set(picked)
    if (next.has(p)) next.delete(p); else next.add(p)
    setPicked(next)
  }

  const searchProvider = status?.patch.searchProvider ?? 'bing'

  return (
    <div style={styles.page}>
      <p style={styles.sub}>{t('subtitle')}</p>
      {error ? <p style={styles.err}>{error}</p> : null}

      {/* 状态 */}
      <section style={styles.card}>
        <div style={styles.row}>
          <h2 style={{ ...styles.h, margin: 0, flex: 1 }}>{t('status')}</h2>
          <button style={styles.btn} onClick={() => void refresh()}>{t('refresh')}</button>
        </div>
        {status ? (
          <div style={{ ...styles.list, marginTop: 8 }}>
            <div style={styles.row}>
              {status.ollama.version
                ? <span className="ok">Ollama v{status.ollama.version}</span>
                : <span style={styles.err}>{t('ollamaUnavailable')}</span>}
              <span style={{ opacity: 0.55, fontSize: 12 }}>{status.ollama.bin}</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {t('currentDefault')}：<b>{status.patch.defaultModel ?? '—'}</b>
              {status.patch.defaultProvider ? ` (${status.patch.defaultProvider})` : ''}
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {status.disk.path} · 剩余 {fmtSize(status.disk.free)} / {fmtSize(status.disk.total)}
            </div>
          </div>
        ) : <span style={{ opacity: 0.5 }}>…</span>}
      </section>

      {/* 已安装模型 */}
      <section style={styles.card}>
        <h2 style={styles.h}>{t('localModels')}</h2>
        <div style={styles.list}>
          {(status?.ollama.models ?? []).length === 0
            ? <div style={{ opacity: 0.55, fontSize: 12 }}>{t('noModels')}</div>
            : status!.ollama.models.map((m) => (
              <div key={m.name} style={styles.item}>
                <span style={styles.row}>
                  <b>{m.name}</b>
                  {m.size ? <span style={{ opacity: 0.55, fontSize: 12 }}>{fmtSize(m.size)}</span> : null}
                  {isDefault(m.name, status?.patch.defaultModel) ? <span style={styles.pill}>{t('isDefault')}</span> : null}
                </span>
                {isDefault(m.name, status?.patch.defaultModel) ? null : (
                  <button style={styles.btn} disabled={busy}
                    onClick={() => void act(() => api('/model', { method: 'POST', body: JSON.stringify({ model: modelBase(m.name) }) }))}>
                    {t('setDefault')}
                  </button>
                )}
              </div>
            ))}
        </div>
      </section>

      {/* 任务进度 */}
      {job ? (
        <section style={styles.card}>
          <div style={styles.row}>
            <h2 style={{ ...styles.h, margin: 0, flex: 1 }}>{t('job')} · {job.label}</h2>
            <button style={styles.btn} onClick={() => void api('/jobs/cancel', { method: 'POST', body: JSON.stringify({ id: job.id }) })}>
              {t('cancel')}
            </button>
          </div>
          <div style={{ ...styles.row, marginTop: 8 }}>
            <div style={styles.bar}><div style={{ ...styles.barFill, width: `${Math.max(2, job.pct)}%` }} /></div>
            <span style={{ fontSize: 12, minWidth: 42, textAlign: 'right' }}>{job.pct}%</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{job.detail}</div>
          {job.error ? <div style={styles.err}>{job.error}</div> : null}
        </section>
      ) : null}

      {/* ollama catalog */}
      <section style={styles.card}>
        <h2 style={styles.h}>{t('catalog')}</h2>
        <div style={styles.list}>
          {catalog.map((c) => (
            <div key={c.model} style={styles.item}>
              <span style={styles.row}>
                <b>{c.label}</b>
                <span style={{ opacity: 0.55, fontSize: 12 }}>{c.size}</span>
                <span style={{ opacity: 0.55, fontSize: 12 }}>{c.note}</span>
              </span>
              <button style={styles.btn} disabled={busy || !!status?.activeJob}
                onClick={() => void act(() => api('/download/pull', { method: 'POST', body: JSON.stringify({ model: c.model }) }))}>
                {t('pull')}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ModelScope */}
      <section style={styles.card}>
        <h2 style={styles.h}>{t('modelscopeTitle')}</h2>
        <p style={styles.sub}>{t('modelscopeHint')}</p>
        <div style={styles.row}>
          <input style={styles.input} value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/name" />
          <button style={styles.btn} disabled={busy} onClick={queryFiles}>{t('queryFiles')}</button>
        </div>
        {files.length ? (
          <div style={{ ...styles.list, marginTop: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{t('selectFiles')}</div>
            {files.map((f) => (
              <label key={f.path} style={styles.check}>
                <input type="checkbox" checked={picked.has(f.path)} onChange={() => toggleFile(f.path)} />
                <span>{f.path}</span>
                <span style={{ opacity: 0.55 }}>({fmtSize(f.size)})</span>
              </label>
            ))}
            <div style={{ ...styles.row, marginTop: 6 }}>
              <input style={styles.input} value={importName} onChange={(e) => setImportName(e.target.value)} placeholder={t('importName')} />
              <button style={styles.btnPrimary} disabled={busy || picked.size === 0 || !!status?.activeJob}
                onClick={() => void act(async () => {
                  await api('/download/gguf', {
                    method: 'POST',
                    body: JSON.stringify({ repo, files: [...picked], name: importName }),
                  })
                })}>
                {t('download')}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* 下载目录 */}
      <section style={styles.card}>
        <h2 style={styles.h}>{t('downloadDir')}</h2>
        <div style={styles.row}>
          <input style={styles.input} value={dir} onChange={(e) => { setDir(e.target.value); setSaved(false) }} />
          <button style={styles.btn} disabled={busy}
            onClick={() => void act(async () => {
              await api('/dir', { method: 'POST', body: JSON.stringify({ dir }) })
              setSaved(true)
            })}>{t('save')}</button>
          {saved ? <span style={styles.ok}>{t('saved')} ✓</span> : null}
        </div>
      </section>

      {/* 开关 */}
      <section style={styles.card}>
        <h2 style={styles.h}>{t('toggles')}</h2>
        <div style={styles.list}>
          <div style={styles.item}>
            <span style={styles.label}>{t('searchLabel')}</span>
            <div style={styles.row}>
              <button style={searchProvider === 'bing' ? styles.btnPrimary : styles.btn} disabled={busy}
                onClick={() => void act(() => api('/toggle', { method: 'POST', body: JSON.stringify({ key: 'search', value: 'bing' }) }))}>
                {t('searchBing')}
              </button>
              <button style={searchProvider === 'deepseek-official' ? styles.btnPrimary : styles.btn} disabled={busy}
                onClick={() => void act(() => api('/toggle', { method: 'POST', body: JSON.stringify({ key: 'search', value: 'deepseek-official' }) }))}>
                {t('searchDeepseek')}
              </button>
            </div>
          </div>
          <div style={styles.item}>
            <span style={styles.label}>{t('scheduleLabel')}</span>
            <button style={status?.patch.scheduleEnabled ? styles.btnPrimary : styles.btn} disabled={busy}
              onClick={() => void act(() => api('/toggle', { method: 'POST', body: JSON.stringify({ key: 'schedule', value: !status?.patch.scheduleEnabled }) }))}>
              {status?.patch.scheduleEnabled ? 'ON' : 'OFF'} · {t('scheduleOn')}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ---------------- client plugin entry ---------------- */

const NS = 'settings.localLlm'
export const inject = ['slots', 'locale']

export function apply(ctx: any): void {
  const t: T = (key) => {
    const dict = (typeof navigator !== 'undefined' && /^zh/i.test(navigator.language)) ? zh : en
    return dict[key] ?? en[key] ?? key
  }
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'local-llm: dictionaries')
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'local-llm',
    order: 40,
    label: () => t('title'),
    inject: () => ({ t }),
  }, Section))
}
