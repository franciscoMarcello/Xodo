import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Api, ProcessList, Status } from '../shared/types'

// Ponte entre a interface e o processo principal: cada função vira uma chamada IPC com o mesmo nome.

const names = [
  'getSettings', 'saveSettings', 'disks', 'folderSizes', 'bigFiles', 'pickFolder', 'showInFolder', 'trash', 'programs', 'openAppsSettings',
  'tempInfo', 'cleanTemp', 'organizerPreview', 'organizerRunNow', 'organizerLog', 'organizerUndo', 'speedHistory', 'speedRun', 'energy',
  'gameSessions', 'toggleWidget', 'startSensors', 'isPackaged', 'watchProcesses', 'killProcess', 'selfWeight',
  'alerts', 'muteAlert', 'unmuteAlert', 'history', 'machine', 'exportPdf', 'openPath',
  'installedGames', 'searchGames', 'canRun', 'drivers', 'checkDrivers', 'openWindowsUpdate', 'openLink',
  'optimize', 'setStartup', 'setPowerPlan', 'optAction', 'diskHealth', 'crashes', 'gameModeCandidates', 'gameModeLog', 'gameModeTest', 'lagTest',
] as const

const api = Object.fromEntries(names.map((n) => [n, (...args: unknown[]) => ipcRenderer.invoke(n, ...args)])) as unknown as Api
/** Assinatura de um evento enviado pelo processo principal; devolve a função que cancela. */
function on<T>(channel: string, cb: (x: T) => void) {
  const listener = (_e: IpcRendererEvent, x: T) => cb(x)
  ipcRenderer.on(channel, listener)
  return () => { ipcRenderer.removeListener(channel, listener) }
}
api.onStatus = (cb) => on<Status>('status', cb)
api.onProcesses = (cb) => on<ProcessList>('processes', cb)

contextBridge.exposeInMainWorld('api', api)
