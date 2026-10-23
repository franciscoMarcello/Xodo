import { useCallback, useEffect, useRef, useState } from 'react'
import type { Go } from '../App'
import { useLoad, useStatus } from '../hooks'
import type { Alert, AlertLevel } from '../../../shared/types'

export const LEVEL: Record<AlertLevel, string> = { warning: 'atenção', serious: 'sério', critical: 'crítico' }

export function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m} min`
  const h = Math.round(m / 60); return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`
}

export function AlertCard({ a, go, onChange, muted }: { a: Alert; go: Go; onChange: () => void; muted?: boolean }) {
  const act = a.action
  return (
    <div className="card alert" style={{ borderLeft: `3px solid var(--${a.level})` }}>
      <div className="row between">
        <div className="row"><span className={`badge lv-${a.level}`}>{LEVEL[a.level]}</span><b>{a.title}</b></div>
        <span className="muted small">{a.resolved ? `resolvido ${ago(a.resolved)}` : `desde ${ago(a.since)}`}</span>
      </div>
      <p style={{ margin: '8px 0 4px', color: 'var(--ink-2)', wordBreak: 'break-word' }}>{a.detail}</p>
      <p className="small" style={{ margin: '0 0 10px' }}><span className="muted">O que fazer:</span> {a.tip}</p>
      {!a.resolved && (
        <div className="row">
          {act && 'page' in act && <button className="btn small primary" onClick={() => go(act.page, 'query' in act ? act.query : undefined)}>{{ processes: 'Ver em Processos', disk: 'Abrir Disco e limpeza', internet: 'Abrir Internet', settings: 'Abrir Ajustes', drivers: 'Abrir Drivers' }[act.page]}</button>}
          {act && 'folder' in act && <button className="btn small primary" onClick={() => window.api.showInFolder(act.folder)}>Mostrar o arquivo</button>}
          {muted ? <button className="btn small" onClick={async () => { await window.api.unmuteAlert(a.id); onChange() }}>Voltar a avisar</button> : <>
            <button className="btn small" title="Some da lista até o problema passar. Se voltar depois, avisa de novo." onClick={async () => { await window.api.muteAlert(a.id, 0); onChange() }}>Ignorar desta vez</button>
            <button className="btn small" onClick={async () => { await window.api.muteAlert(a.id, 7); onChange() }}>Silenciar 7 dias</button>
          </>}
        </div>
      )}
    </div>
  )
}

export default function AlertsPage({ go }: { go: Go }) {
  const v = useLoad(useCallback(() => window.api.alerts(), []))
  const { status } = useStatus(1)
  const [showMuted, setShowMuted] = useState(false)
  // Recarrega quando o número de alertas muda (vem junto com o status, sem leitura extra) e a cada 30 s.
  const count = useRef<number | null>(null)
  useEffect(() => { if (status && status.alerts !== count.current) { count.current = status.alerts; v.reload() } }, [status, v])
  useEffect(() => { const t = setInterval(v.reload, 30_000); return () => clearInterval(t) }, [v.reload])
  if (!v.data) return <><h1>Alertas</h1><p className="muted">Carregando…</p></>
  const { open, muted, resolved, rules } = v.data

  return (
    <>
      <h1>Alertas</h1>
      <p className="sub">Coisas fora do normal no PC, verificadas com os dados que o painel já coleta (sem custo extra). Nada é fechado ou apagado sozinho.</p>
      {open.length === 0 ? <div className="card"><span className="ok-text">● Nada fora do normal agora.</span> <span className="muted small">Algumas regras só começam a valer depois de alguns minutos (ou horas) de dados.</span></div>
        : open.map((a) => <AlertCard key={a.id} a={a} go={go} onChange={v.reload} />)}
      {muted.length > 0 && (
        <div className="card">
          <button className="btn small" onClick={() => setShowMuted(!showMuted)}>{showMuted ? 'Esconder' : 'Mostrar'} silenciados ({muted.length})</button>
          {showMuted && <div style={{ marginTop: 12 }}>{muted.map((a) => <AlertCard key={a.id} a={a} go={go} onChange={v.reload} muted />)}</div>}
        </div>
      )}
      {resolved.length > 0 && (
        <div className="card">
          <h2>Resolvidos recentemente</h2>
          <table><tbody>{resolved.slice(0, 10).map((a) => (
            <tr key={a.id + a.resolved}><td><span className={`badge lv-${a.level}`}>{LEVEL[a.level]}</span></td><td>{a.title}</td><td className="num muted small">{ago(a.resolved!)}</td></tr>
          ))}</tbody></table>
        </div>
      )}
      <div className="card">
        <h2>O que o painel verifica</h2>
        <table><tbody>{rules.map((r) => <tr key={r.name}><td style={{ width: 200 }}><b>{r.name}</b></td><td className="muted">{r.check}</td></tr>)}</tbody></table>
      </div>
    </>
  )
}
