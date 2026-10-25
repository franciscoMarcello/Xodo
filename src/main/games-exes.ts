import fs from 'node:fs'
import path from 'node:path'

// Qual jogo é cada executável. Sem Electron, para dar para testar no node (games.ts guarda as sessões).

/** Pastas de jogos das lojas: o nome do jogo é a pasta logo depois. */
const STORES = [
  /\\steamapps\\common\\([^\\]+)\\/i, /\\Epic Games\\([^\\]+)\\/i, /\\XboxGames\\([^\\]+)\\/i, /\\Riot Games\\([^\\]+)\\/i,
  /\\GOG Galaxy\\Games\\([^\\]+)\\/i, /\\Ubisoft Game Launcher\\games\\([^\\]+)\\/i, /\\EA Games\\([^\\]+)\\/i, /\\Amazon Games\\Library\\([^\\]+)\\/i,
]
/** Executáveis que ficam nessas pastas mas não são o jogo (launchers, anti-cheat, instaladores, crash reporters). */
const NOT_GAME = /crash|anticheat|easyanticheat|beservice|battleye|redist|setup|unins|helper|launcher|updater|dxsetup|webhelper|cefprocess|bootstrap|prereq|unitycrash|reporter|vc_redist/i
/** Pastas das lojas que não são jogos (ferramentas vendidas na Steam, launchers, redistribuíveis). */
const NOT_FOLDER = /^(Steamworks Shared|Riot Client|Epic Online Services|Launcher|DirectXRedist|Common Redistributables|wallpaper_engine|SteamVR|Lossless Scaling|Soundpad|OBS Studio|Steam Controller Configs)$/i

export function gameName(exe: string, extraFolders: string[], ignored: string[] = []): string | null {
  if (NOT_GAME.test(path.basename(exe))) return null
  let name: string | null = null
  for (const re of STORES) { const m = re.exec(exe); if (m) { name = NOT_FOLDER.test(m[1]) ? null : m[1]; break } }
  if (!name) for (const f of extraFolders) {
    const base = f.replace(/[\\/]+$/, '') + '\\'
    if (exe.toLowerCase().startsWith(base.toLowerCase())) { name = exe.slice(base.length).split('\\')[0] || null; break }
  }
  return name && !ignored.includes(name) ? name : null
}

/**
 * Nome do executável (minúsculo, sem .exe) -> pasta do jogo, das bibliotecas da Steam. Jogos com antitrapaça (ex.:
 * Battlefield 6) não deixam o Windows informar o caminho do processo sem administrador, só o nome.
 * shortcut: só Steam e o .exe na pasta do jogo ou uma abaixo; se aparecer jogo protegido de outra loja, somar a pasta dela aqui.
 */
export async function exeIndex(libs: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const read = async (dir: string) => { try { return await fs.promises.readdir(dir, { withFileTypes: true }) } catch { return [] } }
  for (const lib of libs) {
    const common = path.join(lib, 'steamapps', 'common')
    for (const g of await read(common)) {
      if (!g.isDirectory() || NOT_FOLDER.test(g.name)) continue
      const dir = path.join(common, g.name); const top = await read(dir)
      const subs = await Promise.all(top.filter((e) => e.isDirectory()).map((e) => read(path.join(dir, e.name))))
      for (const e of [...top, ...subs.flat()]) if (e.isFile() && /\.exe$/i.test(e.name) && !NOT_GAME.test(e.name)) out.set(e.name.slice(0, -4).toLowerCase(), g.name)
    }
  }
  return out
}
