// Testes de qual jogo é cada executável. Rodar: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { exeIndex, gameName } from './games-exes.ts'

test('gameName: pasta da loja, launcher fora, pasta extra e ignorados', () => {
  assert.equal(gameName('D:\\SteamLibrary\\steamapps\\common\\Battlefield 6\\bf6.exe', []), 'Battlefield 6')
  assert.equal(gameName('D:\\SteamLibrary\\steamapps\\common\\Battlefield 6\\EAAntiCheat.GameServiceLauncher.exe', []), null)
  assert.equal(gameName('E:\\Jogos\\Celeste\\Celeste.exe', ['E:\\Jogos\\']), 'Celeste')
  assert.equal(gameName('D:\\SteamLibrary\\steamapps\\common\\Battlefield 6\\bf6.exe', [], ['Battlefield 6']), null)
})

test('exeIndex: .exe na pasta do jogo e uma abaixo, sem anticheat nem pastas que não são jogo', async () => {
  const lib = fs.mkdtempSync(path.join(os.tmpdir(), 'xodo-lib-'))
  const put = (f: string) => { const p = path.join(lib, 'steamapps', 'common', f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, '') }
  try {
    put('Battlefield 6\\bf6.exe'); put('Battlefield 6\\SP\\bf6sp.exe'); put('Battlefield 6\\EAAntiCheat\\EAAntiCheat.Installer.exe')
    put('Battlefield 6\\a\\b\\fundo.exe'); put('Steamworks Shared\\x.exe')
    const idx = await exeIndex([lib, path.join(lib, 'nao-existe')])
    assert.deepEqual([...idx].sort(), [['bf6', 'Battlefield 6'], ['bf6sp', 'Battlefield 6']])
  } finally { fs.rmSync(lib, { recursive: true, force: true }) }
})
