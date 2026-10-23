// Testes do Modo Jogo (partes puras). Rodar: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitCommand } from './gamemode-split.ts'

test('separa executável e argumentos sem perder símbolos', () => {
  assert.deepEqual(splitCommand('"C:\\Program Files (x86)\\Exemplo\\Papel de Parede\\fundo64.exe" -silent'), ['C:\\Program Files (x86)\\Exemplo\\Papel de Parede\\fundo64.exe', '-silent'])
  assert.deepEqual(splitCommand('C:\\Users\\x\\app\\dummyapp.exe -e setInterval(()=>{},1000)'), ['C:\\Users\\x\\app\\dummyapp.exe', '-e setInterval(()=>{},1000)'])
  assert.deepEqual(splitCommand('"C:\\Users\\x\\AppData\\Local\\Programs\\Exemplo\\exemplo app.exe"'), ['C:\\Users\\x\\AppData\\Local\\Programs\\Exemplo\\exemplo app.exe', ''])
  assert.deepEqual(splitCommand('C:\\Jogos Exemplo\\Launcher\\ServicoLauncher.exe --background'), ['C:\\Jogos Exemplo\\Launcher\\ServicoLauncher.exe', '--background'])
})
