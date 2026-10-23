import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import type { GameModeEntry, Proc, Settings } from '../shared/types'
import { readJson, writeJson } from './store'
import { splitCommand } from './gamemode-split'

// Modo Jogo automático: quando um jogo abre, fecha os programas escolhidos (guardando a linha de comando de cada um)
// e, quando o jogo fecha, reabre do mesmo jeito. Usa a lista de processos que o coletor já tem.

const LOG = 'gamemode-log.json'
const OWN = path.parse(process.execPath).name.toLowerCase()

/** Nunca fecha: Windows, o painel e launchers (o jogo depende deles). */
const NEVER = new Set(['system', 'idle', 'registry', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'svchost', 'dwm', 'explorer', 'sihost', 'ctfmon',
  'fontdrvhost', 'memory compression', 'audiodg', 'spoolsv', 'msmpeng', 'searchhost', 'startmenuexperiencehost', 'shellexperiencehost', 'runtimebroker', 'taskhostw',
  'textinputhost', 'securityhealthsystray', 'librehardwaremonitor', 'powershell', 'conhost', 'cmd',
  'steam', 'steamwebhelper', 'epicgameslauncher', 'epicwebhelper', 'battle.net', 'agent', 'riotclientservices', 'riotclientux', 'vgc', 'vgtray', 'eadesktop', 'eabackgroundservice',
  'upc', 'ubisoftconnect', 'galaxyclient', 'xboxpcapp', 'gamingservices', 'amdrsserv', 'radeonsoftware', 'amdrssrcext', 'atieclxx', 'nvcontainer', 'nvidia share'])
export const canClose = (name: string, game?: string | null) => { const n = name.toLowerCase(); return !NEVER.has(n) && n !== OWN && (!game || n !== game.toLowerCase()) }

interface Closed { name: string; cmd: string | null; exe: string | null }
let closed: Closed[] = []
let busy = false

const log = (e: GameModeEntry) => { const l = readJson<GameModeEntry[]>(LOG, []); writeJson(LOG, [e, ...l].slice(0, 30)); return e }
export const history = () => readJson<GameModeEntry[]>(LOG, [])

/** Linhas de comando dos processos (para reabrir com os mesmos argumentos, ex.: "-silent"). */
function commandLines(pids: number[]): Promise<Map<number, string>> {
  if (!pids.length) return Promise.resolve(new Map())
  const ps = `Get-CimInstance Win32_Process -Filter "${pids.map((p) => `ProcessId=${p}`).join(' OR ')}" | ForEach-Object { "$($_.ProcessId)\`t$($_.CommandLine)" }`
  return new Promise((resolve) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 15_000 }, (err, out) => {
    const m = new Map<number, string>()
    if (!err) for (const line of out.split(/\r?\n/)) { const [pid, cmd] = line.split('\t'); if (pid && cmd?.trim()) m.set(Number(pid), cmd.trim()) }
    resolve(m)
  }))
}

const taskkill = (pids: number[], force: boolean) => new Promise<void>((resolve) => {
  if (!pids.length) return resolve()
  execFile('taskkill', [...(force ? ['/F'] : []), ...pids.flatMap((p) => ['/PID', String(p)]), '/T'], { windowsHide: true, timeout: 15_000 }, () => resolve())
})
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** O processo ainda existe? (sinal 0 só testa, não mata). */
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM' } }

/** Fecha os programas escolhidos. Pede para fechar (como clicar no X) e força depois de 5 s quem não fechou. */
export async function closeApps(cfg: Settings['autoGame'], procs: Proc[], game: string): Promise<GameModeEntry> {
  const targets = procs.filter((p) => cfg.close.includes(p.name.toLowerCase()) && canClose(p.name, game))
  const cmds = await commandLines(targets.map((p) => p.pid))
  // Um registro por programa (navegadores e outros têm vários processos; reabre só o principal).
  const seen = new Set<string>()
  closed = targets.filter((p) => { const k = p.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
    .map((p) => ({ name: p.name, cmd: cmds.get(p.pid) ?? null, exe: p.path }))
  await taskkill(targets.map((p) => p.pid), false)
  await wait(5000)
  await taskkill(targets.filter((p) => alive(p.pid)).map((p) => p.pid), true)
  await wait(1000)
  const failed = targets.filter((p) => alive(p.pid)).map((p) => p.name)
  return log({ time: Date.now(), game, action: 'closed', apps: closed.map((c) => c.name), failed: [...new Set(failed)] })
}

/** Reabre o que foi fechado, com o mesmo executável e os mesmos argumentos. */
export function reopenApps(game: string): GameModeEntry {
  const apps: string[] = [], failed: string[] = []
  for (const c of closed) {
    try {
      const [exe, args] = c.cmd ? splitCommand(c.cmd) : [c.exe ?? '', '']
      if (!exe) throw new Error()
      const child = spawn(exe, args ? [args] : [], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true })
      child.on('error', () => {}); child.unref()
      apps.push(c.name)
    } catch { failed.push(c.name) }
  }
  closed = []
  return log({ time: Date.now(), game, action: 'reopened', apps, failed })
}

/** Chamado a cada leitura do coletor de processos: detecta jogo abrindo/fechando. */
export async function onGameChange(prev: string | null, game: string | null, cfg: Settings['autoGame'], procs: Proc[]) {
  if (busy || !cfg.enabled || !cfg.close.length) return
  busy = true
  try {
    if (!prev && game) await closeApps(cfg, procs, game)
    else if (prev && !game && cfg.reopen && closed.length) reopenApps(prev)
  } finally { busy = false }
}

/** Ao sair do painel no meio de um jogo: reabre o que foi fechado para não deixar nada para trás. */
export function reopenPending() { if (closed.length) reopenApps('saída do painel') }

/** Teste manual: fecha agora e reabre depois de `seconds`. */
export async function test(cfg: Settings['autoGame'], procs: Proc[], seconds: number): Promise<GameModeEntry> {
  if (busy) throw new Error('O Modo Jogo já está agindo agora.')
  busy = true
  try {
    const r = await closeApps({ ...cfg, enabled: true }, procs, 'teste')
    setTimeout(() => { reopenApps('teste') }, seconds * 1000)
    return r
  } finally { busy = false }
}
