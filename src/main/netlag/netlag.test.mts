// Testes do "Lag: internet ou PC?". Rodar: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGateway, parsePing, stats, verdict } from './stats.ts'

test('lê a saída do ping em português e inglês', () => {
  assert.equal(parsePing('Resposta de 1.1.1.1: bytes=32 tempo=43ms TTL=50'), 43)
  assert.equal(parsePing('Resposta de 192.168.0.1: bytes=32 tempo<1ms TTL=64'), 0.5)
  assert.equal(parsePing('Reply from 1.1.1.1: bytes=32 time=12ms TTL=57'), 12)
  assert.equal(parsePing('Esgotado o tempo limite do pedido.'), null)
  assert.equal(parsePing('Resposta de 192.168.0.7: Host de destino inacessível.'), null)
})

test('acha o roteador na rota padrão', () => {
  assert.equal(parseGateway('          0.0.0.0          0.0.0.0    192.168.0.1    192.168.0.7     25'), '192.168.0.1')
  assert.equal(parseGateway('nada'), null)
})

test('média, variação e perda', () => {
  assert.deepEqual(stats('x', [10, 20, null, 10]), { target: 'x', samples: 4, avg: 13.3, jitter: 10, loss: 25 })
})

const good = stats('1.1.1.1', Array(10).fill(43)), lan = stats('roteador', Array(10).fill(0.5))

test('quem é o culpado', () => {
  assert.equal(verdict(lan, good, 'gpu').who, 'ok')
  assert.equal(verdict(stats('roteador', [1, 30, 2, 40, null, 3, 25, 2, 1, 2]), good, null).who, 'wifi')
  assert.equal(verdict(lan, stats('1.1.1.1', [40, 90, 45, null, null, 42, 95, 41, 44, 43]), null).who, 'internet')
  assert.equal(verdict(lan, good, 'cpu').who, 'pc')
  assert.equal(verdict(lan, stats('1.1.1.1', [40, 41]), null).who, 'measuring')
})
