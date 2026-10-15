/** Texto de um PDF. Comprovantes de banco costumam ter texto "de verdade"; se não tiver, devolve '' e o chamador cai no OCR. */
export async function pdfText(file: Blob): Promise<string> {
  // carregado só quando alguém anexa um PDF (a biblioteca é pesada)
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const out: string[] = []
  for (let p = 1; p <= Math.min(doc.numPages, 3); p++) {
    const content = await (await doc.getPage(p)).getTextContent()
    // agrupa por linha usando a posição vertical de cada pedaço de texto
    const rows = new Map<number, { x: number; s: string }[]>()
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue
      const y = Math.round(it.transform[5] / 3)
      rows.set(y, [...(rows.get(y) ?? []), { x: it.transform[4], s: it.str }])
    }
    ;[...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, r]) => out.push(r.sort((a, b) => a.x - b.x).map((c) => c.s).join(' ')))
  }
  return out.join('\n')
}

/** Primeira página do PDF como imagem, para o OCR quando o PDF é escaneado. */
export async function pdfToImage(file: Blob): Promise<Blob> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const page = await doc.getPage(1)
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvas, viewport }).promise
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('canvas vazio'))), 'image/png'))
}
