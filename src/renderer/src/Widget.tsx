import { useStatus } from './hooks'
import { pct, rate, temp, bytes } from './format'
import type { Status, WidgetSize } from '../../shared/types'

// Overlay em três tamanhos. O tamanho e o modo vêm do endereço (#widget-medium, #widget-small-fixed...).
// No modo fixo o mouse passa direto pela janela, então não há botão de fechar (liga/desliga em Ajustes ou na bandeja).

const WIDGET_BN = { gpu: 'GPU', cpu: 'CPU', vram: 'VRAM', ram: 'RAM', heat: 'calor', capped: 'limite de FPS' } as const
const deg = (t: number | null) => (t == null ? '' : ` · ${Math.round(t)}°`)

function Line({ k, load, value }: { k: string; load: number | null; value: string }) {
  return (
    <div className="line">
      <span className="k">{k}</span>
      <div className="bar"><div style={{ width: `${Math.min(100, load ?? 0)}%` }} /></div>
      <span className="v">{value}</span>
    </div>
  )
}

function Small({ s }: { s: Status }) {
  return (
    <div className="widget small">
      <div className="cells">
        <span><b>CPU</b> {pct(s.cpu.load)}{deg(s.cpu.temp)}</span>
        <span><b>GPU</b> {pct(s.gpu.load)}{deg(s.gpu.temp)}</span>
        <span><b>RAM</b> {pct((100 * s.ram.used) / s.ram.total)}</span>
        <span>{s.gpu.fps != null ? <><strong>{Math.round(s.gpu.fps)}</strong> FPS</> : `${s.watts} W`}{s.alerts > 0 && <span className="lv-warning"> ⚠{s.alerts}</span>}</span>
      </div>
    </div>
  )
}

function Head({ s, fixed }: { s: Status; fixed: boolean }) {
  return (
    <div className="head">
      <span>Xodó · {s.watts} W{s.alerts > 0 && <span className="lv-warning"> · ⚠ {s.alerts}</span>}</span>
      {!fixed && <button title="Esconder o overlay" onClick={() => window.api.toggleWidget()}>×</button>}
    </div>
  )
}

function Medium({ s, fixed }: { s: Status; fixed: boolean }) {
  return (
    <div className="widget">
      <Head s={s} fixed={fixed} />
      <Line k="CPU" load={s.cpu.load} value={`${pct(s.cpu.load)} · ${temp(s.cpu.temp)}`} />
      <Line k="GPU" load={s.gpu.load} value={s.gpu.load == null && s.gpu.temp == null ? 'sem sensor' : `${pct(s.gpu.load)} · ${temp(s.gpu.temp)}`} />
      <Line k="RAM" load={(100 * s.ram.used) / s.ram.total} value={bytes(s.ram.used)} />
      <div className="line"><span className="k">REDE</span><span className="small">↓ {rate(s.net.down)}</span><span className="v small">↑ {rate(s.net.up)}</span></div>
      {s.game ? <div className="game">🎮 {s.game}{s.gpu.fps != null && ` · ${Math.round(s.gpu.fps)} FPS`}{s.bottleneck && ` · gargalo: ${WIDGET_BN[s.bottleneck.kind]}`}</div> : !s.lhm && <div className="muted small">Sem sensores: ative em Ajustes</div>}
    </div>
  )
}

function Large({ s, fixed }: { s: Status; fixed: boolean }) {
  const vram = s.gpu.vramUsed != null && s.gpu.vramTotal ? (100 * s.gpu.vramUsed) / s.gpu.vramTotal : null
  return (
    <div className="widget">
      <Head s={s} fixed={fixed} />
      <Line k="CPU" load={s.cpu.load} value={`${pct(s.cpu.load)} · ${temp(s.cpu.temp)}`} />
      <Line k="NÚCLEO" load={s.cpu.coreMax} value={`${pct(s.cpu.coreMax)} máx.`} />
      <Line k="GPU" load={s.gpu.load} value={s.gpu.load == null && s.gpu.temp == null ? 'sem sensor' : `${pct(s.gpu.load)} · ${temp(s.gpu.temp)}`} />
      <Line k="VRAM" load={vram} value={vram == null ? '–' : `${(s.gpu.vramUsed! / 1024).toFixed(1)} GB`} />
      <Line k="RAM" load={(100 * s.ram.used) / s.ram.total} value={bytes(s.ram.used)} />
      <div className="line"><span className="k">REDE</span><span className="small">↓ {rate(s.net.down)}</span><span className="v small">↑ {rate(s.net.up)}</span></div>
      <div className="line"><span className="k">FPS</span><span className="big-fps">{s.gpu.fps != null ? Math.round(s.gpu.fps) : '–'}</span><span className="v small">{s.cpu.power != null || s.gpu.power != null ? `${Math.round((s.cpu.power ?? 0) + (s.gpu.power ?? 0))} W CPU+GPU` : ''}</span></div>
      {s.game ? <div className="game">🎮 {s.game}{s.bottleneck && ` · gargalo: ${WIDGET_BN[s.bottleneck.kind]}`}</div> : <div className="muted small">{s.lhm ? 'Nenhum jogo aberto' : 'Sem sensores: ative em Ajustes'}</div>}
    </div>
  )
}

export default function Widget() {
  const { status: s } = useStatus(1)
  const m = /^#widget-(small|medium|large)(-fixed)?/.exec(location.hash)
  const size = (m?.[1] ?? 'medium') as WidgetSize; const fixed = !!m?.[2]
  document.body.classList.toggle('widget-fixed', fixed)
  if (!s) return <div className={`widget${size === 'small' ? ' small' : ''}`}><span className="muted small">Lendo…</span></div>
  return size === 'small' ? <Small s={s} /> : size === 'large' ? <Large s={s} fixed={fixed} /> : <Medium s={s} fixed={fixed} />
}
