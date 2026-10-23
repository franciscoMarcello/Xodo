import { useCallback, useState } from 'react'
import { useLoad } from '../hooks'
import { Tile } from '../components'
import type { CrashKind } from '../../../shared/types'

const RANGES = [7, 30, 90]
const KIND: Record<CrashKind, string> = { shutdown: 'Desligamentos', bluescreen: 'Telas azuis', hardware: 'Erros de hardware', 'gpu-reset': 'Driver de vídeo', 'app-crash': 'Programas fecharam', 'app-hang': 'Programas travaram', disk: 'Erros de disco' }
const ICON: Record<CrashKind, string> = { shutdown: '⏻', bluescreen: '■', hardware: '⚙', 'gpu-reset': '▣', 'app-crash': '✕', 'app-hang': '⌛', disk: '◉' }
const LEVEL = { critical: ['crítico', 'critical'], serious: ['sério', 'serious'], warning: ['atenção', 'warning'], info: ['info', 'good'] } as const

export default function CrashesPage() {
  const [days, setDays] = useState(30)
  const v = useLoad(useCallback(() => window.api.crashes(days), [days]))
  const [all, setAll] = useState(false)
  const d = v.data

  return (
    <>
      <h1>Travamentos</h1>
      <p className="sub">Desligamentos inesperados, telas azuis, erros de hardware e programas que fecharam, lidos do registro do Windows e cruzados com a temperatura e o jogo de cada momento.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        {RANGES.map((r) => <button key={r} className={`btn${r === days ? ' primary' : ''}`} onClick={() => setDays(r)}>{r} dias</button>)}
        {v.loading && <span className="muted small">Lendo o registro de eventos…</span>}
      </div>
      {v.error && <p className="err-text">{v.error}</p>}
      {d && (
        <>
          <div className="grid">
            {(['shutdown', 'bluescreen', 'hardware', 'gpu-reset', 'app-crash'] as CrashKind[]).map((k) => (
              <Tile key={k} label={KIND[k]} value={<span className={d.counts[k] ? (k === 'app-crash' ? '' : 'lv-serious') : 'ok-text'}>{d.counts[k] ?? 0}</span>} />
            ))}
          </div>

          {d.advice.length === 0 ? (
            <div className="card"><span className="ok-text">● Nada preocupante nos últimos {d.days} dias.</span></div>
          ) : d.advice.map((a) => {
            const [label, level] = LEVEL[a.level]
            return (
              <div key={a.id} className="card" style={{ borderLeft: `3px solid var(--${level})` }}>
                <div className="row"><span className={`badge lv-${level}`}>{label}</span><b style={{ fontSize: 16 }}>{a.title}</b></div>
                <p style={{ margin: '8px 0', color: 'var(--ink-2)' }}><span className="muted">Por quê:</span> {a.why}</p>
                {a.steps.length > 0 && <><div className="muted small">O que fazer:</div><ol className="steps">{a.steps.map((s) => <li key={s}>{s}</li>)}</ol></>}
              </div>
            )
          })}

          <div className="card">
            <h2>Linha do tempo</h2>
            {d.events.length === 0 ? <p className="muted">Nenhum evento.</p> : (
              <>
                <table>
                  <thead><tr><th style={{ width: 140 }}>Quando</th><th>O que aconteceu</th><th style={{ width: 210 }}>Naquele momento</th></tr></thead>
                  <tbody>{(all ? d.events : d.events.slice(0, 40)).map((e, i) => (
                    <tr key={e.time + e.title + i}>
                      <td className="mono small">{new Date(e.time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td><b>{ICON[e.kind]} {e.title}</b>{e.code && <span className="muted small"> · {e.code}</span>}<div className="small" style={{ color: 'var(--ink-2)' }}>{e.explain}</div></td>
                      <td className="small muted">{e.context.cpuTemp != null || e.context.gpuTemp != null ? <>CPU {e.context.cpuTemp != null ? `${Math.round(e.context.cpuTemp)} °C` : '–'} · GPU {e.context.gpuTemp != null ? `${Math.round(e.context.gpuTemp)} °C` : '–'}</> : 'Sem histórico dessa hora'}{e.context.game && <div className="ok-text">🎮 {e.context.game}</div>}</td>
                    </tr>
                  ))}</tbody>
                </table>
                {!all && d.events.length > 40 && <button className="btn small" style={{ marginTop: 10 }} onClick={() => setAll(true)}>Mostrar todos ({d.events.length})</button>}
              </>
            )}
            <p className="muted small" style={{ marginBottom: 0 }}>A temperatura do momento só existe a partir de quando o painel começou a gravar o histórico.</p>
          </div>
        </>
      )}
    </>
  )
}
