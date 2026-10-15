/** CNPJ com dígitos verificadores corretos? Um CNPJ lido errado quase nunca passa nesta conta. */
export function cnpjValid(cnpj: string) {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const dv = (len: number) => {
    let sum = 0, w = len - 7
    for (let i = 0; i < len; i++) { sum += +d[i] * w--; if (w < 2) w = 9 }
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === +d[12] && dv(13) === +d[13]
}

interface Readable {
  merchant: string
  cnpj: string | null
  date: string | null
  totalCents: number | null
  items: { totalCents: number }[]
}

/**
 * Sinais de que o OCR leu mal. Não pega todo erro (um total com um dígito trocado parece normal),
 * por isso a conferência continua obrigatória.
 */
export function doubts(p: Readable, now = Date.now()): string[] {
  const out: string[] = []
  if (!p.totalCents) out.push('Não encontrei o total.')
  if (!p.merchant.trim()) out.push('Não encontrei o nome da loja.')
  if (p.cnpj && !cnpjValid(p.cnpj)) out.push('O CNPJ lido parece incorreto.')
  if (!p.items.length) out.push('Não consegui ler os itens.')
  else if (p.totalCents && p.items.reduce((s, i) => s + i.totalCents, 0) !== p.totalCents)
    out.push('Os itens lidos não somam o total.')
  if (p.date) {
    const days = (now - new Date(`${p.date}T12:00:00`).getTime()) / 86_400_000
    if (days > 400 || days < -1) out.push('A data lida parece estranha.')
  } else out.push('Não encontrei a data.')
  return out
}
