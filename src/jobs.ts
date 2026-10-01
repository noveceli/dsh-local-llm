/**
 * In-memory job registry: one active download/pull at a time,
 * progress readable by the settings page.
 */
import { randomUUID } from 'node:crypto'

export type JobStatus = 'running' | 'done' | 'error' | 'canceled'
export type JobKind = 'ollama-pull' | 'modelscope-gguf'

export interface Job {
  id: string
  kind: JobKind
  label: string
  status: JobStatus
  /** 0..100, -1 while indeterminate. */
  pct: number
  detail: string
  startedAt: string
  finishedAt?: string
  error?: string
  /** Model name imported on success. */
  modelName?: string
  cancel?: () => void
}

const jobs = new Map<string, Job>()
const MAX_HISTORY = 20

export function activeJob(): Job | undefined {
  for (const job of jobs.values()) if (job.status === 'running') return job
  return undefined
}

export function startJob(kind: JobKind, label: string, cancel?: () => void): Job {
  const job: Job = {
    id: randomUUID().slice(0, 8),
    kind,
    label,
    status: 'running',
    pct: kind === 'ollama-pull' ? 0 : 0,
    detail: '',
    startedAt: new Date().toISOString(),
    cancel,
  }
  jobs.set(job.id, job)
  prune()
  return job
}

export function finishJob(job: Job, status: Exclude<JobStatus, 'running'>, extra: Partial<Job> = {}): void {
  job.status = status
  job.pct = status === 'done' ? 100 : job.pct
  job.finishedAt = new Date().toISOString()
  Object.assign(job, extra)
  if (status !== 'running') job.cancel = undefined
  prune()
}

export function listJobs(): Job[] {
  return [...jobs.values()].reverse().slice(0, MAX_HISTORY)
}

function prune(): void {
  if (jobs.size <= MAX_HISTORY) return
  const entries = [...jobs.values()]
  const running = entries.filter((j) => j.status === 'running')
  const finished = entries.filter((j) => j.status !== 'running').slice(-(MAX_HISTORY - running.length))
  const keep = new Set([...running, ...finished].map((j) => j.id))
  for (const id of jobs.keys()) if (!keep.has(id)) jobs.delete(id)
}
