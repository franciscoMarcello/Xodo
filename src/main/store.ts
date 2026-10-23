import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Settings } from '../shared/types'

// Dados do app em %APPDATA%\Xodó (veio de %APPDATA%\Painel do PC, ver migrate.ts): ajustes em JSON e históricos em JSON Lines (uma linha por registro).

const dir = () => app.getPath('userData')
const file = (name: string) => path.join(dir(), name)

export function readJson<T>(name: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')) as T } catch { return fallback }
}

/** Grava num arquivo temporário e troca, para não deixar JSON pela metade se o PC desligar. */
export function writeJson(name: string, data: unknown) {
  fs.mkdirSync(dir(), { recursive: true })
  const tmp = file(name + '.tmp')
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file(name))
}

export function appendLine(name: string, row: unknown) {
  fs.mkdirSync(dir(), { recursive: true })
  fs.appendFileSync(file(name), JSON.stringify(row) + '\n')
}

export function readLines<T>(name: string): T[] {
  let text = ''
  try { text = fs.readFileSync(file(name), 'utf8') } catch { return [] }
  const rows: T[] = []
  for (const line of text.split('\n')) { if (line.trim()) try { rows.push(JSON.parse(line)) } catch { /* linha corrompida: ignora */ } }
  return rows
}

export function writeLines(name: string, rows: unknown[]) {
  fs.mkdirSync(dir(), { recursive: true })
  fs.writeFileSync(file(name), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''))
}

const downloads = () => app.getPath('downloads')

export function defaultSettings(): Settings {
  const d = downloads()
  const rule = (name: string, extensions: string[]) => ({ name, extensions, dest: path.join(d, name) })
  return {
    organizer: {
      enabled: false, folder: d,
      rules: [
        rule('Imagens', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic']),
        rule('Documentos', ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt', 'odt']),
        rule('Instaladores', ['exe', 'msi', 'msix', 'appx']),
        rule('Compactados', ['zip', 'rar', '7z', 'tar', 'gz', 'iso']),
        rule('Vídeos', ['mp4', 'mkv', 'avi', 'mov', 'webm']),
        rule('Músicas', ['mp3', 'wav', 'flac', 'm4a', 'ogg']),
      ],
    },
    internet: { enabled: true, intervalHours: 4, contractedDown: 0, contractedUp: 0 },
    energy: { tariff: 0.95, baseWatts: 45, monitorWatts: 25, cpuTdp: 65, gpuWatts: 200 },
    widget: { visible: true, position: 'top-right', size: 'medium' },
    games: { extraFolders: [], ignored: [] },
    lhmUrl: 'http://127.0.0.1:8085/data.json',
    startWithWindows: true,
    autoGame: { enabled: false, close: [], reopen: true },
  }
}

let cached: Settings | null = null

/** Ajustes salvos por cima dos padrões (campos novos de versões futuras ganham o valor padrão). */
export function getSettings(): Settings {
  if (cached) return cached
  const def = defaultSettings(); const saved = readJson<Partial<Settings>>('settings.json', {})
  cached = {
    ...def, ...saved,
    organizer: { ...def.organizer, ...saved.organizer }, internet: { ...def.internet, ...saved.internet },
    energy: { ...def.energy, ...saved.energy }, games: { ...def.games, ...saved.games }, autoGame: { ...def.autoGame, ...saved.autoGame },
    // Versões antigas não tinham posição: quem já tinha arrastado o widget continua no lugar ("livre").
    widget: { ...def.widget, ...(saved.widget?.x != null && !saved.widget.position ? { position: 'free' as const } : {}), ...saved.widget },
  }
  return cached
}

export function saveSettings(s: Settings): Settings {
  cached = s; writeJson('settings.json', s); return s
}
