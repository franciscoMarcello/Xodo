// Partes puras da verificação de drivers (com testes): página de drivers da AMD, endereço por placa e versões.

/** "26.10.1" > "26.9.2"? Compara número a número. */
export function compareVersions(a: string, b: string): number {
  const x = a.split('.').map(Number), y = b.split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return Math.sign(d) }
  return 0
}

/**
 * Página oficial de drivers da placa Radeon. Ex.: "AMD Radeon RX 6700 XT" ->
 * .../graphics/radeon-rx/radeon-rx-6000-series/amd-radeon-rx-6700-xt.html. null = modelo que não sigo o padrão.
 */
export function amdDriverUrl(gpuName: string): string | null {
  const m = /\bRX\s*(\d)(\d{3})\s*(XTX|XT|GRE)?\b/i.exec(gpuName); if (!m) return null
  const model = `${m[1]}${m[2]}${m[3] ? `-${m[3].toLowerCase()}` : ''}`
  return `https://www.amd.com/en/support/downloads/drivers.html/graphics/radeon-rx/radeon-rx-${m[1]}000-series/amd-radeon-rx-${model}.html`
}

export interface AmdRelease { version: string; date: string | null; size: string | null; recommended: boolean }

/** Lê as versões do "AMD Software: Adrenalin Edition" na página (texto: "Adrenalin 26.10.1 WHQL (Recommended) File Size 941 MB Release Date 2026-10-20"). */
export function parseAmdPage(html: string): AmdRelease[] {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
  const out: AmdRelease[] = []
  for (const m of text.matchAll(/Adrenalin (\d{2}\.\d{1,2}\.\d{1,2})([^0-9]{0,40}?)File Size ([\d.,]+ ?[KMG]B)[^0-9]{0,20}?Release Date (\d{4}-\d{2}-\d{2})/g)) {
    if (!out.some((r) => r.version === m[1])) out.push({ version: m[1], recommended: /recommended|whql/i.test(m[2]), size: m[3], date: m[4] })
  }
  return out.sort((a, b) => compareVersions(b.version, a.version))
}

/** A versão a recomendar: a mais nova "Recommended (WHQL)"; se não houver, a mais nova de todas. */
export const latestAmd = (list: AmdRelease[]) => list.find((r) => r.recommended) ?? list[0] ?? null

/** Data ISO (só o dia) para comparar "o oferecido é mais novo que o instalado". */
export const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null)
