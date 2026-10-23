import type { CanRunVerdict, PartCheck } from '../../shared/types'
import { findCpus, findGpus, type Part } from './hardware.ts'

// Lê os requisitos de PC da Steam (HTML em inglês) e compara com a máquina. Puro, com testes.

export interface Req { cpu: string; gpu: string; ramGB: number | null; storageGB: number | null; ssd: boolean }

const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
function size(text: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(TB|GB|MB)/i.exec(text); if (!m) return null
  const n = Number(m[1].replace(',', '.')); const u = m[2].toUpperCase()
  return u === 'TB' ? n * 1024 : u === 'MB' ? n / 1024 : n
}

/** Uma lista de requisitos ("Minimum" ou "Recommended") vira campos. Linhas: "<li><strong>Processor:</strong> ...". */
export function parseReq(html: string | undefined): Req | null {
  if (!html) return null
  const fields: Record<string, string> = {}
  for (const part of html.split(/<li>|<br\s*\/?>/i)) {
    const t = strip(part); const m = /^([A-Za-z ]+):\s*(.+)$/.exec(t); if (m) fields[m[1].trim().toLowerCase()] = m[2]
  }
  const get = (...keys: string[]) => keys.map((k) => fields[k]).find(Boolean) ?? ''
  const storage = get('storage', 'hard drive', 'hard disk space', 'disk space')
  const req: Req = {
    cpu: get('processor', 'cpu'), gpu: get('graphics', 'video card', 'video', 'gpu'),
    ramGB: size(get('memory', 'ram')), storageGB: size(storage), ssd: /\bssd\b/i.test(storage + ' ' + get('additional notes')),
  }
  return req.cpu || req.gpu || req.ramGB ? req : null
}

/** Entre alternativas ("GTX 1060 or RX 580"), vale a mais fraca: o jogo aceita qualquer uma. */
const weakest = (parts: Part[]) => (parts.length ? parts.reduce((a, b) => (b.score < a.score ? b : a)) : null)

// Requisitos sem modelo ("placa compatível com DirectX 11", "dual core 2.8 GHz") valem como uma peça de entrada.
const GENERIC_GPU = /directx|\bdx ?\d|shader model|opengl|vulkan|vram|video card|graphics card|\d+\s*(gb|mb)\b|compatible/i
const GENERIC_CPU = /dual[- ]?core|quad[- ]?core|\d+\s*(cores?|threads?)|ghz|core 2|64[- ]?bit|x64/i
const ENTRY_GPU: Part = { name: 'placa de entrada (requisito genérico)', score: 15 }
const ENTRY_CPU: Part = { name: 'processador de entrada (requisito genérico)', score: 35 }
const required = (found: Part[], text: string, generic: RegExp, entry: Part) => weakest(found) ?? (text && generic.test(text) ? entry : null)

function check(label: string, yours: Part | null, yoursText: string, minP: Part | null, recP: Part | null, minText: string, recText: string): PartCheck {
  const ratio = (p: Part | null) => (yours && p ? yours.score / p.score : null)
  const rMin = ratio(minP), rRec = ratio(recP)
  let verdict: PartCheck['verdict'] = 'unknown'
  if (yours && (minP || recP)) {
    if (rMin != null && rMin < 0.9) verdict = 'below'
    else if (rRec == null) verdict = rMin! >= 1.5 ? 'rec' : 'min'
    else verdict = rRec < 0.95 ? 'min' : rRec < 1.4 ? 'rec' : 'above'
  }
  return {
    // Requisito genérico: mostra o texto do jogo, não o nome da "peça de entrada".
    label, yours: yours?.name ?? yoursText, ratioMin: rMin, ratioRec: rRec, verdict,
    min: minP && minP !== ENTRY_GPU && minP !== ENTRY_CPU ? minP.name : minText || null,
    rec: recP && recP !== ENTRY_GPU && recP !== ENTRY_CPU ? recP.name : recText || null,
    note: !yours ? 'Não reconheci a sua peça na tabela de desempenho.'
      : (minText || recText) && !minP && !recP ? 'O jogo não cita um modelo conhecido.'
      : [minP, recP].some((p) => p === ENTRY_GPU || p === ENTRY_CPU) ? 'O jogo não cita um modelo, só uma descrição genérica: comparei com uma peça de entrada.' : undefined,
  }
}

const gbText = (n: number | null) => (n == null ? null : `${Number.isInteger(n) ? n : n.toFixed(1)} GB`)

export function compare(min: Req | null, rec: Req | null, pc: { cpu: string; gpu: string; ramGB: number; freeGB: number; hasSsd: boolean }): { parts: PartCheck[]; verdict: CanRunVerdict } {
  const myCpu = findCpus(pc.cpu)[0] ?? null, myGpu = findGpus(pc.gpu)[0] ?? null
  const cpuReq = (t = '') => required(findCpus(t), t, GENERIC_CPU, ENTRY_CPU), gpuReq = (t = '') => required(findGpus(t), t, GENERIC_GPU, ENTRY_GPU)
  const cpu = check('Processador', myCpu, pc.cpu, cpuReq(min?.cpu), cpuReq(rec?.cpu), min?.cpu ?? '', rec?.cpu ?? '')
  const gpu = check('Placa de vídeo', myGpu, pc.gpu, gpuReq(min?.gpu), gpuReq(rec?.gpu), min?.gpu ?? '', rec?.gpu ?? '')

  const rMin = min?.ramGB ?? null, rRec = rec?.ramGB ?? null
  const ram: PartCheck = {
    label: 'Memória RAM', yours: `${pc.ramGB} GB`, min: gbText(rMin), rec: gbText(rRec), ratioMin: rMin ? pc.ramGB / rMin : null, ratioRec: rRec ? pc.ramGB / rRec : null,
    verdict: !rMin && !rRec ? 'unknown' : rMin && pc.ramGB < rMin ? 'below' : rRec && pc.ramGB < rRec ? 'min' : rRec && pc.ramGB >= 2 * rRec ? 'above' : 'rec',
  }
  const need = rec?.storageGB ?? min?.storageGB ?? null
  const ssd = !!(rec?.ssd || min?.ssd)
  const disk: PartCheck = {
    label: 'Espaço em disco', yours: `${Math.floor(pc.freeGB)} GB livres`, min: gbText(min?.storageGB ?? null), rec: gbText(rec?.storageGB ?? null),
    ratioMin: null, ratioRec: need ? pc.freeGB / need : null, verdict: !need ? 'unknown' : pc.freeGB < need ? 'below' : 'rec',
    note: ssd ? (pc.hasSsd ? 'O jogo pede SSD: você tem SSD, instale nele.' : 'O jogo pede SSD e você não tem um.') : undefined,
  }
  return { parts: [cpu, gpu, ram, disk], verdict: overall(cpu, gpu, ram, disk) }
}

/** Qualidade provável pela peça mais fraca (CPU ou GPU) em relação ao recomendado. Recomendado ≈ Alto em 1080p a ~60 FPS. */
function overall(cpu: PartCheck, gpu: PartCheck, ram: PartCheck, disk: PartCheck): CanRunVerdict {
  const below = [cpu, gpu, ram].filter((p) => p.verdict === 'below')
  if (below.length) return { level: 'no', title: 'Abaixo do mínimo', detail: `${below.map((p) => p.label).join(' e ')} abaixo do mínimo: o jogo deve rodar mal ou nem abrir.` }
  const known = [cpu, gpu].filter((p) => p.verdict !== 'unknown')
  if (!known.length) return { level: 'unknown', title: 'Não deu para estimar', detail: 'Os requisitos deste jogo não citam processador e placa de vídeo que eu reconheça.' }
  // Sem "recomendado", estima pelo mínimo: 1,5x o mínimo conta como recomendado.
  const r = (p: PartCheck) => p.ratioRec ?? (p.ratioMin != null ? p.ratioMin / 1.5 : Infinity)
  const weakest = known.reduce((a, b) => (r(b) < r(a) ? b : a))
  const x = r(weakest)
  const limit = known.length === 2 && Math.abs(r(cpu) - r(gpu)) > 0.15 ? ` A peça que mais segura é ${weakest.label === 'Processador' ? 'o processador' : 'a placa de vídeo'}.` : ''
  const space = disk.verdict === 'below' ? ' Falta espaço em disco para instalar.' : ''
  if (x < 0.6) return { level: 'low', title: 'Roda no Baixo', detail: `Acima do mínimo, mas longe do recomendado. Espere gráficos no Baixo em 1080p, talvez com FSR/DLSS.${limit}${space}` }
  if (x < 0.95) return { level: 'medium', title: 'Roda no Médio', detail: `Entre o mínimo e o recomendado. Gráficos no Médio em 1080p devem ficar bons.${limit}${space}` }
  if (x < 1.4) return { level: 'high', title: 'Roda no Alto', detail: `Atende o recomendado. Gráficos no Alto em 1080p, por volta de 60 FPS.${limit}${space}` }
  return { level: 'ultra', title: 'Roda no Ultra', detail: `Bem acima do recomendado. Ultra em 1080p, e dá para tentar 1440p.${space}` }
}
