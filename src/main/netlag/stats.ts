import type { BottleneckKind, LagView, PingStats } from '../../shared/types'

// "Lag: internet ou PC?". Puro (só tipos), com testes.

/** Uma resposta do ping.exe (português ou inglês) -> ms, ou null se perdeu ("Esgotado o tempo", "inacessível"). */
export function parsePing(out: string): number | null {
  const m = /(?:tempo|time)\s*([=<])\s*(\d+)\s*ms/i.exec(out)
  return m ? (m[1] === '<' ? 0.5 : Number(m[2])) : null
}

/** Rota padrão do `route print -4 0.0.0.0` -> IP do roteador. */
export function parseGateway(out: string): string | null {
  return /^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)/m.exec(out)?.[1] ?? null
}

export function stats(target: string, samples: (number | null)[]): PingStats {
  const ok = samples.filter((x): x is number => x != null)
  let jitter: number | null = null
  if (ok.length >= 2) { let s = 0; for (let i = 1; i < ok.length; i++) s += Math.abs(ok[i] - ok[i - 1]); jitter = Math.round((s / (ok.length - 1)) * 10) / 10 }
  return { target, samples: samples.length, avg: ok.length ? Math.round((ok.reduce((a, b) => a + b, 0) / ok.length) * 10) / 10 : null, jitter, loss: samples.length ? Math.round((100 * (samples.length - ok.length)) / samples.length) : 0 }
}

const PC: Partial<Record<BottleneckKind, string>> = { cpu: 'o processador está no limite', vram: 'a memória de vídeo está cheia', ram: 'a RAM está cheia', heat: 'o PC está quente demais' }

/**
 * Quem causa o lag: primeiro a rede de casa (roteador), depois a internet, depois o PC (gargalo que trava o jogo).
 * Precisa de pelo menos 8 leituras (~16 s) para opinar.
 */
export function verdict(home: PingStats | null, internet: PingStats | null, bottleneck: BottleneckKind | null): Omit<LagView, 'until'> {
  if (!internet || internet.samples < 8) return { who: 'measuring', title: 'Medindo…', detail: 'Juntando uns 15 segundos de ping.', tip: '', home, internet }
  const ms = (n: number | null) => (n == null ? '–' : `${Math.round(n)} ms`)
  if (home && (home.loss > 2 || (home.avg ?? 0) > 10 || (home.jitter ?? 0) > 5)) return {
    who: 'wifi', title: 'Problema na rede de casa', home, internet,
    detail: `Até o roteador: ${ms(home.avg)}, variação ${ms(home.jitter)}, ${home.loss}% de perda. Num cabo isso fica perto de 1 ms e 0%.`,
    tip: 'Use cabo de rede em vez de Wi-Fi, ou a rede de 5 GHz perto do roteador. Reiniciar o roteador e tirar downloads de outros aparelhos também ajuda.',
  }
  if (internet.loss > 2 || (internet.jitter ?? 0) > 20 || (internet.avg ?? 0) > 80) return {
    who: 'internet', title: 'Problema na internet (operadora)', home, internet,
    detail: `Até a internet: ${ms(internet.avg)}, variação ${ms(internet.jitter)}, ${internet.loss}% de perda — e a rede de casa está ok.`,
    tip: 'Veja se alguém está baixando ou assistindo em alta qualidade. Se repetir em vários dias e horários, guarde estes números e reclame com a operadora.',
  }
  if (bottleneck && PC[bottleneck]) return {
    who: 'pc', title: 'A rede está ok: o travamento é do PC', home, internet,
    detail: `Ping de ${ms(internet.avg)} sem perda, mas ${PC[bottleneck]}.`, tip: 'Veja o gargalo acima e o que fazer.',
  }
  return {
    who: 'ok', title: 'Rede e PC ok', home, internet,
    detail: `Ping de ${ms(internet.avg)}, variação de ${ms(internet.jitter)} e ${internet.loss}% de perda: tudo normal.`,
    tip: 'Se der lag agora, o mais provável é o servidor do jogo (ou a distância até ele).',
  }
}
