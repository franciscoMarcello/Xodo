// Testes do cálculo do histórico. Rodar: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Acc, aggregate } from './aggregate.ts'
import type { HistPoint } from '../../shared/types'

const MIN = 60_000

test('acumulador: média e máximo, ignorando leituras sem sensor', () => {
  const a = new Acc()
  for (const t of [40, 50, 60]) a.add('cpuTemp', t)
  a.add('gpuTemp', null)
  const p = a.point(0)
  assert.equal(p.cpuTemp, 50); assert.equal(p.cpuTempMax, 60)
  assert.equal(p.gpuTemp, null); assert.equal(p.gpuTempMax, null)
  assert.ok(new Acc().empty)
})

test('blocos: 10 minutos viram 2 blocos de 5 min com média das médias e maior máximo', () => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = new Acc(); a.add('cpu', i < 5 ? 10 : 30, i === 7 ? 95 : i < 5 ? 10 : 30); return a.point(i * MIN)
  })
  const out = aggregate(pts, 5 * MIN, 0)
  assert.equal(out.length, 2)
  assert.deepEqual([out[0].t, out[0].cpu, out[0].cpuMax], [0, 10, 10])
  assert.deepEqual([out[1].t, out[1].cpu, out[1].cpuMax], [5 * MIN, 30, 95])
})

test('blocos alinhados no horário local (Brasília, UTC-3)', () => {
  const offset = 180 * MIN // getTimezoneOffset() do Brasil = 180
  const at = Date.UTC(2026, 9, 21, 3 + 4, 30) // 04:30 no Brasil
  const a = new Acc(); a.add('ram', 50)
  const [p] = aggregate([a.point(at) as HistPoint], 3 * 60 * MIN, offset)
  assert.equal(new Date(p.t - offset).getUTCHours(), 3, 'bloco 03:00–06:00 no horário local')
})
