// Formatação em pt-BR e faixas de temperatura.

const nf = (digits: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export function bytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${nf(i >= 3 ? 1 : 0).format(n)} ${units[i]}`
}

/** bytes/s -> "12,3 Mb/s" (bits, como as operadoras anunciam) */
export const rate = (bps: number) => `${nf(1).format((bps * 8) / 1e6)} Mb/s`
export const num = (n: number, digits = 0) => nf(digits).format(n)
export const pct = (n: number | null) => (n == null ? '–' : `${Math.round(n)}%`)
export const temp = (n: number | null) => (n == null ? '–' : `${Math.round(n)} °C`)
export const watts = (n: number | null) => (n == null ? '–' : `${Math.round(n)} W`)
export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const dateTime = (t: number) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
export const shortDate = (t: number | string) => new Date(typeof t === 'string' ? t + 'T12:00' : t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

/**
 * Marcas do eixo do tempo em horas redondas (a cada `hours`) ou dias à meia-noite (24).
 * Sem elas, o recharts com scale="time" põe uma marca em cada ponto e as datas se sobrepõem.
 */
export function timeTicks(first: number, last: number, hours: number): number[] {
  const d = new Date(first); d.setMinutes(0, 0, 0)
  d.setHours(hours >= 24 ? 24 : Math.floor(d.getHours() / hours) * hours + hours) // próxima marca depois do primeiro ponto
  const out: number[] = []
  for (; d.getTime() <= last; hours >= 24 ? d.setDate(d.getDate() + 1) : d.setHours(d.getHours() + hours)) out.push(d.getTime())
  return out.length >= 2 ? out : [first, last] // tudo no mesmo dia: sem meia-noite no meio, marca as pontas
}

export function duration(ms: number): string {
  const m = Math.round(ms / 60000); const h = Math.floor(m / 60)
  return h ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`
}

export type Level = 'good' | 'warning' | 'serious' | 'critical'
const LABEL: Record<Level, string> = { good: 'normal', warning: 'quente', serious: 'muito quente', critical: 'crítico' }

/** Faixas para CPU e GPU de desktop. Ryzen 5000 e Radeon 6000 aguentam até ~90-95 °C, mas o ideal é bem abaixo. */
export function heat(t: number | null): { level: Level; label: string } | null {
  if (t == null) return null
  const level: Level = t < 70 ? 'good' : t < 80 ? 'warning' : t < 90 ? 'serious' : 'critical'
  return { level, label: LABEL[level] }
}
