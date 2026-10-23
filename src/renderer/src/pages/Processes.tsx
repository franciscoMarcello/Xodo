import { Fragment, useEffect, useMemo, useState } from 'react'
import { message } from '../hooks'
import { bytes, num } from '../format'
import { Meter, Tile } from '../components'
import type { Proc, ProcessList } from '../../../shared/types'

type Sort = 'ram' | 'cpu' | 'name'
interface Group { name: string; procs: Proc[]; ram: number; cpu: number | null; path: string | null }

/** Junta os processos com o mesmo nome (Chrome, Discord...), como o Gerenciador de Tarefas. */
function group(procs: Proc[]): Group[] {
  const map = new Map<string, Group>()
  for (const p of procs) {
    const g = map.get(p.name) ?? { name: p.name, procs: [], ram: 0, cpu: null, path: null }
    g.procs.push(p); g.ram += p.ram; if (p.cpu != null) g.cpu = (g.cpu ?? 0) + p.cpu; g.path ??= p.path
    map.set(p.name, g)
  }
  return [...map.values()]
}

const cpuText = (c: number | null) => (c == null ? '–' : c < 0.1 ? '0%' : `${num(c, c < 10 ? 1 : 0)}%`)

export default function ProcessesPage({ query: initial = '' }: { query?: string }) {
  const [list, setList] = useState<ProcessList | null>(null)
  const [sort, setSort] = useState<Sort>('ram')
  const [query, setQuery] = useState(initial)
  const [open, setOpen] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Leitura rápida (5 s) só enquanto esta aba está na tela.
  useEffect(() => {
    const off = window.api.onProcesses(setList)
    window.api.watchProcesses(true)
    return () => { off(); window.api.watchProcesses(false) }
  }, [])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const g = group(list?.procs ?? []).filter((x) => !q || x.name.toLowerCase().includes(q) || x.path?.toLowerCase().includes(q))
    return g.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'cpu' ? (b.cpu ?? -1) - (a.cpu ?? -1) : b.ram - a.ram))
  }, [list, sort, query])

  async function kill(procs: Proc[], label: string) {
    const targets = procs.filter((p) => p.killable)
    if (!targets.length || !confirm(`Finalizar ${label}? O que não estiver salvo nesse programa será perdido.`)) return
    setMsg(null)
    try { for (const p of targets) await window.api.killProcess(p.pid); setMsg({ text: `${label} finalizado.`, ok: true }) } catch (e) { setMsg({ text: message(e), ok: false }) }
  }

  if (!list) return <><h1>Processos</h1><p className="muted">Lendo os processos…</p></>
  const top = group(list.procs).sort((a, b) => b.ram - a.ram)[0]
  const cpuKnown = list.procs.some((p) => p.cpu != null)
  const shown = all || query ? groups : groups.slice(0, 40)
  const th = (key: Sort, label: string, cls = '') => <th className={cls} style={{ cursor: 'pointer' }} onClick={() => setSort(key)}>{label}{sort === key ? ' ▾' : ''}</th>

  return (
    <>
      <h1>Processos</h1>
      <p className="sub">Atualiza a cada 5 segundos enquanto esta aba está aberta. Fora dela, a leitura volta a ser a cada 1 minuto, para o painel continuar leve.</p>
      <div className="grid">
        <Tile label="Programas abertos" value={num(group(list.procs).length)} detail={`${num(list.procs.length)} processos`} />
        <Tile label="Memória em uso" value={bytes(list.ramUsed)} detail={<div style={{ width: '100%' }}><Meter value={(100 * list.ramUsed) / list.ramTotal} />{num((100 * list.ramUsed) / list.ramTotal)}% de {bytes(list.ramTotal)}</div>} />
        {top && <Tile label="Mais pesado" value={<span style={{ fontSize: 20 }}>{top.name}</span>} detail={`${bytes(top.ram)}${top.procs.length > 1 ? ` em ${top.procs.length} processos` : ''}`} />}
      </div>
      <div className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <input type="text" placeholder="Buscar por nome ou pasta…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 300 }} />
          {msg && <span className={msg.ok ? 'ok-text small' : 'err-text small'}>{msg.text}</span>}
        </div>
        {!cpuKnown && <p className="muted small">O uso de CPU aparece a partir da segunda leitura (5 s).</p>}
        <table>
          <thead><tr>{th('name', 'Programa')}{th('cpu', 'CPU', 'num')}{th('ram', 'Memória', 'num')}<th /></tr></thead>
          <tbody>{shown.map((g) => (
            <Fragment key={g.name}>
              <tr>
                <td className="path" title={g.path ?? 'Caminho protegido pelo Windows'}>
                  {g.procs.length > 1 ? <button className="btn small" style={{ marginRight: 8, padding: '0 6px' }} onClick={() => setOpen(open === g.name ? null : g.name)}>{open === g.name ? '−' : '+'}</button> : <span style={{ display: 'inline-block', width: 30 }} />}
                  {g.name}{g.procs.length > 1 && <span className="muted"> ×{g.procs.length}</span>}
                </td>
                <td className="num">{cpuText(g.cpu)}</td>
                <td className="num">{bytes(g.ram)}</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  {g.path && <button className="btn small" onClick={() => window.api.showInFolder(g.path!)}>Local</button>}{' '}
                  {g.procs.some((p) => p.killable) && <button className="btn small danger" onClick={() => kill(g.procs, g.procs.length > 1 ? `${g.name} (${g.procs.length} processos)` : g.name)}>Finalizar</button>}
                </td>
              </tr>
              {open === g.name && [...g.procs].sort((a, b) => b.ram - a.ram).map((p) => (
                <tr key={p.pid} style={{ background: 'var(--surface-2)' }}>
                  <td className="muted small" style={{ paddingLeft: 46 }}>PID {p.pid}</td><td className="num small">{cpuText(p.cpu)}</td><td className="num small">{bytes(p.ram)}</td>
                  <td className="num">{p.killable && <button className="btn small danger" onClick={() => kill([p], `${g.name} (PID ${p.pid})`)}>Finalizar</button>}</td>
                </tr>
              ))}
            </Fragment>
          ))}</tbody>
        </table>
        {!all && !query && groups.length > 40 && <button className="btn small" style={{ marginTop: 10 }} onClick={() => setAll(true)}>Mostrar todos ({groups.length})</button>}
        <p className="muted small" style={{ marginBottom: 0 }}>Programas essenciais do Windows e o próprio painel não podem ser finalizados por aqui. "Memória" é a memória em uso (working set), como no Gerenciador de Tarefas.</p>
      </div>
    </>
  )
}
