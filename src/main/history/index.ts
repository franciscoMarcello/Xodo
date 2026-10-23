import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { HistPoint, HistRange, HistView, Status } from '../../shared/types'
import { Acc, aggregate, localDate } from './aggregate'

// Histórico de uso e temperatura. Usa as leituras de status que o painel já faz (a cada 2 s) e grava só resumos:
// - por minuto: history/AAAA-MM-DD.jsonl, guardado por 7 dias (~250 KB por dia);
// - por hora:   history/hours.jsonl, guardado para sempre (~4 KB por dia).
// Custo: uma linha anexada por minuto e uma por hora.

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR
const KEEP_DAYS = 7
const dir = () => path.join(app.getPath('userData'), 'history')
const HOURS = 'hours.jsonl'

let minute: { key: number; acc: Acc } | null = null
let hour: { key: number; acc: Acc } | null = null

function append(file: string, p: HistPoint) {
  fs.mkdirSync(dir(), { recursive: true })
  fs.appendFileSync(path.join(dir(), file), JSON.stringify(p) + '\n')
}

function read(file: string): HistPoint[] {
  let text = ''
  try { text = fs.readFileSync(path.join(dir(), file), 'utf8') } catch { return [] }
  const out: HistPoint[] = []
  for (const line of text.split('\n')) if (line) try { out.push(JSON.parse(line)) } catch { /* linha cortada (PC desligou no meio) */ }
  return out
}

/** Apaga os arquivos de minutos com mais de 7 dias. */
function prune() {
  const limit = localDate(Date.now() - KEEP_DAYS * DAY)
  let files: string[] = []
  try { files = fs.readdirSync(dir()) } catch { return }
  for (const f of files) if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(0, 10) < limit) try { fs.unlinkSync(path.join(dir(), f)) } catch { /* em uso */ }
}

function add(acc: Acc, s: Status) {
  acc.add('cpu', s.cpu.load); acc.add('cpuTemp', s.cpu.temp); acc.add('gpu', s.gpu.load); acc.add('gpuTemp', s.gpu.temp)
  acc.add('ram', (100 * s.ram.used) / s.ram.total); acc.add('watts', s.watts)
}

function flushMinute() { if (minute && !minute.acc.empty) append(`${localDate(minute.key)}.jsonl`, minute.acc.point(minute.key)); minute = null }
function flushHour() { if (hour && !hour.acc.empty) append(HOURS, hour.acc.point(hour.key)); hour = null; prune() }

/** Chamado a cada leitura de status. Quando o minuto (ou a hora) vira, grava o resumo do que passou. */
export function record(s: Status) {
  const mk = Math.floor(s.time / MIN) * MIN, hk = Math.floor(s.time / HOUR) * HOUR
  if (minute && minute.key !== mk) flushMinute()
  if (hour && hour.key !== hk) flushHour()
  minute ??= { key: mk, acc: new Acc() }; hour ??= { key: hk, acc: new Acc() }
  add(minute.acc, s); add(hour.acc, s)
}

/** Ao sair: grava o minuto e a hora em andamento (parciais). */
export function flush() { flushMinute(); flushHour() }

export function startHistory() { prune() }

/** Tudo que está gravado: minutos (até 7 dias) e horas. Para cruzar eventos antigos com a temperatura da época. */
export function allPoints(): { minutes: HistPoint[]; hours: HistPoint[] } {
  let files: string[] = []
  try { files = fs.readdirSync(dir()).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort() } catch { /* sem histórico */ }
  return { minutes: files.flatMap((f) => read(f)), hours: read(HOURS) }
}

/** 24 h: minutos em blocos de 5 min. 7 dias: horas. 30 dias: horas em blocos de 3 h. Inclui o intervalo em andamento. */
export function query(range: HistRange): HistView {
  const now = Date.now()
  if (range === '24h') {
    const mins = [...read(`${localDate(now - DAY)}.jsonl`), ...read(`${localDate(now)}.jsonl`)].filter((p) => p.t >= now - DAY)
    if (minute && !minute.acc.empty) mins.push(minute.acc.point(minute.key))
    return { points: aggregate(mins, 5 * MIN), bucketMinutes: 5 }
  }
  const days = range === '7d' ? 7 : 30
  const hours = read(HOURS).filter((p) => p.t >= now - days * DAY)
  if (hour && !hour.acc.empty) hours.push(hour.acc.point(hour.key))
  return range === '7d' ? { points: hours, bucketMinutes: 60 } : { points: aggregate(hours, 3 * HOUR), bucketMinutes: 180 }
}
