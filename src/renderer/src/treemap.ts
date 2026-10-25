// Layout do mapa do disco, sem React (para dar para testar no node).

export type Rect = { x: number; y: number; w: number; h: number }

/** Treemap "squarified" (Bruls et al.): enche o retângulo em faixas, mantendo os blocos o mais quadrados possível. */
export function squarify<T extends { size: number }>(items: T[], r: Rect): (Rect & { item: T })[] {
  const out: (Rect & { item: T })[] = []
  const rest = items.filter((i) => i.size > 0).sort((a, b) => b.size - a.size)
  const scale = (r.w * r.h) / rest.reduce((s, i) => s + i.size, 0)
  let { x, y, w, h } = r
  while (rest.length && w > 0 && h > 0) {
    const short = Math.min(w, h); let n = 0, area = 0, best = Infinity
    while (n < rest.length) {
      const a = area + rest[n].size * scale
      const worst = Math.max((short * short * rest[0].size * scale) / (a * a), (a * a) / (short * short * rest[n].size * scale))
      if (worst > best) break
      best = worst; area = a; n++
    }
    const thick = area / short; let off = 0
    for (const item of rest.splice(0, n)) {
      const len = (item.size * scale) / thick
      out.push(w >= h ? { x, y: y + off, w: thick, h: len, item } : { x: x + off, y, w: len, h: thick, item }); off += len
    }
    if (w >= h) { x += thick; w -= thick } else { y += thick; h -= thick }
  }
  return out
}
