// Testes do agrupamento do mapa do disco. Rodar: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pruneTree } from './disk-prune.ts'

test('pruneTree: ordena, junta os pequenos num bloco e desce nas pastas que ficam', () => {
  const tree = pruneTree({
    name: 'C:\\', size: 1000, children: [
      { name: 'a.txt', size: 5 },
      { name: 'Jogos', size: 900, children: [{ name: 'x.pak', size: 6 }, { name: 'bf6.exe', size: 890 }, { name: 'y.ini', size: 4 }] },
      { name: 'b.txt', size: 95 },
    ],
  }, 100) // mínimo = 10
  assert.deepEqual(tree.children!.map((c) => [c.name, c.size]), [['Jogos', 900], ['b.txt', 95], ['1 itens menores', 5]])
  assert.deepEqual(tree.children![0].children!.map((c) => [c.name, c.size, c.more]), [['bf6.exe', 890, undefined], ['2 itens menores', 10, 2]])
  // O total não muda: o bloco soma exatamente o que juntou.
  assert.equal(tree.children!.reduce((s, c) => s + c.size, 0), 1000)
})
