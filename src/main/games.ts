import type { Bottleneck, BottleneckKind, GameSession, LagView, RawStatus } from '../shared/types'
import { appendLine, readLines } from './store'
import { steamLibraries } from './gamesdb/steam'
import { exeIndex, gameName } from './games-exes'

// Detecta jogos pelo caminho do executável (pastas das lojas) e grava sessões com tempo jogado e temperaturas.
// A lista de processos vem do coletor único (processes.ts).

const FILE = 'games.jsonl'

/** Jogos da Steam pelo nome do .exe, para os processos que vêm sem caminho (ver games-exes.ts). */
let byExe = new Map<string, string>()
let indexedAt = 0
async function indexGameExes() { indexedAt = Date.now(); byExe = await exeIndex(await steamLibraries()) }

interface Running {
  game: string; exe: string; start: number; lastSeen: number; cpu: number[]; gpu: number[]; gpuLoad: number[]
  fps: number[]; vramMax: number | null; bottlenecks: Partial<Record<BottleneckKind, number>>
  pings: number[]; losses: number[]; ticks: number
}
let current: Running | null = null
const fresh = (game: string, exe: string, now: number): Running => ({ game, exe, start: now, lastSeen: now, cpu: [], gpu: [], gpuLoad: [], fps: [], vramMax: null, bottlenecks: {}, pings: [], losses: [], ticks: 0 })

export const currentGame = () => current?.game ?? null

const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null)
const max = (a: number[]) => (a.length ? Math.round(Math.max(...a)) : null)

/**
 * Fecha a sessão em andamento. Menos de 1 minuto não é gravado (abriu e fechou).
 * `stillRunning`: o painel está saindo com o jogo aberto, então o fim é agora (e não a última leitura de processos).
 */
export function closeSession(stillRunning = false) {
  const c = current; current = null
  if (c && stillRunning) c.lastSeen = Date.now()
  if (!c || c.lastSeen - c.start < 60_000) return
  // "1% mais baixo": o FPS abaixo do qual ficaram só 1% das leituras (mostra as quedas, que a média esconde).
  const sorted = [...c.fps].sort((a, b) => a - b)
  const s: GameSession = {
    game: c.game, exe: c.exe, start: c.start, end: c.lastSeen, cpuTempAvg: avg(c.cpu), cpuTempMax: max(c.cpu), gpuTempAvg: avg(c.gpu), gpuTempMax: max(c.gpu), gpuLoadAvg: avg(c.gpuLoad),
    fpsAvg: avg(c.fps), fpsLow: sorted.length >= 30 ? Math.round(sorted[Math.floor(sorted.length * 0.01)]) : null, vramMax: c.vramMax, bottlenecks: c.bottlenecks,
    pingAvg: avg(c.pings), pingLoss: avg(c.losses),
  }
  appendLine(FILE, s)
}

/** Recebe os processos abertos (do coletor único) e abre/fecha a sessão de jogo. */
export function updateGames(procs: { name: string; path: string | null }[], extraFolders: string[], ignored: string[]) {
  // Marcado como "não é jogo" no meio da sessão: descarta sem gravar.
  if (current && ignored.includes(current.game)) current = null
  if (!procs.length) return // leitura falhou: não fecha a sessão por engano
  const now = Date.now()
  if (now - indexedAt > 60 * 60_000) indexGameExes().catch(() => {}) // jogo instalado depois entra em até 1 h
  const found = procs.map((p) => {
    const game = p.path ? gameName(p.path, extraFolders, ignored) : byExe.get(p.name.toLowerCase())
    return game && !ignored.includes(game) ? { exe: p.path ?? `${p.name}.exe`, game } : null
  }).find((x) => x)
  if (current && found?.game === current.game) { current.lastSeen = now; return }
  closeSession()
  if (found) current = fresh(found.game, found.exe, now)
}

/** A cada leitura (2 s) durante um jogo. `bn` = gargalo do momento: soma 2 s no tipo dele. */
export function gameSample(s: RawStatus, bn: Bottleneck | null, lag: LagView | null = null) {
  if (!current) return
  if (s.cpu.temp != null) current.cpu.push(s.cpu.temp)
  if (s.gpu.temp != null) current.gpu.push(s.gpu.temp)
  if (s.gpu.load != null) current.gpuLoad.push(s.gpu.load)
  if (s.gpu.fps != null) current.fps.push(s.gpu.fps)
  if (s.gpu.vramUsed != null) current.vramMax = Math.max(current.vramMax ?? 0, Math.round(s.gpu.vramUsed))
  if (bn) current.bottlenecks[bn.kind] = (current.bottlenecks[bn.kind] ?? 0) + 2
  // A cada ~1 min (30 leituras) guarda o ping médio e a perda do último minuto.
  current.ticks++
  if (lag?.internet?.avg != null && lag.internet.samples >= 30 && current.ticks % 30 === 0) { current.pings.push(lag.internet.avg); current.losses.push(lag.internet.loss) }
}

export const sessions = () => readLines<GameSession>(FILE).slice(-1000).reverse()
