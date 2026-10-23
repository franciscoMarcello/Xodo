import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import type { BigFile, Disk, FolderSize, Program, TempInfo } from '../shared/types'

export async function disks(): Promise<Disk[]> {
  const out: Disk[] = []
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const mount = `${letter}:\\`
    try { const s = await fs.promises.statfs(mount); if (s.blocks > 0) out.push({ mount, total: s.blocks * s.bsize, free: s.bavail * s.bsize }) } catch { /* letra sem disco */ }
  }
  return out
}

interface Walk { size: number; files: number; done: boolean; top: BigFile[] }

/**
 * Soma o tamanho de uma pasta (sem seguir atalhos/junções) e guarda os `keep` maiores arquivos.
 * Para em `limitMs` para não travar o app em pastas gigantes (`done` = false nesse caso).
 */
async function walk(root: string, keep = 0, limitMs = 20_000): Promise<Walk> {
  const r: Walk = { size: 0, files: 0, done: true, top: [] }
  const until = Date.now() + limitMs; const stack = [root]
  while (stack.length) {
    if (Date.now() > until) { r.done = false; break }
    const dir = stack.pop()!
    let entries: fs.Dirent[]
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) { stack.push(p); continue }
      if (!e.isFile()) continue
      try {
        const st = await fs.promises.stat(p); r.size += st.size; r.files++
        if (keep && (r.top.length < keep || st.size > r.top[r.top.length - 1].size)) {
          r.top.push({ path: p, size: st.size, modified: st.mtimeMs }); r.top.sort((a, b) => b.size - a.size); if (r.top.length > keep) r.top.pop()
        }
      } catch { /* arquivo em uso ou sem permissão */ }
    }
  }
  return r
}

export async function folderSizes(): Promise<FolderSize[]> {
  const names: [string, string][] = [
    ['Downloads', app.getPath('downloads')], ['Área de trabalho', app.getPath('desktop')], ['Documentos', app.getPath('documents')],
    ['Imagens', app.getPath('pictures')], ['Vídeos', app.getPath('videos')], ['Músicas', app.getPath('music')], ['Temporários', os.tmpdir()],
  ]
  const list = await Promise.all(names.map(async ([name, p]) => { const w = await walk(p); return { name, path: p, size: w.size, files: w.files, done: w.done } }))
  return list.sort((a, b) => b.size - a.size)
}

export async function bigFiles(folder: string): Promise<BigFile[]> {
  return (await walk(folder, 30, 30_000)).top
}

function powershell(script: string, timeout = 30_000): Promise<string> {
  return new Promise((resolve, reject) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, timeout, maxBuffer: 32 * 1024 * 1024 }, (err, out) => (err ? reject(err) : resolve(out))))
}
export { powershell }

/** Programas instalados (as mesmas chaves do "Adicionar ou remover programas"), do maior para o menor. */
export async function programs(): Promise<Program[]> {
  const script = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; $k='HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
Get-ItemProperty $k -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and -not $_.SystemComponent -and -not $_.ParentKeyName } | Select-Object DisplayName,Publisher,EstimatedSize,InstallDate | ConvertTo-Json -Compress`
  const raw = JSON.parse((await powershell(script)) || '[]')
  const rows = (Array.isArray(raw) ? raw : [raw]) as { DisplayName: string; Publisher?: string; EstimatedSize?: number; InstallDate?: string }[]
  const seen = new Set<string>()
  return rows.map((r) => ({
    name: r.DisplayName.trim(), publisher: (r.Publisher ?? '').trim(), size: (r.EstimatedSize ?? 0) * 1024,
    installed: /^\d{8}$/.test(r.InstallDate ?? '') ? `${r.InstallDate!.slice(6, 8)}/${r.InstallDate!.slice(4, 6)}/${r.InstallDate!.slice(0, 4)}` : '',
  })).filter((p) => !seen.has(p.name) && seen.add(p.name)).sort((a, b) => b.size - a.size)
}

const DAY = 24 * 60 * 60 * 1000
/** Só arquivos com mais de 1 dia: os recentes podem estar em uso por algum programa aberto. */
async function oldTempFiles(): Promise<{ files: string[]; size: number }> {
  const files: string[] = []; let size = 0; const stack = [os.tmpdir()]; const cutoff = Date.now() - DAY
  while (stack.length) {
    const dir = stack.pop()!
    let entries: fs.Dirent[]
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) { stack.push(p); continue }
      try { const st = await fs.promises.stat(p); if (st.mtimeMs < cutoff) { files.push(p); size += st.size } } catch { /* ignora */ }
    }
  }
  return { files, size }
}

export async function tempInfo(): Promise<TempInfo> {
  const t = await oldTempFiles(); return { path: os.tmpdir(), size: t.size, files: t.files.length }
}

/** Apaga de vez os arquivos temporários antigos (arquivos em uso são pulados) e as pastas que ficarem vazias. */
export async function cleanTemp(): Promise<{ freed: number; skipped: number }> {
  const t = await oldTempFiles(); let freed = 0, skipped = 0
  for (const f of t.files) {
    try { const { size } = await fs.promises.stat(f); await fs.promises.unlink(f); freed += size } catch { skipped++ }
  }
  const root = os.tmpdir()
  const prune = async (dir: string): Promise<void> => {
    let entries: fs.Dirent[]
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) if (e.isDirectory() && !e.isSymbolicLink()) await prune(path.join(dir, e.name))
    // Pasta vazia recente pode ser de um programa aberto: só remove as antigas.
    if (dir !== root) try { if ((await fs.promises.stat(dir)).mtimeMs < Date.now() - DAY) await fs.promises.rmdir(dir) } catch { /* não está vazia */ }
  }
  await prune(root)
  return { freed, skipped }
}
