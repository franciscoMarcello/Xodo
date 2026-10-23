// Testes da tabela de hardware e do "Posso rodar?". Rodar: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findCpus, findGpus, findCpu, findGpu } from './hardware.ts'
import { compare, parseReq } from './requirements.ts'

test('reconhece as peças do PC pelo nome do Windows', () => {
  assert.deepEqual(findCpu('AMD Ryzen 5 5600X 6-Core Processor'), { name: 'Ryzen 5 5600X', score: 128 })
  assert.deepEqual(findGpu('AMD Radeon RX 6800'), { name: 'RX 6800', score: 158 })
  assert.equal(findCpu('Intel(R) Core(TM) i5-2500K CPU @ 3.30GHz')?.name, 'Core i5-2500K')
  assert.equal(findGpu('NVIDIA GeForce RTX 3060 Ti')?.name, 'RTX 3060 TI')
})

test('o modelo mais específico ganha (SUPER, Ti, K, X3D)', () => {
  assert.equal(findGpu('GeForce RTX 2060 SUPER')?.score, 97)
  assert.equal(findGpu('GeForce RTX 2060')?.score, 85)
  assert.equal(findCpu('Core i7-6700K')?.score, 78)
  assert.equal(findCpu('Core i7-6700')?.score, 74)
  assert.equal(findCpu('Ryzen 7 7800X3D')?.score, 200)
})

test('alternativas no mesmo texto', () => {
  assert.deepEqual(findGpus('GeForce GTX 1060 6GB or Radeon RX 580 8GB or Arc A380').map((p) => p.name).sort(), ['ARC A380', 'GTX 1060', 'RX 580'].map((n) => n.replace('ARC', 'Arc')).sort())
  assert.equal(findCpus('Core i7-12700 or Ryzen 7 7800X3D').length, 2)
  assert.equal(findGpus('DirectX 11 compatible card with 2GB').length, 0)
})

const steam = (cpu: string, ram: string, gpu: string, storage: string) =>
  `<strong>Minimum:</strong><br><ul class="bb_ul"><li>Requires a 64-bit processor and operating system<br></li><li><strong>OS:</strong> 64-bit Windows 10<br></li><li><strong>Processor:</strong> ${cpu}<br></li><li><strong>Memory:</strong> ${ram}<br></li><li><strong>Graphics:</strong> ${gpu}<br></li><li><strong>DirectX:</strong> Version 12<br></li><li><strong>Storage:</strong> ${storage}<br></li><li><strong>Additional Notes:</strong> SSD required.</li></ul>`

test('lê o HTML de requisitos da Steam', () => {
  const r = parseReq(steam('Core i7-6700 or Ryzen 5 1600', '12 GB RAM', 'GeForce GTX 1060 6GB or Radeon RX 580 8GB', '70 GB available space'))!
  assert.equal(r.cpu, 'Core i7-6700 or Ryzen 5 1600')
  assert.equal(r.ramGB, 12); assert.equal(r.storageGB, 70); assert.equal(r.ssd, true)
  assert.equal(parseReq(''), null)
})

/** PC de exemplo: CPU um pouco abaixo do recomendado do Cyberpunk, GPU com folga. */
const pc = { cpu: 'AMD Ryzen 5 5600X 6-Core Processor', gpu: 'AMD Radeon RX 6800', ramGB: 32, freeGB: 500, hasSsd: true }

test('Cyberpunk 2077: GPU com folga, CPU um pouco abaixo do recomendado -> Médio', () => {
  const min = parseReq(steam('Core i7-6700 or Ryzen 5 1600', '12 GB RAM', 'GeForce GTX 1060 6GB or Radeon RX 580 8GB or Arc A380', '70 GB available space'))
  const rec = parseReq(steam('Core i7-12700 or Ryzen 7 7800X3D', '16 GB RAM', 'GeForce RTX 2060 SUPER or Radeon RX 5700 XT or Arc A770', '70 GB available space'))
  const { parts, verdict } = compare(min, rec, pc)
  const by = Object.fromEntries(parts.map((p) => [p.label, p.verdict]))
  assert.deepEqual(by, { 'Processador': 'min', 'Placa de vídeo': 'above', 'Memória RAM': 'above', 'Espaço em disco': 'rec' })
  assert.equal(verdict.level, 'medium')
  assert.match(verdict.detail, /processador/)
})

test('abaixo do mínimo', () => {
  const weak = { ...pc, gpu: 'NVIDIA GeForce GT 1030' }
  const min = parseReq(steam('Core i5-4460', '8 GB RAM', 'GeForce GTX 1060', '50 GB available space'))
  assert.equal(compare(min, null, weak).verdict.level, 'no')
})

test('requisitos genéricos e de jogos antigos (CS2, Dota 2)', () => {
  // CS2: CPU antiga citada + GPU só "DirectX 11"
  const cs2 = parseReq(steam('4 hardware CPU threads - Intel® Core™ i5 750 or higher', '8 GB RAM', 'Video card must be 1 GB or more and should be a DirectX 11-compatible with support for Shader Model 5.0', '85 GB available space'))
  const r = compare(cs2, null, pc)
  assert.equal(r.verdict.level, 'ultra')
  assert.match(r.parts[1].note ?? '', /genérica/)
  assert.equal(r.parts[0].min, 'Core i5-750')
  // Dota 2: "HD2600/3600" e "8600/9600GT" grudados
  assert.ok(findGpus('NVIDIA GeForce 8600/9600GT, ATI/AMD Radeon HD2600/3600').length >= 2)
  // sem nada reconhecível de verdade
  assert.equal(compare(parseReq(steam('TBD', '8 GB RAM', 'TBD', '10 GB')), null, pc).verdict.level, 'unknown')
})

test('só com mínimo: 1,5x o mínimo conta como recomendado', () => {
  const min = parseReq(steam('Core i5-4460', '8 GB RAM', 'GeForce GTX 960', '20 GB available space')) // jogo leve
  assert.equal(compare(min, null, pc).verdict.level, 'ultra')
})
