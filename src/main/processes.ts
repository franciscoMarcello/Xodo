import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import type { Proc } from '../shared/types'

// Coletor único de processos: uma leitura do PowerShell serve para os jogos, para a aba Processos e (depois) para os
// alertas. Abrir o PowerShell custa ~0,47 s de CPU (medido), mais que o resto do painel junto, então em segundo plano
// a leitura é a cada 1 min (jogos começam/terminam com até 1 min de atraso) e só fica a cada 5 s enquanto alguma
// janela está mostrando a aba Processos.

const SLOW = 60_000
const FAST = 5_000
const CORES = os.cpus().length

// Saída em texto separado por tabulação (mais leve que ConvertTo-Json). CPU em milissegundos inteiros para não
// depender da vírgula decimal do Windows em português.
const SCRIPT = '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Process | ForEach-Object { "$($_.Id)`t$($_.ProcessName)`t$($_.WorkingSet64)`t$(if ($_.TotalProcessorTime) { [long]$_.TotalProcessorTime.TotalMilliseconds })`t$($_.Path)" }'

interface Raw { pid: number; name: string; ram: number; cpuMs: number | null; path: string | null }

export function parse(out: string): Raw[] {
  return out.split(/\r?\n/).flatMap((line) => {
    const [pid, name, ram, cpu, p] = line.split('\t')
    if (!pid || !name || !/^\d+$/.test(pid)) return []
    return [{ pid: Number(pid), name, ram: Number(ram) || 0, cpuMs: cpu ? Number(cpu) : null, path: p?.trim() || null }]
  })
}

function read(): Promise<Raw[]> {
  return new Promise((resolve) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT],
    { windowsHide: true, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 }, (err, out) => resolve(err ? [] : parse(out))))
}

let prev = new Map<string, { cpuMs: number; at: number }>()
let latest: Proc[] = []
let latestAt = 0

/** CPU % (do processador inteiro) desde a leitura anterior do mesmo processo. Na primeira leitura não dá para saber. */
async function sample(): Promise<Proc[]> {
  const raw = await read(); const at = Date.now(); const next = new Map<string, { cpuMs: number; at: number }>()
  latest = raw.map((r) => {
    const key = `${r.pid}:${r.name}`; const p = prev.get(key)
    if (r.cpuMs != null) next.set(key, { cpuMs: r.cpuMs, at })
    const cpu = p && r.cpuMs != null && at > p.at ? Math.max(0, (100 * (r.cpuMs - p.cpuMs)) / ((at - p.at) * CORES)) : null
    return { pid: r.pid, name: r.name, ram: r.ram, cpu, path: r.path }
  })
  prev = next; latestAt = at
  return latest
}

export const latestProcesses = () => ({ time: latestAt, procs: latest })

/** Janelas (webContents) que estão com a aba Processos aberta. */
const watchers = new Set<number>()
let timer: NodeJS.Timeout | null = null
let listener: (procs: Proc[]) => void = () => {}

async function run() {
  timer = null
  try { listener(await sample()) } finally { schedule() }
}
function schedule() { if (timer) clearTimeout(timer); timer = setTimeout(run, watchers.size ? FAST : SLOW) }

export function startCollector(onSample: (procs: Proc[]) => void) { listener = onSample; run() }

export function watch(id: number, on: boolean) {
  const had = watchers.size
  if (on) watchers.add(id); else watchers.delete(id)
  if (!had && watchers.size) { if (timer) clearTimeout(timer); run() } // abriu a aba: lê na hora
  else if (had && !watchers.size) schedule()
}
export const watching = () => watchers.size > 0

/** Programas do Windows que não podem ser finalizados por aqui (travam ou reiniciam o PC). */
const PROTECTED = new Set(['system', 'idle', 'registry', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'svchost', 'dwm',
  'fontdrvhost', 'memory compression', 'secure system', 'lsaiso', 'msmpeng', 'sihost', 'explorer', 'ctfmon', 'audiodg', 'spoolsv'])

/** Nome do executável do app ("Xodo"): protege também outra cópia aberta (ex.: versão de teste). */
const OWN_NAME = path.parse(process.execPath).name.toLowerCase()

export function killable(p: Proc, own: Set<number>) { const n = p.name.toLowerCase(); return !PROTECTED.has(n) && n !== OWN_NAME && !own.has(p.pid) }

export function kill(pid: number, own: Set<number>) {
  const p = latest.find((x) => x.pid === pid)
  if (!p) throw new Error('Esse processo não está mais na lista. Atualize e tente de novo.')
  if (!killable(p, own)) throw new Error(`"${p.name}" é essencial para o Windows ou para o próprio painel e não pode ser finalizado por aqui.`)
  try { process.kill(pid) } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return // já tinha fechado
    throw new Error(code === 'EPERM' ? `Sem permissão para finalizar "${p.name}" (ele roda como administrador).` : `Não foi possível finalizar "${p.name}".`)
  }
}
