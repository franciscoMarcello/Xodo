import { useCallback, useState } from 'react'
import type { Go } from '../App'
import { message, useLoad } from '../hooks'
import type { OptAction, OptCheck, OptimizeView, StartupItem } from '../../../shared/types'

const STATUS: Record<OptCheck['status'], [string, string]> = { warn: ['resolver', 'serious'], tip: ['dica', 'warning'], ok: ['ok', 'good'] }
/** Ações com caminho de volta (o botão "Desfazer" chama a contrária). */
const UNDO: Partial<Record<OptAction, OptAction>> = { 'enable-game-mode': 'disable-game-mode', 'disable-bg-recording': 'enable-bg-recording' }
const BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e'

type Done = { text: string; undo?: () => Promise<OptimizeView> }

function Check({ c, run }: { c: OptCheck; run: (k: OptAction, label: string) => void }) {
  const [label, level] = STATUS[c.status]
  return (
    <div className="card" style={{ borderLeft: `3px solid var(--${level})` }}>
      <div className="row between">
        <div className="row"><span className={`badge lv-${level}`}>{label}</span><b>{c.title}</b></div>
        {c.gain && <span className="muted small">Ganho: {c.gain}</span>}
      </div>
      <p style={{ margin: '8px 0', color: 'var(--ink-2)' }}>{c.summary}</p>
      {c.steps && <ol className="steps">{c.steps.map((s) => <li key={s}>{s}</li>)}</ol>}
      {c.action && <button className="btn small primary" onClick={() => run(c.action!.kind, c.action!.label)}>{c.action.label}</button>}
    </div>
  )
}

export default function OptimizePage({ go }: { go: Go }) {
  const v = useLoad(useCallback(() => window.api.optimize(), []))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [showOk, setShowOk] = useState(false)

  async function apply(fn: () => Promise<OptimizeView>, d?: Done) {
    setBusy(true); setErr(null)
    try { v.setData(await fn()); if (d) setDone(d) } catch (e) { setErr(message(e)) } finally { setBusy(false) }
  }
  function run(kind: OptAction, label: string) {
    if (kind === 'open-disk-page') return go('disk')
    if (kind === 'clear-shader-cache' && !confirm('Limpar o cache de shaders? Na primeira vez que cada jogo abrir, ele recompila (pode travar um pouco no começo).')) return
    const back = UNDO[kind]
    apply(() => window.api.optAction(kind), kind.startsWith('open-') ? undefined : { text: label, undo: back ? () => window.api.optAction(back) : undefined })
  }
  function toggle(i: StartupItem) {
    apply(() => window.api.setStartup(i.name, i.source, !i.enabled), { text: `${i.enabled ? 'Desligado' : 'Ligado'} na inicialização: ${i.name}`, undo: () => window.api.setStartup(i.name, i.source, i.enabled) })
  }
  function plan(guid: string, name: string) {
    const before = v.data!.plans.find((p) => p.active)
    apply(() => window.api.setPowerPlan(guid), { text: `Plano de energia: ${name}`, undo: before ? () => window.api.setPowerPlan(before.guid) : undefined })
  }

  if (v.error) return <><h1>Otimizar</h1><p className="err-text">{v.error}</p></>
  if (!v.data) return <><h1>Otimizar</h1><p className="muted">Checando as configurações do PC…</p></>
  const d = v.data
  const todo = d.checks.filter((c) => c.status !== 'ok'), ok = d.checks.filter((c) => c.status === 'ok')
  const warn = todo.filter((c) => c.status === 'warn').length

  return (
    <>
      <div className="row between">
        <div><h1>Otimizar</h1><p className="sub" style={{ marginBottom: 0 }}>
          {warn ? `${warn} para resolver, ` : ''}{todo.length - warn} {todo.length - warn === 1 ? 'dica' : 'dicas'}, {ok.length} ok. O painel só muda configurações do seu usuário, sempre com "Desfazer"; o resto é passo a passo.
        </p></div>
        <button className="btn" onClick={() => apply(() => window.api.optimize())} disabled={busy}>{busy ? 'Aplicando…' : 'Checar de novo'}</button>
      </div>
      {(done || err) && (
        <div className={`card undo-bar ${err ? 'err' : ''}`} style={{ marginTop: 14 }}>
          {err ? <span className="err-text">{err}</span> : <>
            <span className="ok-text">✓ {done!.text}</span>
            {done!.undo && <button className="btn small" disabled={busy} onClick={() => apply(done!.undo!, { text: 'Desfeito.' })}>Desfazer</button>}
            <button className="btn small" onClick={() => setDone(null)}>×</button>
          </>}
        </div>
      )}
      <div style={{ marginTop: 14 }}>{todo.map((c) => <Check key={c.id} c={c} run={run} />)}</div>

      <div className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>Abrem com o Windows</h2>
          <button className="btn small" onClick={() => run('open-task-manager', '')}>Abrir Gerenciador de Tarefas</button>
        </div>
        <p className="muted small">Desligar não desinstala: o programa só deixa de abrir sozinho. Os de "todos os usuários" precisam de administrador e são desligados pelo Gerenciador de Tarefas.</p>
        <table>
          <thead><tr><th>Programa</th><th>Observação</th><th>De quem</th><th className="num">Abre sozinho</th></tr></thead>
          <tbody>{d.startup.map((i) => (
            <tr key={i.source + i.name} style={{ opacity: i.enabled ? 1 : 0.55 }}>
              <td title={i.command}><b>{i.name.replace(/\.lnk$/i, '')}</b><div className="muted small path" style={{ maxWidth: 380 }}>{i.command}</div></td>
              <td>{i.flag ? <span className="lv-warning small">⚠ {i.flag}</span> : <span className="muted small">–</span>}</td>
              <td className="muted small">{i.canToggle ? 'Só você' : 'Todos os usuários'}</td>
              <td className="num">{i.canToggle
                ? <label className="switch"><input type="checkbox" checked={i.enabled} disabled={busy} onChange={() => toggle(i)} /> {i.enabled ? 'Sim' : 'Não'}</label>
                : <span className="muted small">{i.enabled ? 'Sim' : 'Não'} (Gerenciador)</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {d.plans.length > 0 && (
        <div className="card">
          <h2>Plano de energia</h2>
          <div className="row">{d.plans.map((p) => (
            <button key={p.guid} className={`btn${p.active ? ' primary' : ''}`} disabled={busy || p.active} onClick={() => plan(p.guid, p.name)}>
              {p.name}{p.guid === BALANCED && <span className="small"> · recomendado</span>}
            </button>
          ))}</div>
        </div>
      )}

      {ok.length > 0 && (
        <div className="card">
          <button className="btn small" onClick={() => setShowOk(!showOk)}>{showOk ? 'Esconder' : 'Mostrar'} o que já está certo ({ok.length})</button>
          {showOk && <table style={{ marginTop: 10 }}><tbody>{ok.map((c) => <tr key={c.id}><td style={{ width: 260 }}><span className="badge lv-good">ok</span> <b>{c.title}</b></td><td className="muted">{c.summary}</td></tr>)}</tbody></table>}
        </div>
      )}
    </>
  )
}
