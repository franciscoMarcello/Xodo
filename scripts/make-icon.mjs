// Gera build/icon.png (256x256) do Xodó: quadrado rosa arredondado com um coração branco e uma linha de batimento.
// Bordas suavizadas com 4x4 amostras por pixel. Uso: node scripts/make-icon.mjs
import fs from 'node:fs'
import zlib from 'node:zlib'

const size = 256, SS = 4
const BG = [240, 80, 110], HEART = [255, 255, 255]

/** Coração clássico: (x² + y² - 1)³ - x²·y³ <= 0, com y para cima. */
const inHeart = (x, y) => (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0
/** Linha de batimento (eletrocardiograma) cruzando o coração. */
const PULSE = [[-1.6, -0.05], [-0.55, -0.05], [-0.35, 0.35], [-0.12, -0.6], [0.12, 0.55], [0.3, -0.05], [1.6, -0.05]]
function nearPulse(x, y, w) {
  for (let i = 1; i < PULSE.length; i++) {
    const [ax, ay] = PULSE[i - 1], [bx, by] = PULSE[i]
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= w) return true
  }
  return false
}

/** Cor e cobertura de um ponto (fx, fy em 0..1). */
function sample(fx, fy) {
  const r = 0.2, cx = Math.min(Math.max(fx, r), 1 - r), cy = Math.min(Math.max(fy, r), 1 - r)
  if ((fx - cx) ** 2 + (fy - cy) ** 2 > r * r) return null // fora do quadrado arredondado
  const x = (fx - 0.5) * 3.0, y = (0.47 - fy) * 3.0 // coração centralizado, um pouco acima do meio
  return inHeart(x, y) && !nearPulse(x, y, 0.085) ? HEART : BG
}

const raw = Buffer.alloc((size * 4 + 1) * size)
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  let r = 0, g = 0, b = 0, a = 0
  for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
    const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size)
    if (c) { r += c[0]; g += c[1]; b += c[2]; a++ }
  }
  const i = y * (size * 4 + 1) + 1 + x * 4
  if (a) raw.set([Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round((255 * a) / (SS * SS))], i)
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (buf) => { let c = 0xffffffff; for (const v of buf) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr.set([8, 6, 0, 0, 0], 8) // 8 bits, RGBA

fs.mkdirSync('build', { recursive: true })
fs.writeFileSync('build/icon.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
console.log('build/icon.png criado')
