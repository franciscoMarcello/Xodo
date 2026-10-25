// Primeiro de tudo: copia os dados da época do "Painel do PC" antes de qualquer módulo abaixo ler arquivos.
import './migrate'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron'
import path from 'node:path'
import os from 'node:os'
import iconPath from '../../build/icon.png?asset'
import type { Api, Proc, ProcessList, Settings, Status, WidgetSize } from '../shared/types'
import { getSettings, saveSettings } from './store'
import { lastLhmRoot, readStatus } from './sensors'
import { diskHealth } from './diskhealth'
import { crashes } from './crashes'
import * as gamemode from './gamemode'
import * as netlag from './netlag'
import * as disk from './disk'
import * as organizer from './organizer'
import { history, runSpeedTest, scheduleSpeedTests } from './speedtest'
import { energySummary, estimateWatts, flushEnergy, recordEnergy } from './energy'
import { closeSession, currentGame, gameSample, sessions, updateGames } from './games'
import * as processes from './processes'
import * as alerts from './alerts/engine'
import * as hist from './history'
import { machine } from './machine'
import { classify, type BPoint } from './bottleneck'
import * as steam from './gamesdb/steam'
import * as drivers from './drivers'
import * as optimize from './optimize'
import * as sensorhelper from './sensorhelper'
import fs from 'node:fs'

// A interface é simples (texto e gráficos 2D): sem aceleração de GPU o painel usa ~40% menos RAM e ~70% menos CPU
// (medido: 330 -> 202 MB e 110 -> 33 ms/s com a janela aberta).
app.disableHardwareAcceleration()

let main: BrowserWindow | null = null
let widget: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

const preload = path.join(__dirname, '../preload/index.js')
const webPreferences = { preload, sandbox: true, contextIsolation: true, nodeIntegration: false }

function load(win: BrowserWindow, hash = '') {
  const dev = process.env['ELECTRON_RENDERER_URL']
  if (dev) win.loadURL(dev + (hash ? '#' + hash : ''))
  else win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash })
}

function showMain() {
  if (!main) {
    main = new BrowserWindow({ width: 1180, height: 760, minWidth: 920, minHeight: 600, show: false, backgroundColor: '#0f1115', autoHideMenuBar: true, title: 'Xodó', icon: icon(64), webPreferences })
    main.on('ready-to-show', () => main?.show())
    // Fechar destrói a janela (libera a memória da interface); o app continua medindo na bandeja e o widget segue
    // aberto. "Abrir o painel" cria a janela de novo. "Sair" fica no menu da bandeja.
    main.on('closed', () => { main = null })
    load(main)
  } else { main.show(); main.focus() }
}

/** Tamanho de cada modo do overlay (o conteúdo de cada um cabe exatamente nisso). */
const WIDGET_SIZE: Record<WidgetSize, [number, number]> = { small: [196, 74], medium: [250, 176], large: [300, 262] }
let widgetHash = ''

function widgetBounds(s: Settings['widget']) {
  const [width, height] = WIDGET_SIZE[s.size]; const a = screen.getPrimaryDisplay().workArea; const m = 12
  const left = a.x + m, right = a.x + a.width - width - m, top = a.y + m, bottom = a.y + a.height - height - m
  const pos = { 'top-left': [left, top], 'top-right': [right, top], 'bottom-left': [left, bottom], 'bottom-right': [right, bottom], free: [s.x ?? right, s.y ?? top] }[s.position]
  return { x: Math.round(pos[0]), y: Math.round(pos[1]), width, height }
}

/**
 * Cria, move ou fecha o overlay conforme os ajustes. Num canto fixo ele ignora o mouse (os cliques passam para o
 * jogo ou o programa atrás); no modo livre dá para arrastar e a posição fica salva.
 */
function applyWidget() {
  const s = getSettings().widget
  if (!s.visible) { widget?.close(); updateTray(); return }
  const fixed = s.position !== 'free'
  const hash = `widget-${s.size}${fixed ? '-fixed' : ''}`
  if (widget && widgetHash !== hash) { widget.close(); widget = null } // outro tamanho/modo: outro layout
  const b = widgetBounds(s)
  if (!widget) {
    const w = new BrowserWindow({ ...b, frame: false, transparent: true, resizable: false, skipTaskbar: true, alwaysOnTop: true, focusable: !fixed, show: false, webPreferences })
    // 'screen-saver' fica por cima de jogos em tela cheia sem borda (tela cheia exclusiva o Windows não deixa).
    w.setAlwaysOnTop(true, 'screen-saver')
    w.on('ready-to-show', () => w.showInactive())
    w.on('moved', () => { if (getSettings().widget.position === 'free') { const [x, y] = w.getPosition(); saveSettings({ ...getSettings(), widget: { ...getSettings().widget, x, y } }) } })
    w.on('closed', () => { if (widget === w) widget = null; updateTray() })
    widget = w; widgetHash = hash
    load(w, hash)
  } else widget.setBounds(b)
  widget.setIgnoreMouseEvents(fixed, { forward: true })
  widget.setMovable(!fixed)
  updateTray()
}

function setWidget(visible: boolean) {
  saveSettings({ ...getSettings(), widget: { ...getSettings().widget, visible } })
  applyWidget()
}

/** build/icon.png (gerado por scripts/make-icon.mjs) no tamanho pedido. */
const icon = (size: number) => nativeImage.createFromPath(iconPath).resize({ width: size, height: size, quality: 'best' })

function updateTray() {
  if (!tray) return
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir o painel', click: showMain },
    { label: widget ? 'Esconder o overlay' : 'Mostrar o overlay', click: () => setWidget(!widget) },
    { type: 'separator' },
    { label: 'Sair', click: () => { quitting = true; app.quit() } },
  ]))
}

// --- leituras periódicas ---

let last: Status | null = null
let reading = false
/** Últimos 30 s de leituras para o detector de gargalo. */
const bpoints: BPoint[] = []
async function tick() {
  if (reading) return; reading = true
  try {
    const s = getSettings(); const raw = await readStatus(s.lhmUrl)
    const watts = estimateWatts(raw, s.energy)
    recordEnergy(watts)
    const game = currentGame()
    bpoints.push({ t: raw.time, gpu: raw.gpu.load, cpu: raw.cpu.load, coreMax: raw.cpu.coreMax, vramPct: raw.gpu.vramUsed != null && raw.gpu.vramTotal ? (100 * raw.gpu.vramUsed) / raw.gpu.vramTotal : null, ramPct: (100 * raw.ram.used) / raw.ram.total, cpuTemp: raw.cpu.temp, gpuTemp: raw.gpu.temp, fps: raw.gpu.fps })
    while (bpoints.length && bpoints[0].t < raw.time - 30_000) bpoints.shift()
    const bn = game ? classify(bpoints, raw.time) : null
    const lag = netlag.tick(!!game, bn?.kind ?? null)
    gameSample(raw, bn, lag)
    const status = { ...raw, game, watts, alerts: 0, bottleneck: bn, lag }
    alerts.onStatus(status)
    last = { ...status, alerts: alerts.openCount() }
    hist.record(last)
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && w.isVisible()) w.webContents.send('status', last)
  } finally { reading = false }
}

const games = () => { const g = getSettings().games; updateGames(processes.latestProcesses().procs, g.extraFolders, g.ignored) }

/** PIDs do próprio painel (não podem ser finalizados pela aba Processos). */
const ownPids = () => new Set(app.getAppMetrics().map((m) => m.pid))

function processList(): ProcessList {
  const own = ownPids(); const { time, procs } = processes.latestProcesses()
  return { time, procs: procs.map((p: Proc) => ({ ...p, killable: processes.killable(p, own) })), ramTotal: os.totalmem(), ramUsed: os.totalmem() - os.freemem() }
}

let prevGame: string | null = null

/** Uma leitura do coletor: atualiza os jogos e, se alguém está olhando a aba Processos, manda a lista. */
function onProcesses() {
  games()
  const procs = processes.latestProcesses().procs, game = currentGame()
  if (game !== prevGame) { gamemode.onGameChange(prevGame, game, getSettings().autoGame, procs).catch(() => {}); prevGame = game }
  alerts.onProcesses(procs, game)
  if (!processes.watching()) return
  const list = processList()
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && w.isVisible()) w.webContents.send('processes', list)
}

/** No app instalado, registra (ou tira) a abertura escondida com o Windows. Em desenvolvimento não mexe. */
function applyLogin(s: Settings) { if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: s.startWithWindows, args: ['--hidden'] }) }


// --- API para a interface ---

/** Só dá para mandar para a Lixeira arquivos que o próprio painel listou como "maiores arquivos". */
const listedFiles = new Set<string>()
/** Só dá para abrir pelo painel os PDFs que ele mesmo exportou. */
const exported = new Set<string>()

type Handlers = { [K in Exclude<keyof Api, 'onStatus' | 'onProcesses' | 'watchProcesses'>]: (...args: Parameters<Api[K]>) => ReturnType<Api[K]> | Awaited<ReturnType<Api[K]>> }
const handlers: Handlers = {
  getSettings: () => getSettings(),
  saveSettings: async (s: Settings) => {
    const before = getSettings(); const saved = saveSettings(s)
    if (JSON.stringify(before.organizer) !== JSON.stringify(s.organizer)) organizer.startOrganizer(s.organizer)
    if (JSON.stringify(before.games) !== JSON.stringify(s.games)) await games()
    if (before.startWithWindows !== s.startWithWindows) applyLogin(s)
    if (JSON.stringify(before.widget) !== JSON.stringify(s.widget)) applyWidget()
    return saved
  },
  disks: disk.disks,
  folderSizes: disk.folderSizes,
  diskTree: (folder) => disk.diskTree(folder),
  bigFiles: async (folder) => { const list = await disk.bigFiles(folder); list.forEach((f) => listedFiles.add(f.path)); return list },
  pickFolder: async () => { const opts = { properties: ['openDirectory' as const] }; const r = await (main ? dialog.showOpenDialog(main, opts) : dialog.showOpenDialog(opts)); return r.canceled ? null : r.filePaths[0] },
  showInFolder: async (p) => shell.showItemInFolder(p),
  trash: async (p) => { if (!listedFiles.has(p)) throw new Error('Arquivo não listado.'); await shell.trashItem(p); listedFiles.delete(p) },
  programs: disk.programs,
  openAppsSettings: async () => { await shell.openExternal('ms-settings:appsfeatures') },
  tempInfo: disk.tempInfo,
  cleanTemp: disk.cleanTemp,
  organizerPreview: async () => organizer.preview(getSettings().organizer),
  organizerRunNow: () => organizer.runNow(getSettings().organizer),
  organizerLog: async () => organizer.log(),
  organizerUndo: (id) => organizer.undo(id),
  speedHistory: async () => history(),
  speedRun: () => runSpeedTest(),
  energy: async () => { flushEnergy(); return energySummary(getSettings().energy.tariff) },
  gameSessions: async () => sessions(),
  toggleWidget: async () => { setWidget(!widget); return !!widget },
  startSensors: sensorhelper.start,
  sensorsInfo: sensorhelper.info,
  enableSensors: sensorhelper.enable,
  disableSensors: sensorhelper.disable,
  isPackaged: async () => app.isPackaged,
  killProcess: async (pid) => { processes.kill(pid, ownPids()) },
  /** Peso do próprio painel lido do Electron (sem abrir programa nenhum). privateBytes em KB; CPU desde a última consulta. */
  selfWeight: async () => {
    const m = app.getAppMetrics()
    return { ram: m.reduce((a, x) => a + (x.memory.privateBytes ?? x.memory.workingSetSize), 0) * 1024, cpu: m.reduce((a, x) => a + x.cpu.percentCPUUsage, 0) / os.cpus().length, processes: m.length }
  },
  alerts: async () => alerts.view(),
  muteAlert: async (id, days) => alerts.mute(id, days),
  unmuteAlert: async (id) => alerts.unmute(id),
  history: async (range) => hist.query(range),
  machine: (refresh) => machine(refresh),
  exportPdf: async (name) => {
    if (!main) return null
    const r = await dialog.showSaveDialog(main, { defaultPath: path.join(app.getPath('documents'), name), filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (r.canceled || !r.filePath) return null
    // O CSS de impressão (@media print) troca para fundo branco e esconde o menu e os botões.
    const pdf = await main.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } }) // em polegadas (~1 cm)
    await fs.promises.writeFile(r.filePath, pdf)
    exported.add(r.filePath)
    return r.filePath
  },
  openPath: async (p) => { if (!exported.has(p)) throw new Error('Arquivo não exportado pelo painel.'); await shell.openPath(p) },
  installedGames: () => steam.installedGames(),
  searchGames: (term) => steam.searchGames(term),
  canRun: (appid) => steam.canRun(appid),
  drivers: async () => drivers.current(),
  checkDrivers: async () => { const v = await drivers.check(); alerts.onDrivers(v.updates); return v },
  diskHealth: async () => diskHealth(lastLhmRoot()),
  gameModeCandidates: async () => {
    const seen = new Map<string, { name: string; ram: number; path: string | null }>()
    for (const p of processes.latestProcesses().procs) {
      // Só programas do usuário: fora da pasta do Windows e que podem ser fechados
      if (!gamemode.canClose(p.name, currentGame()) || !p.path || /^c:\\windows\\/i.test(p.path)) continue
      const k = p.name.toLowerCase(); const e = seen.get(k)
      seen.set(k, { name: k, ram: (e?.ram ?? 0) + p.ram, path: e?.path ?? p.path })
    }
    return [...seen.values()].sort((a, b) => b.ram - a.ram).slice(0, 40)
  },
  gameModeLog: async () => gamemode.history(),
  lagTest: async (seconds) => netlag.startTest(Math.min(120, Math.max(10, seconds))),
  gameModeTest: (seconds) => gamemode.test(getSettings().autoGame, processes.latestProcesses().procs, Math.min(120, Math.max(5, seconds))),
  crashes: (days) => crashes(Math.min(365, Math.max(1, Math.round(days)))),
  optimize: () => optimize.scan(),
  setStartup: (name, source, enabled) => optimize.setStartup(name, source, enabled),
  setPowerPlan: (guid) => optimize.setPowerPlan(guid),
  optAction: (kind) => optimize.action(kind),
  openWindowsUpdate: async () => { await shell.openExternal('ms-settings:windowsupdate-optionalupdates') },
  /** Só links de fabricantes de drivers (vêm da verificação, não de texto livre) e do driver PawnIO (sensores). */
  openLink: async (url) => {
    if (!/^https:\/\/(www\.amd\.com|www\.nvidia\.com|www\.intel\.com\.br|pawnio\.eu)\//.test(url) && !url.startsWith('ms-settings:')) throw new Error('Link não permitido.')
    await shell.openExternal(url)
  },
}

// --- ciclo de vida ---

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', showMain)
  app.whenReady().then(() => {
    // Mesmo id da época do "Painel do PC": o instalador do Xodó atualiza no lugar e o "abrir com o Windows" continua valendo.
    app.setAppUserModelId('br.painel-pc')
    for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(name, (_e, ...args) => (fn as (...a: unknown[]) => unknown)(...args))
    // A leitura rápida vale enquanto a janela que pediu existir (fechar a janela com a aba aberta desliga sozinho).
    const hooked = new Set<number>()
    ipcMain.handle('watchProcesses', (e, on: boolean) => {
      const id = e.sender.id
      if (on && !hooked.has(id)) { hooked.add(id); e.sender.once('destroyed', () => { hooked.delete(id); processes.watch(id, false) }) }
      processes.watch(id, on)
      if (on) e.sender.send('processes', processList())
    })
    tray = new Tray(icon(32)); tray.setToolTip('Xodó'); tray.on('click', showMain); updateTray()
    if (!process.argv.includes('--hidden')) showMain()
    const s = getSettings()
    applyLogin(s)
    applyWidget()
    // Mudou resolução, escala ou monitor principal: reposiciona o overlay no canto certo.
    screen.on('display-metrics-changed', applyWidget); screen.on('display-added', applyWidget); screen.on('display-removed', applyWidget)
    // Sensores fora do ar alguns segundos depois de abrir: tenta iniciar o leitor uma vez (pela tarefa, sem UAC).
    setTimeout(() => { if (last && !last.lhm) sensorhelper.start() }, 8000)
    organizer.startOrganizer(s.organizer)
    setInterval(tick, 2000); tick()
    processes.startCollector(onProcesses)
    setInterval(flushEnergy, 60_000)
    scheduleSpeedTests(() => getSettings().internet, () => !!currentGame())
    alerts.startSlowChecks(disk.disks, history, () => getSettings().internet.contractedDown)
    hist.startHistory()
    drivers.scheduleDriverChecks(() => !!currentGame(), (v) => alerts.onDrivers(v.updates))
  })
  app.on('window-all-closed', () => { /* continua na bandeja */ })
  app.on('before-quit', () => { quitting = true; flushEnergy(); hist.flush(); closeSession(true); gamemode.reopenPending(); organizer.stopOrganizer() })
}
