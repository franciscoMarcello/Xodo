import type { SpeedResult } from '../shared/types'
import { appendLine, readLines } from './store'

// Teste de velocidade com os servidores públicos do speed.cloudflare.com (os mesmos do site deles).
// Cada teste usa uns 50 MB: 4 downloads de 10 MB e 2 uploads de 5 MB, em paralelo para encher a conexão.

const BASE = 'https://speed.cloudflare.com'
const FILE = 'speed.jsonl'
const MB = 1_000_000

const mbps = (bytes: number, ms: number) => Math.round((bytes * 8) / (ms / 1000) / 1e4) / 100

async function ping(): Promise<number> {
  const times: number[] = []
  for (let i = 0; i < 6; i++) {
    const t = performance.now(); const r = await fetch(`${BASE}/__down?bytes=0`, { cache: 'no-store' }); await r.arrayBuffer()
    // O servidor mede a latência TCP da conexão ("cfL4;desc=...rtt=44093", em microssegundos). Sem ela, desconta o
    // tempo de processamento informado ("dur=40"), que não é rede.
    const timing = r.headers.get('server-timing') ?? ''
    const rtt = /[?&]rtt=(\d+)/.exec(timing)?.[1]
    const server = [...timing.matchAll(/dur=([\d.]+)/g)].reduce((a, m) => a + Number(m[1]), 0)
    times.push(rtt ? Number(rtt) / 1000 : Math.max(1, performance.now() - t - server))
  }
  times.shift() // a primeira inclui abrir a conexão
  return Math.round(times.sort((a, b) => a - b)[Math.floor(times.length / 2)])
}

async function download(streams: number, bytes: number): Promise<number> {
  const t = performance.now()
  const sizes = await Promise.all(Array.from({ length: streams }, async () => (await (await fetch(`${BASE}/__down?bytes=${bytes}`, { cache: 'no-store' })).arrayBuffer()).byteLength))
  return mbps(sizes.reduce((a, b) => a + b, 0), performance.now() - t)
}

async function upload(streams: number, bytes: number): Promise<number> {
  const body = new Uint8Array(bytes)
  const t = performance.now()
  await Promise.all(Array.from({ length: streams }, async () => { const r = await fetch(`${BASE}/__up`, { method: 'POST', body }); await r.arrayBuffer(); if (!r.ok) throw new Error(`upload ${r.status}`) }))
  return mbps(bytes * streams, performance.now() - t)
}

let running: Promise<SpeedResult> | null = null

export function runSpeedTest(): Promise<SpeedResult> {
  running ??= (async () => {
    let r: SpeedResult
    try {
      const p = await ping(); const down = await download(4, 10 * MB); const up = await upload(2, 5 * MB)
      r = { time: Date.now(), ping: p, down, up }
    } catch (e) { r = { time: Date.now(), ping: 0, down: 0, up: 0, error: 'Sem conexão ou o servidor de teste não respondeu.' } }
    appendLine(FILE, r)
    return r
  })().finally(() => { running = null })
  return running
}

export const history = () => readLines<SpeedResult>(FILE).slice(-500)

/** A cada 10 minutos vê se já passou o intervalo desde o último teste. Não testa durante jogos para não causar lag. */
export function scheduleSpeedTests(get: () => { enabled: boolean; intervalHours: number }, gaming: () => boolean) {
  const tick = () => {
    const s = get(); if (!s.enabled || gaming() || running) return
    const last = history().at(-1)?.time ?? 0
    if (Date.now() - last >= s.intervalHours * 3600_000) runSpeedTest().catch(() => {})
  }
  setTimeout(tick, 60_000) // espera o PC terminar de iniciar
  setInterval(tick, 10 * 60_000)
}
