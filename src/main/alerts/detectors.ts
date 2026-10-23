import type { AlertAction, AlertLevel } from '../../shared/types'

// Regras de "coisa fora do normal". Funções puras: recebem dados que o painel já coleta e devolvem o que achar.
// Sem imports de código (só tipos), para os testes rodarem direto no Node.

export interface Found { id: string; rule: string; level: AlertLevel; title: string; detail: string; tip: string; action?: AlertAction }

/** Leitura de status (a cada 2 s). */
export interface Point { t: number; cpuLoad: number | null; cpuTemp: number | null; gpuTemp: number | null; ramPct: number; gaming: boolean }
/** Processos com o mesmo nome somados. cpu em % do processador inteiro. */
export interface Group { name: string; ram: number; cpu: number | null; path: string | null; count: number }
export interface Sample { t: number; groups: Group[] }
export interface Series { t: number; v: number }

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR, GB = 1024 ** 3

const nf = (n: number, d = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
export const gb = (b: number) => `${nf(b / GB, b < 10 * GB ? 1 : 0)} GB`

/** Pontos dos últimos `ms`, só se eles cobrem quase toda a janela (senão ainda não dá para afirmar "há X minutos"). */
export function lastSpan<T extends { t: number }>(list: T[], now: number, ms: number): T[] | null {
  const w = list.filter((p) => p.t >= now - ms)
  return w.length >= 2 && w[0].t <= now - ms * 0.9 ? w : null
}
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length

export const RULES: { name: string; check: string }[] = [
  { name: 'RAM quase cheia', check: 'Uso da memória acima de 85% por 10 minutos seguidos (90% = sério).' },
  { name: 'Programa pesado', check: 'Um programa (somando seus processos) usando mais de 20% da RAM e mais de 4 GB (35% e 8 GB = sério).' },
  { name: 'Memória só aumenta', check: 'Programa que ganhou mais de 1 GB e dobrou de tamanho nas últimas 2 horas, quase sem baixar (sinal de vazamento).' },
  { name: 'CPU em segundo plano', check: 'Programa usando mais de 6% do processador (um núcleo inteiro) por 5 minutos seguidos, fora de jogos.' },
  { name: 'CPU quente parada', check: 'CPU acima de 65 °C com menos de 15% de uso por 5 minutos (75 °C = sério).' },
  { name: 'Superaquecimento', check: 'CPU ou GPU acima de 85 °C por 1 minuto (CPU 90 °C / GPU 92 °C = crítico).' },
  { name: 'Disco quase cheio', check: 'Menos de 15 GB livres, ou menos de 10% livre e menos de 50 GB (5 GB ou 3% = sério).' },
  { name: 'Disco enchendo rápido', check: 'Disco que perdeu mais de 10 GB de espaço livre nas últimas 24 horas.' },
  { name: 'Internet lenta', check: 'Média dos 3 últimos testes abaixo de 50% do plano contratado, ou 3 testes seguidos falhando.' },
  { name: 'Sem reiniciar', check: 'PC ligado há mais de 7 dias sem reiniciar.' },
  { name: 'Pasta incomum', check: 'Programa rodando de dentro de Temp ou Downloads (instaladores não contam).' },
  { name: 'Novo na inicialização', check: 'Programa novo configurado para abrir com o Windows (avisa por 3 dias).' },
  { name: 'Saúde do disco', check: 'SSD com menos de 20% de vida (10% = crítico), reserva de células esgotada, disco quente ou com "saúde" ruim no Windows.' },
  { name: 'Driver novo', check: 'Driver mais novo que o instalado: placa de vídeo AMD (site oficial) e Windows Update. Verificado 1 vez por dia.' },
]

/** Discos com problema pelo S.M.A.R.T. (a avaliação já vem pronta de diskhealth.ts). Só "warning" ou pior. */
export function diskHealthAlerts(disks: { name: string; status: string; notes: string[] }[]): Found[] {
  return disks.filter((d) => d.status !== 'ok').map((d) => ({
    id: `disk-health:${d.name.toLowerCase()}`, rule: 'Saúde do disco', level: d.status as AlertLevel, title: `Disco ${d.name}: atenção à saúde`,
    detail: d.notes.join(' '), tip: d.status === 'critical' ? 'Copie o que é importante para outro disco agora.' : 'Mantenha backup do que é importante e acompanhe em Disco e limpeza.',
    action: { page: 'disk' as const },
  }))
}

/** Drivers mais novos que os instalados (a verificação diária já comparou as versões). */
export function driverUpdates(updates: { device: string; title: string; available: string; current: string | null; newer: boolean; source: string }[]): Found[] {
  return updates.filter((u) => u.newer).map((u) => ({
    id: `driver:${u.device.toLowerCase()}:${u.available}`, rule: 'Driver novo', level: 'warning' as const,
    title: `Driver novo: ${u.source === 'amd' ? u.title.replace(' (recomendado)', '') : u.device}`,
    detail: `${u.current ? `Você tem ${u.current}; ` : ''}disponível: ${u.available}.`,
    tip: u.source === 'amd' ? 'Baixe pelo AMD Software (Adrenalin) ou pelo site da AMD. Reinicie o PC depois de instalar.' : 'Instale pelo Windows Update, em Atualizações opcionais. Reinicie o PC depois.',
    action: { page: 'drivers' as const },
  }))
}

export function ramTotal(points: Point[], now: number): Found[] {
  const w = lastSpan(points, now, 10 * MIN); if (!w) return []
  const min = Math.min(...w.map((p) => p.ramPct)); if (min < 85) return []
  return [{
    id: 'ram-total', rule: 'RAM quase cheia', level: min >= 90 ? 'serious' : 'warning',
    title: 'Memória RAM quase cheia', detail: `Acima de ${min >= 90 ? 90 : 85}% há 10 minutos (agora ${nf(w[w.length - 1].ramPct)}%). O Windows começa a usar o disco no lugar da RAM e tudo fica lento.`,
    tip: 'Feche programas que não está usando. Os mais pesados aparecem primeiro em Processos.', action: { page: 'processes', query: '' },
  }]
}

/** Contagem de memória do próprio Windows: não é um programa que dá para fechar. */
const NOT_PROGRAM = new Set(['memory compression', 'system', 'registry', 'idle', 'secure system'])

export function procRam(s: Sample, ramTotalBytes: number): Found[] {
  return s.groups.flatMap((g) => {
    if (NOT_PROGRAM.has(g.name.toLowerCase())) return []
    const pct = (100 * g.ram) / ramTotalBytes
    const level: AlertLevel | null = g.ram >= 8 * GB && pct >= 35 ? 'serious' : g.ram >= 4 * GB && pct >= 20 ? 'warning' : null
    if (!level) return []
    return [{
      id: `proc-ram:${g.name.toLowerCase()}`, rule: 'Programa pesado', level, title: `${g.name} usando ${gb(g.ram)} de RAM`,
      detail: `${g.count > 1 ? `${g.count} processos somam` : 'Sozinho ocupa'} ${nf(pct)}% da memória do PC.`,
      tip: 'Se não estiver usando, feche. Em navegadores, abas e extensões abertas são o que mais pesa.', action: { page: 'processes', query: g.name },
    }]
  })
}

/** `history`: RAM de cada programa ao longo do tempo (1 ponto por leitura). */
export function memLeak(history: Map<string, Series[]>, now: number): Found[] {
  const out: Found[] = []
  for (const [name, list] of history) {
    const w = lastSpan(list, now, 2 * HOUR); if (!w || w.length < 10) continue
    const first = w[0].v, last = w[w.length - 1].v
    if (last - first < GB || last < 2 * first) continue
    // "quase sem baixar": pelo menos 75% dos passos não caem mais que 2%
    let steady = 0
    for (let i = 1; i < w.length; i++) if (w[i].v >= w[i - 1].v * 0.98) steady++
    if (steady / (w.length - 1) < 0.75) continue
    out.push({
      id: `leak:${name.toLowerCase()}`, rule: 'Memória só aumenta', level: 'warning', title: `${name}: a memória só aumenta`,
      detail: `Subiu de ${gb(first)} para ${gb(last)} nas últimas 2 horas, quase sem baixar.`,
      tip: 'Pode ser vazamento de memória (defeito do programa). Fechar e abrir de novo costuma resolver.', action: { page: 'processes', query: name },
    })
  }
  return out
}

export function bgCpu(samples: Sample[], now: number, ignore: Set<string>): Found[] {
  const w = lastSpan(samples, now, 5 * MIN); if (!w || w.length < 4) return []
  const names = new Set(w[w.length - 1].groups.map((g) => g.name))
  const out: Found[] = []
  for (const name of names) {
    if (ignore.has(name.toLowerCase())) continue
    const cpus = w.map((s) => s.groups.find((g) => g.name === name)?.cpu ?? null)
    if (cpus.some((c) => c == null || c < 6)) continue
    const mean = avg(cpus as number[])
    out.push({
      id: `bg-cpu:${name.toLowerCase()}`, rule: 'CPU em segundo plano', level: mean >= 25 ? 'serious' : 'warning',
      title: `${name} gastando CPU sem parar`, detail: `Média de ${nf(mean)}% do processador nos últimos 5 minutos.`,
      tip: 'Se você não está usando esse programa agora, ele pode estar travado ou fazendo algo em segundo plano. Dá para finalizar em Processos.',
      action: { page: 'processes', query: name },
    })
  }
  return out
}

export function hotIdleCpu(points: Point[], now: number): Found[] {
  const w = lastSpan(points, now, 5 * MIN); if (!w) return []
  if (w.some((p) => p.gaming || p.cpuTemp == null || p.cpuLoad == null || p.cpuLoad >= 15)) return []
  const t = avg(w.map((p) => p.cpuTemp!)); if (t <= 65) return []
  return [{
    id: 'cpu-hot-idle', rule: 'CPU quente parada', level: t > 75 ? 'serious' : 'warning', title: 'CPU quente mesmo parada',
    detail: `${nf(t)} °C em média com ${nf(avg(w.map((p) => p.cpuLoad!)))}% de uso nos últimos 5 minutos. Parada, o normal é 35–50 °C.`,
    tip: 'Confira se o cooler está limpo e girando e se a pasta térmica não está velha. No Windows, o plano "Alto desempenho" também segura a CPU quente.',
  }]
}

export function overheat(points: Point[], now: number): Found[] {
  const w = lastSpan(points, now, MIN); if (!w) return []
  const out: Found[] = []
  const check = (key: 'cpuTemp' | 'gpuTemp', label: string, critical: number) => {
    const temps = w.map((p) => p[key]); if (temps.some((t) => t == null || t < 85)) return
    const min = Math.min(...(temps as number[]))
    out.push({
      id: `overheat:${key}`, rule: 'Superaquecimento', level: min >= critical ? 'critical' : 'serious', title: `${label} muito quente`,
      detail: `Acima de ${nf(min)} °C há 1 minuto. Perto do limite, o ${label === 'CPU' ? 'processador' : 'chip'} reduz o desempenho para se proteger.`,
      tip: 'Feche o que estiver pesado. Se acontecer sempre, revise a refrigeração (poeira, ventoinhas, fluxo de ar do gabinete).',
    })
  }
  check('cpuTemp', 'CPU', 90); check('gpuTemp', 'GPU', 92)
  return out
}

export function diskLow(disks: { mount: string; total: number; free: number }[]): Found[] {
  return disks.flatMap((d) => {
    const pct = (100 * d.free) / d.total
    const level: AlertLevel | null = d.free < 5 * GB || pct < 3 ? 'serious' : d.free < 15 * GB || (pct < 10 && d.free < 50 * GB) ? 'warning' : null
    if (!level) return []
    const letter = d.mount.slice(0, 2)
    return [{
      id: `disk-low:${letter}`, rule: 'Disco quase cheio', level, title: `Disco ${letter} quase cheio`,
      detail: `Só ${gb(d.free)} livres (${nf(pct, 1)}%).${letter === 'C:' ? ' Com o C: cheio, o Windows não consegue atualizar e fica lento.' : ''}`,
      tip: 'Veja os maiores arquivos e limpe os temporários em Disco e limpeza.', action: { page: 'disk' },
    }]
  })
}

/** `history`: espaço livre de cada disco, 1 ponto por hora. */
export function diskDrop(history: Map<string, Series[]>, now: number): Found[] {
  const out: Found[] = []
  for (const [mount, list] of history) {
    const w = list.filter((p) => p.t >= now - DAY - HOUR)
    if (w.length < 2 || w[0].t > now - 20 * HOUR) continue
    const lost = Math.max(...w.map((p) => p.v)) - w[w.length - 1].v
    if (lost < 10 * GB) continue
    out.push({
      id: `disk-drop:${mount.slice(0, 2)}`, rule: 'Disco enchendo rápido', level: 'warning', title: `Disco ${mount.slice(0, 2)} perdeu ${gb(lost)} em 24 h`,
      detail: `Agora restam ${gb(w[w.length - 1].v)} livres.`,
      tip: 'Downloads grandes, jogos atualizando, gravações de vídeo e pontos de restauração costumam ser a causa. Veja os maiores arquivos em Disco e limpeza.',
      action: { page: 'disk' },
    })
  }
  return out
}

export function internet(tests: { time: number; down: number; error?: string }[], contracted: number, now: number): Found[] {
  const recent = tests.filter((t) => t.time >= now - 3 * DAY)
  const last3 = recent.slice(-3)
  if (last3.length === 3 && last3.every((t) => t.error)) return [{
    id: 'net-fail', rule: 'Internet lenta', level: 'warning', title: 'Testes de internet falhando',
    detail: 'Os 3 últimos testes automáticos não conseguiram medir a velocidade.', tip: 'Confira o roteador e o cabo/Wi-Fi. Se a internet funciona, pode ser bloqueio do servidor de teste.', action: { page: 'internet' },
  }]
  const ok = recent.filter((t) => !t.error).slice(-3)
  if (!contracted || ok.length < 3) return []
  const mean = avg(ok.map((t) => t.down)); if (mean >= contracted * 0.5) return []
  return [{
    id: 'net-slow', rule: 'Internet lenta', level: 'warning', title: 'Internet abaixo do contratado',
    detail: `Média de ${nf(mean)} Mb/s nos 3 últimos testes, ${nf((100 * mean) / contracted)}% dos ${nf(contracted)} Mb/s do plano.`,
    tip: 'Teste com cabo para descartar o Wi-Fi. Se continuar, o histórico da tela Internet serve de prova para reclamar com a operadora.', action: { page: 'internet' },
  }]
}

export function uptime(seconds: number): Found[] {
  const days = Math.floor(seconds / 86400); if (days < 7) return []
  return [{
    id: 'uptime', rule: 'Sem reiniciar', level: 'warning', title: `PC há ${days} dias sem reiniciar`,
    detail: 'Programas acumulam memória e atualizações do Windows ficam pela metade.',
    tip: 'Use "Reiniciar" de vez em quando. "Desligar" não conta: com a Inicialização rápida do Windows, ele hiberna em vez de desligar.',
  }]
}

const INSTALLER = /setup|install|unins|update|updater|\.tmp$|^is-|^nsis|^7z/i
const ODD_FOLDER = /\\AppData\\Local\\Temp\\|\\Downloads\\/i

export function oddFolder(s: Sample): Found[] {
  return s.groups.flatMap((g) => !g.path || !ODD_FOLDER.test(g.path) || INSTALLER.test(g.name) ? [] : [{
    id: `odd-folder:${g.path.toLowerCase()}`, rule: 'Pasta incomum', level: 'warning' as const, title: `${g.name} rodando de uma pasta incomum`,
    detail: g.path, tip: 'Programas instalados ficam em "Arquivos de Programas". Se você não reconhece este, finalize em Processos e passe o antivírus.',
    action: { folder: g.path },
  }])
}

/** `firstSeen`: quando cada item de inicialização apareceu pela primeira vez (itens da primeira leitura não contam). */
export function newStartup(items: { name: string; command: string }[], firstSeen: Map<string, number>, now: number): Found[] {
  return items.flatMap((i) => {
    const seen = firstSeen.get(i.name.toLowerCase())
    if (seen == null || now - seen > 3 * DAY) return []
    return [{
      id: `startup:${i.name.toLowerCase()}`, rule: 'Novo na inicialização', level: 'warning' as const, title: `Novo programa abrindo com o Windows: ${i.name}`,
      detail: i.command, tip: 'Se foi você que instalou, tudo certo. Se não reconhece, desative em Gerenciador de Tarefas > Aplicativos de inicialização.',
    }]
  })
}
