// Testes da saúde dos discos. Rodar: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diskHealth, evaluateDisk, type Node } from './diskhealth.ts'

const s = (Text: string, Value: string) => ({ Text, Value })
const disk = (name: string, groups: Record<string, [string, string][]>): Node => ({ Text: name, ImageURL: 'images_icon/hdd.png', Children: Object.entries(groups).map(([g, l]) => ({ Text: g, Children: l.map(([t, v]) => s(t, v)) })) })

// Leitura no formato do LibreHardwareMonitor (discos de exemplo; nomes com espaço no fim, como o sensor manda)
const root: Node = { Text: 'PC', Children: [
  { Text: 'CPU de exemplo', ImageURL: 'images_icon/cpu.png', Children: [] },
  disk('NVMe Exemplo 500GB', { Temperatures: [['Composite Temperature', '40,0 °C'], ['Warning Temperature', '84,0 °C'], ['Critical Temperature', '89,0 °C']], Load: [['Used Space', '61,2 %']], Levels: [['Life', '96,0 %'], ['Available Spare', '100,0 %'], ['Available Spare Threshold', '10,0 %'], ['Percentage Used', '4,0 %']], Factors: [['Power On Count', '900,000'], ['Power On Hours', '3200,000']], Data: [['Data Written', '12000,0 GB']] }),
  disk('SSD SATA Exemplo 240GB ', { Temperatures: [['Temperature', '45,0 °C']], Levels: [['Life', '88,0 %']], Factors: [['Power On Hours', '9000,000']] }),
  disk('HD Exemplo 1TB', { Temperatures: [['Temperature', '33,0 °C']], Load: [['Used Space', '10,0 %']] }),
] }

test('lê os três tipos de disco (NVMe, SSD SATA e HD)', () => {
  const l = diskHealth(root)
  assert.deepEqual(l.map((d) => [d.name, d.kind, d.life, d.status]), [['NVMe Exemplo 500GB', 'nvme', 96, 'ok'], ['SSD SATA Exemplo 240GB', 'ssd', 88, 'ok'], ['HD Exemplo 1TB', 'hdd', null, 'ok']])
  assert.equal(l[0].writtenGB, 12000); assert.equal(l[0].hours, 3200); assert.equal(l[0].tempWarn, 84)
  assert.deepEqual(diskHealth(null), [])
})

const base = { name: 'X', kind: 'ssd' as const, life: 90, temp: 40, tempWarn: null, tempCrit: null, hours: 100, cycles: 10, writtenGB: 1, readGB: 1, usedPct: 50, spare: null, spareMin: null }

test('vida baixa, reserva esgotada, calor e disco cheio', () => {
  assert.equal(evaluateDisk({ ...base, life: 15 }).status, 'serious')
  assert.equal(evaluateDisk({ ...base, life: 5 }).status, 'critical')
  assert.equal(evaluateDisk({ ...base, spare: 5, spareMin: 10 }).status, 'critical')
  assert.equal(evaluateDisk({ ...base, kind: 'hdd', life: null, temp: 52 }).status, 'warning')
  assert.equal(evaluateDisk({ ...base, kind: 'nvme', temp: 86, tempWarn: 84, tempCrit: 89 }).status, 'warning')
  assert.equal(evaluateDisk({ ...base, usedPct: 95 }).status, 'warning')
})
