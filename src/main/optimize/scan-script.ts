// Script do PowerShell que lê tudo que a tela Otimizar precisa (só leitura, sem administrador). Fica num arquivo
// separado para o index.ts não ficar ilegível.

export const SCAN = String.raw`
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$sa = 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved'

# Ligado/desligado como o Gerenciador de Tarefas grava: 1º byte par = ligado, ímpar = desligado.
function enabled($hive, $sub, $name) { $v = (Get-ItemProperty "$($hive):\$sa\$sub" -Name $name).$name; if ($v) { ($v[0] % 2) -eq 0 } else { $true } }
function target($cmd) {
  if ($cmd -match '^\s*"([^"]+)"') { return $matches[1] }
  if ($cmd -match '^\s*(.+?\.exe)\b') { return $matches[1] }
  return ($cmd -split ' ')[0]
}
$startup = @()
foreach ($r in @(@('HKCU', 'Software\Microsoft\Windows\CurrentVersion\Run', 'Run', 'hkcu'), @('HKLM', 'Software\Microsoft\Windows\CurrentVersion\Run', 'Run', 'hklm'), @('HKLM', 'Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run', 'Run32', 'hklm32'))) {
  $p = Get-ItemProperty "$($r[0]):\$($r[1])"
  if ($p) { $p.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
    $t = [Environment]::ExpandEnvironmentVariables((target $_.Value))
    # Caminho sem pasta ("programa.exe"): procura no PATH do Windows antes de dizer que não existe.
    $ok = if ([IO.Path]::IsPathRooted($t)) { Test-Path -LiteralPath $t } else { [bool](Get-Command $t -CommandType Application) }
    $startup += [ordered]@{ name = $_.Name; command = '' + $_.Value; source = $r[3]; approvedKey = $r[2]; enabled = (enabled $r[0] $r[2] $_.Name); exists = [bool]$ok }
  } }
}
foreach ($f in @(@("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup", 'HKCU', 'folder'), @("$env:ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp", 'HKLM', 'folder-all'))) {
  Get-ChildItem $f[0] -File | Where-Object Name -ne 'desktop.ini' | ForEach-Object {
    $startup += [ordered]@{ name = $_.Name; command = $_.FullName; source = $f[2]; approvedKey = 'StartupFolder'; enabled = (enabled $f[1] 'StartupFolder' $_.Name); exists = $true }
  }
}

$active = (powercfg /getactivescheme) -join ' '
$plans = @(powercfg /list | ForEach-Object { if ($_ -match '([0-9a-f-]{36})\s+\((.+?)\)\s*(\*)?') { [ordered]@{ guid = $matches[1]; name = $matches[2]; active = [bool]$matches[3] } } })

$noLetter = @(Get-Partition | Where-Object { -not $_.DriveLetter -and $_.Type -eq 'Basic' -and $_.Size -gt 1GB } | ForEach-Object {
  $d = Get-Disk -Number $_.DiskNumber; [ordered]@{ disk = $d.FriendlyName; size = [int64]$_.Size } })
$cs = Get-CimInstance Win32_ComputerSystem
$pf = @(Get-CimInstance Win32_PageFileSetting | ForEach-Object { [ordered]@{ path = $_.Name; initialMB = $_.InitialSize; maxMB = $_.MaximumSize } })

$cache = 0
foreach ($p in "$env:LOCALAPPDATA\AMD\DxCache", "$env:LOCALAPPDATA\AMD\DxcCache", "$env:LOCALAPPDATA\AMD\VkCache", "$env:LOCALAPPDATA\NVIDIA\DXCache", "$env:LOCALAPPDATA\NVIDIA\GLCache", "$env:LOCALAPPDATA\D3DSCache") {
  $cache += (Get-ChildItem $p -Recurse -File -Force | Measure-Object Length -Sum).Sum
}
$gb = Get-ItemProperty 'HKCU:\Software\Microsoft\GameBar'
$dvr = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR'
$c = Get-PSDrive C
[ordered]@{
  startup = $startup; activePlan = $active; plans = $plans; noLetter = $noLetter
  pagefileAuto = [bool]$cs.AutomaticManagedPagefile; pagefiles = $pf; ramBytes = [int64]$cs.TotalPhysicalMemory
  shaderCacheBytes = [int64]$cache; gameMode = $gb.AutoGameModeEnabled; bgRecording = $dvr.HistoricalCaptureEnabled
  hags = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers').HwSchMode
  cFree = [int64]$c.Free; cTotal = [int64]($c.Free + $c.Used)
  gpt = [bool]((Get-Disk | Where-Object IsBoot).PartitionStyle -eq 'GPT')
} | ConvertTo-Json -Depth 4 -Compress
`
