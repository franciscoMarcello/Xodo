import { useCallback, useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { message, useLoad, useSettings, useStatus } from '../hooks'
import { dateTime, duration, num, pct } from '../format'
import { ChartTip, Heat, Legend, Tile } from '../components'
import type { BottleneckKind, CanRun, CanRunVerdict, GameSession, LagView, PartCheck, PingStats, SteamGame } from '../../../shared/types'

const DAY = 86_400_000
type Tab = 'now' | 'canrun' | 'mode' | 'sessions'

export const BN_LABEL: Record<BottleneckKind, string> = { gpu: 'Placa de vídeo', cpu: 'Processador', vram: 'Memória de vídeo', ram: 'RAM', heat: 'Temperatura', capped: 'FPS limitado' }
const BN_LEVEL: Record<BottleneckKind, string> = { gpu: 'good', cpu: 'warning', vram: 'serious', ram: 'serious', heat: 'critical', capped: 'warning' }
const LEVEL_COLOR: Record<CanRunVerdict['level'], string> = { no: 'critical', low: 'serious', medium: 'warning', high: 'good', ultra: 'good', unknown: 'warning' }
const PART: Record<PartCheck['verdict'], [string, string]> = { below: ['Abaixo do mínimo', 'critical'], min: ['Entre o mínimo e o recomendado', 'warning'], rec: ['Atende o recomendado', 'good'], above: ['Com folga', 'good'], unknown: ['Sem como comparar', 'warning'] }

/** Gargalo que mais apareceu numa sessão. */
function mainBottleneck(s: GameSession): string {
  const e = Object.entries(s.bottlenecks ?? {}) as [BottleneckKind, number][]
  if (!e.length) return '–'
  const [k, sec] = e.sort((a, b) => b[1] - a[1])[0]; const total = e.reduce((a, [, v]) => a + v, 0)
  return `${BN_LABEL[k]} (${pct((100 * sec) / total)})`
}

// --- Agora ---

const LAG_LEVEL = { ok: 'good', wifi: 'serious', internet: 'serious', pc: 'warning', measuring: 'warning' } as const

/** "Lag: internet ou PC?" — mede durante jogos ou no teste de 30 s. */
function LagCard({ lag }: { lag: LagView | null }) {
  const p = (s: PingStats | null) => (s && s.avg != null ? `${Math.round(s.avg)} ms · variação ${Math.round(s.jitter ?? 0)} ms · ${s.loss}% perda` : '–')
  if (!lag) return (
    <div className="card row between">
      <div><b>Lag: internet ou PC?</b> <span className="muted small">Mede sozinho durante os jogos. Quer testar a rede agora?</span></div>
      <button className="btn small" onClick={() => window.api.lagTest(30)}>Testar agora (30 s)</button>
    </div>
  )
  const level = LAG_LEVEL[lag.who]
  return (
    <div className="card" style={{ borderLeft: `3px solid var(--${level})` }}>
      <div className="row between">
        <div className="row"><span className={`badge lv-${level}`}>lag</span><b>{lag.title}</b></div>
        {lag.until && <span className="muted small">teste: mais {Math.max(0, Math.round((lag.until - Date.now()) / 1000))} s</span>}
      </div>
      <p style={{ margin: '8px 0 4px', color: 'var(--ink-2)' }}>{lag.detail}</p>
      {lag.tip && <p className="small" style={{ margin: '0 0 8px' }}><span className="muted">O que fazer:</span> {lag.tip}</p>}
      <table className="kv"><tbody>
        <tr><th>Rede de casa (roteador)</th><td className="mono">{p(lag.home)}</td></tr>
        <tr><th>Internet (São Paulo)</th><td className="mono">{p(lag.internet)}</td></tr>
      </tbody></table>
    </div>
  )
}

function Now({ ignore }: { ignore: (name: string) => void }) {
  const { status: s, history } = useStatus(30)
  if (!s) return <p className="muted">Lendo os sensores…</p>
  const bn = s.bottleneck
  const vram = s.gpu.vramUsed != null && s.gpu.vramTotal ? `${num(s.gpu.vramUsed / 1024, 1)} de ${num(s.gpu.vramTotal / 1024, 1)} GB` : '–'
  const data = history.map((h) => ({ t: h.time, GPU: h.gpu.load, 'Núcleo mais carregado': h.cpu.coreMax }))
  return (
    <>
      {!s.game ? (
        <div className="card"><b>Nenhum jogo aberto.</b> <span className="muted">Abra um jogo e a análise de gargalo aparece aqui em uns 20 segundos. Se o seu jogo não for detectado, adicione a pasta dele na aba Sessões.</span></div>
      ) : !s.lhm || s.gpu.load == null ? (
        <div className="banner"><b>Jogando {s.game}</b>, mas sem o uso da placa de vídeo não dá para saber onde está o gargalo. Abra o LibreHardwareMonitor (veja em Ajustes).</div>
      ) : !bn ? (
        <div className="card"><b>Jogando {s.game}.</b> <span className="muted">Juntando 20 segundos de leituras…</span></div>
      ) : (
        <div className="card" style={{ borderLeft: `3px solid var(--${BN_LEVEL[bn.kind]})` }}>
          <div className="row between">
            <div className="row"><span className={`badge lv-${BN_LEVEL[bn.kind]}`}>gargalo: {BN_LABEL[bn.kind]}</span><b style={{ fontSize: 17 }}>{bn.title}</b></div>
            <span className="row muted small">{s.game}<button className="btn small" onClick={() => ignore(s.game!)}>Não é jogo</button></span>
          </div>
          <p style={{ margin: '10px 0 4px', color: 'var(--ink-2)' }}>{bn.detail}</p>
          <p className="small" style={{ margin: 0 }}><span className="muted">O que fazer:</span> {bn.tip}</p>
        </div>
      )}
      <LagCard lag={s.lag} />
      <div className="grid">
        <Tile label="FPS" value={s.gpu.fps != null ? num(s.gpu.fps) : '–'} detail={s.gpu.fps == null ? 'Só aparece em jogo em tela cheia' : 'Medido pelo driver da AMD'} />
        <Tile label="Placa de vídeo" value={pct(s.gpu.load)} detail={<><Heat t={s.gpu.temp} />{s.gpu.power != null && <span>{num(s.gpu.power)} W</span>}</>} />
        <Tile label="Processador" value={pct(s.cpu.load)} detail={<><span>núcleo mais carregado: {pct(s.cpu.coreMax)}</span><Heat t={s.cpu.temp} /></>} />
        <Tile label="Memória de vídeo" value={s.gpu.vramUsed != null && s.gpu.vramTotal ? pct((100 * s.gpu.vramUsed) / s.gpu.vramTotal) : '–'} detail={vram} />
        <Tile label="RAM" value={pct((100 * s.ram.used) / s.ram.total)} />
      </div>
      <div className="card">
        <h2>Últimos 60 segundos</h2>
        <p className="muted small" style={{ marginTop: -6 }}>Se a GPU fica abaixo de ~80% enquanto o núcleo mais carregado bate perto de 100%, o processador está segurando.</p>
        <Legend items={[['GPU', 'var(--series-1)'], ['Núcleo mais carregado', 'var(--series-2)']]} />
        <div style={{ height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="t" tick={false} stroke="var(--axis)" />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} stroke="var(--axis)" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
              <Tooltip content={<ChartTip fmt={(v) => pct(v)} labelFmt={(l) => new Date(Number(l)).toLocaleTimeString('pt-BR')} />} />
              <Line dataKey="GPU" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="Núcleo mais carregado" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  )
}

// --- Posso rodar? ---

function GameCard({ g, verdict, image, active, onClick }: { g: SteamGame; verdict?: CanRunVerdict | null; image?: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`game-card${active ? ' active' : ''}`} onClick={onClick}>
      <img src={image ?? g.image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} onLoad={(e) => { e.currentTarget.style.visibility = 'visible' }} />
      <span className="game-name">{g.name}</span>
      {verdict === undefined ? null : verdict === null ? <span className="muted small">analisando…</span> : <span className={`badge lv-${LEVEL_COLOR[verdict.level]}`}>{verdict.title}</span>}
    </button>
  )
}

function Analysis({ r }: { r: CanRun }) {
  const [raw, setRaw] = useState(false)
  return (
    <div className="card" style={{ borderLeft: `3px solid var(--${LEVEL_COLOR[r.verdict.level]})` }}>
      <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
        <img src={r.game.image} alt="" style={{ width: 230, borderRadius: 8 }} />
        <div style={{ flex: 1 }}>
          <h2 style={{ marginBottom: 6 }}>{r.game.name}</h2>
          <div className={`lv-${LEVEL_COLOR[r.verdict.level]}`} style={{ fontSize: 22, fontWeight: 650 }}>{r.verdict.title}</div>
          <p style={{ margin: '6px 0 0', color: 'var(--ink-2)' }}>{r.verdict.detail}</p>
        </div>
      </div>
      <table style={{ marginTop: 14 }}>
        <thead><tr><th>Peça</th><th>Seu PC</th><th>Mínimo</th><th>Recomendado</th><th>Situação</th></tr></thead>
        <tbody>{r.parts.map((p) => (
          <tr key={p.label}>
            <td><b>{p.label}</b></td><td>{p.yours}</td><td className="muted">{p.min ?? '–'}</td><td className="muted">{p.rec ?? '–'}</td>
            <td><span className={`badge lv-${PART[p.verdict][1]}`}>{PART[p.verdict][0]}</span>{p.ratioRec != null && p.verdict !== 'unknown' && p.label !== 'Espaço em disco' && <span className="muted small"> {num(p.ratioRec, 1)}× o recomendado</span>}{p.note && <div className="muted small">{p.note}</div>}</td>
          </tr>
        ))}</tbody>
      </table>
      <p className="muted small" style={{ marginBottom: 6 }}>Estimativa pela tabela de desempenho médio das peças (recomendado ≈ Alto em 1080p a ~60 FPS). Drivers, otimização do jogo e resolução mudam o resultado.</p>
      <button className="btn small" onClick={() => setRaw(!raw)}>{raw ? 'Esconder' : 'Ver'} requisitos da Steam</button>
      {raw && <div className="row" style={{ alignItems: 'flex-start', marginTop: 10 }}>
        <pre className="req">{r.minText || 'Sem requisitos mínimos.'}</pre><pre className="req">{r.recText || 'Sem requisitos recomendados.'}</pre>
      </div>}
    </div>
  )
}

function CanRunTab() {
  const installed = useLoad(useCallback(() => window.api.installedGames(), []))
  const [verdicts, setVerdicts] = useState<Record<number, CanRunVerdict | null>>({})
  /** Capa certa que a análise traz (jogos novos usam outro endereço). */
  const [images, setImages] = useState<Record<number, string>>({})
  const got = (r: CanRun) => { setVerdicts((v) => ({ ...v, [r.game.appid]: r.verdict })); setImages((m) => ({ ...m, [r.game.appid]: r.game.image })) }
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SteamGame[] | null>(null)
  const [selected, setSelected] = useState<CanRun | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Avalia os instalados um de cada vez (a Steam limita pedidos; depois vem do cache).
  useEffect(() => {
    let stop = false
    ;(async () => {
      for (const g of installed.data ?? []) {
        if (stop) return
        setVerdicts((v) => ({ ...v, [g.appid]: null }))
        try { got(await window.api.canRun(g.appid)) } catch { setVerdicts((v) => { const n = { ...v }; delete n[g.appid]; return n }) }
      }
    })()
    return () => { stop = true }
  }, [installed.data])

  async function open(g: SteamGame) {
    setBusy(g.appid); setErr(null)
    try { const r = await window.api.canRun(g.appid); setSelected(r); got(r) } catch (e) { setErr(message(e)) } finally { setBusy(null) }
  }
  async function search(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    try { setResults(await window.api.searchGames(query)) } catch (x) { setErr(message(x)) }
  }

  return (
    <>
      <form className="row" onSubmit={search} style={{ marginBottom: 14 }}>
        <input type="text" placeholder="Buscar qualquer jogo da Steam…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 360 }} />
        <button className="btn primary" disabled={query.trim().length < 2}>Buscar</button>
        {busy && <span className="muted small">Consultando a Steam…</span>}
        {err && <span className="err-text small">{err}</span>}
      </form>
      {selected && <Analysis r={selected} />}
      {results && (
        <div className="card">
          <h2>Resultados</h2>
          {results.length === 0 ? <p className="muted">Nada encontrado.</p> : <div className="game-grid">{results.map((g) => <GameCard key={g.appid} g={g} verdict={verdicts[g.appid]} image={images[g.appid]} active={selected?.game.appid === g.appid} onClick={() => open(g)} />)}</div>}
        </div>
      )}
      <div className="card">
        <h2>Seus jogos instalados (Steam)</h2>
        {installed.loading ? <p className="muted">Lendo a biblioteca…</p> : !installed.data?.length ? <p className="muted">Nenhum jogo da Steam encontrado.</p> :
          <div className="game-grid">{installed.data.map((g) => <GameCard key={g.appid} g={g} verdict={verdicts[g.appid]} image={images[g.appid]} active={selected?.game.appid === g.appid} onClick={() => open(g)} />)}</div>}
      </div>
    </>
  )
}

// --- Modo Jogo ---

/** Programas que costumam pesar e não fazem falta durante o jogo. */
const SUGGEST = /^(wallpaper(32|64)|ollama( app)?|onedrive|dropbox|googledrivefs|teams|ms-teams|slack|spotify|adobe.*|creative cloud|icue|lghub.*|razer.*|chrome|msedge|firefox|opera)$/i

function GameModeTab() {
  const { settings, save } = useSettings()
  const cand = useLoad(useCallback(() => window.api.gameModeCandidates(), []))
  const log = useLoad(useCallback(() => window.api.gameModeLog(), []))
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!settings) return null
  const g = settings.autoGame
  const set = (p: Partial<typeof g>) => save({ ...settings, autoGame: { ...g, ...p } })
  const add = (n: string) => set({ close: [...new Set([...g.close, n.toLowerCase()])] })
  const remove = (n: string) => set({ close: g.close.filter((x) => x !== n) })
  async function test() {
    setBusy(true); setMsg(null)
    try {
      const r = await window.api.gameModeTest(15)
      setMsg(r.apps.length ? `Fechei: ${r.apps.join(', ')}${r.failed.length ? ` (não fecharam: ${r.failed.join(', ')})` : ''}. Reabrindo em 15 s…` : 'Nenhum dos programas escolhidos estava aberto.')
      setTimeout(() => { log.reload(); cand.reload() }, 17_000)
    } catch (e) { setMsg(message(e)) } finally { setBusy(false); log.reload() }
  }
  const available = (cand.data ?? []).filter((c) => !g.close.includes(c.name))

  return (
    <>
      <div className="card">
        <div className="row between">
          <div><h2 style={{ margin: 0 }}>Modo Jogo automático</h2><p className="muted small" style={{ margin: '4px 0 0' }}>Quando um jogo abre, fecha os programas abaixo; quando o jogo fecha, reabre do mesmo jeito. O jogo é detectado em até 1 minuto.</p></div>
          <label className="switch"><input type="checkbox" checked={g.enabled} onChange={() => set({ enabled: !g.enabled })} /> <b>{g.enabled ? 'Ligado' : 'Desligado'}</b></label>
        </div>
      </div>
      <div className="card">
        <h2>Fechar durante o jogo</h2>
        {g.close.length === 0 ? <p className="muted">Nenhum programa escolhido. Adicione da lista abaixo.</p> : (
          <div className="row" style={{ marginBottom: 12 }}>{g.close.map((n) => <span key={n} className="chip">{n}<button title="Tirar" onClick={() => remove(n)}>×</button></span>)}</div>
        )}
        <div className="row">
          <label className="switch"><input type="checkbox" checked={g.reopen} onChange={() => set({ reopen: !g.reopen })} /> Reabrir quando o jogo fechar</label>
          <button className="btn small" disabled={busy || !g.close.length} onClick={test}>Testar agora (fecha e reabre em 15 s)</button>
          {msg && <span className="small muted">{msg}</span>}
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>Os programas recebem o pedido de fechar (como clicar no X); quem não fechar em 5 s é encerrado. O que não estiver salvo neles pode se perder, então não escolha editores com trabalho aberto.</p>
      </div>
      <div className="card">
        <div className="row between"><h2 style={{ margin: 0 }}>Programas abertos agora</h2><button className="btn small" onClick={cand.reload}>Atualizar</button></div>
        <p className="muted small">Windows, launchers (Steam, Epic, Riot…), drivers e o próprio painel não aparecem aqui.</p>
        <table><tbody>{available.map((c) => (
          <tr key={c.name}>
            <td><b>{c.name}</b>{SUGGEST.test(c.name) && <span className="badge lv-good" style={{ marginLeft: 8 }}>sugerido</span>}<div className="muted small path" style={{ maxWidth: 520 }}>{c.path}</div></td>
            <td className="num">{(c.ram / 1024 ** 2).toFixed(0)} MB</td>
            <td className="num"><button className="btn small" onClick={() => add(c.name)}>Fechar no jogo</button></td>
          </tr>
        ))}</tbody></table>
      </div>
      {!!log.data?.length && (
        <div className="card">
          <h2>O que o Modo Jogo fez</h2>
          <table><tbody>{log.data.slice(0, 12).map((e) => (
            <tr key={e.time + e.action}><td className="mono small" style={{ width: 130 }}>{dateTime(e.time)}</td><td>{e.action === 'closed' ? `Fechou ao abrir ${e.game}` : `Reabriu (${e.game})`}: {e.apps.join(', ') || 'nada aberto'}{e.failed.length > 0 && <span className="err-text"> · falhou: {e.failed.join(', ')}</span>}</td></tr>
          ))}</tbody></table>
        </div>
      )}
    </>
  )
}

// --- Sessões ---

function Sessions({ ignore }: { ignore: (name: string, on: boolean) => void }) {
  const g = useLoad(useCallback(() => window.api.gameSessions(), []))
  const { settings, save } = useSettings()
  useEffect(() => { const t = setInterval(g.reload, 30_000); return () => clearInterval(t) }, [g.reload])
  const list = g.data ?? []
  const recent = list.filter((s) => s.end > Date.now() - 30 * DAY)
  const week = list.filter((s) => s.end > Date.now() - 7 * DAY).reduce((a, s) => a + s.end - s.start, 0)
  const byGame = Object.entries(recent.reduce<Record<string, number>>((a, s) => ({ ...a, [s.game]: (a[s.game] ?? 0) + s.end - s.start }), {}))
    .map(([game, ms]) => ({ game, horas: ms / 3600_000 })).sort((a, b) => b.horas - a.horas).slice(0, 10)
  const hottest = list.reduce<number | null>((m, s) => (s.gpuTempMax != null && (m == null || s.gpuTempMax > m) ? s.gpuTempMax : m), null)

  async function addFolder() {
    const f = await window.api.pickFolder(); if (!f || !settings) return
    await save({ ...settings, games: { ...settings.games, extraFolders: [...new Set([...settings.games.extraFolders, f])] } })
  }

  return (
    <>
      <div className="grid">
        <Tile label="Últimos 7 dias" value={duration(week)} detail={`${list.filter((s) => s.end > Date.now() - 7 * DAY).length} sessões`} />
        <Tile label="Mais jogado (30 dias)" value={<span style={{ fontSize: 20 }}>{byGame[0]?.game ?? '–'}</span>} detail={byGame[0] && `${num(byGame[0].horas, 1)} h`} />
        <Tile label="GPU mais quente já vista" value={hottest != null ? `${hottest} °C` : '–'} detail={<Heat t={hottest} />} />
      </div>
      {byGame.length > 0 && (
        <div className="card">
          <h2>Horas por jogo (30 dias)</h2>
          <div style={{ height: Math.max(120, byGame.length * 36 + 30) }}>
            <ResponsiveContainer>
              <BarChart data={byGame} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="var(--grid)" horizontal={false} />
                <XAxis type="number" stroke="var(--axis)" tick={{ fill: 'var(--muted)', fontSize: 12 }} tickFormatter={(v) => `${num(v, 1)} h`} />
                <YAxis type="category" dataKey="game" width={170} stroke="var(--axis)" tick={{ fill: 'var(--ink-2)', fontSize: 12 }} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<ChartTip fmt={(v) => duration(v * 3600_000)} />} />
                <Bar dataKey="horas" name="Tempo" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="card">
        <h2>Sessões</h2>
        {list.length === 0 ? <p className="muted">Nenhuma sessão ainda. Abra um jogo e ela aparece aqui quando você fechar.</p> : (
          <table>
            <thead><tr><th>Jogo</th><th>Início</th><th className="num">Duração</th><th className="num">FPS médio</th><th className="num">1% mais baixo</th><th className="num">Ping</th><th>Gargalo principal</th><th>CPU (média/máx)</th><th>GPU (média/máx)</th></tr></thead>
            <tbody>{list.slice(0, 100).map((s) => (
              <tr key={s.start}>
                <td>{s.game}</td><td>{dateTime(s.start)}</td><td className="num">{duration(s.end - s.start)}</td>
                <td className="num">{s.fpsAvg ?? '–'}</td><td className="num">{s.fpsLow ?? '–'}</td><td className="num">{s.pingAvg != null ? `${s.pingAvg} ms${s.pingLoss ? ` · ${s.pingLoss}%` : ''}` : '–'}</td><td>{mainBottleneck(s)}</td>
                <td>{s.cpuTempAvg != null ? <>{s.cpuTempAvg} / <Heat t={s.cpuTempMax} /></> : '–'}</td>
                <td>{s.gpuTempAvg != null ? <>{s.gpuTempAvg} / <Heat t={s.gpuTempMax} /></> : '–'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {settings && (
        <div className="card">
          <h2>Outras pastas de jogos</h2>
          <p className="muted small">Jogos da Steam, Epic, Xbox, Riot, GOG, Ubisoft, EA e Amazon são detectados sozinhos (a cada 1 minuto). Para outros (Battle.net, jogos soltos), adicione a pasta: cada subpasta vira um jogo.</p>
          {settings.games.extraFolders.map((f) => (
            <div className="row" key={f} style={{ marginBottom: 6 }}><span className="mono">{f}</span><button className="btn small danger" onClick={() => save({ ...settings, games: { ...settings.games, extraFolders: settings.games.extraFolders.filter((x) => x !== f) } })}>Remover</button></div>
          ))}
          <button className="btn" onClick={addFolder}>Adicionar pasta</button>
          {settings.games.ignored.length > 0 && (
            <>
              <h2 style={{ marginTop: 18 }}>Marcados como "não é jogo"</h2>
              {settings.games.ignored.map((n) => <div className="row" key={n} style={{ marginBottom: 6 }}><span>{n}</span><button className="btn small" onClick={() => ignore(n, false)}>Voltar a contar</button></div>)}
            </>
          )}
        </div>
      )}
    </>
  )
}

export default function GamesPage() {
  const [tab, setTab] = useState<Tab>('now')
  const { settings, save } = useSettings()
  async function ignore(name: string, on = true) {
    if (!settings) return
    const ignored = on ? [...new Set([...settings.games.ignored, name])] : settings.games.ignored.filter((x) => x !== name)
    await save({ ...settings, games: { ...settings.games, ignored } })
  }
  return (
    <>
      <h1>Jogos</h1>
      <p className="sub">Gargalo do jogo aberto, "posso rodar?" para qualquer jogo da Steam e o histórico de sessões.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        {([['now', 'Agora'], ['canrun', 'Posso rodar?'], ['mode', 'Modo Jogo'], ['sessions', 'Sessões']] as [Tab, string][]).map(([t, label]) => <button key={t} className={`btn${tab === t ? ' primary' : ''}`} onClick={() => setTab(t)}>{label}</button>)}
      </div>
      {tab === 'now' && <Now ignore={(n) => ignore(n)} />}
      {tab === 'canrun' && <CanRunTab />}
      {tab === 'mode' && <GameModeTab />}
      {tab === 'sessions' && <Sessions ignore={ignore} />}
    </>
  )
}
