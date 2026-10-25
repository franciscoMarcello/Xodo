// Testes do layout do mapa do disco. Rodar: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { squarify } from './treemap.ts'

test('squarify: área proporcional ao tamanho, tudo dentro do retângulo, zeros fora', () => {
  const items = [6, 6, 4, 3, 2, 2, 1, 0].map((size) => ({ size }))
  const r = squarify(items, { x: 0, y: 0, w: 600, h: 400 })
  assert.equal(r.length, 7)
  for (const b of r) {
    assert.ok(Math.abs(b.w * b.h - b.item.size * 10_000) < 1e-6)
    assert.ok(b.x >= -1e-9 && b.y >= -1e-9 && b.x + b.w <= 600 + 1e-6 && b.y + b.h <= 400 + 1e-6)
  }
})
