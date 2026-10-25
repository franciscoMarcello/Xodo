import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import type { SensorsInfo } from '../shared/types'
import { sensorSource } from './sensors'

// Leitor de sensores do Xodó (sensors-helper/XodoSensores.exe). Temperatura da CPU e saúde dos discos precisam de
// administrador, então "Ativar" pede o UAC uma vez: copia o leitor para Arquivos de Programas (só o administrador
// altera, então ninguém troca o programa que roda elevado) e cria uma tarefa agendada que o abre no login, já com
// permissão. Rodar a tarefa depois não pede nada.

export const TASK = 'Xodo Sensores'
const DIR = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Xodo', 'Sensores')
const EXE = 'XodoSensores.exe'
/** Cópia que vem com o instalador (ou do build em desenvolvimento). */
const bundled = () => app.isPackaged ? path.join(process.resourcesPath, 'sensores') : path.join(app.getAppPath(), 'resources', 'sensores')

const run = (cmd: string, args: string[], timeout = 15_000) => new Promise<boolean>((resolve) =>
  execFile(cmd, args, { windowsHide: true, timeout }, (err) => resolve(!err)))
const taskExists = () => run('schtasks', ['/Query', '/TN', TASK])
const hash = (f: string) => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') } catch { return null } }
/** Texto entre aspas simples no PowerShell. */
const q = (s: string) => `'${s.replace(/'/g, "''")}'`

/** Roda o script como administrador (um UAC). false = pedido recusado ou o script falhou. */
function elevated(script: string): Promise<boolean> {
  const body = `$ErrorActionPreference = 'Stop'\ntry {\n${script}\n} catch { exit 1 }`
  const b64 = Buffer.from(body, 'utf16le').toString('base64')
  const outer = `$p = Start-Process powershell -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${b64}'; exit $p.ExitCode`
  return run('powershell', ['-NoProfile', '-NonInteractive', '-Command', outer], 120_000)
}

export async function info(): Promise<SensorsInfo> {
  const src = hash(path.join(bundled(), EXE)), dst = hash(path.join(DIR, EXE))
  const installed = !!dst && await taskExists()
  return { ...sensorSource(), bundled: !!src, installed, outdated: installed && !!src && src !== dst }
}

/** Instala (ou atualiza) o leitor e inicia. Também serve para atualizar depois de uma versão nova do Xodó. */
export async function enable(): Promise<SensorsInfo> {
  const src = bundled()
  if (!fs.existsSync(path.join(src, EXE))) throw new Error('O leitor de sensores não veio nesta instalação.')
  const user = `${process.env.USERDOMAIN ?? ''}\\${process.env.USERNAME ?? ''}`
  const ok = await elevated(`
Get-Process XodoSensores -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
$dst = ${q(DIR)}
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item (Join-Path ${q(src)} '*') $dst -Recurse -Force
$a = New-ScheduledTaskAction -Execute (Join-Path $dst '${EXE}')
$t = New-ScheduledTaskTrigger -AtLogOn -User ${q(user)}
$p = New-ScheduledTaskPrincipal -UserId ${q(user)} -LogonType Interactive -RunLevel Highest
$s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable
Register-ScheduledTask -TaskName ${q(TASK)} -Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null
Start-ScheduledTask -TaskName ${q(TASK)}`)
  if (!ok) throw new Error('Não ativou: o pedido de administrador foi recusado ou deu erro.')
  return info()
}

/** Tira a tarefa e apaga o leitor de Arquivos de Programas. */
export async function disable(): Promise<SensorsInfo> {
  const ok = await elevated(`
Unregister-ScheduledTask -TaskName ${q(TASK)} -Confirm:$false -ErrorAction SilentlyContinue
Get-Process XodoSensores -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
Remove-Item ${q(path.dirname(DIR))} -Recurse -Force -ErrorAction SilentlyContinue`)
  if (!ok) throw new Error('Não desativou: o pedido de administrador foi recusado ou deu erro.')
  return info()
}

/**
 * Inicia o leitor pela tarefa (não pede permissão). Sem o leitor do Xodó, tenta a tarefa do LibreHardwareMonitor
 * criada por scripts/sensores-no-login.ps1 (quem já usava assim continua funcionando).
 */
export async function start(): Promise<boolean> {
  return await run('schtasks', ['/Run', '/TN', TASK]) || run('schtasks', ['/Run', '/TN', 'LibreHardwareMonitor'])
}
