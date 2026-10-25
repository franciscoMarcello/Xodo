import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLoad, message } from '../hooks'
import { bytes, num } from '../format'
import { Heat, Meter } from '../components'
import { squarify, type Rect } from '../treemap'
import type { BigFile, DiskTree, TreeNode } from '../../../shared/types'

function Disks() {
  const { data } = useLoad(useCallback(() => window.api.disks(), []))
  return (
    <div className="grid">
      {data?.map((d) => {
        const used = d.total - d.free; const p = (100 * used) / d.total
        return (
          <div className="card tile" key={d.mount}>
            <div className="label">Disco {d.mount.slice(0, 2)}</div>
            <div className="value">{bytes(d.free)} <span className="muted small" style={{ fontWeight: 400 }}>livres</span></div>
            <Meter value={p} />
            <div className="detail">{num(p)}% usado de {bytes(d.total)}</div>
          </div>
        )
      })}
    </div>
  )
}

function Folders() {
  const f = useLoad(useCallback(() => window.api.folderSizes(), []), false)
  const max = Math.max(1, ...(f.data ?? []).map((x) => x.size))
  return (
    <div className="card">
      <div className="row between"><h2>Pastas principais</h2><button className="btn" disabled={f.loading} onClick={f.reload}>{f.loading ? 'Calculando…' : f.data ? 'Recalcular' : 'Calcular tamanhos'}</button></div>
      {!f.data && !f.loading && <p className="muted">Soma o tamanho de Downloads, Documentos, Imagens, Vídeos e outras. Pode levar alguns segundos.</p>}
      {f.data && (
        <table>
          <thead><tr><th>Pasta</th><th>Tamanho</th><th className="num">Arquivos</th><th /></tr></thead>
          <tbody>{f.data.map((x) => (
            <tr key={x.path}>
              <td>{x.name}</td>
              <td style={{ width: '40%' }}><div className="row"><div className="meter" style={{ flex: 1, margin: 0 }}><div style={{ width: `${(100 * x.size) / max}%` }} /></div><span className="mono">{bytes(x.size)}{!x.done && '+'}</span></div></td>
              <td className="num">{num(x.files)}</td>
              <td className="num"><button className="btn small" onClick={() => window.api.showInFolder(x.path)}>Abrir</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {f.data?.some((x) => !x.done) && <p className="muted small">"+": pasta grande demais, a contagem parou em 20 segundos.</p>}
    </div>
  )
}

function Temp() {
  const t = useLoad(useCallback(() => window.api.tempInfo(), []))
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function clean() {
    if (!confirm(`Apagar ${t.data!.files} arquivos temporários antigos (${bytes(t.data!.size)})? Eles não vão para a Lixeira.`)) return
    setBusy(true)
    try { const r = await window.api.cleanTemp(); setResult(`Liberados ${bytes(r.freed)}.${r.skipped ? ` ${r.skipped} arquivos em uso foram pulados.` : ''}`); t.reload() } finally { setBusy(false) }
  }
  return (
    <div className="card">
      <div className="row between">
        <div><h2 style={{ marginBottom: 4 }}>Arquivos temporários</h2><span className="muted">{t.data ? `${num(t.data.files)} arquivos com mais de 1 dia · ${bytes(t.data.size)}` : 'Calculando…'}</span></div>
        <button className="btn danger" disabled={!t.data?.files || busy} onClick={clean}>{busy ? 'Limpando…' : 'Limpar'}</button>
      </div>
      {result && <p className="ok-text small" style={{ marginBottom: 0 }}>{result}</p>}
    </div>
  )
}

function BigFiles() {
  const [folder, setFolder] = useState<string | null>(null)
  const [files, setFiles] = useState<BigFile[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function scan() {
    const f = await window.api.pickFolder(); if (!f) return
    setFolder(f); setBusy(true); setFiles(null)
    try { setFiles(await window.api.bigFiles(f)) } finally { setBusy(false) }
  }
  async function trash(p: string) {
    setErr(null)
    try { await window.api.trash(p); setFiles((l) => l!.filter((x) => x.path !== p)) } catch (e) { setErr(message(e)) }
  }
  return (
    <div className="card">
      <div className="row between"><div><h2 style={{ marginBottom: 4 }}>Maiores arquivos</h2><span className="muted">{folder ?? 'Escolha uma pasta (ou um disco inteiro) para ver os 30 maiores arquivos.'}</span></div>
        <button className="btn" disabled={busy} onClick={scan}>{busy ? 'Procurando…' : 'Escolher pasta'}</button></div>
      {err && <p className="err-text small">{err}</p>}
      {files && (
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Arquivo</th><th className="num">Tamanho</th><th className="num">Modificado</th><th /></tr></thead>
          <tbody>{files.map((x) => (
            <tr key={x.path}>
              <td className="path" title={x.path}>{x.path.slice(folder!.length).replace(/^\\/, '')}</td>
              <td className="num">{bytes(x.size)}</td>
              <td className="num">{new Date(x.modified).toLocaleDateString('pt-BR')}</td>
              <td className="num" style={{ whiteSpace: 'nowrap' }}><button className="btn small" onClick={() => window.api.showInFolder(x.path)}>Mostrar</button> <button className="btn small danger" onClick={() => trash(x.path)}>Lixeira</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  )
}

const KINDS: [string, string, RegExp][] = [
  ['Vídeos', '#d95926', /^(mp4|mkv|avi|mov|wmv|webm|m4v|ts)$/],
  ['Imagens', '#199e70', /^(jpe?g|png|gif|bmp|webp|heic|psd|tiff?|raw|cr2|nef|dng)$/],
  ['Áudio', '#a855c7', /^(mp3|wav|flac|aac|ogg|m4a|wma|opus)$/],
  ['Jogos', '#3987e5', /^(pak|vpk|upk|ucas|utoc|bundle|assets|resource|bank|wem|forge|big|arc|dat|bin|blob)$/],
  ['Programas', '#c9a227', /^(exe|dll|sys|msi|msix|appx|cab|so|node)$/],
  ['Compactados', '#d0647f', /^(zip|rar|7z|gz|tar|iso|img|vhdx?|wim|esd)$/],
  ['Documentos', '#5aa9b8', /^(pdf|docx?|xlsx?|pptx?|txt|odt|csv|epub)$/],
]
const OTHER = '#7a7873'
const color = (name: string) => { const ext = name.split('.').pop()!.toLowerCase(); return KINDS.find((k) => k[2].test(ext))?.[1] ?? OTHER }
const join = (a: string, b: string) => (a.endsWith('\\') ? a + b : `${a}\\${b}`)

type Box = Rect & { node: TreeNode; path: string; folder: boolean }
/** Desce pelas pastas enquanto houver espaço: cada pasta ganha uma faixa de título de 16 px e os filhos vão dentro. */
function boxes(node: TreeNode, r: Rect, path: string, out: Box[] = []): Box[] {
  for (const b of squarify(node.children ?? [], r)) {
    if (b.w < 2 || b.h < 2) continue
    const p = join(path, b.item.name); const folder = !!b.item.children
    out.push({ ...b, node: b.item, path: p, folder })
    if (folder && b.w > 24 && b.h > 30) boxes(b.item, { x: b.x + 2, y: b.y + 16, w: b.w - 4, h: b.h - 18 }, p, out)
  }
  return out
}

function DiskMap() {
  const d = useLoad(useCallback(() => window.api.disks(), []))
  const [scan, setScan] = useState<DiskTree | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [trail, setTrail] = useState<TreeNode[]>([])
  const [width, setWidth] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current; if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth)); ro.observe(el); return () => ro.disconnect()
  }, [scan])
  async function run(folder: string | null) {
    if (!folder) return
    setBusy(folder)
    try { const t = await window.api.diskTree(folder); setScan(t); setTrail([t.tree]) } finally { setBusy(null) }
  }
  const view = trail[trail.length - 1]
  const viewPath = trail.slice(1).reduce((p, n) => join(p, n.name), scan?.root ?? '')
  const HEIGHT = 440
  const list = useMemo(() => (view && width ? boxes(view, { x: 0, y: 0, w: width, h: HEIGHT }, viewPath) : []), [view, width, viewPath])
  return (
    <div className="card">
      <div className="row between">
        <div><h2 style={{ marginBottom: 4 }}>Mapa do disco</h2><span className="muted">{busy ? `Escaneando ${busy}… pode levar um ou dois minutos num disco inteiro.` : scan ? `${num(scan.files)} arquivos · ${bytes(scan.tree.size)}${scan.done ? '' : ' (parou em 2 minutos, mapa incompleto)'}` : 'Cada bloco é um arquivo, do tamanho do espaço que ocupa. Clique numa pasta para entrar nela.'}</span></div>
        <div className="row">
          {d.data?.map((x) => <button key={x.mount} className="btn" disabled={!!busy} onClick={() => run(x.mount)}>{x.mount.slice(0, 2)}</button>)}
          <button className="btn" disabled={!!busy} onClick={async () => run(await window.api.pickFolder())}>Outra pasta…</button>
        </div>
      </div>
      {scan && view && (
        <>
          <div className="row" style={{ margin: '12px 0 8px', flexWrap: 'wrap', gap: 4 }}>
            {trail.map((n, i) => <span key={i}>{i > 0 && <span className="muted"> › </span>}<button className="btn small" disabled={i === trail.length - 1} onClick={() => setTrail(trail.slice(0, i + 1))}>{i ? n.name : scan.root}</button></span>)}
            <button className="btn small" style={{ marginLeft: 'auto' }} onClick={() => window.api.showInFolder(viewPath)}>Abrir no Explorer</button>
          </div>
          <div ref={box} style={{ position: 'relative', height: HEIGHT, overflow: 'hidden', borderRadius: 6, background: 'var(--surface-2)' }}>
            {list.map((b) => (
              <div key={b.path} title={`${b.path}\n${bytes(b.node.size)} · ${num((100 * b.node.size) / scan.tree.size, 1)}% do total`}
                onClick={b.folder ? (e) => { e.stopPropagation(); setTrail(trailTo(trail, b.path, viewPath)) } : undefined}
                onDoubleClick={b.node.more ? undefined : (e) => { e.stopPropagation(); window.api.showInFolder(b.path) }}
                style={{
                  position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h, boxSizing: 'border-box', overflow: 'hidden', whiteSpace: 'nowrap',
                  fontSize: 11, lineHeight: '14px', padding: '1px 3px', cursor: b.folder ? 'zoom-in' : 'default',
                  background: b.folder ? 'var(--surface)' : b.node.more ? 'var(--grid)' : color(b.node.name),
                  border: '1px solid var(--page)', color: b.folder || b.node.more ? 'var(--ink-2)' : '#fff',
                }}>
                {b.w > 40 && b.h > 13 && `${b.node.name} (${bytes(b.node.size)})`}
              </div>
            ))}
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
            {[...KINDS.map((k) => [k[0], k[1]]), ['Outros', OTHER]].map(([n, c]) => <span key={n} className="small muted"><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: c, marginRight: 4 }} />{n}</span>)}
            <span className="small muted" style={{ marginLeft: 'auto' }}>Dois cliques num bloco mostra o arquivo no Explorer.</span>
          </div>
        </>
      )}
    </div>
  )
}

/** Pasta clicada lá no fundo do mapa: refaz a trilha de nós da visão atual até ela. */
function trailTo(trail: TreeNode[], target: string, viewPath: string): TreeNode[] {
  const out = [...trail]; let node = trail[trail.length - 1]
  for (const name of target.slice(join(viewPath, '').length).split('\\')) {
    node = node.children!.find((c) => c.name === name)!; out.push(node)
  }
  return out
}

function Programs() {
  const p = useLoad(useCallback(() => window.api.programs(), []), false)
  const [all, setAll] = useState(false)
  const list = p.data ? (all ? p.data : p.data.slice(0, 25)) : []
  return (
    <div className="card">
      <div className="row between"><div><h2 style={{ marginBottom: 4 }}>Programas instalados</h2><span className="muted">Do maior para o menor. Tamanho informado pelo próprio programa (alguns não informam).</span></div>
        <div className="row"><button className="btn" onClick={() => window.api.openAppsSettings()}>Desinstalar programas…</button><button className="btn" disabled={p.loading} onClick={p.reload}>{p.loading ? 'Carregando…' : p.data ? 'Atualizar' : 'Carregar lista'}</button></div></div>
      {p.error && <p className="err-text small">{p.error}</p>}
      {p.data && (
        <>
          <table style={{ marginTop: 12 }}>
            <thead><tr><th>Programa</th><th>Fabricante</th><th className="num">Instalado em</th><th className="num">Tamanho</th></tr></thead>
            <tbody>{list.map((x) => <tr key={x.name}><td>{x.name}</td><td className="muted">{x.publisher}</td><td className="num">{x.installed || '–'}</td><td className="num">{x.size ? bytes(x.size) : '–'}</td></tr>)}</tbody>
          </table>
          {!all && p.data.length > 25 && <button className="btn small" style={{ marginTop: 10 }} onClick={() => setAll(true)}>Mostrar todos ({p.data.length})</button>}
        </>
      )}
    </div>
  )
}

const KIND = { nvme: 'SSD NVMe', ssd: 'SSD', hdd: 'HD' }
const LEVEL = { ok: ['saudável', 'good'], warning: ['atenção', 'warning'], serious: ['sério', 'serious'], critical: ['crítico', 'critical'] } as const

function Health() {
  const h = useLoad(useCallback(() => window.api.diskHealth(), []))
  if (!h.data) return null
  if (!h.data.length) return <div className="card"><h2>Saúde dos discos</h2><p className="muted" style={{ margin: 0 }}>Sem dados: a saúde dos discos vem dos sensores (LibreHardwareMonitor).</p></div>
  return (
    <div className="card">
      <h2>Saúde dos discos</h2>
      <div className="grid" style={{ marginBottom: 0 }}>
        {h.data.map((d) => {
          const [label, level] = LEVEL[d.status]
          return (
            <div key={d.name} className="card tile" style={{ borderLeft: `3px solid var(--${level})`, background: 'var(--surface-2)' }}>
              <div className="row between"><span className="label">{KIND[d.kind]}</span><span className={`badge lv-${level}`}>{label}</span></div>
              <div className="name" style={{ marginTop: 4, fontSize: 13, color: 'var(--ink)' }} title={d.name}>{d.name}</div>
              {d.life != null ? <><div className="value" style={{ fontSize: 22 }}>{d.life}% <span className="muted small" style={{ fontWeight: 400 }}>de vida</span></div><Meter value={100 - d.life} /></> : <div className="value" style={{ fontSize: 18 }}>–</div>}
              <div className="detail">
                {d.temp != null && <Heat t={d.temp} />}
                {d.hours != null && <span>{num(d.hours)} h ligado</span>}
                {d.writtenGB != null && <span>{num(d.writtenGB / 1024, 1)} TB gravados</span>}
              </div>
              {d.notes.map((n) => <p key={n} className="small" style={{ margin: '6px 0 0', color: 'var(--ink-2)' }}>{n}</p>)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function DiskPage() {
  return (
    <>
      <h1>Disco e limpeza</h1>
      <p className="sub">Espaço livre, o que ocupa mais e limpeza de temporários. Nada é apagado sem você confirmar.</p>
      <Disks />
      <Health />
      <DiskMap />
      <Temp />
      <Folders />
      <BigFiles />
      <Programs />
    </>
  )
}
