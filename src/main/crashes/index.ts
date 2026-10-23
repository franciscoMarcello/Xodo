import path from 'node:path'
import { execFile } from 'node:child_process'
import type { CrashView, HistPoint } from '../../shared/types'
import * as hist from '../history'
import { sessions } from '../games'
import { advise, classify, type Ctx, type RawEvent } from './explain'

// Diário de travamentos: lê os eventos do Windows (sem administrador) só quando a tela abre e cruza cada um com o
// histórico de temperatura e as sessões de jogo daquele momento.

const SCRIPT = (days: number) => String.raw`
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'
$since = (Get-Date).AddDays(-${days})
$out = @()
foreach ($f in @(
  @{ LogName = 'System'; Id = 41; ProviderName = 'Microsoft-Windows-Kernel-Power' },
  @{ LogName = 'System'; Id = 1001; ProviderName = 'Microsoft-Windows-WER-SystemErrorReporting' },
  @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WHEA-Logger' },
  @{ LogName = 'System'; Id = 4101 },
  @{ LogName = 'System'; ProviderName = 'disk'; Id = 7, 51, 153 },
  @{ LogName = 'Application'; ProviderName = 'Application Error'; Id = 1000 },
  @{ LogName = 'Application'; ProviderName = 'Application Hang'; Id = 1002 })) {
  $f.StartTime = $since
  foreach ($e in @(Get-WinEvent -FilterHashtable $f -MaxEvents 200)) {
    $d = [ordered]@{}; ([xml]$e.ToXml()).Event.EventData.Data | ForEach-Object { if ($_.Name) { $d[$_.Name] = '' + $_.'#text' } }
    $out += [ordered]@{ provider = $e.ProviderName; id = $e.Id; time = $e.TimeCreated.ToString('o'); data = $d; msg = ('' + $e.Message).Split([char]10)[0] }
  }
}
ConvertTo-Json -InputObject @($out) -Depth 4 -Compress
`

function read(days: number): Promise<RawEvent[]> {
  return new Promise((resolve, reject) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(SCRIPT(days), 'utf16le').toString('base64')],
    { windowsHide: true, timeout: 90_000, maxBuffer: 32 * 1024 * 1024 }, (err, out) => {
      if (err) return reject(new Error('Não foi possível ler o registro de eventos do Windows.'))
      try { resolve(JSON.parse(out || '[]')) } catch { reject(new Error('O registro de eventos veio num formato inesperado.')) }
    }))
}

/** Temperatura máxima nos 5 minutos antes do evento (minutos se houver; senão a hora) e o jogo aberto. */
function contextAt(t: number, pts: { minutes: HistPoint[]; hours: HistPoint[] }, games: { game: string; start: number; end: number }[]): Ctx {
  let w = pts.minutes.filter((p) => p.t >= t - 5 * 60_000 && p.t <= t)
  if (!w.length) w = pts.hours.filter((p) => p.t >= t - 3600_000 && p.t <= t)
  const max = (k: 'cpuTempMax' | 'gpuTempMax') => { const v = w.map((p) => p[k]).filter((x): x is number => x != null); return v.length ? Math.max(...v) : null }
  return { cpuTemp: max('cpuTempMax'), gpuTemp: max('gpuTempMax'), game: games.find((s) => t >= s.start && t <= s.end + 120_000)?.game ?? null }
}

let cache: { days: number; at: number; view: CrashView } | null = null

export async function crashes(days: number): Promise<CrashView> {
  if (cache && cache.days === days && Date.now() - cache.at < 5 * 60_000) return cache.view
  const raw = await read(days)
  const pts = hist.allPoints(); const games = sessions()
  // O próprio app (nome atual do executável e o antigo, de antes de virar Xodó) não entra no diário.
  const own = new Set([path.basename(process.execPath).toLowerCase(), 'painel do pc.exe'])
  const events = raw.filter((e) => !own.has((e.data?.AppName ?? '').toLowerCase())).map((e) => classify({ ...e, data: e.data ?? {} }, contextAt(new Date(e.time).getTime(), pts, games)))
    .filter((e): e is NonNullable<typeof e> => !!e).sort((a, b) => b.time - a.time)
  const counts: CrashView['counts'] = {}
  for (const e of events) counts[e.kind] = (counts[e.kind] ?? 0) + 1
  const view: CrashView = { days, events: events.map(({ cause: _, ...e }) => e), advice: advise(events), counts }
  cache = { days, at: Date.now(), view }
  return view
}
