import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import type { Alert, AlertsView, Proc, Status } from '../../shared/types'
import { readJson, writeJson } from '../store'
import * as d from './detectors'
import { diskHealth } from '../diskhealth'
import { lastLhmRoot } from '../sensors'

// Liga os detectores nas leituras que o painel já faz. Nada aqui lê o sistema de novo, fora o espaço dos discos
// (statfs, instantâneo) e a lista de inicialização (reg.exe, a cada 30 min). Os históricos têm tamanho limitado.

const MIN = 60_000, HOUR = 60 * MIN
const FILE = 'alerts.json'

interface Saved { mutes: Record<string, number>; startupSeen: Record<string, number>; disks: Record<string, d.Series[]>; resolved: Alert[] }
const saved = readJson<Saved>(FILE, { mutes: {}, startupSeen: {}, disks: {}, resolved: [] })
const persist = () => writeJson(FILE, saved)

const points: d.Point[] = []          // status a cada 2 s, últimos 10 min
const samples: d.Sample[] = []        // processos, últimos 6 min
const ramHistory = new Map<string, d.Series[]>() // RAM dos programas acima de 300 MB, 1 ponto/min, ~2 h
const diskHistory = new Map(Object.entries(saved.disks)) // espaço livre, 1 ponto/h, 26 h
let startupItems: { name: string; command: string }[] = []

const open = new Map<string, Alert>()
/** Achados atuais de cada grupo de regras (cada grupo é reavaliado no seu ritmo). */
const found = new Map<string, d.Found[]>()

function apply(group: string, list: d.Found[]) {
  const now = Date.now(); const before = found.get(group) ?? []; found.set(group, list)
  for (const f of list) {
    const a = open.get(f.id)
    open.set(f.id, a ? { ...a, ...f, lastSeen: now } : { ...f, since: now, lastSeen: now })
  }
  // o que este grupo achava antes e não acha mais: resolvido
  for (const old of before) if (!list.some((f) => f.id === old.id)) {
    const a = open.get(old.id); if (!a) continue
    open.delete(old.id)
    saved.resolved = [{ ...a, resolved: now }, ...saved.resolved].slice(0, 30)
    if (saved.mutes[old.id] === 0) delete saved.mutes[old.id] // "ignorar até sumir": sumiu
    persist()
  }
}

const muted = (id: string) => { const m = saved.mutes[id]; return m != null && (m === 0 || m > Date.now()) }
export const openCount = () => [...open.keys()].filter((id) => !muted(id)).length

// --- entradas ---

let lastFast = 0
export function onStatus(s: Status) {
  const now = s.time
  points.push({ t: now, cpuLoad: s.cpu.load, cpuTemp: s.cpu.temp, gpuTemp: s.gpu.temp, ramPct: (100 * s.ram.used) / s.ram.total, gaming: !!s.game })
  while (points.length && points[0].t < now - 11 * MIN) points.shift()
  if (now - lastFast < 30_000) return
  lastFast = now
  apply('ram', d.ramTotal(points, now))
  apply('temp', [...d.hotIdleCpu(points, now), ...d.overheat(points, now)])
}

const OWN = path.parse(process.execPath).name.toLowerCase()
const BG_IGNORE = new Set(['idle', 'system', 'memory compression', 'registry', OWN])

export function onProcesses(procs: Proc[], game: string | null) {
  if (!procs.length) return
  const now = Date.now()
  const map = new Map<string, d.Group>()
  for (const p of procs) {
    const g = map.get(p.name) ?? { name: p.name, ram: 0, cpu: null, path: p.path, count: 0 }
    g.ram += p.ram; g.count++; if (p.cpu != null) g.cpu = (g.cpu ?? 0) + p.cpu; g.path ??= p.path
    map.set(p.name, g)
  }
  const sample = { t: now, groups: [...map.values()] }
  samples.push(sample)
  while (samples.length && samples[0].t < now - 6 * MIN) samples.shift()

  for (const g of sample.groups) {
    const list = ramHistory.get(g.name)
    if (!list && g.ram < 300 * 1024 ** 2) continue
    const l = list ?? []; if (!list) ramHistory.set(g.name, l)
    if (!l.length || now - l[l.length - 1].t >= 55_000) l.push({ t: now, v: g.ram })
    while (l.length > 130) l.shift()
  }
  for (const [name, l] of ramHistory) if (now - l[l.length - 1].t > 10 * MIN) ramHistory.delete(name) // programa fechado

  apply('proc', [...d.procRam(sample, os.totalmem()), ...d.memLeak(ramHistory, now), ...(game ? [] : d.bgCpu(samples, now, BG_IGNORE)), ...d.oddFolder(sample)])
}

// --- regras lentas (a cada 10 min) ---

function regRun(key: string): Promise<{ name: string; command: string }[]> {
  return new Promise((resolve) => execFile('reg', ['query', key], { windowsHide: true, timeout: 10_000 }, (err, out) => resolve(err ? [] :
    out.split(/\r?\n/).flatMap((l) => { const m = /^\s{4}(.+?)\s{4}REG_(?:EXPAND_)?SZ\s{4}(.*)$/.exec(l); return m ? [{ name: m[1], command: m[2] }] : [] }))))
}
function startupFolder(dir: string) {
  try { return fs.readdirSync(dir).filter((f) => !/^desktop\.ini$/i.test(f)).map((f) => ({ name: path.parse(f).name, command: path.join(dir, f) })) } catch { return [] }
}
async function readStartup() {
  const keys = ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run']
  const lists = await Promise.all(keys.map(regRun))
  startupItems = [...lists.flat(), ...startupFolder(path.join(app.getPath('appData'), 'Microsoft\\Windows\\Start Menu\\Programs\\Startup')),
    ...startupFolder(path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs\\StartUp'))]
  // Primeira leitura de todas: tudo que já existe é "conhecido" (marca com 0 = antigo).
  const first = Object.keys(saved.startupSeen).length === 0
  for (const i of startupItems) saved.startupSeen[i.name.toLowerCase()] ??= first ? 0 : Date.now()
  persist()
}

let lastStartup = 0
async function slow(disks: () => Promise<{ mount: string; total: number; free: number }[]>, tests: () => { time: number; down: number; error?: string }[], contracted: () => number) {
  const now = Date.now(); const list = await disks()
  for (const k of list) {
    const l = diskHistory.get(k.mount) ?? []; diskHistory.set(k.mount, l)
    if (!l.length || now - l[l.length - 1].t >= HOUR - MIN) { l.push({ t: now, v: k.free }); while (l.length > 26) l.shift(); saved.disks = Object.fromEntries(diskHistory); persist() }
  }
  apply('disk', [...d.diskLow(list), ...d.diskDrop(diskHistory, now), ...d.diskHealthAlerts(diskHealth(lastLhmRoot()))])
  apply('net', d.internet(tests(), contracted(), now))
  apply('uptime', d.uptime(os.uptime()))
  if (now - lastStartup >= 30 * MIN) { lastStartup = now; await readStartup() }
  apply('startup', d.newStartup(startupItems, new Map(Object.entries(saved.startupSeen).filter(([, t]) => t > 0)), now))
}

export function startSlowChecks(...args: Parameters<typeof slow>) {
  const run = () => slow(...args).catch(() => {})
  setTimeout(run, 30_000) // depois que o PC terminou de iniciar
  setInterval(run, 10 * MIN)
}

/** Resultado da verificação de drivers (feita fora daqui, 1x por dia). */
export function onDrivers(updates: Parameters<typeof d.driverUpdates>[0]) { apply('drivers', d.driverUpdates(updates)) }

// --- interface ---

export function view(): AlertsView {
  const order = { critical: 0, serious: 1, warning: 2 }
  const all = [...open.values()].sort((a, b) => order[a.level] - order[b.level] || b.since - a.since)
  return { open: all.filter((a) => !muted(a.id)), muted: all.filter((a) => muted(a.id)), resolved: saved.resolved, rules: d.RULES }
}

export function mute(id: string, days: number) { saved.mutes[id] = days > 0 ? Date.now() + days * 24 * HOUR : 0; persist() }
export function unmute(id: string) { delete saved.mutes[id]; persist() }
