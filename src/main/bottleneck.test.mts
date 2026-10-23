// Testes do detector de gargalo. Rodar: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify, type BPoint } from './bottleneck.ts'

const NOW = 1_800_000_000_000
/** 20 s de leituras a cada 2 s. */
const run = (p: Partial<BPoint>) => Array.from({ length: 11 }, (_, i) => ({ t: NOW - 20_000 + i * 2000, gpu: 97, cpu: 30, coreMax: 60, vramPct: 50, ramPct: 45, cpuTemp: 70, gpuTemp: 70, ...p }))
const kind = (p: Partial<BPoint>) => classify(run(p), NOW)?.kind

test('GPU no talo é o normal', () => { assert.equal(kind({}), 'gpu'); assert.match(classify(run({}), NOW)!.title, /normal/) })
test('GPU sobrando e um núcleo no limite: gargalo na CPU', () => assert.equal(kind({ gpu: 60, coreMax: 98, cpu: 35 }), 'cpu'))
test('thread travada que o Windows espalha entre núcleos (75% na média) ainda é CPU', () => assert.equal(kind({ gpu: 50, coreMax: 75, cpu: 12 }), 'cpu'))
test('FPS parado em 144 com GPU sobrando é trava, não gargalo', () => {
  const b = classify(run({ gpu: 55, coreMax: 90, fps: 144 }), NOW)!
  assert.equal(b.kind, 'capped'); assert.equal(b.title, 'FPS travado em 144')
})
test('FPS variando não conta como trava', () => {
  const pts = run({ gpu: 55, coreMax: 90 }).map((p, i) => ({ ...p, fps: i % 2 ? 110 : 150 }))
  assert.equal(classify(pts, NOW)?.kind, 'cpu')
})
test('GPU sobrando e CPU folgada: FPS limitado', () => assert.equal(kind({ gpu: 45, coreMax: 50 }), 'capped'))
test('memória de vídeo cheia vem antes da GPU', () => assert.equal(kind({ vramPct: 98 }), 'vram'))
test('RAM cheia', () => assert.equal(kind({ ramPct: 95, gpu: 70 }), 'ram'))
test('temperatura vem primeiro', () => assert.equal(kind({ gpuTemp: 92, vramPct: 99 }), 'heat'))
test('entre 80% e 90% de GPU: equilibrado', () => assert.equal(classify(run({ gpu: 85 }), NOW)?.title, 'Equilibrado'))
test('sem sensor da GPU ou pouco tempo: não arrisca', () => {
  assert.equal(classify(run({ gpu: null }), NOW), null)
  assert.equal(classify(run({}).slice(-3), NOW), null)
})
