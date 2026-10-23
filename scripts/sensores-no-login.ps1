# Cria a tarefa agendada "LibreHardwareMonitor": abre o LHM como administrador quando você entra no Windows,
# sem pedir permissão toda vez. Precisa rodar uma vez como administrador:
#   powershell -ExecutionPolicy Bypass -File scripts\sensores-no-login.ps1
# O Xodó também usa esta tarefa para iniciar os sensores quando eles não estão respondendo.
param([string] $Exe = (Join-Path $env:USERPROFILE 'Programas\LibreHardwareMonitor\LibreHardwareMonitor.exe'))

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Exe)) { throw "LibreHardwareMonitor não encontrado em $Exe" }

$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $Exe -WorkingDirectory (Split-Path $Exe)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
# Sem limite de tempo (o padrão do Windows mata a tarefa depois de 3 dias) e sem parar na bateria.
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'LibreHardwareMonitor' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

# Reinicia pelo agendador para conferir que funciona.
Get-Process LibreHardwareMonitor -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
Start-ScheduledTask -TaskName 'LibreHardwareMonitor'
Write-Host 'Tarefa "LibreHardwareMonitor" criada e iniciada.'
