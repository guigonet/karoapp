import { createWorker, PSM } from 'tesseract.js'

/**
 * Prepara a foto para o OCR: escala de cinza, contraste e nitidez em ~2400px de largura.
 * (Testado numa foto real de cupom: com nitidez + modo de coluna única o OCR passou de 3 para 6 acertos em 12 campos.)
 */
export async function preprocess(file: Blob, targetWidth = 2400): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(2, targetWidth / bmp.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * k)
  canvas.height = Math.round(bmp.height * k)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  const n = canvas.width * canvas.height
  const g = new Float32Array(n)
  let min = 255, max = 0
  for (let i = 0; i < n; i++) {
    const v = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000
    g[i] = v
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = Math.max(1, max - min)
  for (let i = 0; i < n; i++) g[i] = ((g[i] - min) / range) * 255
  // nitidez 3x3
  const W = canvas.width, H = canvas.height
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      let v = g[i]
      if (x > 0 && y > 0 && x < W - 1 && y < H - 1) v = 5 * g[i] - g[i - 1] - g[i + 1] - g[i - W] - g[i + W]
      const o = i * 4
      d[o] = d[o + 1] = d[o + 2] = v < 0 ? 0 : v > 255 ? 255 : v
    }
  ctx.putImageData(img, 0, 0)
  return canvas
}

export async function readText(file: Blob, onProgress?: (p: number) => void): Promise<string> {
  const canvas = await preprocess(file)
  const worker = await createWorker('por', 1, {
    logger: (m) => m.status === 'recognizing text' && onProgress?.(m.progress),
  })
  try {
    // cupom é uma coluna de texto: o modo "coluna única" erra menos que o automático
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN, preserve_interword_spaces: '1' })
    const { data } = await worker.recognize(canvas)
    return data.text
  } finally {
    await worker.terminate()
  }
}
