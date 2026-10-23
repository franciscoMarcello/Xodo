import { execFile } from 'node:child_process'
import type { BottleneckKind, LagView } from '../../shared/types'
import { parseGateway, parsePing, stats, verdict } from './stats'

// Mede o lag só durante jogos (ou no teste manual): um ping a cada 2 s para o roteador e para a internet.
// O ping.exe é minúsculo (~10 ms de CPU) e nada roda fora desses momentos.

const INTERNET = '1.1.1.1' // Cloudflare: no Brasil responde de São Paulo
const KEEP = 30 // 30 leituras x 2 s = último minuto

let gateway: string | null | undefined
let home: (number | null)[] = [], net: (number | null)[] = []
let inflight = false
let testUntil = 0

const ping = (host: string) => new Promise<number | null>((resolve) =>
  execFile('ping', ['-n', '1', '-w', '1000', host], { windowsHide: true, timeout: 3000 }, (_e, out) => resolve(parsePing(out ?? ''))))

function findGateway() {
  gateway = null // "procurando"
  execFile('route', ['print', '-4', '0.0.0.0'], { windowsHide: true, timeout: 5000 }, (_e, out) => { gateway = parseGateway(out ?? '') })
}

export function startTest(seconds: number) { testUntil = Date.now() + seconds * 1000 }

/** A cada leitura de status (2 s). Devolve a situação atual, ou null quando não está medindo. */
export function tick(gaming: boolean, bottleneck: BottleneckKind | null): LagView | null {
  const now = Date.now()
  if (!gaming && now >= testUntil) { home = []; net = []; gateway = undefined; return null }
  if (gateway === undefined) findGateway()
  if (!inflight) {
    inflight = true
    Promise.all([gateway ? ping(gateway) : Promise.resolve(undefined), ping(INTERNET)]).then(([h, n]) => {
      if (h !== undefined) { home.push(h); if (home.length > KEEP) home.shift() }
      net.push(n); if (net.length > KEEP) net.shift()
    }).finally(() => { inflight = false })
  }
  const v = verdict(home.length ? stats(`roteador (${gateway})`, home) : null, net.length ? stats(INTERNET, net) : null, bottleneck)
  return { ...v, until: now < testUntil ? testUntil : null }
}
