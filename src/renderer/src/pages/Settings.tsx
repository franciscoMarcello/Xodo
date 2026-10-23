import { useEffect, useState } from 'react'
import { useSettings, useStatus } from '../hooks'
import { LhmBanner } from '../components'
import { bytes, num } from '../format'
import type { SelfWeight, Settings, WidgetPosition, WidgetSize } from '../../../shared/types'

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

export default function SettingsPage() {
  const { settings, save } = useSettings()
  const { status } = useStatus(1)
  const [msg, setMsg] = useState<string | null>(null)
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
      <div className="card">
        <h2>Sensores (LibreHardwareMonitor)</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          {status == null ? 'Lendo…' : status.lhm ? <span className="ok-text">● Conectado: temperaturas, GPU e potência disponíveis.</span> : <span className="err-text">● Não conectado.</span>}
          {status && !status.lhm && <button className="btn small" onClick={async () => setMsg(await window.api.startSensors() ? 'Iniciando… pode levar uns 10 segundos.' : 'A tarefa agendada do LibreHardwareMonitor não existe. Abra-o como administrador.')}>Iniciar LibreHardwareMonitor</button>}
          {msg && <span className="muted small">{msg}</span>}
        </div>
        <label className="field" style={{ maxWidth: 420 }}>Endereço do servidor web
          <input type="text" defaultValue={settings.lhmUrl} onBlur={(e) => save({ ...settings, lhmUrl: e.target.value.trim() || 'http://127.0.0.1:8085/data.json' })} />
        </label>
      </div>
      {status && !status.lhm && <LhmBanner />}
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
