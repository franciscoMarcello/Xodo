import { execFile } from 'node:child_process'
import type { MachineInfo } from '../shared/types'

// Ficha da máquina para a aba Meu PC. Uma leitura do Windows (WMI/CIM e registro, sem administrador) que leva ~5 s,
// feita só quando a aba é aberta e guardada na memória até o usuário pedir "Atualizar".

const SCRIPT = String.raw`
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
function s($c) { if ($c) { ($c | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) -join '' } else { '' } }
function d($x) { if ($x) { ([datetime]$x).ToString('o') } else { $null } }

$c = Get-CimInstance Win32_Processor | Select-Object -First 1
# A VRAM do Win32_VideoController para em 4 GB (campo de 32 bits); o valor real fica no registro do driver.
$vr = @(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0*')
$gpus = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Basic|Virtual|Remote|Parsec|Meta|Mirage' } | ForEach-Object {
  $n = $_.Name; $q = ($vr | Where-Object { $_.DriverDesc -eq $n } | Select-Object -First 1).'HardwareInformation.qwMemorySize'
  [ordered]@{ name = $n; driver = $_.DriverVersion; driverDate = (d $_.DriverDate)
    vram = $(if ($q) { [int64]$q } elseif ($_.AdapterRAM) { [int64]$_.AdapterRAM } else { $null })
    resolution = $(if ($_.CurrentHorizontalResolution) { '' + $_.CurrentHorizontalResolution + ' x ' + $_.CurrentVerticalResolution } else { $null })
    refresh = $_.CurrentRefreshRate }
})
$types = @{ 20 = 'DDR'; 21 = 'DDR2'; 24 = 'DDR3'; 26 = 'DDR4'; 34 = 'DDR5'; 35 = 'LPDDR5' }
$mods = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
  [ordered]@{ slot = $_.DeviceLocator; size = [int64]$_.Capacity; speed = $_.Speed; configured = $_.ConfiguredClockSpeed
    maker = ('' + $_.Manufacturer).Trim(); part = ('' + $_.PartNumber).Trim(); type = ('' + $types[[int]$_.SMBIOSMemoryType]) }
})
$b = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
$bi = Get-CimInstance Win32_BIOS | Select-Object -First 1
$o = Get-CimInstance Win32_OperatingSystem
$v = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$disks = @(Get-PhysicalDisk | ForEach-Object { [ordered]@{ name = ('' + $_.FriendlyName).Trim(); type = ('' + $_.MediaType); bus = ('' + $_.BusType); size = [int64]$_.Size; health = ('' + $_.HealthStatus) } })
$sizes = @{}
Get-CimInstance -Namespace root\wmi WmiMonitorBasicDisplayParams | ForEach-Object { if ($_.MaxHorizontalImageSize) { $sizes[$_.InstanceName] = [math]::Round([math]::Sqrt([math]::Pow($_.MaxHorizontalImageSize, 2) + [math]::Pow($_.MaxVerticalImageSize, 2)) / 2.54, 1) } }
$mons = @(Get-CimInstance -Namespace root\wmi WmiMonitorID | ForEach-Object { [ordered]@{ name = (s $_.UserFriendlyName); maker = (s $_.ManufacturerName); inches = $sizes[$_.InstanceName] } })
$net = @(Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | ForEach-Object { [ordered]@{ name = $_.Name; description = $_.InterfaceDescription; speed = ('' + $_.LinkSpeed) } })

[ordered]@{
  cpu = [ordered]@{ name = ('' + $c.Name).Trim(); maker = $c.Manufacturer; cores = $c.NumberOfCores; threads = $c.NumberOfLogicalProcessors; baseMHz = $c.MaxClockSpeed
    l2KB = $c.L2CacheSize; l3KB = $c.L3CacheSize; socket = $c.SocketDesignation; virtualization = $c.VirtualizationFirmwareEnabled }
  gpus = $gpus
  memory = [ordered]@{ total = [int64](($mods | ForEach-Object { $_.size }) | Measure-Object -Sum).Sum; slots = (Get-CimInstance Win32_PhysicalMemoryArray | Measure-Object MemoryDevices -Sum).Sum; modules = $mods }
  board = [ordered]@{ maker = $b.Manufacturer; model = $b.Product; version = $b.Version; biosMaker = $bi.Manufacturer; biosVersion = $bi.SMBIOSBIOSVersion; biosDate = (d $bi.ReleaseDate) }
  os = [ordered]@{ name = $o.Caption; release = $v.DisplayVersion; build = ('' + $o.BuildNumber + '.' + $v.UBR); arch = $o.OSArchitecture; installed = (d $o.InstallDate); lastBoot = (d $o.LastBootUpTime) }
  disks = $disks
  monitors = $mons
  network = $net
} | ConvertTo-Json -Depth 5 -Compress
`

/** Códigos de fabricante do EDID (o Windows informa só as 3 letras). */
const MONITOR_MAKERS: Record<string, string> = { AOC: 'AOC', GSM: 'LG', SAM: 'Samsung', DEL: 'Dell', ACR: 'Acer', AUS: 'ASUS', BNQ: 'BenQ', HWP: 'HP', LEN: 'Lenovo', PHL: 'Philips', VSC: 'ViewSonic', MSI: 'MSI', GBT: 'Gigabyte', HPN: 'HP', AOU: 'AOC' }
const CPU_MAKERS: Record<string, string> = { AuthenticAMD: 'AMD', GenuineIntel: 'Intel' }

let cached: MachineInfo | null = null
let running: Promise<MachineInfo> | null = null

function read(): Promise<MachineInfo> {
  // -EncodedCommand evita qualquer problema de aspas com o script grande.
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    { windowsHide: true, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      if (err) return reject(new Error('Não foi possível ler as informações da máquina.'))
      try {
        const m = JSON.parse(out) as MachineInfo
        m.time = Date.now()
        m.cpu.maker = CPU_MAKERS[m.cpu.maker] ?? m.cpu.maker
        m.monitors = (m.monitors ?? []).map((x) => ({ ...x, maker: MONITOR_MAKERS[x.maker] ?? x.maker }))
        for (const k of ['gpus', 'disks', 'network'] as const) m[k] = (m[k] ?? []) as never
        m.memory.modules ??= []
        resolve(m)
      } catch { reject(new Error('O Windows devolveu as informações da máquina num formato inesperado.')) }
    }))
}

export function machine(refresh = false): Promise<MachineInfo> {
  if (cached && !refresh) return Promise.resolve(cached)
  running ??= read().then((m) => (cached = m)).finally(() => { running = null })
  return running
}
