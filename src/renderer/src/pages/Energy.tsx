import { useCallback, useEffect } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLoad, useSettings, useStatus } from '../hooks'
import { brl, duration, num, shortDate } from '../format'
import { ChartTip, Tile } from '../components'
import type { Settings } from '../../../shared/types'

const kwh = (wh: number) => `${num(wh / 1000, 2)} kWh`

export default function EnergyPage() {
  const e = useLoad(useCallback(() => window.api.energy(), []))
  const { settings, save } = useSettings()
  const { status } = useStatus(1)
  useEffect(() => { const t = setInterval(e.reload, 30_000); return () => clearInterval(t) }, [e.reload])
  if (!settings || !e.data) return null
  const en = settings.energy; const tariff = e.data.tariff
  const money = (wh: number) => brl((wh / 1000) * tariff)
  const today = e.data.days.at(-1)
  const field = (k: keyof Settings['energy'], label: string, step = 1) => (
    <label className="field">{label}<input type="number" step={step} min={0} defaultValue={en[k]} onBlur={(ev) => save({ ...settings, energy: { ...en, [k]: Number(ev.target.value.replace(',', '.')) || 0 } }).then(e.reload)} /></label>
  )

  return (
    <>
      <h1>Gasto de energia</h1>
      <p className="sub">Estimativa enquanto o app está aberto (deixe-o na bandeja para medir o dia todo).{!status?.lhm && ' Sem os sensores (Ajustes), CPU e GPU são estimadas pelo uso.'}</p>
      <div className="grid">
        <Tile label="Agora" value={status ? `${status.watts} W` : '–'} detail={status ? `${brl((status.watts / 1000) * tariff)} por hora` : undefined} />
        <Tile label="Hoje" value={money(e.data.todayWh)} detail={`${kwh(e.data.todayWh)}${today ? ` · ${duration(today.seconds * 1000)} medidos` : ''}`} />
        <Tile label="Este mês" value={money(e.data.monthWh)} detail={kwh(e.data.monthWh)} />
        <Tile label="Previsão do mês" value={money(e.data.projectionWh)} detail={`${kwh(e.data.projectionWh)} no ritmo atual`} />
      </div>
      <div className="card">
        <h2>Consumo por dia (kWh)</h2>
        {e.data.days.length === 0 ? <p className="muted">Ainda sem dados. O primeiro dia aparece aqui em instantes.</p> : (
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={e.data.days.map((d) => ({ date: d.date, kWh: d.wh / 1000 }))} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => shortDate(d)} stroke="var(--axis)" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                <YAxis stroke="var(--axis)" tick={{ fill: 'var(--muted)', fontSize: 12 }} tickFormatter={(v) => num(v, v > 0 && v < 1 ? 2 : 1)} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<ChartTip fmt={(v) => `${num(v, 2)} kWh · ${brl(v * tariff)}`} labelFmt={(l) => shortDate(String(l))} />} />
                <Bar dataKey="kWh" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="card">
        <h2>Ajustes da estimativa</h2>
        <div className="fields">
          {field('tariff', 'Tarifa (R$ por kWh, com impostos)', 0.01)}
          {field('baseWatts', 'Resto do PC (placa-mãe, SSD, fans) em W')}
          {field('monitorWatts', 'Monitor(es) em W')}
          {field('cpuTdp', 'TDP da CPU em W (sem sensor)')}
          {field('gpuWatts', 'Potência máxima da GPU em W (sem sensor)')}
        </div>
        <p className="muted small" style={{ margin: 0 }}>A tarifa está na sua conta de luz: divida o valor total pelo consumo em kWh. Uma fonte comum perde uns 13% em calor, e isso já entra na conta.</p>
      </div>
    </>
  )
}
