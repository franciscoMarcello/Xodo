import type { OptCheck, StartupItem } from '../../shared/types'

// Avaliação da tela Otimizar: recebe o que o PowerShell leu e devolve itens ok/dica/atenção com passo a passo.
// Pura (só tipos), com testes.

export interface ScanRaw {
  startup: Omit<StartupItem, 'canToggle' | 'flag'>[]
  plans: { guid: string; name: string; active: boolean }[]
  noLetter: { disk: string; size: number }[]
  pagefileAuto: boolean; pagefiles: { path: string; initialMB: number; maxMB: number }[]; ramBytes: number
  shaderCacheBytes: number; gameMode: number | null; bgRecording: number | null; hags: number | null
  cFree: number; cTotal: number; gpt: boolean
}
export interface Context { cpu: string; gpu: string; idleTemp: number | null }

const GB = 1024 ** 3
const gb = (b: number) => `${(b / GB).toLocaleString('pt-BR', { maximumFractionDigits: b < 10 * GB ? 1 : 0 })} GB`
export const PLAN = { balanced: '381b4222-f694-41f0-9685-ff5bb260df2e', high: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', saver: 'a1841308-3541-4fab-bc81-f71556f20b4a', ultimate: 'e9a42b02-d5df-448d-aa00-03f14749eb61' }

/** Marca itens de inicialização que parecem sobra. Só os do usuário dá para desligar sem administrador. */
export function flagStartup(items: ScanRaw['startup']): StartupItem[] {
  return items.map((i) => ({
    ...i, canToggle: i.source === 'hkcu' || i.source === 'folder',
    flag: !i.exists ? 'O programa não existe mais (sobra de desinstalação)'
      : /node_modules[\\/]electron/i.test(i.command) ? 'App em desenvolvimento (de um projeto de programação)'
      : /install|setup|uninst|updater/i.test(i.name + ' ' + i.command) && !/update\.exe.*--processstart/i.test(i.command) ? 'Parece um instalador ou atualizador'
      : undefined,
  }))
}

export function evaluate(raw: ScanRaw, ctx: Context): OptCheck[] {
  const out: OptCheck[] = []
  const startup = flagStartup(raw.startup)

  // Disco sem letra
  for (const d of raw.noLetter) out.push({
    id: `letter:${d.disk}`, title: `Disco sem letra: ${d.disk}`, status: 'warn', gain: `+${gb(d.size)} de espaço`,
    summary: `Tem uma partição de ${gb(d.size)} pronta, mas sem letra (C:, D:...). Por isso ela não aparece no Explorador e o espaço fica parado.`,
    steps: ['Clique em "Abrir Gerenciamento de disco" (o Windows pede permissão de administrador).', `Clique com o botão direito na partição de ${gb(d.size)} do ${d.disk}.`, 'Escolha "Alterar letra da unidade e caminho" > "Adicionar" > uma letra livre (ex.: F:) > OK.', 'Antes, confira que não há nada importante nela que dependa de não ter letra.'],
    action: { kind: 'open-diskmgmt', label: 'Abrir Gerenciamento de disco' },
  })
  if (!raw.noLetter.length) out.push({ id: 'letter', title: 'Discos', status: 'ok', summary: 'Todas as partições têm letra.' })

  // Espaço no C:
  const freePct = (100 * raw.cFree) / raw.cTotal
  out.push(freePct < 15 ? {
    id: 'c-space', title: `C: com só ${gb(raw.cFree)} livres`, status: 'warn', gain: 'Atualizações e desempenho',
    summary: `${Math.round(100 - freePct)}% usado. O Windows precisa de folga no disco do sistema para atualizar, criar arquivos temporários e cache de shaders.`,
    steps: ['Em Disco e limpeza, veja os maiores arquivos e limpe os temporários.', 'Mova jogos para outro disco (Steam: Configurações > Armazenamento > selecione o jogo > Mover).', 'Deixe pelo menos 15% do C: livre.'],
    action: { kind: 'open-disk-page', label: 'Abrir Disco e limpeza' },
  } : { id: 'c-space', title: 'Espaço no C:', status: 'ok', summary: `${gb(raw.cFree)} livres (${Math.round(freePct)}%).` })

  // Inicialização
  const on = startup.filter((i) => i.enabled)
  const leftovers = on.filter((i) => i.flag)
  out.push(leftovers.length ? {
    id: 'startup', title: `${leftovers.length} ${leftovers.length === 1 ? 'programa' : 'programas'} na inicialização ${leftovers.length === 1 ? 'parece' : 'parecem'} sobra`, status: 'warn',
    gain: 'Windows liga mais rápido, menos RAM',
    summary: `${leftovers.map((i) => i.name).join(', ')}. Desligue na lista "Abrem com o Windows" abaixo${leftovers.some((i) => !i.canToggle) ? ' (os de todos os usuários, pelo Gerenciador de Tarefas)' : ''}.`,
  } : on.length > 8 ? {
    id: 'startup', title: `${on.length} programas abrem com o Windows`, status: 'tip', gain: 'Windows liga mais rápido',
    summary: 'Desligue os que você não usa todo dia na lista abaixo. Desligar não desinstala: dá para abrir o programa normalmente quando quiser.',
  } : { id: 'startup', title: 'Inicialização', status: 'ok', summary: `${on.length} programas abrem com o Windows.` })

  // Plano de energia
  const active = raw.plans.find((p) => p.active)
  const ryzen = /ryzen/i.test(ctx.cpu)
  out.push(!active ? { id: 'power', title: 'Plano de energia', status: 'tip', summary: 'Não consegui ler o plano ativo.' }
    : active.guid === PLAN.saver ? { id: 'power', title: `Plano de energia: ${active.name}`, status: 'warn', gain: 'Desempenho', summary: 'O modo de economia segura o processador. Para um PC de mesa, use Equilibrado.' }
    : active.guid === PLAN.balanced ? { id: 'power', title: `Plano de energia: ${active.name}`, status: 'ok', summary: ryzen ? 'O recomendado pela AMD para processadores Ryzen: acelera quando precisa e economiza parado.' : 'O recomendado para o dia a dia.' }
    : { id: 'power', title: `Plano de energia: ${active.name}`, status: 'tip', gain: 'Menos calor e consumo', summary: ryzen ? 'Em Ryzen, Alto desempenho quase não ganha FPS e deixa a CPU mais quente parada. A AMD recomenda Equilibrado.' : 'Alto desempenho gasta mais energia parado; Equilibrado costuma bastar.' })

  // Modo de Jogo (ausente = ligado, padrão do Windows)
  out.push(raw.gameMode === 0
    ? { id: 'game-mode', title: 'Modo de Jogo desligado', status: 'warn', gain: 'FPS mais estável', summary: 'O Modo de Jogo do Windows dá prioridade ao jogo e segura atualizações durante a partida.', action: { kind: 'enable-game-mode', label: 'Ligar Modo de Jogo' } }
    : { id: 'game-mode', title: 'Modo de Jogo', status: 'ok', summary: 'Ligado.' })

  // Gravação em segundo plano do Xbox Game Bar
  out.push(raw.bgRecording === 1
    ? { id: 'bg-rec', title: 'Gravação em segundo plano ligada', status: 'tip', gain: '~1–5% de FPS', summary: 'O Xbox Game Bar fica gravando os últimos minutos do jogo o tempo todo ("Gravar o que aconteceu"), usando placa de vídeo e disco.', action: { kind: 'disable-bg-recording', label: 'Desligar gravação' } }
    : { id: 'bg-rec', title: 'Gravação em segundo plano do Xbox', status: 'ok', summary: 'Desligada.' })

  // Agendamento de GPU acelerado por hardware (2 = ligado, 1 = desligado, ausente = padrão)
  out.push(raw.hags === 1
    ? { id: 'hags', title: 'Agendamento de GPU acelerado desligado', status: 'tip', gain: 'Menos latência', summary: 'Sua placa suporta. Ligar costuma reduzir um pouco a latência e é necessário para a geração de quadros (FSR 3 / DLSS 3).', steps: ['Clique em "Abrir configurações de gráficos".', 'Em "Configurações padrão" > "Alterar configurações gráficas padrão", ligue "Agendamento de GPU acelerado por hardware".', 'Reinicie o PC.'], action: { kind: 'open-graphics-settings', label: 'Abrir configurações de gráficos' } }
    : { id: 'hags', title: 'Agendamento de GPU acelerado', status: 'ok', summary: raw.hags === 2 ? 'Ligado.' : 'No padrão do Windows.' })

  // Resizable BAR / Smart Access Memory (não dá para ler sem o driver: passo a passo para conferir)
  const modernGpu = /rx\s*[679]\d{3}|rtx\s*[345]\d{3}|arc\s*[ab]\d{3}/i.test(ctx.gpu)
  const modernCpu = /ryzen\s*\d\s*[3579]\d{3}/i.test(ctx.cpu) || /i\d[- ]1\d{4}|core ultra/i.test(ctx.cpu)
  if (modernGpu && modernCpu) {
    const amd = /radeon|rx\s*\d/i.test(ctx.gpu)
    out.push({
      id: 'rebar', title: amd ? 'Confira o Smart Access Memory (Resizable BAR)' : 'Confira o Resizable BAR', status: 'tip', gain: 'Até ~5–10% de FPS em alguns jogos',
      summary: `Sua placa e seu processador suportam${raw.gpt ? ', e o disco do Windows já está no formato certo (GPT)' : ''}. Lá no driver mostra se está ligado.`,
      steps: [
        amd ? 'Abra o AMD Software > Desempenho > Ajuste e veja "Smart Access Memory".' : 'Abra o painel do driver e procure "Resizable BAR".',
        'Se estiver desligado, entre na BIOS (aperte Del ao ligar o PC).',
        'Em Advanced > PCI Subsystem Settings: "Above 4G Decoding" = Enabled e "Re-Size BAR Support" = Auto.',
        'Em Boot > CSM: Disabled. Salve com F10.',
        ...(raw.gpt ? [] : ['Atenção: o disco do Windows não é GPT; desligar o CSM pode impedir o Windows de iniciar.']),
      ],
      action: amd ? { kind: 'open-amd-software', label: 'Abrir AMD Software' } : undefined,
    })
  }

  // Arquivo de paginação
  const maxMB = Math.max(0, ...raw.pagefiles.map((p) => p.maxMB))
  out.push(!raw.pagefileAuto && maxMB > 0 && maxMB < 8192
    ? { id: 'pagefile', title: `Arquivo de paginação fixo em ${Math.round(maxMB / 1024)} GB`, status: 'tip', gain: 'Evita travar em jogos pesados', summary: 'Alguns jogos reservam muita memória virtual e fecham sozinhos com um arquivo de paginação pequeno. "Gerenciado pelo sistema" é o mais seguro.', steps: ['Clique em "Abrir Opções de desempenho".', 'Aba Avançado > Memória virtual > Alterar.', 'Marque "Gerenciar automaticamente o tamanho do arquivo de paginação" > OK e reinicie.'], action: { kind: 'open-performance-options', label: 'Abrir Opções de desempenho' } }
    : { id: 'pagefile', title: 'Arquivo de paginação', status: 'ok', summary: raw.pagefileAuto ? 'Gerenciado pelo Windows.' : 'Tamanho adequado.' })

  // Cache de shaders
  out.push(raw.shaderCacheBytes > 2 * GB
    ? { id: 'shaders', title: `Cache de shaders com ${gb(raw.shaderCacheBytes)}`, status: 'tip', gain: `+${gb(raw.shaderCacheBytes)} no C:`, summary: 'O driver guarda shaders compilados dos jogos. Limpar libera espaço e resolve travadas depois de atualizar o driver; os jogos refazem o cache na primeira vez que abrirem.', action: { kind: 'clear-shader-cache', label: 'Limpar cache' } }
    : { id: 'shaders', title: 'Cache de shaders', status: 'ok', summary: `${raw.shaderCacheBytes < GB ? `${Math.round(raw.shaderCacheBytes / 1024 ** 2)} MB` : gb(raw.shaderCacheBytes)}, tamanho normal.` })

  // Temperatura parada (do histórico)
  if (ctx.idleTemp != null) out.push(ctx.idleTemp > 60
    ? { id: 'idle-temp', title: `CPU a ${Math.round(ctx.idleTemp)} °C parada`, status: 'warn', gain: 'Menos calor, barulho e desgaste', summary: 'Média das últimas 24 h com menos de 15% de uso. Parada, o normal é 35–50 °C: o calor não está saindo direito.', steps: ['Limpe a poeira do cooler e dos filtros do gabinete (PC desligado, com ar comprimido).', 'Confira se a ventoinha do cooler gira; na BIOS (Monitor > Q-Fan) dá para ajustar a curva.', 'Se o cooler for o original ou tiver mais de 3 anos, troque a pasta térmica.', 'Opcional: o "Eco Mode" do Ryzen (na BIOS ou no Ryzen Master) baixa bastante a temperatura com pouca perda.'] }
    : { id: 'idle-temp', title: 'Temperatura da CPU parada', status: 'ok', summary: `${Math.round(ctx.idleTemp)} °C em média nas últimas 24 h.` })

  const order = { warn: 0, tip: 1, ok: 2 }
  return out.sort((a, b) => order[a.status] - order[b.status])
}
