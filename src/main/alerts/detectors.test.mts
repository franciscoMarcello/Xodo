// Testes das regras de alerta. Rodar: npm test (Node 24 executa TypeScript direto).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as d from './detectors.ts'

const MIN = 60_000, HOUR = 60 * MIN, GB = 1024 ** 3
const NOW = 1_800_000_000_000

/** Pontos de status a cada 2 s nos últimos `mins` minutos. */
const points = (mins: number, p: Partial<d.Point>) =>
  Array.from({ length: mins * 30 + 1 }, (_, i) => ({ t: NOW - mins * MIN + i * 2000, cpuLoad: 5, cpuTemp: 45, gpuTemp: 40, ramPct: 50, gaming: false, ...p }))
const group = (name: string, ram: number, cpu: number | null = 0, path: string | null = null): d.Group => ({ name, ram, cpu, path, count: 1 })
const levels = (f: d.Found[]) => f.map((x) => `${x.id}=${x.level}`)

test('RAM quase cheia: só depois de 10 minutos acima de 85%', () => {
  assert.deepEqual(d.ramTotal(points(10, { ramPct: 87 }), NOW).map((f) => f.level), ['warning'])
  assert.deepEqual(d.ramTotal(points(10, { ramPct: 93 }), NOW).map((f) => f.level), ['serious'])
  assert.equal(d.ramTotal(points(5, { ramPct: 95 }), NOW).length, 0, 'só 5 minutos de dados')
  const dip = points(10, { ramPct: 90 }); dip[100].ramPct = 70
  assert.equal(d.ramTotal(dip, NOW).length, 0, 'baixou no meio')
})

test('programa pesado: precisa passar de 4 GB e de 20% da RAM', () => {
  const total = 32 * GB
  assert.deepEqual(levels(d.procRam({ t: NOW, groups: [group('chrome', 7 * GB)] }, total)), ['proc-ram:chrome=warning'])
  assert.deepEqual(levels(d.procRam({ t: NOW, groups: [group('chrome', 12 * GB)] }, total)), ['proc-ram:chrome=serious'])
  assert.equal(d.procRam({ t: NOW, groups: [group('chrome', 5 * GB)] }, total).length, 0, '5 GB de 32 = 16%')
  assert.equal(d.procRam({ t: NOW, groups: [group('Memory Compression', 9 * GB)] }, total).length, 0, 'não é programa')
})

test('vazamento: cresce mais de 1 GB, dobra e quase não baixa em 2 h', () => {
  const grow = Array.from({ length: 121 }, (_, i) => ({ t: NOW - 2 * HOUR + i * MIN, v: 0.4 * GB + i * 0.015 * GB }))
  assert.deepEqual(levels(d.memLeak(new Map([['Discord', grow]]), NOW)), ['leak:discord=warning'])
  const saw = grow.map((p, i) => ({ ...p, v: i % 2 ? p.v * 0.5 : p.v })) // sobe e desce
  assert.equal(d.memLeak(new Map([['Discord', saw]]), NOW).length, 0)
  const big = grow.map((p) => ({ ...p, v: p.v + 8 * GB })) // cresceu 1,8 GB mas não dobrou
  assert.equal(d.memLeak(new Map([['Jogo', big]]), NOW).length, 0)
})

test('CPU em segundo plano: acima de 6% em todas as leituras de 5 min', () => {
  const samples = (cpu: (i: number) => number | null) => Array.from({ length: 6 }, (_, i) => ({ t: NOW - 5 * MIN + i * MIN, groups: [group('miner', GB / 2, cpu(i))] }))
  assert.deepEqual(levels(d.bgCpu(samples(() => 12), NOW, new Set())), ['bg-cpu:miner=warning'])
  assert.deepEqual(levels(d.bgCpu(samples(() => 30), NOW, new Set())), ['bg-cpu:miner=serious'])
  assert.equal(d.bgCpu(samples((i) => (i === 3 ? 1 : 12)), NOW, new Set()).length, 0, 'parou um pouco')
  assert.equal(d.bgCpu(samples(() => 12), NOW, new Set(['miner'])).length, 0, 'ignorado')
})

test('CPU quente parada: 70 °C com 8% de uso', () => {
  assert.deepEqual(levels(d.hotIdleCpu(points(5, { cpuTemp: 70, cpuLoad: 8 }), NOW)), ['cpu-hot-idle=warning'])
  assert.deepEqual(levels(d.hotIdleCpu(points(5, { cpuTemp: 78, cpuLoad: 8 }), NOW)), ['cpu-hot-idle=serious'])
  assert.equal(d.hotIdleCpu(points(5, { cpuTemp: 70, cpuLoad: 40 }), NOW).length, 0, 'com uso, esquentar é normal')
  assert.equal(d.hotIdleCpu(points(5, { cpuTemp: 70, cpuLoad: 8, gaming: true }), NOW).length, 0, 'jogando')
  assert.equal(d.hotIdleCpu(points(5, { cpuTemp: null, cpuLoad: 8 }), NOW).length, 0, 'sem sensor')
})

test('superaquecimento: CPU 90 °C e GPU 92 °C são críticos', () => {
  assert.deepEqual(levels(d.overheat(points(1, { cpuTemp: 91, gpuTemp: 86 }), NOW)), ['overheat:cpuTemp=critical', 'overheat:gpuTemp=serious'])
  assert.equal(d.overheat(points(1, { cpuTemp: 80, gpuTemp: 80 }), NOW).length, 0)
})

test('disco quase cheio: limites em GB e em %', () => {
  const disk = (free: number, total = 232 * GB) => ({ mount: 'C:\\', total, free })
  assert.equal(d.diskLow([disk(24.9 * GB)]).length, 0, 'C: com 24,9 GB livres (10,7%) ainda não é alerta')
  assert.deepEqual(levels(d.diskLow([disk(12 * GB)])), ['disk-low:C:=warning'])
  assert.deepEqual(levels(d.diskLow([disk(4 * GB)])), ['disk-low:C:=serious'])
  assert.equal(d.diskLow([disk(150 * GB, 2000 * GB)]).length, 0, '2 TB com 150 GB livres (7,5%) não é urgente')
})

test('disco enchendo: perdeu mais de 10 GB em 24 h', () => {
  const h = Array.from({ length: 25 }, (_, i) => ({ t: NOW - 24 * HOUR + i * HOUR, v: 100 * GB - i * 0.5 * GB }))
  assert.deepEqual(levels(d.diskDrop(new Map([['C:\\', h]]), NOW)), ['disk-drop:C:=warning'])
  assert.equal(d.diskDrop(new Map([['C:\\', h.slice(-10)]]), NOW).length, 0, 'menos de 20 h de histórico')
})

test('internet: abaixo de 50% do plano ou 3 falhas seguidas', () => {
  const t = (down: number, error?: string) => ({ time: NOW - HOUR, down, error })
  assert.deepEqual(levels(d.internet([t(120), t(140), t(130)], 500, NOW)), ['net-slow=warning'])
  assert.equal(d.internet([t(320), t(330), t(300)], 500, NOW).length, 0)
  assert.equal(d.internet([t(120), t(140), t(130)], 0, NOW).length, 0, 'sem plano informado')
  assert.deepEqual(levels(d.internet([t(0, 'x'), t(0, 'x'), t(0, 'x')], 500, NOW)), ['net-fail=warning'])
})

test('pasta incomum: Temp/Downloads, mas instaladores não', () => {
  const s = (name: string, path: string) => ({ t: NOW, groups: [group(name, GB, 0, path)] })
  assert.equal(d.oddFolder(s('svc', 'C:\\Users\\x\\AppData\\Local\\Temp\\svc.exe')).length, 1)
  assert.equal(d.oddFolder(s('ChromeSetup', 'C:\\Users\\x\\Downloads\\ChromeSetup.exe')).length, 0)
  assert.equal(d.oddFolder(s('chrome', 'C:\\Program Files\\Google\\Chrome\\chrome.exe')).length, 0)
})

test('inicialização: só itens novos, por 3 dias', () => {
  const items = [{ name: 'Steam', command: 'steam.exe' }, { name: 'Coisa', command: 'coisa.exe' }]
  assert.deepEqual(d.newStartup(items, new Map([['coisa', NOW - HOUR]]), NOW).map((f) => f.id), ['startup:coisa'])
  assert.equal(d.newStartup(items, new Map([['coisa', NOW - 4 * 24 * HOUR]]), NOW).length, 0)
})

test('driver novo: só avisa o que é mais novo que o instalado', () => {
  const f = d.driverUpdates([
    { source: 'amd', device: 'AMD Radeon RX 6800', title: 'AMD Software: Adrenalin 26.11.1 (recomendado)', available: '26.11.1', current: '26.10.1', newer: true },
    { source: 'windows-update', device: 'Placa de rede Exemplo', title: 'Exemplo - LAN', available: '10.1.505', current: '10.68.815', newer: false },
  ])
  assert.deepEqual(f.map((x) => [x.id, x.title]), [['driver:amd radeon rx 6800:26.11.1', 'Driver novo: AMD Software: Adrenalin 26.11.1']])
  assert.match(f[0].detail, /Você tem 26\.10\.1/)
})

test('sem reiniciar: 7 dias', () => {
  assert.equal(d.uptime(6.9 * 86400).length, 0)
  assert.equal(d.uptime(9 * 86400)[0].title, 'PC há 9 dias sem reiniciar')
})
