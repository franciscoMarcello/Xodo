import type { Bottleneck } from '../shared/types'

// Onde está o gargalo num jogo rodando, pelos últimos 20 s de leituras. Puro (só tipos), com testes.
// Ideia central: num PC equilibrado a placa de vídeo trabalha perto de 100%. Se ela está sobrando, alguém está
// segurando: o processador (um núcleo no limite), a memória, a temperatura ou um limite de FPS.

export interface BPoint { t: number; gpu: number | null; cpu: number | null; coreMax: number | null; vramPct: number | null; ramPct: number; cpuTemp: number | null; gpuTemp: number | null; fps?: number | null }

/** Travas de FPS comuns (V-Sync na taxa do monitor ou limitador do jogo/driver). */
const CAPS = [30, 60, 75, 90, 100, 120, 144, 165, 180, 200, 240, 360]

const WINDOW = 20_000
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
const mean = (a: number[]) => (a.length ? avg(a) : 0)
const nums = (a: (number | null)[]) => a.filter((x): x is number => x != null)
const pct = (n: number) => `${Math.round(n)}%`

/** null = sem dados suficientes (menos de 12 s) ou sem leitura de uso da GPU (precisa dos sensores). */
export function classify(points: BPoint[], now: number): Bottleneck | null {
  const w = points.filter((p) => p.t >= now - WINDOW)
  if (w.length < 6 || w[w.length - 1].t - w[0].t < 10_000) return null
  const gpuL = nums(w.map((p) => p.gpu)); if (gpuL.length < w.length / 2) return null
  const gpu = avg(gpuL)
  const core = mean(nums(w.map((p) => p.coreMax))), cpu = mean(nums(w.map((p) => p.cpu)))
  const cpuT = Math.max(0, ...nums(w.map((p) => p.cpuTemp))), gpuT = Math.max(0, ...nums(w.map((p) => p.gpuTemp)))
  const vram = nums(w.map((p) => p.vramPct)), ram = avg(w.map((p) => p.ramPct))

  if (cpuT >= 90 || gpuT >= 90) return {
    kind: 'heat', title: 'Temperatura alta', detail: `${cpuT >= 90 ? `CPU em ${Math.round(cpuT)} °C` : ''}${cpuT >= 90 && gpuT >= 90 ? ' e ' : ''}${gpuT >= 90 ? `GPU em ${Math.round(gpuT)} °C` : ''}: perto do limite, o hardware reduz o clock para se proteger e o FPS cai.`,
    tip: 'Melhore a ventilação do gabinete e limpe a poeira. Limitar o FPS (por exemplo, à taxa do monitor) também baixa a temperatura.',
  }
  if (vram.length && avg(vram) >= 95) return {
    kind: 'vram', title: 'Memória de vídeo cheia', detail: `${pct(avg(vram))} da VRAM em uso: o jogo passa a usar a RAM do PC no lugar e aparecem travadinhas.`,
    tip: 'Baixe a qualidade das texturas (é a opção que mais usa VRAM). Ray tracing e resolução alta também pesam.',
  }
  if (ram >= 92) return {
    kind: 'ram', title: 'RAM quase cheia', detail: `${pct(ram)} da memória do PC em uso: o Windows começa a usar o disco e o jogo engasga.`,
    tip: 'Feche o navegador e outros programas pesados antes de jogar.',
  }
  if (gpu >= 90) return {
    kind: 'gpu', title: 'Placa de vídeo no limite (o normal)', detail: `GPU em ${pct(gpu)}: é ela quem define o FPS, e isso é o ideal. O processador está dando conta.`,
    tip: 'Para ganhar FPS: baixe sombras e reflexos, ative o FSR no modo Qualidade ou reduza a resolução de renderização.',
  }
  // GPU sobrando: primeiro vê se o FPS está travado num valor fixo (aí é limite, não gargalo).
  const fpsL = nums(w.map((p) => p.fps ?? null))
  const fps = fpsL.length >= w.length / 2 ? mean(fpsL) : null
  const cap = fps != null ? CAPS.find((c) => Math.abs(fps - c) <= c * 0.03) : undefined
  if (gpu < 80 && cap && Math.max(...fpsL) - Math.min(...fpsL) <= fps! * 0.08) return {
    kind: 'capped', title: `FPS travado em ${cap}`, detail: `O FPS está parado em ~${cap} com a GPU em ${pct(gpu)}: é um limite (V-Sync, limitador do jogo ou do driver), não falta de hardware.`,
    tip: cap >= 120 ? 'Está ótimo. Se o monitor é de 144 Hz ou mais e você quer mais FPS, aumente ou tire o limite.' : 'Se o seu monitor tem mais Hz que isso, procure o limite de FPS ou o V-Sync nas opções do jogo.',
  }
  // 70% e não 100%: o Windows troca a thread principal de núcleo, então a média do "núcleo mais carregado" fica bem
  // abaixo de 100% mesmo com a thread travada (medido: 88% no instante, 75–80% na média de 20 s, em 16 threads).
  if (gpu < 80 && (core >= 70 || cpu >= 85)) return {
    kind: 'cpu', title: 'Gargalo no processador', detail: `GPU só em ${pct(gpu)} enquanto ${cpu >= 85 ? `a CPU está em ${pct(cpu)}` : `um núcleo da CPU está em ${pct(core)}`}: a placa de vídeo fica esperando o processador.`,
    tip: 'Dá para subir gráficos e resolução sem perder FPS. Para mais FPS: baixe opções que pesam na CPU (distância de visão, multidão, física) e feche programas em segundo plano.',
  }
  if (gpu < 80) return {
    kind: 'capped', title: 'FPS limitado', detail: `GPU em ${pct(gpu)} e CPU folgada (núcleo mais carregado em ${pct(core)}): algo está segurando o FPS antes do hardware.`,
    tip: 'Se o FPS está no limite que você escolheu (V-Sync, limitador do jogo ou do driver, ex.: 144), está tudo certo. Se não, confira essas opções. Menus e telas de carregamento também aparecem assim.',
  }
  return {
    kind: 'gpu', title: 'Equilibrado', detail: `GPU em ${pct(gpu)} e CPU com folga: o PC está bem aproveitado.`,
    tip: 'Nada a fazer. Se quiser mais FPS, baixe um pouco os gráficos.',
  }
}
