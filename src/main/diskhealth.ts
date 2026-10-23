import type { DiskHealth } from '../shared/types'

// Saúde dos discos (SSD/NVMe/HD) a partir dos dados S.M.A.R.T. que o LibreHardwareMonitor já manda junto com os
// outros sensores. Puro (só tipos), com testes.

export interface Node { Text: string; Value?: string; ImageURL?: string; Children?: Node[] }

/** "45,3 °C", "21621,0 GB" -> número. */
export function num(v?: string): number | null {
  const m = v && /-?[\d.,]+/.exec(v); if (!m) return null
  let s = m[0]
  if (s.includes('.') && s.includes(',')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else s = s.replace(',', '.')
  const n = Number(s); return Number.isFinite(n) ? n : null
}

function sensor(hw: Node, re: RegExp): number | null {
  for (const g of hw.Children ?? []) for (const s of g.Children ?? []) if (re.test(s.Text)) return num(s.Value)
  return null
}

export function parseDisks(root: Node | null): Omit<DiskHealth, 'status' | 'notes'>[] {
  if (!root) return []
  const out: Node[] = []
  const walk = (n: Node) => { if (/images_icon\/hdd\.png/i.test(n.ImageURL ?? '')) out.push(n); n.Children?.forEach(walk) }
  walk(root)
  return out.map((hw) => {
    const nvme = sensor(hw, /^Percentage Used$/i) != null || sensor(hw, /^Composite Temperature$/i) != null
    const life = sensor(hw, /^(Life|Remaining Life)$/i)
    return {
      name: hw.Text.trim(), kind: nvme ? 'nvme' : life != null ? 'ssd' : 'hdd', life,
      temp: sensor(hw, /^(Composite Temperature|Temperature)$/i), tempWarn: sensor(hw, /^Warning Temperature$/i), tempCrit: sensor(hw, /^Critical Temperature$/i),
      hours: sensor(hw, /^Power On Hours$/i), cycles: sensor(hw, /^Power On Count$/i), writtenGB: sensor(hw, /^Data Written$/i), readGB: sensor(hw, /^Data Read$/i),
      usedPct: sensor(hw, /^Used Space$/i), spare: sensor(hw, /^Available Spare$/i), spareMin: sensor(hw, /^Available Spare Threshold$/i),
    }
  })
}

/** Situação de cada disco com explicação. ok / warning / serious / critical. */
export function evaluateDisk(d: Omit<DiskHealth, 'status' | 'notes'>): DiskHealth {
  const notes: string[] = []; let status: DiskHealth['status'] = 'ok'
  const worse = (s: DiskHealth['status']) => { const o = ['ok', 'warning', 'serious', 'critical']; if (o.indexOf(s) > o.indexOf(status)) status = s }
  if (d.life != null) {
    if (d.life < 10) { worse('critical'); notes.push(`Só ${d.life}% de vida. Faça backup agora e troque o disco.`) }
    else if (d.life < 20) { worse('serious'); notes.push(`${d.life}% de vida: planeje a troca e mantenha backup em dia.`) }
    else if (d.life < 50) { worse('warning'); notes.push(`${d.life}% de vida: tudo bem por enquanto, mas já gastou mais da metade.`) }
    else notes.push(`${d.life}% de vida${d.hours ? ` depois de ${Math.round(d.hours).toLocaleString('pt-BR')} h ligado` : ''}.`)
  }
  if (d.spare != null && d.spareMin != null && d.spare <= d.spareMin) { worse('critical'); notes.push('A reserva de células do SSD acabou: ele pode virar só leitura a qualquer momento. Backup já.') }
  if (d.temp != null) {
    const limit = d.tempWarn ?? (d.kind === 'hdd' ? 50 : d.kind === 'ssd' ? 60 : 70)
    if (d.temp >= (d.tempCrit ?? limit + 10)) { worse('serious'); notes.push(`${Math.round(d.temp)} °C: perto do limite, ele reduz a velocidade para não queimar. Melhore a ventilação.`) }
    else if (d.temp >= limit) { worse('warning'); notes.push(`${Math.round(d.temp)} °C: quente. ${d.kind === 'nvme' ? 'Um dissipador no NVMe resolve.' : 'Veja se ele está no fluxo de ar do gabinete.'}`) }
  }
  if (d.usedPct != null && d.usedPct >= 90) { worse('warning'); notes.push(`${Math.round(d.usedPct)}% cheio: SSDs muito cheios ficam mais lentos e gastam mais rápido.`) }
  if (d.kind === 'hdd' && d.life == null) notes.push('HD: o sensor não informa desgaste; acompanhe pela temperatura e pela "saúde" do Windows.')
  return { ...d, status, notes }
}

export const diskHealth = (root: Node | null) => parseDisks(root).map(evaluateDisk)
