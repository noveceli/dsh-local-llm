/**
 * Targeted edits to the profile's `cordis.patch.yml`.
 *
 * The patch file is an official user-owned YAML array. Rather than
 * re-serialising it (which would destroy comments and formatting), we
 * operate on top-level entries (lines starting at column 0 with `- `)
 * and mutate only the keys we own.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { profilePatchPath } from './util.ts'

interface Entry {
  /** Full text including the leading "- " line and trailing newlines. */
  text: string
  start: number
  end: number
  id: string | undefined
}

/** Split patch text into top-level entries + inter-entry gaps. */
function splitEntries(text: string): { entries: Entry[]; gaps: Array<[number, number]> } {
  const lines = text.split('\n')
  const entries: Entry[] = []
  const gaps: Array<[number, number]> = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('- ')) {
      const start = i
      let j = i + 1
      while (j < lines.length && !isTopLevel(lines[j])) j++
      const block = lines.slice(start, j).join('\n')
      const idMatch = block.match(/^-\s+id:\s*(\S+)/)
      entries.push({ text: block, start, end: j, id: idMatch?.[1] })
      i = j
    } else {
      const start = i
      while (i < lines.length && !lines[i].startsWith('- ')) i++
      gaps.push([start, i])
      void gaps
    }
  }
  return { entries, gaps }
}

/** A col-0 non-comment, non-blank line starts a new top-level thing. */
function isTopLevel(line: string): boolean {
  if (line.startsWith(' ') || line.startsWith('\t')) return false
  return true
}

function getEntry(text: string, id: string): Entry | undefined {
  return splitEntries(text).entries.find((e) => e.id === id)
}

/**
 * Set (or add) a key inside an entry's `config:` block.
 * Only handles one level of nesting (`  config:` then 4-space keys).
 */
function setConfigKey(entry: string, key: string, value: string): string {
  const lines = entry.split('\n')
  const configIdx = lines.findIndex((l) => /^\s+config:\s*$/.test(l))
  const keyRe = new RegExp(`^(\\s+)${key}:\\s*.*$`)
  const keyIdx = lines.findIndex((l) => keyRe.test(l))
  if (keyIdx >= 0) {
    lines[keyIdx] = lines[keyIdx].replace(keyRe, `$1${key}: ${value}`)
    return lines.join('\n')
  }
  if (configIdx >= 0) {
    lines.splice(configIdx + 1, 0, `    ${key}: ${value}`)
    return lines.join('\n')
  }
  // No config block yet: append one at the end of the entry.
  return `${entry.replace(/\n*$/, '')}\n  config:\n    ${key}: ${value}`
}

function upsertEntry(text: string, id: string, initial: string, mutator: (entry: string) => string): string {
  const existing = getEntry(text, id)
  if (existing) {
    const updated = mutator(existing.text)
    const lines = text.split('\n')
    lines.splice(existing.start, existing.end - existing.start, ...updated.split('\n'))
    return lines.join('\n')
  }
  const base = text.endsWith('\n') ? text : `${text}\n`
  return `${base}${initial.endsWith('\n') ? initial : `${initial}\n`}`
}

/* ---------------- readers ---------------- */

export interface PatchState {
  defaultModel?: string
  defaultProvider?: string
  searchProvider?: string
  scheduleEnabled: boolean
}

export async function readPatchState(profile: string): Promise<PatchState> {
  const text = await safeRead(profile)
  const modelEntry = getEntry(text, 'agent-default-model')
  const webEntry = getEntry(text, 'web')
  const model = modelEntry?.text.match(/^\s+model:\s*(\S+)/m)?.[1]
  const provider = modelEntry?.text.match(/^\s+provider:\s*(\S+)/m)?.[1]
  const search = webEntry?.text.match(/^\s+searchProvider:\s*(\S+)/m)?.[1]
  return {
    defaultModel: model,
    defaultProvider: provider,
    searchProvider: search,
    scheduleEnabled: /id:\s*schedule\b/.test(text),
  }
}

async function safeRead(profile: string): Promise<string> {
  try { return await readFile(profilePatchPath(profile), 'utf8') } catch { return '' }
}

/* ---------------- writers ---------------- */

export interface ModelDeclaration {
  contextWindow: number
  maxTokens: number
}

export async function setDefaultModel(
  profile: string,
  model: string,
  decl?: ModelDeclaration,
): Promise<void> {
  let text = await safeRead(profile)
  text = upsertEntry(
    text,
    'agent-default-model',
    '- id: agent-default-model\n  config:\n    provider: ollama\n    model: PLACEHOLDER',
    (entry) => {
      let next = setConfigKey(entry, 'provider', 'ollama')
      next = setConfigKey(next, 'model', model)
      return next.replace('model: PLACEHOLDER', `model: ${model}`)
    },
  )
  text = text.replace('model: PLACEHOLDER', `model: ${model}`)
  if (decl) text = declareModel(text, model, decl)
  await writeFile(profilePatchPath(profile), text, 'utf8')
}

/**
 * The llm-pi-ai provider config enumerates every ollama model it is
 * allowed to route to. A freshly downloaded model is unknown to it,
 * so append (or update) a declaration. contextWindow MUST equal the
 * model's actual ollama `num_ctx`, otherwise Harness sends prompts
 * larger than ollama serves and gets a 400 context-size error.
 */
export function declareModel(text: string, model: string, decl: ModelDeclaration): string {
  const entry = getEntry(text, 'llm-pi-ai')
  if (!entry) return text
  const entryLines = entry.text.split('\n')
  const modelsIdx = entryLines.findIndex((l) => /^\s{8}models:\s*$/.test(l))
  if (modelsIdx < 0) return text

  // Find an existing entry for this model.
  const idRe = new RegExp(`^(\\s+)- id:\\s*${escapeRe(model)}\\s*$`)
  const existingIdx = entryLines.findIndex((l) => idRe.test(l))
  if (existingIdx >= 0) {
    // Update contextWindow / maxTokens in place (keep any other keys like input).
    const indent = (entryLines[existingIdx].match(/^(\s+)/)?.[1] ?? '          ') + '  '
    const updateKey = (key: string, value: number): void => {
      const re = new RegExp(`^${escapeRe(indent)}${key}:\\s*\\d+\\s*$`)
      const idx = entryLines.findIndex((l, i) => i > existingIdx && re.test(l))
      if (idx >= 0) entryLines[idx] = `${indent}${key}: ${value}`
      else {
        // Insert after the id line.
        entryLines.splice(existingIdx + 1, 0, `${indent}${key}: ${value}`)
      }
    }
    updateKey('contextWindow', decl.contextWindow)
    updateKey('maxTokens', decl.maxTokens)
  } else {
    let insertAt = modelsIdx + 1
    while (insertAt < entryLines.length && /^\s{10,}\S/.test(entryLines[insertAt])) insertAt++
    while (insertAt > modelsIdx + 1 && entryLines[insertAt - 1] === '') insertAt--
    entryLines.splice(insertAt, 0,
      `          - id: ${model}`,
      `            contextWindow: ${decl.contextWindow}`,
      `            maxTokens: ${decl.maxTokens}`,
    )
  }
  const all = text.split('\n')
  all.splice(entry.start, entry.end - entry.start, ...entryLines)
  return all.join('\n')
}

/** Persist a model declaration (add or update context/maxTokens). */
export async function declareOllamaModel(profile: string, model: string, decl: ModelDeclaration): Promise<void> {
  let text = await safeRead(profile)
  text = declareModel(text, model, decl)
  await writeFile(profilePatchPath(profile), text, 'utf8')
}

export async function setSearchProvider(profile: string, value: string): Promise<void> {
  let text = await safeRead(profile)
  text = upsertEntry(
    text,
    'web',
    `- id: web\n  config:\n    searchProvider: ${value}`,
    (entry) => setConfigKey(entry, 'searchProvider', value),
  )
  await writeFile(profilePatchPath(profile), text, 'utf8')
}

const MARK_BEGIN = '# >>> dsh-local-llm schedule begin'
const MARK_END = '# <<< dsh-local-llm schedule end'

const SCHEDULE_BLOCK = `${MARK_BEGIN}
- insert:
    - id: time-context
      name: '@deepseek-ai/dsh-time-context'

    - id: schedule
      name: '@deepseek-ai/dsh-schedule'

- id: ui-schedule
  disabled: false
${MARK_END}`

/** Strip any previous managed schedule region (marker or legacy hand-written block). */
function stripSchedule(text: string): string {
  let next = text
  // Managed region.
  next = next.replace(new RegExp(`${escapeRe(MARK_BEGIN)}[\\s\\S]*?${escapeRe(MARK_END)}\\n?`, 'g'), '')
  // Legacy insert block (time-context + schedule).
  next = next.replace(
    /- insert:\n(?:\s+- id: time-context\n\s+name: '@deepseek-ai\/dsh-time-context'\n)?(?:\s*\n)?\s+- id: schedule\n\s+name: '@deepseek-ai\/dsh-schedule'\n?/g,
    '',
  )
  // Legacy ui-schedule enable row.
  next = next.replace(/- id: ui-schedule\n\s+disabled:\s*false\n?/g, '')
  return next.replace(/\n{3,}/g, '\n\n\n').replace(/\s*$/, '\n')
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function setSchedule(profile: string, enabled: boolean): Promise<void> {
  const stripped = stripSchedule(await safeRead(profile))
  const text = enabled
    ? `${stripped.replace(/\s*$/, '\n')}\n${SCHEDULE_BLOCK}\n`
    : stripped
  await writeFile(profilePatchPath(profile), text, 'utf8')
}
