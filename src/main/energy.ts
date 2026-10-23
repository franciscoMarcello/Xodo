import type { EnergyDay, EnergySummary, Settings, RawStatus } from '../shared/types'
import { readJson, writeJson } from './store'

// Estimativa do consumo do PC enquanto o app está aberto. CPU e GPU vêm dos sensores de potência do
// LibreHardwareMonitor quando há; sem eles, são estimadas pelo uso. O resto (placa-mãe, SSD, fans) é fixo nos ajustes.

const FILE = 'energy.json'
/** Eficiência típica de uma fonte 80 Plus Bronze/Gold: a tomada entrega um pouco mais do que o PC consome. */
const PSU_EFFICIENCY = 0.87

type Days = Record<string, { wh: number; seconds: number }>
let days: Days | null = null
let last = 0
let dirty = false

const load = () => (days ??= readJson<Days>(FILE, {}))
export const localDate = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export function estimateWatts(s: RawStatus, e: Settings['energy']): number {
  const cpu = s.cpu.power ?? e.cpuTdp * (0.2 + 0.8 * (s.cpu.load ?? 0) / 100)
  const gpu = s.gpu.power ?? e.gpuWatts * (0.1 + 0.9 * (s.gpu.load ?? 0) / 100)
  return Math.round((cpu + gpu + e.baseWatts) / PSU_EFFICIENCY + e.monitorWatts)
}

/** Soma watts x tempo desde a última amostra. Intervalos longos (PC suspenso) não contam. */
export function recordEnergy(watts: number, now = Date.now()) {
  const dt = last ? (now - last) / 1000 : 0; last = now
  if (dt <= 0 || dt > 15) return
  const d = load(); const day = (d[localDate(now)] ??= { wh: 0, seconds: 0 })
  day.wh += (watts * dt) / 3600; day.seconds += dt; dirty = true
}

export function flushEnergy() { if (dirty && days) { writeJson(FILE, days); dirty = false } }

export function energySummary(tariff: number): EnergySummary {
  const d = load(); const today = localDate(); const month = today.slice(0, 7)
  const list: EnergyDay[] = Object.entries(d).map(([date, v]) => ({ date, wh: v.wh, seconds: Math.round(v.seconds) })).sort((a, b) => a.date.localeCompare(b.date))
  const monthWh = list.filter((x) => x.date.startsWith(month)).reduce((a, x) => a + x.wh, 0)
  const now = new Date(); const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const elapsed = now.getDate() - 1 + (now.getHours() * 60 + now.getMinutes()) / 1440
  return { days: list.slice(-31), tariff, todayWh: d[today]?.wh ?? 0, monthWh, projectionWh: elapsed > 0.5 ? (monthWh / elapsed) * daysInMonth : monthWh }
}
