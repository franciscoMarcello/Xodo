// Desempenho relativo aproximado em jogos, para comparar o PC com os requisitos dos jogos.
// GPU: rasterização em 1080p, RTX 3060 = 100. CPU: jogos, Ryzen 5 3600 = 100.
// Valores arredondados a partir de médias públicas de reviews; servem para estimar, não para prometer FPS.
// Sem imports de código, para os testes rodarem direto no Node.

export const GPUS: [string, number][] = [
  // NVIDIA (antigas aparecem em requisitos de jogos velhos, como Dota 2 e CS)
  ['8800 gt', 5], ['9600 gt', 4], ['9800 gt', 5], ['gts 250', 6], ['gtx 260', 8], ['gtx 275', 9], ['gtx 285', 10], ['gtx 460', 12], ['gtx 470', 15], ['gtx 480', 17],
  ['gtx 550 ti', 10], ['gtx 560', 14], ['gtx 560 ti', 16], ['gtx 570', 19], ['gtx 580', 21],
  ['gt 730', 6], ['gt 1030', 12], ['gtx 650', 11], ['gtx 650 ti', 15], ['gtx 660', 22], ['gtx 660 ti', 25], ['gtx 670', 28], ['gtx 680', 31],
  ['gtx 750', 17], ['gtx 750 ti', 20], ['gtx 760', 26], ['gtx 770', 32], ['gtx 780', 38], ['gtx 780 ti', 45],
  ['gtx 950', 26], ['gtx 960', 31], ['gtx 970', 47], ['gtx 980', 55], ['gtx 980 ti', 68],
  ['gtx 1050', 24], ['gtx 1050 ti', 30], ['gtx 1060 3gb', 47], ['gtx 1060', 52], ['gtx 1070', 70], ['gtx 1070 ti', 78], ['gtx 1080', 85], ['gtx 1080 ti', 112],
  ['gtx 1630', 22], ['gtx 1650', 42], ['gtx 1650 super', 55], ['gtx 1660', 62], ['gtx 1660 super', 70], ['gtx 1660 ti', 72],
  ['rtx 2060', 85], ['rtx 2060 super', 97], ['rtx 2070', 100], ['rtx 2070 super', 113], ['rtx 2080', 120], ['rtx 2080 super', 126], ['rtx 2080 ti', 145],
  ['rtx 3050', 75], ['rtx 3060', 100], ['rtx 3060 ti', 123], ['rtx 3070', 137], ['rtx 3070 ti', 145], ['rtx 3080', 165], ['rtx 3080 ti', 178], ['rtx 3090', 180], ['rtx 3090 ti', 192],
  ['rtx 4060', 117], ['rtx 4060 ti', 137], ['rtx 4070', 168], ['rtx 4070 super', 190], ['rtx 4070 ti', 200], ['rtx 4070 ti super', 212], ['rtx 4080', 245], ['rtx 4080 super', 250], ['rtx 4090', 300],
  ['rtx 5060', 140], ['rtx 5060 ti', 155], ['rtx 5070', 205], ['rtx 5070 ti', 245], ['rtx 5080', 265], ['rtx 5090', 320],
  // AMD
  ['hd 2600', 1], ['hd 3850', 3], ['hd 3870', 4], ['hd 4850', 6], ['hd 4870', 7], ['hd 5770', 9], ['hd 5850', 12], ['hd 5870', 14], ['hd 6850', 13], ['hd 6870', 15], ['hd 6950', 17], ['hd 6970', 19],
  ['hd 7850', 22], ['hd 7870', 26], ['hd 7950', 30], ['hd 7970', 33], ['r9 270x', 27], ['r9 280x', 32], ['r9 290', 42], ['r9 290x', 45], ['r9 380', 32], ['r9 390', 50], ['r9 fury', 58],
  ['rx 460', 20], ['rx 470', 42], ['rx 480', 47], ['rx 550', 14], ['rx 560', 22], ['rx 570', 45], ['rx 580', 50], ['rx 590', 55], ['vega 56', 68], ['vega 64', 75], ['radeon vii', 90],
  ['rx 5500 xt', 52], ['rx 5600 xt', 78], ['rx 5700', 95], ['rx 5700 xt', 105],
  ['rx 6400', 33], ['rx 6500 xt', 38], ['rx 6600', 98], ['rx 6600 xt', 110], ['rx 6650 xt', 115], ['rx 6700', 120], ['rx 6700 xt', 133], ['rx 6750 xt', 140],
  ['rx 6800', 158], ['rx 6800 xt', 178], ['rx 6900 xt', 188], ['rx 6950 xt', 200],
  ['rx 7600', 115], ['rx 7600 xt', 120], ['rx 7700 xt', 165], ['rx 7800 xt', 190], ['rx 7900 gre', 205], ['rx 7900 xt', 235], ['rx 7900 xtx', 265],
  ['rx 9060 xt', 150], ['rx 9070', 245], ['rx 9070 xt', 265],
  // Intel
  ['arc a380', 40], ['arc a580', 92], ['arc a750', 100], ['arc a770', 108], ['arc b570', 110], ['arc b580', 120],
  // Integradas
  ['hd 4000', 4], ['hd 520', 5], ['hd 620', 6], ['uhd 620', 6], ['uhd 630', 7], ['uhd 770', 9], ['iris xe', 18], ['vega 8', 15], ['vega 11', 18], ['radeon 680m', 32], ['radeon 780m', 38],
]

export const CPUS: [string, number][] = [
  // Intel
  ['e8400', 18], ['q6600', 22], ['i5 750', 36], ['i7 860', 40], ['i7 920', 40],
  ['i3 2100', 35], ['i5 2400', 45], ['i5 2500', 47], ['i5 2500k', 50], ['i7 2600', 53], ['i7 2600k', 55], ['i7 2700k', 57],
  ['i3 3220', 38], ['i5 3470', 50], ['i5 3570', 52], ['i5 3570k', 54], ['i7 3770', 58], ['i7 3770k', 60],
  ['i3 4130', 42], ['i3 4160', 42], ['i3 4170', 43], ['i5 4430', 50], ['i5 4460', 52], ['i5 4590', 55], ['i5 4670', 56], ['i5 4670k', 58], ['i5 4690', 57], ['i5 4690k', 59],
  ['i7 4770', 64], ['i7 4770k', 66], ['i7 4790', 68], ['i7 4790k', 71],
  ['i3 6100', 50], ['i5 6400', 58], ['i5 6500', 62], ['i5 6600', 64], ['i5 6600k', 66], ['i7 6700', 74], ['i7 6700k', 78],
  ['i3 7100', 52], ['i5 7400', 62], ['i5 7500', 66], ['i5 7600', 68], ['i5 7600k', 72], ['i7 7700', 78], ['i7 7700k', 82],
  ['i3 8100', 60], ['i5 8400', 82], ['i5 8500', 84], ['i5 8600k', 88], ['i7 8700', 92], ['i7 8700k', 96],
  ['i3 9100', 63], ['i5 9400', 84], ['i5 9400f', 84], ['i5 9600k', 92], ['i7 9700', 100], ['i7 9700k', 102], ['i9 9900k', 108],
  ['i3 10100', 75], ['i5 10400', 92], ['i5 10400f', 92], ['i5 10600k', 100], ['i7 10700', 106], ['i7 10700k', 108], ['i9 10900k', 115],
  ['i5 11400', 108], ['i5 11400f', 108], ['i5 11600k', 115], ['i7 11700', 117], ['i7 11700k', 120], ['i9 11900k', 125],
  ['i3 12100', 108], ['i3 12100f', 108], ['i5 12400', 122], ['i5 12400f', 122], ['i5 12600k', 135], ['i7 12700', 142], ['i7 12700k', 145], ['i9 12900k', 155],
  ['i5 13400', 128], ['i5 13400f', 128], ['i5 13600k', 155], ['i7 13700', 162], ['i7 13700k', 168], ['i9 13900k', 178],
  ['i5 14400', 130], ['i5 14400f', 130], ['i5 14600k', 158], ['i7 14700', 166], ['i7 14700k', 172], ['i9 14900k', 182],
  ['ultra 5 245k', 150], ['ultra 7 265k', 165], ['ultra 9 285k', 175],
  // AMD
  ['fx 4300', 30], ['fx 6300', 36], ['fx 8320', 42], ['fx 8350', 45], ['fx 9590', 50], ['a10 7850k', 30], ['athlon 200ge', 40], ['athlon 3000g', 42],
  ['ryzen 3 1200', 55], ['ryzen 3 1300x', 60], ['ryzen 5 1400', 64], ['ryzen 5 1500x', 70], ['ryzen 5 1600', 75], ['ryzen 5 1600x', 78], ['ryzen 7 1700', 78], ['ryzen 7 1700x', 80], ['ryzen 7 1800x', 82],
  ['ryzen 3 2200g', 62], ['ryzen 5 2400g', 68], ['ryzen 5 2600', 85], ['ryzen 5 2600x', 88], ['ryzen 7 2700', 88], ['ryzen 7 2700x', 92],
  ['ryzen 3 3100', 82], ['ryzen 3 3300x', 92], ['ryzen 5 3400g', 72], ['ryzen 5 3500x', 92], ['ryzen 5 3600', 100], ['ryzen 5 3600x', 102], ['ryzen 7 3700x', 105], ['ryzen 7 3800x', 107], ['ryzen 9 3900x', 108], ['ryzen 9 3950x', 109],
  ['ryzen 5 5500', 105], ['ryzen 5 5600g', 110], ['ryzen 5 5600', 125], ['ryzen 5 5600x', 128], ['ryzen 7 5700g', 118], ['ryzen 7 5700x', 130], ['ryzen 7 5800x', 135],
  ['ryzen 5 5600x3d', 158], ['ryzen 7 5700x3d', 158], ['ryzen 7 5800x3d', 165], ['ryzen 9 5900x', 137], ['ryzen 9 5950x', 138],
  ['ryzen 5 7600', 150], ['ryzen 5 7600x', 155], ['ryzen 7 7700', 160], ['ryzen 7 7700x', 163], ['ryzen 7 7800x3d', 200], ['ryzen 9 7900x', 165], ['ryzen 9 7900x3d', 185], ['ryzen 9 7950x', 170], ['ryzen 9 7950x3d', 195],
  ['ryzen 5 9600x', 165], ['ryzen 7 9700x', 172], ['ryzen 7 9800x3d', 225], ['ryzen 9 9900x', 172], ['ryzen 9 9950x', 178], ['ryzen 9 9950x3d', 220],
]

/** Tira marcas e palavras genéricas: "AMD Radeon™ RX 6700 XT" -> "rx 6700 xt", "Intel Core i7-6700K" -> "i7 6700k". */
export function normalize(s: string): string {
  return ` ${s.toLowerCase()} `
    .replace(/[®™©]|\((r|tm)\)/g, ' ')
    .replace(/\b(nvidia|geforce|amd|ati|radeon(?! vii| 680m| 780m)|intel|core(?! ultra)|processor|graphics|series|cpu|gpu)\b/g, ' ')
    .replace(/[-,;:()]/g, ' ').replace(/\//g, ' / ')
    // "HD2600" -> "hd 2600", "9600GT" -> "9600 gt", "GTX970" -> "gtx 970"
    .replace(/\b(hd|gtx|gts|gt|rtx|rx|r9|r7)(\d)/g, '$1 $2').replace(/(\d)(gtx|gts|gt|ti|xt)\b/g, '$1 $2')
    .replace(/\s+/g, ' ').trim()
}

const index = (list: [string, number][]) => list.map(([k, v]) => ({ key: normalize(k), name: k, score: v })).sort((a, b) => b.key.length - a.key.length)
const GPU_INDEX = index(GPUS), CPU_INDEX = index(CPUS)

export interface Part { name: string; score: number }

/** Todos os modelos citados no texto (o mais específico ganha: "rtx 2060 super" antes de "rtx 2060"). */
function findAll(text: string, idx: ReturnType<typeof index>): Part[] {
  let t = ` ${normalize(text)} `; const out: Part[] = []
  for (const e of idx) {
    const at = t.indexOf(` ${e.key} `)
    if (at >= 0) { out.push({ name: display(e.name), score: e.score }); t = t.slice(0, at) + ' '.repeat(e.key.length + 2) + t.slice(at + e.key.length + 2) }
  }
  return out
}

/** "i7 6700k" -> "Core i7-6700K", "ryzen 5 1600" -> "Ryzen 5 1600", "rtx 2060 super" -> "RTX 2060 SUPER". */
export function display(key: string): string {
  let m = /^i(\d) (.+)$/.exec(key); if (m) return `Core i${m[1]}-${m[2].toUpperCase()}`
  m = /^(ryzen|ultra) (\d) (.+)$/.exec(key); if (m) return `${m[1] === 'ultra' ? 'Core Ultra' : 'Ryzen'} ${m[2]} ${m[3].toUpperCase()}`
  m = /^(arc|vega|radeon|iris|athlon) (.+)$/.exec(key); if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2].toUpperCase()}`
  return key.toUpperCase()
}

export const findGpus = (text: string) => findAll(text, GPU_INDEX)
export const findCpus = (text: string) => findAll(text, CPU_INDEX)
export const findGpu = (text: string): Part | null => findGpus(text)[0] ?? null
export const findCpu = (text: string): Part | null => findCpus(text)[0] ?? null
