# Compila o leitor de sensores do Xodó (XodoSensores.exe) com o compilador C# que já vem no Windows (.NET Framework 4.8).
# As bibliotecas vêm do release oficial do LibreHardwareMonitor 0.9.6 (baixado uma vez para sensors-helper\lib e
# conferido por hash). Resultado em resources\sensores, que o instalador leva junto. Rodar: npm run sensores
param([string]$Out = (Join-Path $PSScriptRoot '..\resources\sensores'))
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$zipUrl = 'https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/download/v0.9.6/LibreHardwareMonitor.zip'
$libHash = '6EBC194316536BA61AF5BE24508AD9FCBB2ECC685E716C12E787C79530F66BF0'
$dlls = 'LibreHardwareMonitorLib', 'BlackSharp.Core', 'DiskInfoToolkit', 'RAMSPDToolkit-NDD', 'HidSharp',
  'System.Buffers', 'System.Memory', 'System.Numerics.Vectors', 'System.Runtime.CompilerServices.Unsafe'
$lib = Join-Path $PSScriptRoot 'lib'

if (-not (Test-Path (Join-Path $lib 'LibreHardwareMonitorLib.dll'))) {
  Write-Host 'Baixando o LibreHardwareMonitor 0.9.6...'
  $tmp = Join-Path $env:TEMP ('xodo-lhm-' + [guid]::NewGuid())
  New-Item -ItemType Directory $tmp | Out-Null
  try {
    Invoke-WebRequest -UseBasicParsing $zipUrl -OutFile "$tmp\lhm.zip"
    Expand-Archive "$tmp\lhm.zip" "$tmp\x"
    New-Item -ItemType Directory -Force $lib | Out-Null
    foreach ($d in $dlls) { Copy-Item (Get-ChildItem "$tmp\x" -Recurse -Filter "$d.dll" | Select-Object -First 1).FullName $lib }
  } finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
if ((Get-FileHash (Join-Path $lib 'LibreHardwareMonitorLib.dll')).Hash -ne $libHash) { throw 'LibreHardwareMonitorLib.dll diferente da versao esperada (0.9.6).' }

$fw = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
New-Item -ItemType Directory $Out | Out-Null
& "$fw\csc.exe" /nologo /target:winexe /optimize+ /platform:x64 "/out:$Out\XodoSensores.exe" "/r:$lib\LibreHardwareMonitorLib.dll" "/r:$fw\netstandard.dll" (Join-Path $PSScriptRoot 'XodoSensores.cs')
if ($LASTEXITCODE) { throw 'Falha ao compilar.' }
Copy-Item (Join-Path $PSScriptRoot 'XodoSensores.exe.config') $Out
foreach ($d in $dlls) { Copy-Item (Join-Path $lib "$d.dll") $Out }
Copy-Item (Join-Path $PSScriptRoot 'AVISOS-DE-TERCEIROS.txt') $Out
Copy-Item (Join-Path $PSScriptRoot 'licencas\*') $Out
Write-Host ('Pronto: {0} ({1:N1} MB)' -f (Resolve-Path $Out), ((Get-ChildItem $Out | Measure-Object Length -Sum).Sum / 1MB))
