/**
 * Separa a linha de comando do Windows em executável e argumentos ('"C:\a b\x.exe" -silent' -> ['C:\a b\x.exe', '-silent']).
 * Os argumentos voltam como texto cru, para reabrir sem passar pelo cmd (que entenderia >, & e | como comandos).
 */
export function splitCommand(cmd: string): [string, string] {
  const s = cmd.trim()
  if (s.startsWith('"')) { const end = s.indexOf('"', 1); return [s.slice(1, end), s.slice(end + 1).trim()] }
  const m = /^(.+?\.exe)(\s+.*)?$/i.exec(s); if (m) return [m[1], (m[2] ?? '').trim()]
  const sp = s.indexOf(' '); return sp < 0 ? [s, ''] : [s.slice(0, sp), s.slice(sp + 1).trim()]
}
