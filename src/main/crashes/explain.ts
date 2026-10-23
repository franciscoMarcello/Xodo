import type { CrashAdvice, CrashEvent, CrashKind } from '../../shared/types'

// Diário de travamentos: transforma eventos do Windows em explicações e sugestões. Puro (só tipos), com testes.

/** Evento como vem do PowerShell: provedor, id, hora e os campos de dados pelo nome. */
export interface RawEvent { provider: string; id: number; time: string; data: Record<string, string>; msg: string }
export interface Ctx { cpuTemp: number | null; gpuTemp: number | null; game: string | null }

/** Telas azuis mais comuns: nome técnico, explicação e o grupo de causa (para juntar conselhos). */
const BUGCHECK: Record<number, [string, string, Cause]> = {
  0x0a: ['IRQL_NOT_LESS_OR_EQUAL', 'Um driver acessou memória que não podia.', 'driver'],
  0x19: ['BAD_POOL_HEADER', 'Memória do sistema corrompida, geralmente por driver ou RAM instável.', 'ram'],
  0x1a: ['MEMORY_MANAGEMENT', 'Erro no gerenciamento de memória: quase sempre RAM instável (XMP/overclock) ou pente com defeito.', 'ram'],
  0x1e: ['KMODE_EXCEPTION_NOT_HANDLED', 'Um driver travou de um jeito que o Windows não conseguiu tratar.', 'driver'],
  0x3b: ['SYSTEM_SERVICE_EXCEPTION', 'Um driver ou serviço do sistema travou.', 'driver'],
  0x50: ['PAGE_FAULT_IN_NONPAGED_AREA', 'Acesso a memória inválida: driver com defeito ou RAM instável.', 'ram'],
  0x7a: ['KERNEL_DATA_INPAGE_ERROR', 'O Windows não conseguiu ler dados do disco: disco ou cabo com problema.', 'storage'],
  0x7e: ['SYSTEM_THREAD_EXCEPTION_NOT_HANDLED', 'Um driver travou.', 'driver'],
  0x9f: ['DRIVER_POWER_STATE_FAILURE', 'Um driver não respondeu ao suspender ou acordar o PC.', 'driver'],
  0xa0: ['INTERNAL_POWER_ERROR', 'Erro no gerenciamento de energia (suspensão/hibernação).', 'driver'],
  0xd1: ['DRIVER_IRQL_NOT_LESS_OR_EQUAL', 'Um driver (muitas vezes de rede ou áudio) acessou memória que não podia.', 'driver'],
  0xef: ['CRITICAL_PROCESS_DIED', 'Um processo essencial do Windows morreu: arquivos do sistema corrompidos ou disco com problema.', 'system'],
  0x101: ['CLOCK_WATCHDOG_TIMEOUT', 'Um núcleo do processador parou de responder: instabilidade de CPU (overclock, PBO, tensão).', 'cpu'],
  0x116: ['VIDEO_TDR_FAILURE', 'O driver de vídeo travou e não conseguiu se recuperar.', 'gpu'],
  0x117: ['VIDEO_TDR_TIMEOUT_DETECTED', 'O driver de vídeo demorou demais para responder.', 'gpu'],
  0x119: ['VIDEO_SCHEDULER_INTERNAL_ERROR', 'Erro interno no agendamento da placa de vídeo.', 'gpu'],
  0x124: ['WHEA_UNCORRECTABLE_ERROR', 'O próprio hardware avisou de um erro grave: CPU, RAM ou placa-mãe instáveis (overclock, tensão, temperatura).', 'cpu'],
  0x133: ['DPC_WATCHDOG_VIOLATION', 'Um driver (muitas vezes de SSD/armazenamento) ficou preso tempo demais.', 'storage'],
  0x139: ['KERNEL_SECURITY_CHECK_FAILURE', 'Estrutura interna do Windows corrompida, normalmente por driver.', 'driver'],
  0x154: ['UNEXPECTED_STORE_EXCEPTION', 'Erro ao ler a memória comprimida do disco: SSD ou RAM.', 'storage'],
}
type Cause = 'driver' | 'ram' | 'storage' | 'gpu' | 'cpu' | 'system' | 'power' | 'app'

/** DLLs que entregam o verdadeiro culpado quando um programa fecha. */
function moduleCause(module: string): [Cause, string] | null {
  const m = module.toLowerCase()
  if (/^(amdxx64|atidxx64|atiumd|amdxc64|amd_ags|amdvlk64|atiuxp|aticfx64)/.test(m)) return ['gpu', 'Driver de vídeo da AMD']
  if (/^(nvwgf2um|nvoglv64|nvldumd|nvd3dum|nvcuda|nvlddmkm)/.test(m)) return ['gpu', 'Driver de vídeo da NVIDIA']
  if (/^(igd|ig\d+icd)/.test(m)) return ['gpu', 'Driver de vídeo da Intel']
  if (/^(d3d1[12]|dxgi|d3d9|vulkan-1)\.dll/.test(m)) return ['gpu', 'DirectX/Vulkan (geralmente o driver de vídeo)']
  if (/^(vcruntime|msvcp|ucrtbase|concrt)/.test(m)) return ['app', 'Bibliotecas do Visual C++']
  if (/^(clr|coreclr|clrjit)\.dll/.test(m)) return ['app', '.NET']
  return null
}

const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(8, '0')}`
const hot = (c: Ctx) => (c.cpuTemp != null && c.cpuTemp >= 90) || (c.gpuTemp != null && c.gpuTemp >= 90)
const tempText = (c: Ctx) => [c.cpuTemp != null ? `CPU ${Math.round(c.cpuTemp)} °C` : '', c.gpuTemp != null ? `GPU ${Math.round(c.gpuTemp)} °C` : ''].filter(Boolean).join(', ')

/** Um evento do Windows -> evento do diário com explicação. null = ignorar. */
export function classify(e: RawEvent, ctx: Ctx): (CrashEvent & { cause: Cause }) | null {
  const time = new Date(e.time).getTime(); const base = { time, context: ctx }
  const t = tempText(ctx); const at = t ? ` Naquele momento: ${t}${ctx.game ? `, jogando ${ctx.game}` : ''}.` : ctx.game ? ` Você estava jogando ${ctx.game}.` : ''
  if (e.provider === 'Microsoft-Windows-Kernel-Power' && e.id === 41) {
    if (Number(e.data.PowerButtonTimestamp ?? 0) > 0) return { ...base, kind: 'shutdown', cause: 'app', title: 'Desligado pelo botão', explain: `Alguém segurou o botão de ligar para forçar o desligamento (o PC devia estar travado).${at}` }
    const code = Number(e.data.BugcheckCode ?? 0)
    if (code) return null // vem junto com a tela azul (evento 1001), que é contada lá
    // SleepInProgress: caiu durante a entrada/saída da suspensão. (SystemSleepTransitionsToOn só conta quantas vezes já tinha
    // voltado da suspensão antes; não quer dizer que caiu nela.)
    const sleep = !['0', 'false', '', undefined].includes(e.data.SleepInProgress)
    return {
      ...base, kind: 'shutdown', cause: hot(ctx) ? 'cpu' : 'power', title: sleep ? 'Desligou sozinho durante a suspensão' : 'Desligou sozinho, sem tela azul',
      explain: (sleep ? 'O PC caiu enquanto entrava ou saía da suspensão.' : 'O PC apagou de uma vez, sem tela azul: queda de energia, fonte, superaquecimento ou travamento total.') + at,
    }
  }
  if (e.provider === 'Microsoft-Windows-WER-SystemErrorReporting' && e.id === 1001) {
    const m = /0x[0-9a-f]+/i.exec(e.data.param1 ?? e.msg); const code = m ? parseInt(m[0], 16) : 0
    const known = BUGCHECK[code]
    return { ...base, kind: 'bluescreen', cause: known?.[2] ?? 'driver', code: known ? `${hex(code)} ${known[0]}` : m?.[0], title: `Tela azul${known ? `: ${known[0]}` : ''}`, explain: (known?.[1] ?? 'Erro grave do sistema (código pouco comum).') + at }
  }
  if (e.provider === 'Microsoft-Windows-WHEA-Logger') {
    const fatal = [18, 1].includes(e.id) || /fatal|fatais/i.test(e.msg)
    return { ...base, kind: 'hardware', cause: 'cpu', title: fatal ? 'Erro grave de hardware' : 'Erro de hardware corrigido', explain: `${fatal ? 'O processador/placa-mãe relatou um erro que derrubou o sistema.' : 'O hardware corrigiu um erro sozinho, mas isso mostra instabilidade (overclock, XMP, tensão ou temperatura).'}${at}` }
  }
  if (e.id === 4101) return { ...base, kind: 'gpu-reset', cause: 'gpu', title: 'Driver de vídeo reiniciou', explain: `A tela piscou ou travou e o driver de vídeo se recuperou sozinho.${at}` }
  if (e.provider === 'disk') return { ...base, kind: 'disk', cause: 'storage', title: e.id === 7 ? 'Setor ruim no disco' : 'Erro de leitura/escrita no disco', explain: 'O disco não respondeu direito a uma leitura ou escrita. Pode ser o disco, o cabo SATA ou a porta.' }
  if (e.provider === 'Application Error' && e.id === 1000) {
    const app = e.data.AppName ?? 'programa', module = e.data.ModuleName ?? ''
    const mc = moduleCause(module); const same = module.toLowerCase() === app.toLowerCase()
    return {
      ...base, kind: 'app-crash', cause: mc?.[0] ?? 'app', app, module, code: e.data.ExceptionCode ? `0x${e.data.ExceptionCode}` : undefined, title: `${app} fechou sozinho`,
      explain: (mc ? `A falha foi dentro de: ${mc[1]} (${module}).` : same ? 'A falha foi no próprio programa.' : `A falha foi em ${module || 'um módulo desconhecido'}.`) + (e.data.ExceptionCode === 'c0000374' ? ' Tipo: memória corrompida dentro do programa.' : '') + at,
    }
  }
  if (e.provider === 'Application Hang' && e.id === 1002) return { ...base, kind: 'app-hang', cause: 'app', app: e.data.AppName ?? e.data.param1, title: `${e.data.AppName ?? e.data.param1 ?? 'Programa'} travou ("Não está respondendo")`, explain: `O Windows fechou o programa depois que ele parou de responder.${at}` }
  return null
}

/** Junta os eventos em conclusões com passo a passo, das mais graves para as mais leves. */
export function advise(events: (CrashEvent & { cause: Cause })[]): CrashAdvice[] {
  const out: CrashAdvice[] = []
  const of = (k: CrashKind) => events.filter((e) => e.kind === k)

  const shut = of('shutdown').filter((e) => e.title !== 'Desligado pelo botão')
  if (shut.length) {
    const hotOnes = shut.filter((e) => hot(e.context)), gaming = shut.filter((e) => e.context.game), sleep = shut.filter((e) => /suspensão/.test(e.title))
    const why = hotOnes.length ? `${hotOnes.length} de ${shut.length} aconteceram com o PC muito quente (90 °C ou mais).`
      : gaming.length === shut.length ? 'Todos aconteceram durante jogos, sem tela azul: o padrão de fonte de energia no limite.'
      : sleep.length === shut.length ? 'Todos aconteceram durante a suspensão: problema de energia/driver na suspensão.'
      : 'Desligar de uma vez, sem tela azul, costuma ser queda de energia, fonte ou travamento total.'
    out.push({
      id: 'shutdown', level: shut.length >= 3 ? 'serious' : 'warning', count: shut.length, title: `${shut.length} ${shut.length === 1 ? 'desligamento inesperado' : 'desligamentos inesperados'}`, why,
      steps: hotOnes.length ? ['Limpe a poeira do cooler e da placa de vídeo e confira se as ventoinhas giram.', 'Troque a pasta térmica se o cooler tiver mais de 3 anos.', 'Acompanhe as temperaturas no Histórico depois da limpeza.']
        : sleep.length === shut.length ? ['Atualize o chipset da AMD e a BIOS da placa-mãe.', 'Se continuar, desligue a "Inicialização rápida" (Painel de Controle > Opções de energia > O que os botões fazem).', 'Ou prefira desligar o PC em vez de suspender.']
        : ['Se acabou a luz ou alguém mexeu no cabo, pode ignorar.', 'Ligue o PC num filtro de linha ou nobreak, sem extensão "T".', 'Se acontece durante jogos, a fonte pode estar no limite: confira se ela tem a potência que o fabricante da sua placa de vídeo recomenda (está na caixa ou no site) e se é de boa marca.', 'Desative overclock/PBO e o undervolt, se tiver, e veja se para.'],
    })
  }

  const blue = of('bluescreen')
  const byCause = (c: Cause) => blue.filter((e) => e.cause === c).length + events.filter((e) => e.kind !== 'bluescreen' && e.cause === c && e.kind !== 'shutdown').length
  if (blue.length) {
    const codes = [...new Set(blue.map((e) => e.code).filter(Boolean))]
    out.push({ id: 'bluescreen', level: blue.length >= 2 ? 'serious' : 'warning', count: blue.length, title: `${blue.length} ${blue.length === 1 ? 'tela azul' : 'telas azuis'}`, why: `Códigos: ${codes.join(', ') || 'não informados'}. As sugestões abaixo seguem a causa mais provável de cada código.`, steps: [] })
  }
  const gpu = byCause('gpu')
  if (gpu) out.push({
    id: 'gpu', level: gpu >= 3 ? 'serious' : 'warning', count: gpu, title: 'Driver de vídeo envolvido', why: `${gpu} ${gpu === 1 ? 'evento aponta' : 'eventos apontam'} para o driver da placa de vídeo (tela azul de vídeo, driver reiniciando ou programa fechando dentro dele).`,
    steps: ['Atualize o driver de vídeo (veja em Drivers).', 'Se já está atualizado, faça uma instalação limpa: o AMD Software tem a opção "Redefinição de fábrica" na instalação.', 'Tire overclock/undervolt da placa de vídeo, se tiver.', 'Confira a temperatura da GPU durante jogos no Histórico.'],
  })
  const ram = byCause('ram')
  if (ram) out.push({ id: 'ram', level: 'serious', count: ram, title: 'Memória RAM suspeita', why: 'Os erros indicam memória instável.', steps: ['Desligue o XMP/DOCP na BIOS por alguns dias e veja se para.', 'Rode o "Diagnóstico de Memória do Windows" (procure no menu Iniciar) ou o MemTest86.', 'Teste os pentes um de cada vez para achar o defeituoso.'] })
  const cpu = events.filter((e) => e.kind === 'hardware' || (e.kind === 'bluescreen' && e.cause === 'cpu')).length
  if (cpu) out.push({ id: 'cpu', level: 'serious', count: cpu, title: 'Instabilidade de hardware (CPU/placa-mãe)', why: 'O próprio processador relatou erros. Costuma ser overclock, PBO/Curve Optimizer agressivo, tensão ou temperatura.', steps: ['Volte a BIOS para os padrões (ou desative PBO/Curve Optimizer).', 'Atualize a BIOS da placa-mãe.', 'Confira a temperatura da CPU no Histórico.'] })
  const storage = byCause('storage')
  if (storage) out.push({ id: 'storage', level: 'serious', count: storage, title: 'Disco envolvido', why: 'Os erros indicam falha de leitura/escrita.', steps: ['Faça backup do que é importante.', 'Veja a saúde dos discos em Disco e limpeza.', 'Troque o cabo SATA ou a porta do disco com problema.', 'Atualize o firmware do SSD (site do fabricante).'] })
  const drv = blue.filter((e) => e.cause === 'driver' || e.cause === 'system').length
  if (drv) out.push({ id: 'driver', level: 'warning', count: drv, title: 'Driver ou sistema', why: 'Telas azuis desse tipo costumam vir de um driver com problema.', steps: ['Atualize os drivers (Drivers) e o chipset da AMD.', 'Pense no que foi instalado pouco antes: desinstale para testar.', 'Rode "sfc /scannow" no Prompt de Comando como administrador para reparar arquivos do Windows.'] })

  // Programas que fecham sempre (3+ vezes), sem culpa do driver
  const apps = new Map<string, number>()
  for (const e of events) if ((e.kind === 'app-crash' || e.kind === 'app-hang') && e.cause === 'app' && e.app) apps.set(e.app, (apps.get(e.app) ?? 0) + 1)
  for (const [app, n] of [...apps].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1])) out.push({
    id: `app:${app}`, level: 'info', count: n, title: `${app} fechou ou travou ${n} vezes`, why: 'O problema parece ser do próprio programa, não do PC.',
    steps: ['Atualize o programa.', 'Se for jogo da Steam: botão direito no jogo > Propriedades > Arquivos instalados > "Verificar integridade".', 'Se continuar, reinstale. Se o erro cita bibliotecas do Visual C++, reinstale o "Microsoft Visual C++ Redistributable".'],
  })
  const order = { critical: 0, serious: 1, warning: 2, info: 3 }
  return out.sort((a, b) => order[a.level] - order[b.level] || b.count - a.count)
}
