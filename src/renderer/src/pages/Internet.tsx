import { useCallback, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLoad, useSettings } from '../hooks'
import { dateTime, num, shortDate } from '../format'
import { ChartTip, Legend, Tile } from '../components'

const mbps = (v: number) => `${num(v, v < 10 ? 1 : 0)} Mb/s`

export default function InternetPage() {
  const h = useLoad(useCallback(() => window.api.speedHistory(), []))
  const { settings, save } = useSettings()
  const [running, setRunning] = useState(false)
  const ok = (h.data ?? []).filter((r) => !r.error)
  const last = ok.at(-1)
  const avg = (k: 'down' | 'up' | 'ping') => (ok.length ? ok.reduce((a, r) => a + r[k], 0) / ok.length : 0)
  const night = ok.filter((r) => { const hr = new Date(r.time).getHours(); return hr >= 19 && hr <= 23 })
  const nightDown = night.length ? night.reduce((a, r) => a + r.down, 0) / night.length : null

  async function run() { setRunning(true); try { await window.api.speedRun(); await h.reload() } finally { setRunning(false) } }
  if (!settings) return null
  const i = settings.internet
  const contracted = i.contractedDown

  return (
    <>
      <h1>Histórico de internet</h1>
      <p className="sub">Testes automáticos a cada {i.intervalHours} h (pulados durante jogos). Cada teste usa uns 50 MB da franquia.</p>
      <div className="grid">
        <Tile label="Último download" value={last ? mbps(last.down) : '–'} detail={last && dateTime(last.time)} />
        <Tile label="Último upload" value={last ? mbps(last.up) : '–'} detail={last && `Ping ${last.ping} ms`} />
        <Tile label={`Média (${ok.length} testes)`} value={ok.length ? mbps(avg('down')) : '–'} detail={ok.length ? `↑ ${mbps(avg('up'))} · ping ${Math.round(avg('ping'))} ms` : undefined} />
        <Tile label="Download à noite (19h–23h)" value={nightDown != null ? mbps(nightDown) : '–'} detail={contracted && nightDown != null ? `${num((100 * nightDown) / contracted)}% do contratado` : 'Horário de mais uso na rede'} />
      </div>
      <div className="card">
        <div className="row between"><h2>Velocidade ao longo do tempo</h2><button className="btn primary" disabled={running} onClick={run}>{running ? 'Testando… (uns 20 s)' : 'Testar agora'}</button></div>
        {ok.length < 2 ? <p className="muted">O gráfico aparece depois de dois testes.</p> : (
          <>
            <Legend items={[['Download', 'var(--series-1)'], ['Upload', 'var(--series-2)'], ...(contracted ? [['Contratado (download)', 'var(--muted)'] as [string, string]] : [])]} />
            <div style={{ height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={ok.map((r) => ({ t: r.time, Download: r.down, Upload: r.up }))} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t) => shortDate(t)} stroke="var(--axis)" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `${v}`} unit=" Mb/s" width={80} stroke="var(--axis)" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                  <Tooltip content={<ChartTip fmt={mbps} labelFmt={(l) => dateTime(Number(l))} />} />
                  {contracted > 0 && <ReferenceLine y={contracted} stroke="var(--muted)" strokeDasharray="4 4" />}
                  <Line dataKey="Download" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  <Line dataKey="Upload" stroke="var(--series-2)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
      <div className="card">
        <h2>Ajustes</h2>
        <div className="fields">
          <label className="field">Plano contratado: download (Mb/s)<input type="number" min={0} defaultValue={i.contractedDown || ''} onBlur={(e) => save({ ...settings, internet: { ...i, contractedDown: Number(e.target.value) || 0 } })} /></label>
          <label className="field">Plano contratado: upload (Mb/s)<input type="number" min={0} defaultValue={i.contractedUp || ''} onBlur={(e) => save({ ...settings, internet: { ...i, contractedUp: Number(e.target.value) || 0 } })} /></label>
          <label className="field">Testar a cada (horas)<input type="number" min={1} max={24} defaultValue={i.intervalHours} onBlur={(e) => save({ ...settings, internet: { ...i, intervalHours: Math.min(24, Math.max(1, Number(e.target.value) || 4)) } })} /></label>
        </div>
        <label className="switch"><input type="checkbox" checked={i.enabled} onChange={() => save({ ...settings, internet: { ...i, enabled: !i.enabled } })} /> Testes automáticos</label>
      </div>
      {!!h.data?.length && (
        <div className="card">
          <h2>Testes</h2>
          <table>
            <thead><tr><th>Quando</th><th className="num">Download</th><th className="num">Upload</th><th className="num">Ping</th></tr></thead>
            <tbody>{[...h.data].reverse().slice(0, 50).map((r) => (
              <tr key={r.time}><td>{dateTime(r.time)}</td>{r.error ? <td colSpan={3} className="err-text">{r.error}</td> : <><td className="num">{mbps(r.down)}</td><td className="num">{mbps(r.up)}</td><td className="num">{r.ping} ms</td></>}</tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  )
}
