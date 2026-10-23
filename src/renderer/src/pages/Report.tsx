import { useEffect, useState, type ReactNode } from 'react'
import { message } from '../hooks'
import { bytes, num } from '../format'
import type { AlertsView, CrashView, DiskHealth, DriversView, GameSession, HistView, MachineInfo, OptimizeView } from '../../../shared/types'

// Relatório completo: junta o que as outras telas mostram num documento só, para salvar em PDF (assistência técnica,
// venda do PC, ou só guardar o estado de hoje). Cada parte que falhar ao carregar só fica de fora.

interface Data { m?: MachineInfo; disks?: DiskHealth[]; crashes?: CrashView; hist?: HistView; drivers?: DriversView; opt?: OptimizeView; alerts?: AlertsView; games?: GameSession[] }

const S = ({ title, children }: { title: string; children: ReactNode }) => <div className="card"><h2>{title}</h2>{children}</div>
const KV = ({ rows }: { rows: [string, ReactNode][] }) => <table className="kv"><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
const LV = { ok: 'good', warning: 'warning', serious: 'serious', critical: 'critical', info: 'good', warn: 'serious', tip: 'warning' } as Record<string, string>

export default function ReportPage() {
  const [d, setD] = useState<Data | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const api = window.api
    Promise.allSettled([api.machine(), api.diskHealth(), api.crashes(30), api.history('7d'), api.drivers(), api.optimize(), api.alerts(), api.gameSessions()]).then((r) => {
      const v = <T,>(i: number) => (r[i].status === 'fulfilled' ? (r[i] as PromiseFulfilledResult<T>).value : undefined)
      setD({ m: v(0), disks: v(1), crashes: v(2), hist: v(3), drivers: v(4), opt: v(5), alerts: v(6), games: v(7) })
    })
  }, [])

  async function pdf() {
    setBusy(true); setErr(null)
    try { const t = new Date(); setSaved(await window.api.exportPdf(`Relatório do PC - ${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}.pdf`)) }
    catch (e) { setErr(message(e)) } finally { setBusy(false) }
  }

  if (!d) return <><h1>Relatório</h1><p className="muted">Juntando tudo (máquina, discos, travamentos, drivers…). Leva uns segundos.</p></>
  const m = d.m, pts = d.hist?.points ?? []
  const peak = (k: 'cpuTempMax' | 'gpuTempMax') => pts.reduce<number | null>((a, p) => (p[k] != null && (a == null || p[k]! > a) ? p[k]! : a), null)
  const idle = pts.filter((p) => p.cpu != null && p.cpu < 15 && p.cpuTemp != null)
  const idleT = idle.length ? idle.reduce((a, p) => a + p.cpuTemp!, 0) / idle.length : null
  const games = (d.games ?? []).filter((s) => s.end > Date.now() - 30 * 86_400_000)
  const byGame = Object.entries(games.reduce<Record<string, { ms: number; fps: number[] }>>((a, s) => { const g = (a[s.game] ??= { ms: 0, fps: [] }); g.ms += s.end - s.start; if (s.fpsAvg) g.fps.push(s.fpsAvg); return a }, {})).sort((a, b) => b[1].ms - a[1].ms)
  const todo = (d.opt?.checks ?? []).filter((c) => c.status !== 'ok')

  return (
    <>
      <div className="row between no-print">
        <div><h1>Relatório</h1><p className="sub" style={{ marginBottom: 0 }}>Tudo sobre o PC num documento só. Bom para levar a uma assistência técnica ou anexar na venda.</p></div>
        <button className="btn primary" onClick={pdf} disabled={busy}>{busy ? 'Gerando…' : 'Exportar PDF'}</button>
      </div>
      {(saved || err) && <div className="row no-print" style={{ margin: '10px 0' }}>{err ? <span className="err-text small">{err}</span> : <><span className="ok-text small">PDF salvo em {saved}</span><button className="btn small" onClick={() => window.api.openPath(saved!)}>Abrir</button></>}</div>}

      <div className="report-head" style={{ margin: '16px 0' }}>
        <div className="report-title">Relatório do PC</div>
        <div className="muted">Gerado pelo Xodó em {new Date().toLocaleString('pt-BR')}</div>
      </div>

      {m && <S title="Máquina"><KV rows={[
        ['Processador', `${m.cpu.name} (${m.cpu.cores} núcleos, ${m.cpu.threads} threads)`],
        ['Placa de vídeo', m.gpus.map((g) => `${g.name}${g.vram ? ` · ${bytes(g.vram)}` : ''} · driver ${g.driver}`).join('; ') || '–'],
        ['Memória', `${bytes(m.memory.total)} ${m.memory.modules[0]?.type ?? ''} a ${m.memory.modules[0]?.configured ?? '–'} MHz (${m.memory.modules.length} de ${m.memory.slots ?? '?'} encaixes)`],
        ['Placa-mãe', `${m.board.maker} ${m.board.model} · BIOS ${m.board.biosVersion} (${m.board.biosDate ? new Date(m.board.biosDate).toLocaleDateString('pt-BR') : '–'})`],
        ['Discos', m.disks.map((x) => `${x.name} (${bytes(x.size)} ${x.type}/${x.bus})`).join('; ')],
        ['Sistema', `${m.os.name} ${m.os.release} (build ${m.os.build})`],
      ]} /></S>}

      <S title="Situação geral"><KV rows={[
        ['Alertas abertos', d.alerts ? (d.alerts.open.length ? d.alerts.open.map((a) => a.title).join('; ') : 'Nenhum') : '–'],
        ['Para resolver (Otimizar)', d.opt ? (todo.length ? todo.map((c) => c.title).join('; ') : 'Nada') : '–'],
        ['Travamentos (30 dias)', d.crashes ? (d.crashes.advice.length ? d.crashes.advice.map((a) => a.title).join('; ') : 'Nada preocupante') : '–'],
        ['Drivers', d.drivers?.gpu ? `${d.drivers.gpu.name}: instalado ${d.drivers.gpu.installed ?? '–'}, mais novo ${d.drivers.gpu.latest ?? '–'}${d.drivers.updates.filter((u) => u.newer).length ? ` · ${d.drivers.updates.filter((u) => u.newer).length} atualização(ões) disponível(is)` : ''}` : 'Não verificado'],
      ]} /></S>

      {!!d.disks?.length && <S title="Saúde dos discos">
        <table><thead><tr><th>Disco</th><th>Vida</th><th>Temperatura</th><th className="num">Horas ligado</th><th className="num">Gravado</th><th>Situação</th></tr></thead>
          <tbody>{d.disks.map((x) => <tr key={x.name}><td>{x.name}</td><td>{x.life != null ? `${x.life}%` : '–'}</td><td>{x.temp != null ? `${Math.round(x.temp)} °C` : '–'}</td><td className="num">{x.hours != null ? num(x.hours) : '–'}</td><td className="num">{x.writtenGB != null ? `${num(x.writtenGB / 1024, 1)} TB` : '–'}</td><td><span className={`badge lv-${LV[x.status]}`}>{{ ok: 'saudável', warning: 'atenção', serious: 'sério', critical: 'crítico' }[x.status]}</span></td></tr>)}</tbody>
        </table></S>}

      {pts.length > 0 && <S title="Temperaturas (últimos 7 dias)"><KV rows={[
        ['CPU: máxima', peak('cpuTempMax') != null ? `${Math.round(peak('cpuTempMax')!)} °C` : '–'],
        ['CPU: média parada (uso < 15%)', idleT != null ? `${Math.round(idleT)} °C${idleT > 60 ? ' — alta (o normal é 35–50 °C)' : ''}` : '–'],
        ['GPU: máxima', peak('gpuTempMax') != null ? `${Math.round(peak('gpuTempMax')!)} °C` : '–'],
      ]} /></S>}

      {d.crashes && d.crashes.advice.length > 0 && <S title="Travamentos (últimos 30 dias)">
        {d.crashes.advice.map((a) => <div key={a.id} style={{ marginBottom: 10 }}><span className={`badge lv-${LV[a.level]}`}>{a.count}x</span> <b>{a.title}</b><div className="small" style={{ color: 'var(--ink-2)' }}>{a.why}</div>{a.steps.length > 0 && <ol className="steps">{a.steps.map((s) => <li key={s}>{s}</li>)}</ol>}</div>)}
      </S>}

      {todo.length > 0 && <S title="O que dá para melhorar">
        {todo.map((c) => <div key={c.id} style={{ marginBottom: 8 }}><span className={`badge lv-${LV[c.status]}`}>{c.status === 'warn' ? 'resolver' : 'dica'}</span> <b>{c.title}</b><div className="small" style={{ color: 'var(--ink-2)' }}>{c.summary}</div></div>)}
      </S>}

      {byGame.length > 0 && <S title="Jogos (últimos 30 dias)">
        <table><thead><tr><th>Jogo</th><th className="num">Tempo</th><th className="num">FPS médio</th></tr></thead>
          <tbody>{byGame.slice(0, 10).map(([g, v]) => <tr key={g}><td>{g}</td><td className="num">{num(v.ms / 3600_000, 1)} h</td><td className="num">{v.fps.length ? Math.round(v.fps.reduce((a, b) => a + b, 0) / v.fps.length) : '–'}</td></tr>)}</tbody>
        </table></S>}
    </>
  )
}
