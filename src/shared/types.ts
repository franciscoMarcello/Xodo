// Tipos compartilhados entre o processo principal (Node) e a interface (React).

export type WidgetPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'free'
export type WidgetSize = 'small' | 'medium' | 'large'

export interface OrganizerRule { name: string; extensions: string[]; dest: string }

export interface Settings {
  organizer: { enabled: boolean; folder: string; rules: OrganizerRule[] }
  internet: { enabled: boolean; intervalHours: number; contractedDown: number; contractedUp: number }
  /** tarifa em R$/kWh; watts do resto do PC (placa-mãe, SSD, fans) e do monitor; TDP para estimar a CPU sem sensor. */
  energy: { tariff: number; baseWatts: number; monitorWatts: number; cpuTdp: number; gpuWatts: number }
  /** Overlay: num canto fixo (deixa os cliques passarem) ou livre (arrastável, guarda x/y). */
  widget: { visible: boolean; position: WidgetPosition; size: WidgetSize; x?: number; y?: number }
  /** ignored: nomes marcados como "não é jogo" */
  games: { extraFolders: string[]; ignored: string[] }
  lhmUrl: string
  /** Só vale no app instalado: abre escondido na bandeja quando o Windows inicia. */
  startWithWindows: boolean
  /** Modo Jogo automático: fecha estes programas (nome do processo, minúsculo) quando um jogo abre e reabre ao fechar. */
  autoGame: { enabled: boolean; close: string[]; reopen: boolean }
}

export interface GameModeEntry { time: number; game: string; action: 'closed' | 'reopened'; apps: string[]; failed: string[] }

export interface Status {
  time: number
  /** coreMax: uso do núcleo mais carregado (jogos costumam travar num núcleo antes do total subir) */
  cpu: { name: string; load: number | null; temp: number | null; power: number | null; coreMax: number | null }
  /** vram em MB; fps só em jogo em tela cheia (driver AMD via LibreHardwareMonitor) */
  gpu: { name: string; load: number | null; temp: number | null; power: number | null; vramUsed: number | null; vramTotal: number | null; fps: number | null }
  ram: { used: number; total: number }
  /** bytes por segundo */
  net: { down: number; up: number }
  /** LibreHardwareMonitor respondendo (temperaturas e potência) */
  lhm: boolean
  game: string | null
  watts: number
  /** Alertas abertos (não silenciados). */
  alerts: number
  /** Gargalo dos últimos 20 s enquanto um jogo está aberto (null fora de jogo ou sem sensores). */
  bottleneck: Bottleneck | null
  /** Medição de lag (durante jogos ou no teste manual); null quando não está medindo. */
  lag: LagView | null
}

/** Leitura dos sensores, antes dos campos calculados pelo painel. */
export type RawStatus = Omit<Status, 'game' | 'watts' | 'alerts' | 'bottleneck' | 'lag'>

export type AlertLevel = 'warning' | 'serious' | 'critical'
/** O que o botão do alerta faz: abrir uma tela do painel (com busca, na de Processos) ou uma pasta. */
export type AlertAction = { page: 'processes'; query: string } | { page: 'disk' | 'internet' | 'settings' | 'drivers' } | { folder: string }

export interface Alert {
  /** regra + alvo, ex.: "proc-ram:chrome". O mesmo problema mantém o mesmo id enquanto durar. */
  id: string
  rule: string
  level: AlertLevel
  title: string
  detail: string
  /** o que fazer */
  tip: string
  action?: AlertAction
  since: number
  lastSeen: number
  resolved?: number
}

/** Medidas guardadas no histórico: uso em %, temperatura em °C, consumo em W. */
export type Metric = 'cpu' | 'cpuTemp' | 'gpu' | 'gpuTemp' | 'ram' | 'watts'
/** Um intervalo do histórico (minuto, hora ou mais): média e máximo de cada medida (null = sem leitura). */
export type HistPoint = { t: number } & { [M in Metric]: number | null } & { [M in Metric as `${M}Max`]: number | null }
export type HistRange = '24h' | '7d' | '30d'
export interface HistView { points: HistPoint[]; bucketMinutes: number }

/** Ficha da máquina (aba Meu PC). Datas em ISO; tamanhos em bytes; null = o Windows não informou. */
export interface MachineInfo {
  time: number
  cpu: { name: string; maker: string; cores: number; threads: number; baseMHz: number; l2KB: number; l3KB: number; socket: string; virtualization: boolean | null }
  gpus: { name: string; driver: string; driverDate: string | null; vram: number | null; resolution: string | null; refresh: number | null }[]
  memory: { total: number; slots: number | null; modules: { slot: string; size: number; speed: number | null; configured: number | null; maker: string; part: string; type: string }[] }
  board: { maker: string; model: string; version: string; biosMaker: string; biosVersion: string; biosDate: string | null }
  os: { name: string; release: string; build: string; arch: string; installed: string | null; lastBoot: string | null }
  disks: { name: string; type: string; bus: string; size: number; health: string }[]
  monitors: { name: string; maker: string; inches: number | null }[]
  network: { name: string; description: string; speed: string }[]
}

/** Uma peça comparada com o requisito: below = abaixo do mínimo, min = entre mínimo e recomendado, rec = atende, above = com folga. */
export interface PartCheck {
  label: string; yours: string; min: string | null; rec: string | null; ratioMin: number | null; ratioRec: number | null
  verdict: 'below' | 'min' | 'rec' | 'above' | 'unknown'; note?: string
}
export interface CanRunVerdict { level: 'no' | 'low' | 'medium' | 'high' | 'ultra' | 'unknown'; title: string; detail: string }
export interface SteamGame { appid: number; name: string; image: string; installed?: boolean }
export interface CanRun { game: SteamGame; verdict: CanRunVerdict; parts: PartCheck[]; minText: string; recText: string }

export type BottleneckKind = 'gpu' | 'cpu' | 'vram' | 'ram' | 'heat' | 'capped'
export interface Bottleneck { kind: BottleneckKind; title: string; detail: string; tip: string }

/** Driver instalado de um dispositivo (fabricante, não os genéricos da Microsoft). Datas ISO. */
export interface DriverInfo { device: string; cls: string; provider: string; version: string; date: string | null }
/** Driver disponível. `newer` = mais novo que o instalado (só esses viram alerta). */
export interface DriverUpdate {
  source: 'windows-update' | 'amd'; device: string; title: string; current: string | null; currentDate: string | null
  available: string; availableDate: string | null; size: string | null; newer: boolean; link?: string
}
export interface DriversView {
  checked: number | null; checking: boolean; error?: string; installed: DriverInfo[]; updates: DriverUpdate[]
  /** Placa de vídeo: versão do pacote (ex.: Adrenalin 26.10.1) e a mais nova no site do fabricante. */
  gpu: { name: string; vendor: 'amd' | 'nvidia' | 'intel' | 'other'; installed: string | null; latest: string | null; latestDate: string | null; link: string } | null
}

/** Programa que abre com o Windows. `canToggle` = dá para ligar/desligar sem administrador (os do usuário). */
export interface StartupItem {
  name: string; command: string; source: 'hkcu' | 'hklm' | 'hklm32' | 'folder' | 'folder-all'; approvedKey: string
  enabled: boolean; exists: boolean; canToggle: boolean; flag?: string
}
export type OptAction =
  | 'open-diskmgmt' | 'open-disk-page' | 'open-graphics-settings' | 'open-amd-software' | 'open-task-manager' | 'open-performance-options'
  | 'clear-shader-cache' | 'enable-game-mode' | 'disable-game-mode' | 'disable-bg-recording' | 'enable-bg-recording'
export interface OptCheck {
  id: string; title: string; status: 'ok' | 'tip' | 'warn'; summary: string; steps?: string[]; gain?: string
  action?: { kind: OptAction; label: string }
}
export interface OptimizeView { time: number; checks: OptCheck[]; startup: StartupItem[]; plans: { guid: string; name: string; active: boolean }[] }

/** Saúde de um disco pelos dados S.M.A.R.T. (null = o disco não informa). life em %, temperaturas em °C. */
export interface DiskHealth {
  name: string; kind: 'nvme' | 'ssd' | 'hdd'; life: number | null; temp: number | null; tempWarn: number | null; tempCrit: number | null
  hours: number | null; cycles: number | null; writtenGB: number | null; readGB: number | null; usedPct: number | null; spare: number | null; spareMin: number | null
  status: 'ok' | 'warning' | 'serious' | 'critical'; notes: string[]
}

export type CrashKind = 'shutdown' | 'bluescreen' | 'hardware' | 'gpu-reset' | 'app-crash' | 'app-hang' | 'disk'
/** Um evento do diário. `context`: o que o painel sabia naquele momento (temperaturas máximas nos 5 min antes, jogo aberto). */
export interface CrashEvent {
  time: number; kind: CrashKind; title: string; explain: string; code?: string; app?: string; module?: string
  context: { cpuTemp: number | null; gpuTemp: number | null; game: string | null }
}
/** Conclusão sobre um grupo de eventos, com o que fazer. */
export interface CrashAdvice { id: string; level: 'info' | 'warning' | 'serious' | 'critical'; title: string; why: string; steps: string[]; count: number }
export interface CrashView { days: number; events: CrashEvent[]; advice: CrashAdvice[]; counts: Partial<Record<CrashKind, number>> }

/** Ping de um alvo nos últimos 60 s: média, variação entre leituras (jitter) e perda, em ms e %. */
export interface PingStats { target: string; avg: number | null; jitter: number | null; loss: number; samples: number }
/** "Lag: internet ou PC?": quem provavelmente causa o lag agora. */
export interface LagView {
  who: 'ok' | 'wifi' | 'internet' | 'pc' | 'measuring'; title: string; detail: string; tip: string
  home: PingStats | null; internet: PingStats | null; until: number | null
}

export interface AlertsView { open: Alert[]; muted: Alert[]; resolved: Alert[]; rules: { name: string; check: string }[] }

export interface Disk { mount: string; total: number; free: number }
export interface FolderSize { name: string; path: string; size: number; files: number; done: boolean }
export interface BigFile { path: string; size: number; modified: number }
export interface Program { name: string; publisher: string; size: number; installed: string }
export interface TempInfo { path: string; size: number; files: number }

export interface Move { id: string; time: number; from: string; to: string; rule: string; undone?: boolean }

export interface SpeedResult { time: number; down: number; up: number; ping: number; error?: string }

export interface EnergyDay { date: string; wh: number; seconds: number }
export interface EnergySummary { days: EnergyDay[]; tariff: number; todayWh: number; monthWh: number; projectionWh: number }

export interface GameSession {
  game: string; exe: string; start: number; end: number
  cpuTempAvg: number | null; cpuTempMax: number | null; gpuTempAvg: number | null; gpuTempMax: number | null; gpuLoadAvg: number | null
  /** Sessões novas: FPS médio, 1% mais baixo, VRAM máxima (MB) e segundos em cada tipo de gargalo. */
  fpsAvg?: number | null; fpsLow?: number | null; vramMax?: number | null; bottlenecks?: Partial<Record<BottleneckKind, number>>
  /** Ping médio até a internet e perda de pacotes (%) durante a sessão. */
  pingAvg?: number | null; pingLoss?: number | null
}

/** ram em bytes (memória em uso); cpu em % do processador inteiro (null na primeira leitura ou sem permissão). */
export interface Proc { pid: number; name: string; ram: number; cpu: number | null; path: string | null; killable?: boolean }
export interface ProcessList { time: number; procs: Proc[]; ramTotal: number; ramUsed: number }
export interface SelfWeight { ram: number; cpu: number; processes: number }

export interface Api {
  getSettings(): Promise<Settings>
  saveSettings(s: Settings): Promise<Settings>
  onStatus(cb: (s: Status) => void): () => void
  disks(): Promise<Disk[]>
  folderSizes(): Promise<FolderSize[]>
  bigFiles(folder: string): Promise<BigFile[]>
  pickFolder(): Promise<string | null>
  showInFolder(path: string): Promise<void>
  trash(path: string): Promise<void>
  programs(): Promise<Program[]>
  openAppsSettings(): Promise<void>
  tempInfo(): Promise<TempInfo>
  cleanTemp(): Promise<{ freed: number; skipped: number }>
  organizerPreview(): Promise<{ from: string; to: string; rule: string }[]>
  organizerRunNow(): Promise<number>
  organizerLog(): Promise<Move[]>
  organizerUndo(id: string): Promise<void>
  speedHistory(): Promise<SpeedResult[]>
  speedRun(): Promise<SpeedResult>
  energy(): Promise<EnergySummary>
  gameSessions(): Promise<GameSession[]>
  toggleWidget(): Promise<boolean>
  /** Roda a tarefa agendada do LibreHardwareMonitor. false = tarefa não existe ou não deu para iniciar. */
  startSensors(): Promise<boolean>
  isPackaged(): Promise<boolean>
  /** Liga/desliga a leitura rápida (5 s) enquanto a aba Processos está aberta nesta janela. */
  watchProcesses(on: boolean): Promise<void>
  onProcesses(cb: (l: ProcessList) => void): () => void
  killProcess(pid: number): Promise<void>
  selfWeight(): Promise<SelfWeight>
  alerts(): Promise<AlertsView>
  /** Silencia o alerta por `days` dias (0 = até o problema sumir e voltar). */
  muteAlert(id: string, days: number): Promise<void>
  unmuteAlert(id: string): Promise<void>
  history(range: HistRange): Promise<HistView>
  /** Lê a ficha da máquina (~5 s na primeira vez; depois vem da memória até `refresh`). */
  machine(refresh?: boolean): Promise<MachineInfo>
  /** Salva a tela atual em PDF (pergunta onde). Devolve o caminho ou null se cancelou. */
  exportPdf(suggestedName: string): Promise<string | null>
  openPath(path: string): Promise<void>
  /** Jogos instalados na Steam (lê os manifestos locais, sem internet). */
  installedGames(): Promise<SteamGame[]>
  searchGames(term: string): Promise<SteamGame[]>
  /** Requisitos da Steam (com cache de 30 dias) comparados com este PC. */
  canRun(appid: number): Promise<CanRun>
  /** Último resultado da verificação de drivers (feita 1x por dia). */
  drivers(): Promise<DriversView>
  /** Verifica agora (Windows Update + site do fabricante da placa de vídeo, ~15 s). */
  checkDrivers(): Promise<DriversView>
  openWindowsUpdate(): Promise<void>
  openLink(url: string): Promise<void>
  /** Checagem da tela Otimizar (~2 s, só leitura). */
  optimize(): Promise<OptimizeView>
  /** Liga/desliga um programa da inicialização (só os do usuário), como o Gerenciador de Tarefas faz. */
  setStartup(name: string, source: StartupItem['source'], enabled: boolean): Promise<OptimizeView>
  setPowerPlan(guid: string): Promise<OptimizeView>
  /** Ações de um clique (e as de "desfazer") e atalhos para ferramentas do Windows. */
  optAction(kind: OptAction): Promise<OptimizeView>
  /** Saúde dos discos pela última leitura dos sensores (sem leitura extra). [] = sem sensores. */
  diskHealth(): Promise<DiskHealth[]>
  /** Diário de travamentos dos últimos `days` dias, com causas prováveis e o que fazer (~2 s, só leitura). */
  crashes(days: number): Promise<CrashView>
  /** Programas abertos que podem entrar no Modo Jogo (sem sistema, launchers e o próprio painel). */
  gameModeCandidates(): Promise<{ name: string; ram: number; path: string | null }[]>
  gameModeLog(): Promise<GameModeEntry[]>
  /** Testa agora: fecha os programas escolhidos e reabre depois de `seconds`. */
  gameModeTest(seconds: number): Promise<GameModeEntry>
  /** Mede o lag por `seconds` mesmo sem jogo aberto (o resultado chega em status.lag). */
  lagTest(seconds: number): Promise<void>
}
