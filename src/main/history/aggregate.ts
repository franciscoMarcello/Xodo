import type { HistPoint, Metric } from '../../shared/types'

// Cálculo do histórico: soma leituras em intervalos (minuto, hora) guardando média e máximo de cada medida.
// Puro (só tipos importados), para os testes rodarem direto no Node.

export const METRICS: Metric[] = ['cpu', 'cpuTemp', 'gpu', 'gpuTemp', 'ram', 'watts']

interface Cell { sum: number; n: number; max: number }

/** Acumulador de um intervalo. Leituras nulas (sem sensor) não entram na média. */
export class Acc {
  private cells = new Map<Metric, Cell>()
  add(m: Metric, avg: number | null, max: number | null = avg, weight = 1) {
    if (avg == null) return
    const c = this.cells.get(m) ?? { sum: 0, n: 0, max: -Infinity }
    c.sum += avg * weight; c.n += weight; c.max = Math.max(c.max, max ?? avg)
    this.cells.set(m, c)
  }
  get empty() { return this.cells.size === 0 }
  point(t: number): HistPoint {
    const p = { t } as HistPoint
    for (const m of METRICS) {
      const c = this.cells.get(m)
      p[m] = c ? round(c.sum / c.n) : null
      p[`${m}Max`] = c ? round(c.max) : null
    }
    return p
  }
}

const round = (n: number) => Math.round(n * 10) / 10

/**
 * Junta pontos em intervalos maiores (ex.: minutos em blocos de 5 min). Cada ponto pesa igual, e o máximo é o maior
 * máximo. `start` alinha os blocos (padrão: múltiplos do tamanho no horário local).
 */
export function aggregate(points: HistPoint[], bucketMs: number, offsetMs = new Date().getTimezoneOffset() * 60_000): HistPoint[] {
  const groups = new Map<number, Acc>()
  for (const p of points) {
    const key = Math.floor((p.t - offsetMs) / bucketMs) * bucketMs + offsetMs
    const acc = groups.get(key) ?? new Acc(); groups.set(key, acc)
    for (const m of METRICS) acc.add(m, p[m], p[`${m}Max`])
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([t, acc]) => acc.point(t))
}

/** Data local "AAAA-MM-DD" (nome do arquivo de minutos de cada dia). */
export const localDate = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
