import jsQR from 'jsqr'

export interface NfceKey {
  key: string
  uf: string
  /** AAAA-MM */
  month: string
  cnpj: string
  number: string
  url: string | null
}

const UF: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO', '21': 'MA', '22': 'PI',
  '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES',
  '33': 'RJ', '35': 'SP', '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
}

/** Chave de acesso: UF(2) AAMM(4) CNPJ(14) modelo(2) série(3) número(9) ... = 44 dígitos. */
export function parseNfceQr(content: string): NfceKey | null {
  const m = content.match(/(?<!\d)\d{44}(?!\d)/)
  if (!m) return null
  const key = m[0]
  return {
    key,
    uf: UF[key.slice(0, 2)] ?? key.slice(0, 2),
    month: `20${key.slice(2, 4)}-${key.slice(4, 6)}`,
    cnpj: key.slice(6, 20),
    number: String(+key.slice(25, 34)),
    url: /^https?:\/\//i.test(content) ? content : null,
  }
}

export async function scanQr(file: Blob): Promise<NfceKey | null> {
  const bmp = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const code = jsQR(img.data, img.width, img.height)
  return code ? parseNfceQr(code.data) : null
}
