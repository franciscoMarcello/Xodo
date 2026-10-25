import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import type { CanRun, SteamGame } from '../../shared/types'
import { readJson, writeJson } from '../store'
import { machine } from '../machine'
import { disks } from '../disk'
import { compare, parseReq } from './requirements'

// Jogos da Steam: os instalados vêm dos manifestos locais (sem internet); busca e requisitos vêm da API pública da
// loja (sem chave), só quando o usuário usa a aba. Requisitos ficam em cache por 30 dias.

const CACHE = 'games-req.json'
const DAY = 86_400_000
const header = (appid: number) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`
/** Coisas da Steam que não são jogos. */
const NOT_GAME = /redistributable|wallpaper engine|steamvr|proton|steamworks|steam linux runtime|dedicated server|soundtrack|sdk$/i

function steamPath(): Promise<string> {
  return new Promise((resolve) => execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true, timeout: 5000 }, (err, out) => {
    const m = !err && /SteamPath\s+REG_SZ\s+(.+)/.exec(out)
    resolve(m ? path.normalize(m[1].trim()) : 'C:\\Program Files (x86)\\Steam')
  }))
}

/** Pastas das bibliotecas da Steam (a da instalação e as de outros discos). */
export async function steamLibraries(): Promise<string[]> {
  try {
    const vdf = await fs.promises.readFile(path.join(await steamPath(), 'steamapps', 'libraryfolders.vdf'), 'utf8')
    return [...vdf.matchAll(/"path"\s+"([^"]+)"/g)].map((m) => m[1].replace(/\\\\/g, '\\'))
  } catch { return [] }
}

export async function installedGames(): Promise<SteamGame[]> {
  const games: SteamGame[] = []
  for (const lib of await steamLibraries()) {
    let files: string[] = []
    try { files = fs.readdirSync(path.join(lib, 'steamapps')).filter((f) => /^appmanifest_\d+\.acf$/.test(f)) } catch { continue }
    for (const f of files) {
      try {
        const t = fs.readFileSync(path.join(lib, 'steamapps', f), 'utf8')
        const appid = Number(/"appid"\s+"(\d+)"/.exec(t)?.[1]); const name = /"name"\s+"([^"]+)"/.exec(t)?.[1]
        if (appid && name && !NOT_GAME.test(name)) games.push({ appid, name, image: header(appid), installed: true })
      } catch { /* manifesto ilegível */ }
    }
  }
  return games.sort((a, b) => a.name.localeCompare(b.name))
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'Accept-Language': 'en' } })
  if (!r.ok) throw new Error(`A loja da Steam respondeu ${r.status}. Tente de novo em alguns minutos.`)
  return r.json() as Promise<T>
}

export async function searchGames(term: string): Promise<SteamGame[]> {
  const q = term.trim(); if (q.length < 2) return []
  const r = await getJson<{ items?: { id: number; name: string; type: string }[] }>(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=BR`)
  return (r.items ?? []).filter((i) => i.type === 'app').slice(0, 12).map((i) => ({ appid: i.id, name: i.name, image: header(i.id) }))
}

interface Cached { time: number; name: string; min: string; rec: string; image?: string }

async function requirements(appid: number): Promise<Cached> {
  const cache = readJson<Record<string, Cached>>(CACHE, {})
  const hit = cache[appid]; if (hit && Date.now() - hit.time < 30 * DAY) return hit
  type Details = Record<string, { success: boolean; data?: { name: string; header_image?: string; pc_requirements?: { minimum?: string; recommended?: string } | [] } }>
  const d = (await getJson<Details>(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=english&filters=basic`))[appid]
  if (!d?.success || !d.data) throw new Error('A Steam não tem os dados deste jogo.')
  const req = Array.isArray(d.data.pc_requirements) ? {} : d.data.pc_requirements ?? {}
  // Jogos novos têm a capa num endereço com código; a loja informa o certo em header_image.
  const entry = { time: Date.now(), name: d.data.name, min: req.minimum ?? '', rec: req.recommended ?? '', image: d.data.header_image }
  cache[appid] = entry; writeJson(CACHE, cache)
  return entry
}

const plain = (h: string) => h.replace(/<br\s*\/?>|<\/li>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n\s*\n+/g, '\n').trim()

export async function canRun(appid: number): Promise<CanRun> {
  const [req, m, vols] = await Promise.all([requirements(appid), machine(), disks()])
  const pc = {
    cpu: m.cpu.name, gpu: m.gpus[0]?.name ?? '', ramGB: Math.round(m.memory.total / 1024 ** 3),
    freeGB: Math.max(0, ...vols.map((v) => v.free / 1024 ** 3)), hasSsd: m.disks.some((x) => x.type === 'SSD'),
  }
  const { parts, verdict } = compare(parseReq(req.min), parseReq(req.rec), pc)
  return { game: { appid, name: req.name, image: req.image ?? header(appid) }, verdict, parts, minText: plain(req.min), recText: plain(req.rec) }
}
