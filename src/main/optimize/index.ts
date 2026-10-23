import { shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import type { OptAction, OptimizeView, StartupItem } from '../../shared/types'
import { machine } from '../machine'
import * as hist from '../history'
import { evaluate, flagStartup, type ScanRaw } from './checks'
import { SCAN } from './scan-script'

// Tela Otimizar: lê as configurações (só quando a tela abre) e faz as mudanças de um clique. Toda mudança daqui é
// reversível e só mexe em configurações do usuário (HKCU), sem administrador. O resto vira passo a passo.

function run(cmd: string, args: string[], timeout = 30_000): Promise<string> {
  return new Promise((resolve, reject) => execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, out) => (err ? reject(err) : resolve(out))))
}

let last: ScanRaw | null = null
let lastView: OptimizeView | null = null

/** Temperatura média da CPU com menos de 15% de uso nas últimas 24 h (do histórico). null = menos de 30 min de dados. */
function idleTemp(): number | null {
  const pts = hist.query('24h').points.filter((p) => p.cpu != null && p.cpu < 15 && p.cpuTemp != null)
  return pts.length >= 6 ? pts.reduce((a, p) => a + p.cpuTemp!, 0) / pts.length : null
}

export async function scan(): Promise<OptimizeView> {
  const out = await run('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(SCAN, 'utf16le').toString('base64')], 60_000)
  const raw = JSON.parse(out) as ScanRaw
  raw.startup ??= []; raw.plans ??= []; raw.noLetter ??= []; raw.pagefiles ??= []
  last = raw
  const m = await machine()
  lastView = { time: Date.now(), checks: evaluate(raw, { cpu: m.cpu.name, gpu: m.gpus[0]?.name ?? '', idleTemp: idleTemp() }), startup: flagStartup(raw.startup), plans: raw.plans }
  return lastView
}

const APPROVED = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\'

/** O mesmo valor que o Gerenciador de Tarefas grava: 02 = ligado, 03 = desligado (+ 11 bytes). */
export async function setStartup(name: string, source: StartupItem['source'], enabled: boolean) {
  const item = last?.startup.find((i) => i.name === name && i.source === source)
  if (!item) throw new Error('Esse item não está mais na lista. Atualize a tela.')
  if (source !== 'hkcu' && source !== 'folder') throw new Error('Este item é de todos os usuários: desligue pelo Gerenciador de Tarefas (precisa de administrador).')
  await run('reg', ['add', APPROVED + item.approvedKey, '/v', name, '/t', 'REG_BINARY', '/d', (enabled ? '02' : '03') + '0'.repeat(22), '/f'])
  return scan()
}

export async function setPowerPlan(guid: string) {
  if (!last?.plans.some((p) => p.guid === guid)) throw new Error('Plano de energia desconhecido.')
  await run('powercfg', ['/setactive', guid])
  return scan()
}

const SHADER_DIRS = () => { const l = process.env.LOCALAPPDATA ?? ''; return ['AMD\\DxCache', 'AMD\\DxcCache', 'AMD\\VkCache', 'NVIDIA\\DXCache', 'NVIDIA\\GLCache', 'D3DSCache'].map((d) => path.join(l, d)) }

/** Apaga os arquivos dos caches de shader (os em uso são pulados; os jogos refazem o cache sozinhos). */
async function clearShaderCache() {
  for (const dir of SHADER_DIRS()) {
    let entries: string[] = []
    try { entries = await fs.promises.readdir(dir) } catch { continue }
    for (const e of entries) await fs.promises.rm(path.join(dir, e), { recursive: true, force: true }).catch(() => {})
  }
}

const dword = (key: string, name: string, value: number) => run('reg', ['add', key, '/v', name, '/t', 'REG_DWORD', '/d', String(value), '/f'])

export async function action(kind: OptAction): Promise<OptimizeView> {
  switch (kind) {
    case 'enable-game-mode': await dword('HKCU\\Software\\Microsoft\\GameBar', 'AutoGameModeEnabled', 1); break
    case 'disable-game-mode': await dword('HKCU\\Software\\Microsoft\\GameBar', 'AutoGameModeEnabled', 0); break
    case 'disable-bg-recording': await dword('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'HistoricalCaptureEnabled', 0); break
    case 'enable-bg-recording': await dword('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'HistoricalCaptureEnabled', 1); break
    case 'clear-shader-cache': await clearShaderCache(); break
    case 'open-diskmgmt': await shell.openPath('C:\\Windows\\System32\\diskmgmt.msc'); break
    case 'open-graphics-settings': await shell.openExternal('ms-settings:display-advancedgraphics'); break
    case 'open-performance-options': spawn('SystemPropertiesPerformance.exe', { detached: true, stdio: 'ignore' }).unref(); break
    case 'open-task-manager': spawn('taskmgr.exe', ['/0', '/startup'], { detached: true, stdio: 'ignore' }).unref(); break
    case 'open-amd-software': {
      const exe = 'C:\\Program Files\\AMD\\CNext\\CNext\\RadeonSoftware.exe'
      if (!fs.existsSync(exe)) throw new Error('Não encontrei o AMD Software instalado.')
      spawn(exe, { detached: true, stdio: 'ignore' }).unref(); break
    }
    case 'open-disk-page': break // a interface navega
  }
  // Atalhos "abrir" não mudam nada: devolve a última leitura em vez de ler tudo de novo.
  return kind.startsWith('open-') && lastView ? lastView : scan()
}
