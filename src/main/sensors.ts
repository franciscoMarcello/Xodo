import os from 'node:os'
import { execFile } from 'node:child_process'
import type { RawStatus } from '../shared/types'

// Leituras do sistema. CPU e RAM vêm do Node; rede vem do `netstat -e`; GPU, temperaturas e potência vêm do leitor
// de sensores do Xodó (sensors-helper, porta 47085) ou, sem ele, do servidor web do LibreHardwareMonitor (mesmo formato).

let lastCpu = os.cpus()
/**
 * Uso da CPU (%) desde a última leitura: média de todos os núcleos e o núcleo (thread) mais carregado.
 * O mais carregado importa em jogos: a thread principal trava num núcleo enquanto o total ainda parece baixo.
 */
function cpuLoad(): { total: number; max: number } {
  const now = os.cpus(); let idle = 0, total = 0, max = 0
  now.forEach((c, i) => {
    const p = lastCpu[i]?.times ?? c.times; const t = c.times
    const sum = (x: typeof t) => x.user + x.nice + x.sys + x.idle + x.irq
    const di = t.idle - p.idle, dt = sum(t) - sum(p)
    idle += di; total += dt; if (dt > 0) max = Math.max(max, 100 * (1 - di / dt))
  })
  lastCpu = now
  const clamp = (n: number) => Math.max(0, Math.min(100, n))
  return { total: total > 0 ? clamp(100 * (1 - idle / total)) : 0, max: clamp(max) }
}

let lastNet: { rx: number; tx: number; at: number } | null = null
const WRAP = 2 ** 32 // os contadores do netstat são de 32 bits e voltam a zero

function netstat(): Promise<{ rx: number; tx: number } | null> {
  return new Promise((resolve) => execFile('netstat', ['-e'], { windowsHide: true, timeout: 3000 }, (err, out) => {
    const m = !err && /^Bytes\s+(\d+)\s+(\d+)/m.exec(out)
    resolve(m ? { rx: Number(m[1]), tx: Number(m[2]) } : null)
  }))
}

async function netSpeed(): Promise<{ down: number; up: number }> {
  const n = await netstat(); const at = Date.now()
  if (!n) return { down: 0, up: 0 }
  const prev = lastNet; lastNet = { ...n, at }
  if (!prev) return { down: 0, up: 0 }
  const secs = (at - prev.at) / 1000; const diff = (a: number, b: number) => (a - b + WRAP) % WRAP
  return { down: diff(n.rx, prev.rx) / secs, up: diff(n.tx, prev.tx) / secs }
}

interface LhmNode { Text: string; Value?: string; ImageURL?: string; SensorId?: string; Children?: LhmNode[]; Xodo?: string; Admin?: boolean }

/** "45,3 °C", "1.234,5 W" ou "12.5 %" -> número. */
export function lhmNumber(v?: string): number | null {
  const m = v && /-?[\d.,]+/.exec(v); if (!m) return null
  let s = m[0]
  if (s.includes('.') && s.includes(',')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else s = s.replace(',', '.')
  const n = Number(s); return Number.isFinite(n) ? n : null
}

function hardware(root: LhmNode): LhmNode[] {
  const out: LhmNode[] = []
  const walk = (n: LhmNode) => { if (n.ImageURL && /images_icon\/(cpu|ati|amd|nvidia|intel)/i.test(n.ImageURL)) out.push(n); n.Children?.forEach(walk) }
  walk(root); return out
}

/** Sensor do grupo (Load, Temperatures, Powers) cujo nome casa com a primeira preferência que existir. */
function pick(hw: LhmNode | undefined, group: string, prefer: RegExp[]): number | null {
  const sensors = hw?.Children?.find((g) => g.Text.startsWith(group))?.Children ?? []
  for (const re of prefer) { const s = sensors.find((x) => re.test(x.Text)); if (s) return lhmNumber(s.Value) }
  return sensors.length ? lhmNumber(sensors[0].Value) : null
}

/** Só o sensor com o nome pedido (sem cair no primeiro do grupo), procurando em vários grupos. */
function exact(hw: LhmNode | undefined, groups: string[], name: RegExp): number | null {
  for (const g of hw?.Children ?? []) if (groups.some((p) => g.Text.startsWith(p))) {
    const s = g.Children?.find((x) => name.test(x.Text)); if (s) return lhmNumber(s.Value)
  }
  return null
}

export interface Lhm {
  cpuName?: string; gpuName?: string; cpuLoad: number | null; cpuTemp: number | null; cpuPower: number | null; gpuLoad: number | null; gpuTemp: number | null; gpuPower: number | null
  vramUsed: number | null; vramTotal: number | null; fps: number | null
}

export function parseLhm(root: LhmNode): Lhm {
  const hw = hardware(root)
  const cpu = hw.find((h) => /cpu\.png/i.test(h.ImageURL ?? ''))
  const gpu = hw.find((h) => /(ati|amd|nvidia)\.png/i.test(h.ImageURL ?? '')) ?? hw.find((h) => h !== cpu)
  return {
    cpuName: cpu?.Text, gpuName: gpu?.Text,
    cpuLoad: pick(cpu, 'Load', [/CPU Total/i]),
    cpuTemp: pick(cpu, 'Temp', [/Tctl|Tdie/i, /Package/i, /Core Average/i, /Core Max/i]),
    cpuPower: pick(cpu, 'Power', [/Package/i]),
    gpuLoad: pick(gpu, 'Load', [/GPU Core/i, /D3D 3D/i]),
    gpuTemp: pick(gpu, 'Temp', [/GPU Core/i, /Edge/i]),
    gpuPower: pick(gpu, 'Power', [/Package/i, /GPU Power/i, /Total/i, /GPU Core/i]),
    // MB. AMD põe em "Data", NVIDIA em "SmallData".
    vramUsed: exact(gpu, ['Data', 'SmallData'], /^GPU Memory Used$/i) ?? exact(gpu, ['Data', 'SmallData'], /^D3D Dedicated Memory Used$/i),
    vramTotal: exact(gpu, ['Data', 'SmallData'], /^GPU Memory Total$/i) ?? exact(gpu, ['Data', 'SmallData'], /^D3D Dedicated Memory Total$/i),
    // Driver AMD: FPS do jogo em tela cheia (0 fora de tela cheia).
    fps: ((v) => (v && v > 0 ? v : null))(exact(gpu, ['Factors'], /Fullscreen FPS/i)),
  }
}

/** Última resposta inteira dos sensores (discos e outros sensores são lidos dela sob demanda, sem nova leitura). */
let lastRoot: LhmNode | null = null
let lastParsed: Lhm | null = null
export const lastLhmRoot = () => lastRoot

export const HELPER_URL = 'http://127.0.0.1:47085/data.json'

/** De onde vêm os sensores agora (para os Ajustes explicarem o que falta). */
export function sensorSource() {
  const source = !lastRoot ? null : lastRoot.Xodo ? 'xodo' as const : 'lhm' as const
  return { source, admin: source === 'xodo' ? !!lastRoot?.Admin : null, cpuTemp: lastParsed?.cpuTemp != null }
}

async function fetchRoot(url: string): Promise<LhmNode | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) })
    return res.ok ? await res.json() as LhmNode : null
  } catch { return null }
}

/** Leitor do Xodó primeiro; sem ele (porta fechada responde na hora), o LibreHardwareMonitor. */
async function lhm(url: string): Promise<Lhm | null> {
  lastRoot = await fetchRoot(HELPER_URL) ?? (url && url !== HELPER_URL ? await fetchRoot(url) : null)
  lastParsed = lastRoot ? parseLhm(lastRoot) : null
  return lastParsed
}

/** Nome da placa de vídeo pelo Windows (para quando não há sensores). Lido uma vez. */
let gpuName = 'GPU'
execFile('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch "Basic|Virtual|Remote" } | Select-Object -First 1).Name'],
  { windowsHide: true, timeout: 15_000 }, (err, out) => { if (!err && out.trim()) gpuName = out.trim() })

export async function readStatus(lhmUrl: string): Promise<RawStatus> {
  const [net, l] = await Promise.all([netSpeed(), lhm(lhmUrl)])
  const load = cpuLoad()
  return {
    time: Date.now(),
    cpu: { name: l?.cpuName ?? os.cpus()[0]?.model.trim() ?? 'CPU', load: l?.cpuLoad ?? load.total, temp: l?.cpuTemp ?? null, power: l?.cpuPower ?? null, coreMax: load.max },
    gpu: { name: l?.gpuName ?? gpuName, load: l?.gpuLoad ?? null, temp: l?.gpuTemp ?? null, power: l?.gpuPower ?? null, vramUsed: l?.vramUsed ?? null, vramTotal: l?.vramTotal ?? null, fps: l?.fps ?? null },
    ram: { used: os.totalmem() - os.freemem(), total: os.totalmem() },
    net, lhm: !!l,
  }
}
