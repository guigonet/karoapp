// Gera o ícone do KaRo: moeda 8-bit amarela com as letras K e R.
// Uso: npm run icons  ->  public/icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png
import { deflateSync, crc32 } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const N = 16
const C = {
  edge: [120, 53, 15],
  rim: [245, 158, 11],
  fill: [252, 211, 77],
  shine: [254, 243, 199],
  letter: [120, 53, 15],
  shadow: [217, 119, 6],
}
const K = ['X.X', 'X.X', 'XX.', 'X.X', 'X.X']
const R = ['XX.', 'X.X', 'XX.', 'X.X', 'X.X']

function buildGrid() {
  const dist = (x, y) => Math.hypot(x - 7.5, y - 7.5)
  const inside = (x, y) => dist(x, y) <= 7.7
  const g = Array.from({ length: N }, () => Array(N).fill(null))
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!inside(x, y)) continue
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)
      g[y][x] = edge ? C.edge : dist(x, y) > 6.0 ? C.rim : C.fill
    }
  for (const [x, y] of [[3, 4], [4, 3], [3, 5]]) g[y][x] = C.shine
  const put = (glyph, ox, oy, col) =>
    glyph.forEach((row, j) =>
      [...row].forEach((ch, i) => { if (ch === 'X') g[oy + j][ox + i] = col }))
  put(K, 4, 5, C.letter); put(R, 9, 5, C.letter)
  return g
}

function raster(size, scale, bg) {
  const g = buildGrid()
  const px = Math.floor((size * scale) / N)
  const off = Math.floor((size - px * N) / 2)
  const data = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - off) / px), gy = Math.floor((y - off) / px)
      const c = gx >= 0 && gy >= 0 && gx < N && gy < N ? g[gy][gx] : null
      const o = (y * size + x) * 4
      const col = c ?? bg
      if (col) { data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255 }
    }
  return png(size, data)
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length)
    const td = Buffer.concat([Buffer.from(type), body])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

function svg() {
  const g = buildGrid()
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
  let r = ''
  g.forEach((row, y) => row.forEach((c, x) => { if (c) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${hex(c)}"/>` }))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">${r}</svg>\n`
}

mkdirSync('public', { recursive: true })
writeFileSync('public/icon.svg', svg())
writeFileSync('public/icon-192.png', raster(192, 1, null))
writeFileSync('public/icon-512.png', raster(512, 1, null))
writeFileSync('public/icon-maskable-512.png', raster(512, 0.62, [30, 27, 75]))
writeFileSync('public/apple-touch-icon.png', raster(180, 0.8, [30, 27, 75]))
console.log('ícones gerados em public/')
