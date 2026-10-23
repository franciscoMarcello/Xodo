import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Go } from '../App'
import { useLoad, useStatus } from '../hooks'
import { brl, bytes, num, pct, rate, watts } from '../format'
import { ChartTip, Heat, Legend, LhmBanner, Tile } from '../components'
import { useCallback, useEffect, useState } from 'react'
import { LEVEL } from './Alerts'
import type { Alert } from '../../../shared/types'

/** Os 3 alertas mais graves; só busca a lista quando o número de alertas muda. */
function AlertsSummary({ count, go }: { count: number; go: Go }) {
  const [list, setList] = useState<Alert[]>([])
  useEffect(() => { if (count) window.api.alerts().then((v) => setList(v.open)); else setList([]) }, [count])
  if (!count || !list.length) return null
  return (
    <div className="card" style={{ borderLeft: `3px solid var(--${list[0].level})` }}>
      <div className="row between"><h2 style={{ margin: 0 }}>{count === 1 ? '1 coisa fora do normal' : `${count} coisas fora do normal`}</h2><button className="btn small" onClick={() => go('alerts')}>Ver alertas</button></div>
      <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
        {list.slice(0, 3).map((a) => <div key={a.id} className="row"><span className={`badge lv-${a.level}`}>{LEVEL[a.level]}</span><span>{a.title}</span></div>)}
      </div>
    </div>
  )
}

export default function Overview({ go }: { go: Go }) {
  const { status: s, history } = useStatus(60)
  const energy = useLoad(useCallback(() => window.api.energy(), []))
  if (!s) return <p className="muted">Lendo os sensores…</p>
  const today = energy.data ? (energy.data.todayWh / 1000) * energy.data.tariff : null
  const data = history.map((h) => ({ t: h.time, CPU: h.cpu.load, GPU: h.gpu.load }))
  return (
    <>
      <h1>Visão geral</h1>
      <p className="sub">Atualiza a cada 2 segundos.{s.game && <> Jogando agora: <b className="ok-text">{s.game}</b>.</>}</p>
      {!s.lhm && <LhmBanner onSettings={() => go('settings')} />}
      <AlertsSummary count={s.alerts} go={go} />
      <div className="grid">
        <Tile label="Processador" value={pct(s.cpu.load)} detail={<><Heat t={s.cpu.temp} />{s.cpu.power != null && <span>{watts(s.cpu.power)}</span>}</>} name={s.cpu.name} />
        <Tile label="Placa de vídeo" value={pct(s.gpu.load)} detail={<><Heat t={s.gpu.temp} />{s.gpu.power != null && <span>{watts(s.gpu.power)}</span>}</>} name={s.gpu.name} />
        <Tile label="Memória RAM" value={pct((100 * s.ram.used) / s.ram.total)} detail={`${bytes(s.ram.used)} de ${bytes(s.ram.total)}`} />
        <Tile label="Internet agora" value={<span style={{ fontSize: 20 }}>↓ {rate(s.net.down)}</span>} detail={`↑ ${rate(s.net.up)}`} />
        <Tile label="Consumo agora" value={`${num(s.watts)} W`} detail={today != null ? `Hoje: ${num(energy.data!.todayWh / 1000, 2)} kWh · ${brl(today)}` : 'Estimativa'} />
      </div>
      <div className="card">
        <h2>Uso {s.gpu.load == null && 'da CPU '}nos últimos 2 minutos</h2>
        {s.gpu.load != null && <Legend items={[['CPU', 'var(--series-1)'], ['GPU', 'var(--series-2)']]} />}
        <div style={{ height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="t" tick={false} stroke="var(--axis)" />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} stroke="var(--axis)" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
              <Tooltip content={<ChartTip fmt={(v) => pct(v)} labelFmt={(l) => new Date(Number(l)).toLocaleTimeString('pt-BR')} />} />
              <Line dataKey="CPU" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
              {s.gpu.load != null && <Line dataKey="GPU" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  )
}
