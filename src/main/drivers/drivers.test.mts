// Testes da verificação de drivers. Rodar: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { amdDriverUrl, compareVersions, latestAmd, parseAmdPage } from './parse.ts'

test('compara versões número a número', () => {
  assert.equal(compareVersions('26.10.1', '26.9.2'), 1)
  assert.equal(compareVersions('26.10.1', '26.10.1'), 0)
  assert.equal(compareVersions('25.12.1', '26.1.1'), -1)
})

test('endereço da página de drivers de cada Radeon', () => {
  assert.equal(amdDriverUrl('AMD Radeon RX 6700 XT'), 'https://www.amd.com/en/support/downloads/drivers.html/graphics/radeon-rx/radeon-rx-6000-series/amd-radeon-rx-6700-xt.html')
  assert.match(amdDriverUrl('AMD Radeon RX 7900 XTX')!, /radeon-rx-7000-series\/amd-radeon-rx-7900-xtx\.html$/)
  assert.match(amdDriverUrl('AMD Radeon RX 9070')!, /radeon-rx-9000-series\/amd-radeon-rx-9070\.html$/)
  assert.equal(amdDriverUrl('AMD Radeon(TM) Graphics'), null)
})

// Trecho real da página (texto, depois de tirar o HTML)
const page = `<div>AMD Software: Adrenalin Edition Revision Number Adrenalin 26.11.1 (Optional) File Size 945 MB Release Date 2026-11-05 Download</div>
<div>AMD Software: Adrenalin Edition Revision Number <b>Adrenalin 26.10.1 WHQL (Recommended)</b> File Size 941 MB Release Date 2026-10-20 Download</div>
<div>Windows 7 - 64-Bit Edition Driver AMD Software: Adrenalin Edition Revision Number Adrenalin 22.6.1 Recommended (WHQL) File Size 656 MB Release Date 2022-06-21</div>`

test('lê versões da página da AMD e prefere a recomendada', () => {
  const list = parseAmdPage(page)
  assert.deepEqual(list.map((r) => [r.version, r.recommended]), [['26.11.1', false], ['26.10.1', true], ['22.6.1', true]])
  assert.deepEqual(latestAmd(list), { version: '26.10.1', recommended: true, size: '941 MB', date: '2026-10-20' })
  assert.equal(latestAmd(parseAmdPage('<html>página mudou</html>')), null)
})
