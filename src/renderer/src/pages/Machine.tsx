import { useCallback, useState, type ReactNode } from 'react'
import { message, useLoad, useStatus } from '../hooks'
import { bytes, num, pct } from '../format'
import { Heat } from '../components'
import type { MachineInfo } from '../../../shared/types'

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '–')
const since = (iso: string | null) => {
  if (!iso) return '–'
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600_000)
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} dias`
}
const ghz = (mhz: number) => `${num(mhz / 1000, 1)} GHz`

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div className="card"><h2>{title}</h2>{children}</div>
}
function KV({ rows }: { rows: [string, ReactNode][] }) {
  return <table className="kv"><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
}

/** Observações tiradas dos próprios dados (sem regra nova rodando em segundo plano). */
function notes(m: MachineInfo): { level: 'good' | 'warning'; text: string }[] {
  const out: { level: 'good' | 'warning'; text: string }[] = []
  const mod = m.memory.modules[0]
  if (mod?.speed && mod.configured && mod.configured < mod.speed - 100)
    out.push({ level: 'warning', text: `A memória está rodando a ${mod.configured} MHz, mas os pentes suportam ${mod.speed} MHz. Ativar o perfil XMP/DOCP na BIOS deixa o PC mais rápido.` })
  else if (mod?.configured) out.push({ level: 'good', text: `Memória na velocidade certa (${mod.configured} MHz).` })
  const slotsA = m.memory.modules.some((x) => /A\d|channel ?a/i.test(x.slot)), slotsB = m.memory.modules.some((x) => /B\d|channel ?b/i.test(x.slot))
  if (m.memory.modules.length === 1) out.push({ level: 'warning', text: 'Só um pente de memória: com dois pentes iguais (dual channel), o PC fica mais rápido, principalmente em jogos.' })
  else if (slotsA && slotsB) out.push({ level: 'good', text: 'Memória em dual channel (pentes nos dois canais).' })
  for (const d of m.disks) if (d.health && d.health !== 'Healthy') out.push({ level: 'warning', text: `O disco ${d.name} está com saúde "${d.health}". Faça backup do que tem nele.` })
  if (m.disks.length && m.disks.every((d) => d.health === 'Healthy')) out.push({ level: 'good', text: 'Todos os discos com saúde boa.' })
  const biosAge = m.board.biosDate ? (Date.now() - new Date(m.board.biosDate).getTime()) / (365 * 86400_000) : 0
  if (biosAge > 2) out.push({ level: 'warning', text: `A BIOS é de ${date(m.board.biosDate)} (mais de ${Math.floor(biosAge)} anos). Vale ver se há atualização no site da ${m.board.maker.split(' ')[0]}.` })
  if (m.cpu.virtualization === false) out.push({ level: 'warning', text: 'A virtualização está desligada na BIOS (necessária para WSL, Android no Windows e máquinas virtuais).' })
  return out
}

export default function MachinePage() {
  const m = useLoad(useCallback(() => window.api.machine(), []))
  const vols = useLoad(useCallback(() => window.api.disks(), []))
  const { status: s } = useStatus(1)
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function refresh() { await window.api.machine(true).then(m.setData).catch((e) => setErr(message(e))) }
  async function pdf() {
    setBusy(true); setErr(null)
    try {
      const d = new Date(); const name = `Meu PC - ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.pdf`
      setSaved(await window.api.exportPdf(name))
    } catch (e) { setErr(message(e)) } finally { setBusy(false) }
  }

  if (m.error) return <><h1>Meu PC</h1><p className="err-text">{m.error}</p></>
  if (!m.data) return <><h1>Meu PC</h1><p className="muted">Lendo as informações da máquina (alguns segundos)…</p></>
  const d = m.data
  const gpu = d.gpus[0]

  return (
    <>
      <div className="print-only report-head">
        <div className="report-title">Relatório do PC</div>
        <div className="muted">Gerado pelo Xodó em {new Date().toLocaleString('pt-BR')}</div>
      </div>
      <div className="row between no-print">
        <div><h1>Meu PC</h1><p className="sub" style={{ marginBottom: 0 }}>Tudo sobre a máquina, lido do Windows em {new Date(d.time).toLocaleString('pt-BR')}.</p></div>
        <div className="row">
          <button className="btn" onClick={refresh} disabled={m.loading}>Atualizar</button>
          <button className="btn primary" onClick={pdf} disabled={busy}>{busy ? 'Gerando…' : 'Exportar PDF'}</button>
        </div>
      </div>
      {(saved || err) && (
        <div className="row no-print" style={{ margin: '10px 0' }}>
          {err ? <span className="err-text small">{err}</span> : <><span className="ok-text small">PDF salvo em {saved}</span><button className="btn small" onClick={() => window.api.openPath(saved!)}>Abrir</button></>}
        </div>
      )}

      <div className="card spec" style={{ marginTop: 16 }}>
        <div><span className="muted">Processador</span><b>{d.cpu.name}</b></div>
        <div><span className="muted">Placa de vídeo</span><b>{gpu ? `${gpu.name}${gpu.vram ? ` · ${bytes(gpu.vram)}` : ''}` : '–'}</b></div>
        <div><span className="muted">Memória</span><b>{bytes(d.memory.total)} {d.memory.modules[0]?.type} {d.memory.modules[0]?.configured ? `${d.memory.modules[0].configured} MHz` : ''}</b></div>
        <div><span className="muted">Placa-mãe</span><b>{d.board.maker.replace(/ COMPUTER INC\.?/i, '')} {d.board.model}</b></div>
        <div><span className="muted">Armazenamento</span><b>{d.disks.map((x) => `${bytes(x.size)} ${x.type === 'SSD' ? (x.bus === 'NVMe' ? 'SSD NVMe' : 'SSD') : x.type}`).join(' + ')}</b></div>
        <div><span className="muted">Sistema</span><b>{d.os.name.replace('Microsoft ', '')} {d.os.release}</b></div>
      </div>

      {notes(d).length > 0 && (
        <Section title="Observações">
          {notes(d).map((n) => <p key={n.text} style={{ margin: '0 0 6px' }}><span className={`badge lv-${n.level}`}>{n.level === 'good' ? 'ok' : 'atenção'}</span> {n.text}</p>)}
        </Section>
      )}

      {s && (
        <Section title="Agora">
          <KV rows={[
            ['Processador', <>{pct(s.cpu.load)} de uso {s.cpu.temp != null && <Heat t={s.cpu.temp} />}{s.cpu.power != null && ` · ${num(s.cpu.power)} W`}</>],
            ['Placa de vídeo', s.gpu.load == null && s.gpu.temp == null ? 'Sem sensor' : <>{pct(s.gpu.load)} de uso {s.gpu.temp != null && <Heat t={s.gpu.temp} />}{s.gpu.power != null && ` · ${num(s.gpu.power)} W`}</>],
            ['Memória em uso', `${bytes(s.ram.used)} de ${bytes(s.ram.total)} (${pct((100 * s.ram.used) / s.ram.total)})`],
            ['Ligado há', since(d.os.lastBoot)],
          ]} />
        </Section>
      )}

      <Section title="Processador">
        <KV rows={[
          ['Modelo', d.cpu.name], ['Fabricante', d.cpu.maker], ['Núcleos / threads', `${d.cpu.cores} núcleos, ${d.cpu.threads} threads`],
          ['Clock base', ghz(d.cpu.baseMHz)], ['Cache', `L2 ${bytes(d.cpu.l2KB * 1024)} · L3 ${bytes(d.cpu.l3KB * 1024)}`], ['Soquete', d.cpu.socket],
          ['Virtualização', d.cpu.virtualization == null ? '–' : d.cpu.virtualization ? 'Ativada' : 'Desativada'],
        ]} />
      </Section>

      {d.gpus.map((g) => (
        <Section key={g.name} title={d.gpus.length > 1 ? `Placa de vídeo: ${g.name}` : 'Placa de vídeo'}>
          <KV rows={[
            ['Modelo', g.name], ['Memória de vídeo (VRAM)', g.vram ? bytes(g.vram) : '–'], ['Driver', `${g.driver}${g.driverDate ? ` (${date(g.driverDate)})` : ''}`],
            ['Resolução atual', g.resolution ? `${g.resolution}${g.refresh ? ` a ${g.refresh} Hz` : ''}` : '–'],
          ]} />
        </Section>
      ))}

      <Section title="Memória RAM">
        <KV rows={[
          ['Total', bytes(d.memory.total)], ['Pentes', `${d.memory.modules.length}${d.memory.slots ? ` de ${d.memory.slots} encaixes usados` : ''}`],
          ['Tipo', d.memory.modules[0]?.type || '–'], ['Velocidade', d.memory.modules[0] ? `${d.memory.modules[0].configured ?? '–'} MHz (suporta ${d.memory.modules[0].speed ?? '–'} MHz)` : '–'],
        ]} />
        <table style={{ marginTop: 10 }}>
          <thead><tr><th>Encaixe</th><th>Tamanho</th><th>Fabricante</th><th>Modelo</th><th className="num">Velocidade</th></tr></thead>
          <tbody>{d.memory.modules.map((x) => <tr key={x.slot}><td>{x.slot}</td><td>{bytes(x.size)}</td><td>{x.maker}</td><td className="mono">{x.part}</td><td className="num">{x.configured ?? x.speed} MHz</td></tr>)}</tbody>
        </table>
      </Section>

      <Section title="Armazenamento">
        <table>
          <thead><tr><th>Disco</th><th>Tipo</th><th>Conexão</th><th className="num">Tamanho</th><th>Saúde</th></tr></thead>
          <tbody>{d.disks.map((x) => <tr key={x.name + x.size}><td>{x.name}</td><td>{x.type}</td><td>{x.bus}</td><td className="num">{bytes(x.size)}</td><td>{x.health === 'Healthy' ? <span className="ok-text">Boa</span> : <span className="err-text">{x.health || '–'}</span>}</td></tr>)}</tbody>
        </table>
        {vols.data && (
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>Unidade</th><th className="num">Livre</th><th className="num">Total</th><th className="num">Uso</th></tr></thead>
            <tbody>{vols.data.map((v) => <tr key={v.mount}><td>{v.mount.slice(0, 2)}</td><td className="num">{bytes(v.free)}</td><td className="num">{bytes(v.total)}</td><td className="num">{pct((100 * (v.total - v.free)) / v.total)}</td></tr>)}</tbody>
          </table>
        )}
      </Section>

      <Section title="Placa-mãe e BIOS">
        <KV rows={[['Fabricante', d.board.maker], ['Modelo', d.board.model], ['BIOS', `${d.board.biosMaker} versão ${d.board.biosVersion}`], ['Data da BIOS', date(d.board.biosDate)]]} />
      </Section>

      {d.monitors.length > 0 && (
        <Section title="Monitores">
          <KV rows={d.monitors.map((x, i) => [`Monitor ${i + 1}`, `${x.maker} ${x.name}${x.inches ? ` · ${num(x.inches)}"` : ''}`])} />
        </Section>
      )}

      {d.network.length > 0 && (
        <Section title="Rede">
          <KV rows={d.network.map((x) => [x.name, `${x.description} · ${x.speed}`])} />
        </Section>
      )}

      <Section title="Windows">
        <KV rows={[
          ['Edição', d.os.name.replace('Microsoft ', '')], ['Versão', `${d.os.release} (build ${d.os.build})`], ['Arquitetura', d.os.arch],
          ['Instalado em', date(d.os.installed)], ['Ligado desde', d.os.lastBoot ? new Date(d.os.lastBoot).toLocaleString('pt-BR') : '–'],
        ]} />
      </Section>
    </>
  )
}
