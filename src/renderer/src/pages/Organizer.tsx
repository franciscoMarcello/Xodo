import { useCallback, useEffect, useState } from 'react'
import { message, useLoad, useSettings } from '../hooks'
import { dateTime } from '../format'
import type { OrganizerRule, Settings } from '../../../shared/types'

const fileName = (p: string) => p.split('\\').pop()

function Rules({ settings, save }: { settings: Settings; save: (s: Settings) => Promise<void> }) {
  const [rules, setRules] = useState<OrganizerRule[]>(settings.organizer.rules)
  const [saved, setSaved] = useState(false)
  useEffect(() => setRules(settings.organizer.rules), [settings])
  const set = (i: number, r: Partial<OrganizerRule>) => { setRules((l) => l.map((x, j) => (i === j ? { ...x, ...r } : x))); setSaved(false) }
  async function pick(i: number) { const f = await window.api.pickFolder(); if (f) set(i, { dest: f }) }
  async function store() {
    const clean = rules.filter((r) => r.name.trim() && r.dest.trim()).map((r) => ({ ...r, extensions: r.extensions.map((e) => e.trim().replace(/^\./, '').toLowerCase()).filter(Boolean) }))
    await save({ ...settings, organizer: { ...settings.organizer, rules: clean } }); setSaved(true)
  }
  return (
    <div className="card">
      <h2>Regras</h2>
      <table>
        <thead><tr><th>Nome</th><th>Extensões (separadas por vírgula)</th><th>Mover para</th><th /></tr></thead>
        <tbody>{rules.map((r, i) => (
          <tr key={i}>
            <td style={{ width: 150 }}><input type="text" value={r.name} onChange={(e) => set(i, { name: e.target.value })} style={{ width: '100%' }} /></td>
            <td style={{ width: '42%' }}><input type="text" value={r.extensions.join(', ')} onChange={(e) => set(i, { extensions: e.target.value.split(',') })} style={{ width: '100%' }} /></td>
            <td className="path" title={r.dest}><button className="btn small" onClick={() => pick(i)}>Escolher</button> <span className="muted small">{r.dest}</span></td>
            <td className="num"><button className="btn small danger" onClick={() => { setRules((l) => l.filter((_, j) => j !== i)); setSaved(false) }}>Remover</button></td>
          </tr>
        ))}</tbody>
      </table>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => { setRules((l) => [...l, { name: 'Nova regra', extensions: [], dest: settings.organizer.folder }]); setSaved(false) }}>Adicionar regra</button>
        <button className="btn primary" onClick={store}>Salvar regras</button>
        {saved && <span className="ok-text small">Salvo.</span>}
      </div>
    </div>
  )
}

export default function OrganizerPage() {
  const { settings, save } = useSettings()
  const log = useLoad(useCallback(() => window.api.organizerLog(), []))
  const [preview, setPreview] = useState<{ from: string; to: string; rule: string }[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { const t = setInterval(log.reload, 5000); return () => clearInterval(t) }, [log.reload])
  if (!settings) return null
  const o = settings.organizer

  async function toggle() { await save({ ...settings!, organizer: { ...o, enabled: !o.enabled } }) }
  async function pickFolder() { const f = await window.api.pickFolder(); if (f) await save({ ...settings!, organizer: { ...o, folder: f } }) }
  async function runNow() { const n = await window.api.organizerRunNow(); setPreview(null); setMsg(`${n} arquivo(s) organizados.`); log.reload() }
  async function undo(id: string) { setMsg(null); try { await window.api.organizerUndo(id); log.reload() } catch (e) { setMsg(message(e)) } }

  return (
    <>
      <h1>Organizador automático</h1>
      <p className="sub">Quando um arquivo novo chega na pasta, ele vai para a pasta da regra da extensão dele. Downloads em andamento e subpastas não são tocados.</p>
      <div className="card">
        <div className="row between">
          <label className="switch"><input type="checkbox" checked={o.enabled} onChange={toggle} /> <b>{o.enabled ? 'Ligado: organizando arquivos novos' : 'Desligado'}</b></label>
          <div className="row"><span className="muted small">Pasta vigiada: {o.folder}</span><button className="btn small" onClick={pickFolder}>Trocar</button></div>
        </div>
      </div>
      <Rules settings={settings} save={save} />
      <div className="card">
        <div className="row between"><div><h2 style={{ marginBottom: 4 }}>Arquivos que já estão lá</h2><span className="muted">O organizador só pega arquivos novos. Para arrumar os antigos, veja a prévia e confirme.</span></div>
          <button className="btn" onClick={async () => { setMsg(null); setPreview(await window.api.organizerPreview()) }}>Ver prévia</button></div>
        {preview && (preview.length === 0 ? <p className="muted">Nenhum arquivo solto com regra.</p> : (
          <>
            <table style={{ marginTop: 12 }}>
              <thead><tr><th>Arquivo</th><th>Regra</th></tr></thead>
              <tbody>{preview.slice(0, 200).map((p) => <tr key={p.from}><td className="path">{fileName(p.from)}</td><td>{p.rule}</td></tr>)}</tbody>
            </table>
            <div className="row" style={{ marginTop: 10 }}><button className="btn primary" onClick={runNow}>Mover {preview.length} arquivo(s)</button><button className="btn" onClick={() => setPreview(null)}>Cancelar</button></div>
          </>
        ))}
        {msg && <p className="small" style={{ marginBottom: 0 }}>{msg}</p>}
      </div>
      <div className="card">
        <h2>Histórico</h2>
        {!log.data?.length ? <p className="muted">Nenhum arquivo movido ainda.</p> : (
          <table>
            <thead><tr><th>Quando</th><th>Arquivo</th><th>Regra</th><th /></tr></thead>
            <tbody>{log.data.map((m) => (
              <tr key={m.id}>
                <td className="mono">{dateTime(m.time)}</td><td className="path" title={m.to}>{fileName(m.to)}</td><td>{m.rule}</td>
                <td className="num">{m.undone ? <span className="muted small">desfeito</span> : <><button className="btn small" onClick={() => window.api.showInFolder(m.to)}>Mostrar</button> <button className="btn small" onClick={() => undo(m.id)}>Desfazer</button></>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  )
}
