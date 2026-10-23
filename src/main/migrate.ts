import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

// O app se chamava "Painel do PC" e guardava os dados em %APPDATA%\Painel do PC. Na primeira vez que o Xodó abre,
// copia os dados de lá (ajustes, histórico, sessões, alertas...). A pasta antiga fica intacta, como backup.
// Roda ao ser importado: tem que ser o primeiro import do index.ts, antes de qualquer módulo ler os arquivos.

const OURS = /^(settings|energy|alerts|drivers|games-req|gamemode-log)\.json$|\.jsonl$/
const MARK = '.migrado-do-painel-do-pc'

function migrate() {
  const now = app.getPath('userData'), old = path.join(app.getPath('appData'), 'Painel do PC')
  if (path.resolve(now).toLowerCase() === path.resolve(old).toLowerCase() || !fs.existsSync(old)) return
  if (fs.existsSync(path.join(now, MARK)) || fs.existsSync(path.join(now, 'settings.json'))) return // já migrou ou já tem dados próprios
  fs.mkdirSync(now, { recursive: true })
  for (const f of fs.readdirSync(old)) if (OURS.test(f)) fs.copyFileSync(path.join(old, f), path.join(now, f))
  if (fs.existsSync(path.join(old, 'history'))) fs.cpSync(path.join(old, 'history'), path.join(now, 'history'), { recursive: true })
  fs.writeFileSync(path.join(now, MARK), `Dados copiados de ${old} em ${new Date().toISOString()}\n`)
}

try { migrate() } catch { /* sem permissão ou disco cheio: o app abre do zero, sem perder a pasta antiga */ }
