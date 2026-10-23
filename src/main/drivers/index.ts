import { execFile } from 'node:child_process'
import type { DriverInfo, DriversView, DriverUpdate } from '../../shared/types'
import { readJson, writeJson } from '../store'
import { amdDriverUrl, compareVersions, latestAmd, parseAmdPage } from './parse'

// Drivers: o que está instalado, o que o Windows Update oferece e a versão mais nova no site da AMD.
// A busca do Windows Update leva ~10 s (o serviço do Windows faz o trabalho), então roda 1 vez por dia, fora de jogos,
// ou quando o usuário pede. Só vira alerta o que for mais novo que o instalado.

const FILE = 'drivers.json'
const HOUR = 3600_000

const SCRIPT = String.raw`
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
function d($x) { if ($x) { ([datetime]$x).ToString('yyyy-MM-dd') } else { $null } }
$all = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object DeviceName)
$updates = @(); $err = $null
try {
  $r = (New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher().Search("IsInstalled=0 and Type='Driver'")
  foreach ($u in $r.Updates) {
    $cur = $all | Where-Object { ($u.DriverHardwareID -and $_.HardWareID -eq $u.DriverHardwareID) -or ($u.DriverModel -and $_.DeviceName -eq $u.DriverModel) } | Select-Object -First 1
    $updates += [ordered]@{ title = $u.Title; cls = $u.DriverClass; model = $u.DriverModel; date = (d $u.DriverVerDate); size = [int64]$u.MaxDownloadSize
      curVersion = $cur.DriverVersion; curDate = (d $cur.DriverDate); curDevice = $cur.DeviceName }
  }
} catch { $err = $_.Exception.Message }
$installed = @($all | Where-Object { $_.DeviceClass -in 'DISPLAY','NET','MEDIA','SYSTEM','HDC','SCSIADAPTER','USB','BLUETOOTH' -and $_.DriverProviderName -notmatch '^Microsoft' } |
  ForEach-Object { [ordered]@{ device = $_.DeviceName; cls = $_.DeviceClass; provider = $_.DriverProviderName; version = $_.DriverVersion; date = (d $_.DriverDate) } })
$gpu = $all | Where-Object { $_.DeviceClass -eq 'DISPLAY' -and $_.DeviceName -notmatch 'Basic|Virtual|Remote|Parsec|Meta' } | Select-Object -First 1
[ordered]@{
  updates = $updates; installed = $installed; wuError = $err
  gpu = [ordered]@{ name = $gpu.DeviceName; provider = $gpu.DriverProviderName; version = $gpu.DriverVersion; date = (d $gpu.DriverDate) }
  radeon = (Get-ItemProperty 'HKLM:\SOFTWARE\ATI Technologies\Install').RadeonSoftwareVersion
} | ConvertTo-Json -Depth 4 -Compress
`

interface Raw {
  updates: { title: string; cls: string; model: string; date: string | null; size: number; curVersion: string | null; curDate: string | null; curDevice: string | null }[]
  installed: DriverInfo[]; wuError: string | null; gpu: { name: string | null; provider: string | null; version: string | null; date: string | null }; radeon: string | null
}

function readWindows(): Promise<Raw> {
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    { windowsHide: true, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      if (err) return reject(new Error('Não foi possível consultar os drivers do Windows.'))
      try { resolve(JSON.parse(out)) } catch { reject(new Error('O Windows devolveu a lista de drivers num formato inesperado.')) }
    }))
}

const mb = (b: number) => (b > 0 ? `${b >= 1024 ** 3 ? (b / 1024 ** 3).toFixed(1) + ' GB' : Math.max(1, Math.round(b / 1024 ** 2)) + ' MB'}` : null)
const vendorOf = (s: string) => (/amd|radeon|advanced micro/i.test(s) ? 'amd' : /nvidia|geforce/i.test(s) ? 'nvidia' : /intel/i.test(s) ? 'intel' : 'other') as 'amd' | 'nvidia' | 'intel' | 'other'
const VENDOR_LINK = { nvidia: 'https://www.nvidia.com/pt-br/drivers/', intel: 'https://www.intel.com.br/content/www/br/pt/support/detect.html', other: 'ms-settings:windowsupdate' }

async function amdLatest(gpuName: string) {
  const url = amdDriverUrl(gpuName); if (!url) return null
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' } })
  if (!r.ok) return null
  const latest = latestAmd(parseAmdPage(await r.text()))
  return latest ? { ...latest, url } : null
}

let view: DriversView = { ...readJson<Omit<DriversView, 'checking'>>(FILE, { checked: null, installed: [], updates: [], gpu: null }), checking: false }
let running: Promise<DriversView> | null = null

export const current = () => view

export function check(): Promise<DriversView> {
  running ??= (async () => {
    view = { ...view, checking: true }
    try {
      const raw = await readWindows()
      const updates: DriverUpdate[] = (raw.updates ?? []).map((u) => ({
        source: 'windows-update', device: u.curDevice ?? u.model, title: u.title, current: u.curVersion, currentDate: u.curDate,
        available: /(\d+(?:\.\d+){2,3})\s*$/.exec(u.title)?.[1] ?? u.model, availableDate: u.date, size: mb(u.size),
        // Só é novidade se dá para comparar e o oferecido é mais novo (o Windows Update às vezes oferece drivers antigos).
        newer: !!(u.date && u.curDate && u.date > u.curDate),
      }))
      let gpu: DriversView['gpu'] = null
      if (raw.gpu?.name) {
        const vendor = vendorOf(`${raw.gpu.provider} ${raw.gpu.name}`)
        const latest = vendor === 'amd' ? await amdLatest(raw.gpu.name).catch(() => null) : null
        const installed = vendor === 'amd' ? raw.radeon : raw.gpu.version
        gpu = { name: raw.gpu.name, vendor, installed, latest: latest?.version ?? null, latestDate: latest?.date ?? null, link: latest?.url ?? amdDriverUrl(raw.gpu.name) ?? VENDOR_LINK[vendor === 'amd' ? 'other' : vendor] }
        if (latest && raw.radeon && compareVersions(latest.version, raw.radeon) > 0) updates.unshift({
          source: 'amd', device: raw.gpu.name, title: `AMD Software: Adrenalin ${latest.version}${latest.recommended ? ' (recomendado)' : ''}`,
          current: raw.radeon, currentDate: raw.gpu.date, available: latest.version, availableDate: latest.date, size: latest.size, newer: true, link: latest.url,
        })
      }
      view = { checked: Date.now(), checking: false, installed: raw.installed ?? [], updates, gpu, error: raw.wuError ? 'O Windows Update não respondeu; só a placa de vídeo foi verificada.' : undefined }
    } catch (e) {
      view = { ...view, checking: false, error: (e as Error).message }
    }
    const { checking: _, ...save } = view; writeJson(FILE, save)
    return view
  })().finally(() => { running = null })
  return running
}

/** Verifica 1 vez por dia: 3 min depois de abrir e depois de hora em hora vê se já passou 1 dia. Nunca durante jogos. */
export function scheduleDriverChecks(gaming: () => boolean, onResult: (v: DriversView) => void) {
  const tick = () => {
    if (gaming() || running || (view.checked && Date.now() - view.checked < 23 * HOUR)) return
    check().then(onResult).catch(() => {})
  }
  setTimeout(() => { onResult(view); tick() }, 3 * 60_000)
  setInterval(tick, HOUR)
}
