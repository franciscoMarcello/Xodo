import { useCallback, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLoad } from '../hooks'
import { num, timeTicks } from '../format'
import { Heat, Legend, Tile } from '../components'
import type { HistPoint, HistRange, Metric } from '../../../shared/types'

const RANGES: [HistRange, string][] = [['24h', '24 horas'], ['7d', '7 dias'], ['30d', '30 dias']]
type Row = HistPoint | ({ t: number } & Partial<HistPoint>)

/** Intervalos sem dados (PC desligado ou painel fechado) viram buracos na linha em vez de uma reta enganosa. */
function withGaps(points: HistPoint[], bucketMin: number): Row[] {
  const out: Row[] = []
  for (let i = 0; i < points.length; i++) {
    if (i && points[i].t - points[i - 1].t > 2 * bucketMin * 60_000) out.push({ t: points[i - 1].t + bucketMin * 60_000 })
    out.push(points[i])
  }
  return out
}

const fmtTime = (range: HistRange) => (t: number) => new Date(t).toLocaleString('pt-BR', range === '24h' ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit' })
const when = (t: number) => new Date(t).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Maior máximo de uma medida e quando foi. */
function peak(points: HistPoint[], m: Metric) {
  let best: HistPoint | null = null
  for (const p of points) if (p[`${m}Max`] != null && (!best || p[`${m}Max`]! > best[`${m}Max`]!)) best = p
  return best ? { v: best[`${m}Max`]!, t: best.t } : null
}
const mean = (points: HistPoint[], m: Metric) => { const v = points.map((p) => p[m]).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }

function Tip({ active, payload, series, unit, range, bucket }: { active?: boolean; payload?: { payload: Row }[]; series: [Metric, string, string][]; unit: string; range: HistRange; bucket: number }) {
  const p = payload?.[0]?.payload; if (!active || !p || p.cpu === undefined) return null
  const end = new Date(p.t + bucket * 60_000)
  return (
    <div className="chart-tip">
      <div className="t">{fmtTime(range)(p.t)}{range === '24h' ? `–${end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ` ${new Date(p.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}</div>
      {series.map(([m, name, color]) => p[m] != null && <div key={m}><span style={{ color }}>■</span> {name}: <b>{num(p[m]!)}{unit}</b> <span className="muted">(máx. {num(p[`${m}Max`]!)}{unit})</span></div>)}
    </div>
  )
}

function Chart({ title, data, series, unit, domain, range, bucket }: { title: string; data: Row[]; series: [Metric, string, string][]; unit: string; domain?: [number, number]; range: HistRange; bucket: number }) {
  const shown = series.filter(([m]) => data.some((p) => p[m] != null))
  if (!shown.length) return null
  return (
    <div className="card">
      <h2>{title}</h2>
      {shown.length > 1 && <Legend items={shown.map(([, name, color]) => [name, color])} />}
      <div style={{ height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={timeTicks(data[0].t, data[data.length - 1].t, range === '24h' ? 3 : 24)} tickFormatter={fmtTime(range)} stroke="var(--axis)" tick={{ fill: 'var(--muted)', fontSize: 12 }} minTickGap={40} />
            <YAxis domain={domain ?? ['auto', 'auto']} tickFormatter={(v) => `${v}${unit}`} width={58} stroke="var(--axis)" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
            <Tooltip content={<Tip series={shown} unit={unit} range={range} bucket={bucket} />} />
            {shown.map(([m, name, color]) => <Line key={m} dataKey={m} name={name} stroke={color} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function HistoryPage() {
  const [range, setRange] = useState<HistRange>('24h')
  const h = useLoad(useCallback(() => window.api.history(range), [range]))
  const points = h.data?.points ?? []
  const bucket = h.data?.bucketMinutes ?? 5
  const data = withGaps(points, bucket)
  const cpuPeak = peak(points, 'cpuTemp'), gpuPeak = peak(points, 'gpuTemp'), ramPeak = peak(points, 'ram')
  const watts = mean(points, 'watts')

  return (
    <>
      <h1>Histórico</h1>
      <p className="sub">Média e máximo de cada {bucket < 60 ? `${bucket} minutos` : bucket === 60 ? 'hora' : `${bucket / 60} horas`}. Os detalhes por minuto ficam 7 dias; os resumos por hora ficam para sempre. Buracos no gráfico = painel fechado ou PC desligado.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        {RANGES.map(([r, label]) => <button key={r} className={`btn${r === range ? ' primary' : ''}`} onClick={() => setRange(r)}>{label}</button>)}
      </div>
      {h.loading && !h.data ? <p className="muted">Carregando…</p> : points.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Ainda sem histórico neste período. O primeiro resumo é gravado depois de 1 minuto com o painel aberto{range !== '24h' && ', e o primeiro resumo por hora depois de 1 hora'}.</p></div>
      ) : (
        <>
          <div className="grid">
            <Tile label="CPU mais quente" value={cpuPeak ? `${num(cpuPeak.v)} °C` : '–'} detail={cpuPeak ? <><Heat t={cpuPeak.v} /><span>{when(cpuPeak.t)}</span></> : 'Sem sensor'} />
            <Tile label="GPU mais quente" value={gpuPeak ? `${num(gpuPeak.v)} °C` : '–'} detail={gpuPeak ? <><Heat t={gpuPeak.v} /><span>{when(gpuPeak.t)}</span></> : 'Sem sensor'} />
            <Tile label="Pico de RAM" value={ramPeak ? `${num(ramPeak.v)}%` : '–'} detail={ramPeak ? when(ramPeak.t) : undefined} />
            <Tile label="Consumo médio" value={watts != null ? `${num(watts)} W` : '–'} detail={`Uso médio da CPU no período: ${num(mean(points, 'cpu') ?? 0)}%`} />
          </div>
          <Chart title="Temperatura" unit=" °C" data={data} range={range} bucket={bucket} series={[['cpuTemp', 'CPU', 'var(--series-1)'], ['gpuTemp', 'GPU', 'var(--series-2)']]} />
          <Chart title="Uso" unit="%" domain={[0, 100]} data={data} range={range} bucket={bucket} series={[['cpu', 'CPU', 'var(--series-1)'], ['gpu', 'GPU', 'var(--series-2)'], ['ram', 'RAM', 'var(--series-3)']]} />
          <Chart title="Consumo estimado" unit=" W" data={data} range={range} bucket={bucket} series={[['watts', 'Consumo', 'var(--series-1)']]} />
        </>
      )}
    </>
  )
}
