import { useEffect, useState } from 'react'
import { message, useSettings, useStatus } from '../hooks'
import { bytes, num } from '../format'
import type { SelfWeight, SensorsInfo, Settings, WidgetPosition, WidgetSize } from '../../../shared/types'

const SIZES: [WidgetSize, string, string][] = [['small', 'Pequeno', 'CPU, GPU, RAM e FPS'], ['medium', 'Médio', '+ barras, rede e jogo'], ['large', 'Grande', '+ núcleo, VRAM, FPS grande e gargalo']]
const CORNERS: [WidgetPosition, string][] = [['top-left', 'Superior esquerdo'], ['top-right', 'Superior direito'], ['bottom-left', 'Inferior esquerdo'], ['bottom-right', 'Inferior direito']]

function Overlay({ w, set }: { w: Settings['widget']; set: (w: Partial<Settings['widget']>) => void }) {
  return (
    <div className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Overlay</h2>
        <label className="switch"><input type="checkbox" checked={w.visible} onChange={() => set({ visible: !w.visible })} /> <b>{w.visible ? 'Ativo' : 'Desligado'}</b></label>
      </div>
      <p className="muted small">Janela sempre por cima de tudo, inclusive de jogos em tela cheia sem borda (em tela cheia exclusiva o Windows não deixa nada por cima).</p>
      <div className="overlay-opts" style={{ opacity: w.visible ? 1 : 0.5 }}>
        <div>
          <div className="opt-title">Tamanho</div>
          <div className="row">{SIZES.map(([id, label, hint]) => (
            <button key={id} className={`btn size-btn${w.size === id ? ' primary' : ''}`} onClick={() => set({ size: id })}><b>{label}</b><span className="small">{hint}</span></button>
          ))}</div>
        </div>
        <div>
          <div className="opt-title">Posição</div>
          <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div className="screen-pick">
              {CORNERS.map(([id, label]) => <button key={id} title={label} aria-label={label} className={`corner ${id}${w.position === id ? ' on' : ''}`} onClick={() => set({ position: id })} />)}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <span className="small">{w.position === 'free' ? 'Livre: arraste o overlay para onde quiser.' : `Fixo no canto ${CORNERS.find((c) => c[0] === w.position)?.[1].toLowerCase()}.`}</span>
              <span className="muted small">{w.position === 'free' ? 'A posição fica salva.' : 'Fixo, o mouse passa direto por ele (não atrapalha cliques no jogo).'}</span>
              <button className={`btn small${w.position === 'free' ? ' primary' : ''}`} style={{ justifySelf: 'start' }} onClick={() => set({ position: 'free' })}>Livre (arrastar)</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const LHM_URL = 'http://127.0.0.1:8085/data.json'

function Sensors({ live, url, setUrl }: { live: boolean | undefined; url: string; setUrl: (u: string) => void }) {
  const [info, setInfo] = useState<SensorsInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const read = () => window.api.sensorsInfo().then(setInfo)
  useEffect(() => { read() }, [live])
  /** O leitor leva alguns segundos para abrir depois da tarefa: relê o estado logo depois. */
  const later = () => { setTimeout(read, 3000); setTimeout(read, 8000) }
  const act = async (fn: () => Promise<SensorsInfo>, done: string) => {
    setBusy(true); setMsg(null)
    try { setInfo(await fn()); setMsg(done); later() } catch (e) { setMsg(message(e)) } finally { setBusy(false) }
  }
  if (!info) return <div className="card"><h2>Sensores</h2>Lendo…</div>
  const status = info.source === 'xodo'
    ? info.admin ? <span className="ok-text">● Conectado: temperaturas, GPU, potência e saúde dos discos.</span>
      : <span className="err-text">● Conectado sem permissão de administrador: só uso da CPU e da GPU (sem temperatura da CPU nem saúde dos discos).</span>
    : info.source === 'lhm' ? <span className="ok-text">● Conectado pelo LibreHardwareMonitor.</span>
      : <span className="err-text">● Não conectado: sem temperaturas, uso da GPU e potência.</span>
  return (
    <div className="card">
      <h2>Sensores</h2>
      <div style={{ marginBottom: 10 }}>{status}</div>
      {info.source === 'xodo' && info.admin && !info.cpuTemp && (
        <p className="small" style={{ marginTop: 0 }}>A temperatura da CPU precisa do driver gratuito <b>PawnIO</b>, que não veio instalado neste PC.{' '}
          <button className="btn small" onClick={() => window.api.openLink('https://pawnio.eu/')}>Baixar o PawnIO</button>{' '}<span className="muted">Depois de instalar, reinicie o PC.</span></p>
      )}
      {!info.installed && (info.bundled ? <>
        <p className="muted small" style={{ marginTop: 0 }}>O Windows só entrega temperaturas e saúde dos discos para programas com permissão de administrador. <b>Ativar</b> pede essa permissão <b>uma vez</b> e instala um leitor pequeno do Xodó (3 MB, ~40 MB de memória, metade do LibreHardwareMonitor) em Arquivos de Programas. Ele abre sozinho com o PC e só trabalha quando o Xodó pede uma leitura.</p>
        <button className="btn primary" disabled={busy} onClick={() => act(window.api.enableSensors, 'Ativado. Os sensores aparecem em alguns segundos.')}>{busy ? 'Esperando a permissão…' : 'Ativar sensores'}</button>
      </> : <p className="muted small">O leitor de sensores não veio nesta cópia do Xodó (em desenvolvimento: <code>npm run sensores</code>).</p>)}
      {info.installed && (
        <div className="row">
          {info.outdated && <button className="btn primary small" disabled={busy} onClick={() => act(window.api.enableSensors, 'Leitor atualizado.')}>Atualizar o leitor (versão nova do Xodó)</button>}
          {info.source !== 'xodo' && <button className="btn small" disabled={busy} onClick={async () => { setMsg(await window.api.startSensors() ? 'Iniciando… leva uns segundos.' : 'Não deu para iniciar. Tente Ativar de novo.'); later() }}>Iniciar o leitor</button>}
          <button className="btn small" disabled={busy} onClick={() => act(window.api.disableSensors, 'Desativado: o leitor e a tarefa foram removidos.')}>Desativar sensores</button>
          <span className="muted small">Desativar também pede permissão de administrador.</span>
        </div>
      )}
      {msg && <p className="small" style={{ marginBottom: 0 }}>{msg}</p>}
      <details style={{ marginTop: 12 }}>
        <summary className="muted small">Usar o LibreHardwareMonitor</summary>
        <p className="muted small">Se o leitor do Xodó não estiver rodando, o Xodó lê o servidor web do LibreHardwareMonitor (Options &gt; Remote Web Server, aberto como administrador) neste endereço:</p>
        <label className="field" style={{ maxWidth: 420 }}>Endereço do servidor web
          <input type="text" defaultValue={url} onBlur={(e) => setUrl(e.target.value.trim() || LHM_URL)} />
        </label>
      </details>
    </div>
  )
}

export default function SettingsPage() {
  const { settings, save } = useSettings()
  const { status } = useStatus(1)
  const [packaged, setPackaged] = useState<boolean | null>(null)
  useEffect(() => { window.api.isPackaged().then(setPackaged) }, [])
  const [weight, setWeight] = useState<SelfWeight | null>(null)
  useEffect(() => {
    const read = () => window.api.selfWeight().then(setWeight)
    read(); const t = setInterval(read, 5000); return () => clearInterval(t)
  }, [])
  if (!settings) return null
  return (
    <>
      <h1>Ajustes</h1>
      <p className="sub">Os ajustes de cada parte ficam na própria tela (Organizador, Internet, Energia, Jogos).</p>
      <Overlay w={settings.widget} set={(w) => save({ ...settings, widget: { ...settings.widget, ...w } })} />
      <Sensors live={status?.lhm} url={settings.lhmUrl} setUrl={(lhmUrl) => save({ ...settings, lhmUrl })} />
      <div className="card">
        <h2>Iniciar com o Windows</h2>
        <label className="switch"><input type="checkbox" checked={settings.startWithWindows} onChange={() => save({ ...settings, startWithWindows: !settings.startWithWindows })} /> Abrir o painel escondido na bandeja quando o Windows iniciar</label>
        {packaged === false && <p className="muted small" style={{ marginBottom: 0 }}>Só funciona na versão instalada (o .exe), não rodando pelo terminal.</p>}
      </div>
      <div className="card">
        <h2>Peso do painel</h2>
        <p style={{ margin: 0 }}>{weight ? <><b>{bytes(weight.ram)}</b> de memória · <b>{num(weight.cpu, 1)}%</b> de CPU · {weight.processes} processos</> : 'Medindo…'}</p>
        <p className="muted small" style={{ marginBottom: 0 }}>Com esta janela aberta. Fechando a janela, só o overlay e as medições continuam, e o painel fica bem mais leve.</p>
      </div>
      <div className="card">
        <h2>Funcionamento</h2>
        <p className="muted" style={{ margin: 0 }}>Fechar a janela não fecha o painel: ele continua na bandeja (perto do relógio), medindo energia, jogos e internet. Para sair de verdade, clique com o botão direito no ícone da bandeja e escolha <b>Sair</b>.</p>
      </div>
    </>
  )
}
