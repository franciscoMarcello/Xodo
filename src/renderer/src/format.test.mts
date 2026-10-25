// Testes das marcas do eixo do tempo. Rodar: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { timeTicks } from './format.ts'

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime()

test('timeTicks: dias à meia-noite, só dentro do intervalo', () => {
  assert.deepEqual(timeTicks(at(21, 10, 30), at(23, 1), 24), [at(22, 0), at(23, 0)])
})

test('timeTicks: tudo no mesmo dia ainda tem as pontas', () => {
  assert.deepEqual(timeTicks(at(25, 9), at(25, 18), 24), [at(25, 9), at(25, 18)])
})

test('timeTicks: horas redondas, passando da meia-noite', () => {
  assert.deepEqual(timeTicks(at(21, 19, 40), at(22, 4), 3), [at(21, 21), at(22, 0), at(22, 3)])
})
