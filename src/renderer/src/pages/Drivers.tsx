import { useCallback, useState } from 'react'
import { message, useLoad } from '../hooks'
import type { DriversView } from '../../../shared/types'

const date = (iso: string | null) => (iso ? new Date(iso + 'T12:00').toLocaleDateString('pt-BR') : '–')
const age = (iso: string | null) => {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso + 'T12:00').getTime()) / 86_400_000)
  return days < 60 ? `${days} dias` : days < 730 ? `${Math.round(days / 30)} meses` : `${Math.round(days / 365)} anos`
}
const CLASS: Record<string, string> = { DISPLAY: 'Vídeo', NET: 'Rede', MEDIA: 'Áudio', SYSTEM: 'Sistema / chipset', HDC: 'Armazenamento', SCSIADAPTER: 'Armazenamento', USB: 'USB', BLUETOOTH: 'Bluetooth' }

export default function DriversPage() {
  const v = useLoad(useCallback(() => window.api.drivers(), []))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function check() {
    setBusy(true); setErr(null)
    try { v.setData(await window.api.checkDrivers()) } catch (e) { setErr(message(e)) } finally { setBusy(false) }
  }
  if (!v.data) return <><h1>Drivers</h1><p className="muted">Carregando…</p></>
  const d: DriversView = v.data
  const newer = d.updates.filter((u) => u.newer), older = d.updates.filter((u) => !u.newer)
  const g = d.gpu

  return (
    <>
      <div className="row between">
        <div><h1>Drivers</h1><p className="sub" style={{ marginBottom: 0 }}>
          {d.checked ? `Verificado em ${new Date(d.checked).toLocaleString('pt-BR')}. ` : 'Ainda não verificado. '}O painel verifica sozinho 1 vez por dia (fora de jogos) e avisa em Alertas.
        </p></div>
        <button className="btn primary" onClick={check} disabled={busy || d.checking}>{busy || d.checking ? 'Verificando… (~15 s)' : 'Verificar agora'}</button>
      </div>
      {(err || d.error) && <p className="err-text small">{err ?? d.error}</p>}

      {g && (
        <div className="card" style={{ marginTop: 16, borderLeft: `3px solid var(--${g.latest && g.installed ? (g.latest === g.installed ? 'good' : 'warning') : 'border'})` }}>
          <div className="row between">
            <h2 style={{ margin: 0 }}>Placa de vídeo: {g.name}</h2>
            <button className="btn small" onClick={() => window.api.openLink(g.link)}>{g.vendor === 'amd' ? 'Página da AMD' : g.vendor === 'nvidia' ? 'Página da NVIDIA' : g.vendor === 'intel' ? 'Página da Intel' : 'Windows Update'}</button>
          </div>
          <table className="kv" style={{ marginTop: 10 }}><tbody>
            <tr><th>Instalado</th><td>{g.installed ?? '–'}{g.vendor === 'amd' && g.installed && <span className="muted"> (AMD Software: Adrenalin)</span>}</td></tr>
            <tr><th>Mais novo</th><td>{g.latest ? <>{g.latest} <span className="muted">de {date(g.latestDate)}</span></> : g.vendor === 'amd' ? <span className="muted">Não consegui ler a página da AMD.</span> : <span className="muted">Para {g.vendor === 'nvidia' ? 'NVIDIA' : 'Intel'}, confira pelo botão (o painel só lê o site da AMD).</span>}</td></tr>
            <tr><th>Situação</th><td>{g.latest && g.installed ? (g.latest === g.installed ? <span className="ok-text">● Em dia</span> : <span className="lv-warning">● Tem versão nova</span>) : '–'}</td></tr>
          </tbody></table>
        </div>
      )}

      <div className="card">
        <h2>Drivers novos</h2>
        {!d.checked ? <p className="muted">Clique em "Verificar agora".</p> : newer.length === 0 ? <p className="ok-text" style={{ margin: 0 }}>● Nenhum driver mais novo que os instalados.</p> : (
          <>
            <table>
              <thead><tr><th>Dispositivo</th><th>Instalado</th><th>Disponível</th><th className="num">Tamanho</th><th /></tr></thead>
              <tbody>{newer.map((u) => (
                <tr key={u.title}>
                  <td><b>{u.device}</b><div className="muted small">{u.source === 'amd' ? 'Site da AMD' : 'Windows Update'}</div></td>
                  <td>{u.current ?? '–'}<div className="muted small">{date(u.currentDate)}</div></td>
                  <td>{u.available}<div className="muted small">{date(u.availableDate)}</div></td>
                  <td className="num">{u.size ?? '–'}</td>
                  <td className="num">{u.source === 'amd' && u.link ? <button className="btn small primary" onClick={() => window.api.openLink(u.link!)}>Baixar</button> : <button className="btn small primary" onClick={() => window.api.openWindowsUpdate()}>Abrir Windows Update</button>}</td>
                </tr>
              ))}</tbody>
            </table>
            <p className="muted small" style={{ marginBottom: 0 }}>O painel não instala nada sozinho: drivers precisam de administrador e às vezes reiniciar o PC.</p>
          </>
        )}
      </div>

      {older.length > 0 && (
        <div className="card">
          <h2>Oferecidos pelo Windows Update, mas não precisa</h2>
          <p className="muted small" style={{ marginTop: -6 }}>O Windows Update às vezes oferece drivers mais antigos que os instalados (ou sem como comparar). Esses não viram alerta.</p>
          <table><tbody>{older.map((u) => <tr key={u.title}><td>{u.title}</td><td className="muted">{u.current ? `instalado ${u.current} (${date(u.currentDate)})` : 'sem driver instalado para comparar'}</td><td className="num muted">{date(u.availableDate)}</td></tr>)}</tbody></table>
        </div>
      )}

      {d.installed.length > 0 && (
        <div className="card">
          <h2>Drivers instalados (dos fabricantes)</h2>
          <table>
            <thead><tr><th>Dispositivo</th><th>Tipo</th><th>Fabricante</th><th>Versão</th><th className="num">Data</th></tr></thead>
            <tbody>{[...d.installed].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).map((x, i) => (
              <tr key={x.device + i}><td>{x.device}</td><td className="muted">{CLASS[x.cls] ?? x.cls}</td><td className="muted">{x.provider}</td><td className="mono">{x.version}</td><td className="num">{date(x.date)} <span className="muted small">({age(x.date)})</span></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  )
}
