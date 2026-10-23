// Testes do diário de travamentos. Rodar: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advise, classify, type Ctx, type RawEvent } from './explain.ts'

const cold: Ctx = { cpuTemp: 55, gpuTemp: 50, game: null }
const kp41 = (time: string, d: Record<string, string> = {}): RawEvent => ({ provider: 'Microsoft-Windows-Kernel-Power', id: 41, time, msg: '', data: { BugcheckCode: '0', PowerButtonTimestamp: '0', SleepInProgress: '0', SystemSleepTransitionsToOn: '0', ...d } })
const appErr = (app: string, module: string, code = 'c0000005'): RawEvent => ({ provider: 'Application Error', id: 1000, time: '2026-03-11T20:00:00', msg: '', data: { AppName: app, ModuleName: module, ExceptionCode: code } })
const bsod = (code: string): RawEvent => ({ provider: 'Microsoft-Windows-WER-SystemErrorReporting', id: 1001, time: '2026-03-12T21:00:00', msg: '', data: { param1: `${code} (0x0, 0x0, 0x0, 0x0)` } })
const all = (list: RawEvent[], ctx = cold) => list.map((e) => classify(e, ctx)!).filter(Boolean)

test('3 desligamentos sem tela azul e sem botão', () => {
  const ev = all([kp41('2026-03-10T20:15:00'), kp41('2026-02-01T21:40:00', { SystemSleepTransitionsToOn: '1' }), kp41('2026-01-05T19:05:00')])
  assert.deepEqual(ev.map((e) => e.title), Array(3).fill('Desligou sozinho, sem tela azul'))
  const a = advise(ev)
  assert.equal(a[0].id, 'shutdown'); assert.equal(a[0].level, 'serious'); assert.equal(a[0].count, 3)
  assert.match(a[0].steps.join(' '), /nobreak/)
})

test('desligamento quente aponta para o cooler; botão de ligar não é problema', () => {
  const hot = all([kp41('2026-03-10T20:15:00')], { cpuTemp: 95, gpuTemp: 70, game: 'Jogo Exemplo' })
  assert.match(hot[0].explain, /CPU 95 °C, GPU 70 °C, jogando Jogo Exemplo/)
  assert.match(advise(hot)[0].why, /muito quente/)
  assert.match(advise(hot)[0].steps[0], /poeira/)
  const button = all([kp41('2026-03-10T20:15:00', { PowerButtonTimestamp: '133' })])
  assert.equal(button[0].title, 'Desligado pelo botão')
  assert.equal(advise(button).length, 0)
})

test('telas azuis viram a causa certa', () => {
  const ev = all([bsod('0x00000116'), bsod('0x0000001a'), bsod('0x00000124')])
  assert.deepEqual(ev.map((e) => e.code), ['0x00000116 VIDEO_TDR_FAILURE', '0x0000001A MEMORY_MANAGEMENT', '0x00000124 WHEA_UNCORRECTABLE_ERROR'])
  assert.deepEqual(advise(ev).map((a) => a.id).sort(), ['bluescreen', 'cpu', 'gpu', 'ram'])
})

test('programa que fecha dentro do driver de vídeo é culpa do driver, não do jogo', () => {
  const ev = all([appErr('jogo.exe', 'amdxx64.dll'), appErr('jogo.exe', 'amdxx64.dll')])
  assert.match(ev[0].explain, /Driver de vídeo da AMD/)
  assert.equal(advise(ev)[0].id, 'gpu')
})

test('programa que fecha sempre sozinho (3+) vira conselho do próprio programa', () => {
  const ev = all([appErr('ferramenta.exe', 'ucrtbase.dll', 'c0000409'), appErr('ferramenta.exe', 'ucrtbase.dll', 'c0000409'), appErr('ferramenta.exe', 'ucrtbase.dll', 'c0000409'), appErr('outroapp.exe', 'ntdll.dll', 'c0000374')])
  assert.match(ev[3].explain, /memória corrompida/)
  const a = advise(ev)
  assert.deepEqual(a.map((x) => x.id), ['app:ferramenta.exe'])
})
