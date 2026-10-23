import type { ReactNode } from 'react'
import { heat } from './format'

export function Tile({ label, value, detail, name }: { label: string; value: ReactNode; detail?: ReactNode; name?: string }) {
  return (
    <div className="card tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {detail && <div className="detail">{detail}</div>}
      {name && <div className="name" title={name}>{name}</div>}
    </div>
  )
}

/** Temperatura com faixa: a cor sempre vem com o texto ("normal", "quente"...). */
export function Heat({ t }: { t: number | null }) {
  const h = heat(t)
  return h ? <span className={`badge lv-${h.level}`}>{Math.round(t!)} °C · {h.label}</span> : null
}

export function Meter({ value }: { value: number }) {
  return <div className={`meter ${value > 95 ? 'crit' : value > 85 ? 'warn' : ''}`}><div style={{ width: `${Math.min(100, value)}%` }} /></div>
}

/** Aviso para quando o LibreHardwareMonitor não está respondendo. */
export function LhmBanner({ onSettings }: { onSettings?: () => void }) {
  return (
    <div className="banner">
      <strong>Sem temperaturas, uso da GPU e potência</strong>
      <div className="muted small">O Windows não informa esses dados para programas comuns. Eles vêm do LibreHardwareMonitor (gratuito e de código aberto):</div>
      <ol className="small">
        <li>Abra o LibreHardwareMonitor <b>como administrador</b>.</li>
        <li>No menu <b>Options</b>, marque <b>Remote Web Server &gt; Run</b> (porta 8085).</li>
        <li>Opcional: em <b>Options</b>, marque <b>Start Minimized</b> e <b>Run On Windows Startup</b>.</li>
      </ol>
      {onSettings && <button className="btn small" style={{ marginTop: 8 }} onClick={onSettings}>Ver ajustes</button>}
    </div>
  )
}

export function ChartTip({ active, payload, label, fmt, labelFmt }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: unknown; fmt: (v: number) => string; labelFmt?: (l: unknown) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tip">
      <div className="t">{labelFmt ? labelFmt(label) : String(label)}</div>
      {payload.map((p) => <div key={p.name}><span style={{ color: p.color }}>■</span> {p.name}: <b>{fmt(p.value)}</b></div>)}
    </div>
  )
}

export function Legend({ items }: { items: [string, string][] }) {
  return <div className="legend">{items.map(([name, color]) => <span key={name}><i style={{ background: color }} />{name}</span>)}</div>
}
