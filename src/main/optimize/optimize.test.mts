// Testes da tela Otimizar. Rodar: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, flagStartup, PLAN, type ScanRaw } from './checks.ts'

const GB = 1024 ** 3
const item = (name: string, command: string, o: Partial<ScanRaw['startup'][0]> = {}) => ({ name, command, source: 'hkcu' as const, approvedKey: 'Run', enabled: true, exists: true, ...o })
/** Um PC de exemplo. */
const raw: ScanRaw = {
  startup: [
    item('com.exemplo.meu-app', 'C:\\Users\\usuario\\Projetos\\meu-app\\app\\node_modules\\electron\\dist\\electron.exe C:\\...\\app --hidden'),
    item('Steam', '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent'),
    item('Discord', '"C:\\Users\\usuario\\AppData\\Local\\Discord\\Update.exe" --processStart Discord.exe'),
    item('Exemplo Install Helper', 'C:\\Program Files\\Exemplo\\installhelper.exe', { source: 'hklm' }),
    item('impressora', 'impressora.exe', { source: 'hklm' }),
  ],
  plans: [{ guid: PLAN.balanced, name: 'Equilibrado', active: true }, { guid: PLAN.high, name: 'Alto desempenho', active: false }],
  noLetter: [{ disk: 'SSD Exemplo 128GB', size: 111.8 * GB }],
  pagefileAuto: true, pagefiles: [], ramBytes: 32 * GB, shaderCacheBytes: 0.3 * GB, gameMode: null, bgRecording: null, hags: null,
  cFree: 20 * GB, cTotal: 240 * GB, gpt: true,
}
const ctx = { cpu: 'AMD Ryzen 5 5600X 6-Core Processor', gpu: 'AMD Radeon RX 6800', idleTemp: 66 }
const byId = (list: ReturnType<typeof evaluate>) => Object.fromEntries(list.map((c) => [c.id.split(':')[0], c.status]))

test('PC de exemplo: disco sem letra, C: cheio, sobras na inicialização e CPU quente vêm primeiro', () => {
  const list = evaluate(raw, ctx)
  assert.deepEqual(byId(list), { letter: 'warn', 'c-space': 'warn', startup: 'warn', 'idle-temp': 'warn', rebar: 'tip', power: 'ok', 'game-mode': 'ok', 'bg-rec': 'ok', hags: 'ok', pagefile: 'ok', shaders: 'ok' })
  assert.equal(list[0].status, 'warn')
  assert.match(list.find((c) => c.id === 'startup')!.summary, /com\.exemplo\.meu-app, Exemplo Install Helper/)
})

test('sobras na inicialização: arquivo sumido, app de desenvolvimento e instalador (mas não o Update.exe do Discord)', () => {
  const f = flagStartup([...raw.startup, item('Velho', 'C:\\nao\\existe.exe', { exists: false })])
  assert.deepEqual(f.filter((i) => i.flag).map((i) => i.name), ['com.exemplo.meu-app', 'Exemplo Install Helper', 'Velho'])
  assert.deepEqual(f.map((i) => i.canToggle), [true, true, true, false, false, true])
})

test('plano de energia e opções do Windows', () => {
  const saver = evaluate({ ...raw, plans: [{ guid: PLAN.saver, name: 'Economia de energia', active: true }] }, ctx)
  assert.equal(saver.find((c) => c.id === 'power')!.status, 'warn')
  const off = evaluate({ ...raw, gameMode: 0, bgRecording: 1, hags: 1 }, ctx)
  assert.deepEqual([off.find((c) => c.id === 'game-mode')!.action?.kind, off.find((c) => c.id === 'bg-rec')!.action?.kind, off.find((c) => c.id === 'hags')!.status], ['enable-game-mode', 'disable-bg-recording', 'tip'])
})

test('paginação pequena fixa, cache grande e PC sem suporte a Resizable BAR', () => {
  const l = evaluate({ ...raw, pagefileAuto: false, pagefiles: [{ path: 'C:\\pagefile.sys', initialMB: 2048, maxMB: 2048 }], shaderCacheBytes: 5 * GB }, { ...ctx, gpu: 'NVIDIA GeForce GTX 1060', idleTemp: 45 })
  assert.equal(l.find((c) => c.id === 'pagefile')!.status, 'tip')
  assert.equal(l.find((c) => c.id === 'shaders')!.action?.kind, 'clear-shader-cache')
  assert.equal(l.find((c) => c.id === 'rebar'), undefined)
  assert.equal(l.find((c) => c.id === 'idle-temp')!.status, 'ok')
})
