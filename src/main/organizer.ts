import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import chokidar, { type FSWatcher } from 'chokidar'
import type { Move, OrganizerRule, Settings } from '../shared/types'
import { appendLine, readLines, writeLines } from './store'

// Vigia a pasta (Downloads) e move cada arquivo novo para a pasta da regra da extensão dele.
// Só arquivos soltos na pasta; subpastas não são tocadas. Tudo vai para o histórico e pode ser desfeito.

const LOG = 'organizer-log.jsonl'
/** Downloads ainda em andamento (Chrome, Edge, Firefox, Opera) e arquivos temporários. */
const PARTIAL = new Set(['crdownload', 'part', 'partial', 'download', 'opdownload', 'tmp', 'temp'])

let watcher: FSWatcher | null = null
/** Arquivos que acabaram de voltar por "Desfazer": não são movidos de novo. */
const skip = new Set<string>()

const ext = (f: string) => path.extname(f).slice(1).toLowerCase()

export function ruleFor(file: string, rules: OrganizerRule[]): OrganizerRule | undefined {
  const e = ext(file); if (!e || PARTIAL.has(e) || path.basename(file).startsWith('~$')) return undefined
  return rules.find((r) => r.extensions.some((x) => x.toLowerCase().replace(/^\./, '') === e))
}

/** "nota.pdf" já existe no destino -> "nota (1).pdf", "nota (2).pdf"... */
export function freeName(dir: string, base: string): string {
  const { name, ext: e } = path.parse(base); let p = path.join(dir, base)
  for (let i = 1; fs.existsSync(p); i++) p = path.join(dir, `${name} (${i})${e}`)
  return p
}

async function moveFile(from: string, to: string) {
  await fs.promises.mkdir(path.dirname(to), { recursive: true })
  try { await fs.promises.rename(from, to) } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e
    await fs.promises.copyFile(from, to, fs.constants.COPYFILE_EXCL); await fs.promises.unlink(from) // outro disco
  }
}

async function organize(file: string, s: Settings['organizer']): Promise<Move | null> {
  if (skip.has(file)) return null
  const rule = ruleFor(file, s.rules)
  if (!rule || path.resolve(path.dirname(file)) === path.resolve(rule.dest)) return null
  const to = freeName(rule.dest, path.basename(file))
  await moveFile(file, to)
  const move: Move = { id: randomUUID(), time: Date.now(), from: file, to, rule: rule.name }
  appendLine(LOG, move)
  return move
}

export function startOrganizer(s: Settings['organizer']) {
  stopOrganizer()
  if (!s.enabled || !fs.existsSync(s.folder)) return
  watcher = chokidar.watch(s.folder, { depth: 0, ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 500 } })
  watcher.on('add', (file) => { organize(file, s).catch(() => { /* arquivo preso por outro programa: fica onde está */ }) })
}

export function stopOrganizer() { watcher?.close(); watcher = null }

function looseFiles(folder: string): string[] {
  try { return fs.readdirSync(folder, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(folder, e.name)) } catch { return [] }
}

/** O que "Organizar agora" faria com os arquivos que já estão na pasta. */
export function preview(s: Settings['organizer']) {
  return looseFiles(s.folder).flatMap((from) => {
    const rule = ruleFor(from, s.rules)
    return rule ? [{ from, to: path.join(rule.dest, path.basename(from)), rule: rule.name }] : []
  })
}

export async function runNow(s: Settings['organizer']): Promise<number> {
  let n = 0
  for (const f of looseFiles(s.folder)) { try { if (await organize(f, s)) n++ } catch { /* pula */ } }
  return n
}

export function log(): Move[] { return readLines<Move>(LOG).slice(-300).reverse() }

export async function undo(id: string) {
  const rows = readLines<Move>(LOG); const m = rows.find((r) => r.id === id)
  if (!m || m.undone) return
  if (!fs.existsSync(m.to)) throw new Error('O arquivo não está mais no destino.')
  if (fs.existsSync(m.from)) throw new Error('Já existe um arquivo com esse nome na pasta original.')
  skip.add(m.from); setTimeout(() => skip.delete(m.from), 15_000)
  await moveFile(m.to, m.from)
  m.undone = true; writeLines(LOG, rows)
}
