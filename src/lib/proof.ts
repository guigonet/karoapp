import type { Kind } from './categorize'
import { findDate, toCents } from './parser'

export interface ParsedProof {
  kind: Kind
  /** nome da outra pessoa (quem recebeu ou quem enviou) */
  who: string
  totalCents: number | null
  date: string | null
}

/** Texto parece comprovante/print de transferência, e não cupom fiscal? */
export const looksLikeProof = (text: string) =>
  /\bpix\b|comprovante de (transfer|pagamento)|transfer[eê]ncia/i.test(text) && !/NFC-?e|CUPOM FISCAL|DANFE/i.test(text)

// Primeira versão, escrita sem comprovantes reais: confira sempre na tela de conferência.
export function parseProof(raw: string): ParsedProof {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const received = /voc[eê] recebeu|pix recebido|transfer[eê]ncia recebida|recebido de/i.test(raw)
  const sent = /voc[eê] (enviou|pagou|transferiu)|pix enviado|transfer[eê]ncia (enviada|realizada)|pagamento realizado/i.test(raw)
  const kind: Kind = received && !sent ? 'in' : 'out'

  const amount = raw.match(/R\$\s*(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/)
  const totalCents = amount ? toCents(`${amount[1]},${amount[2]}`) : null

  // nome: "Para <nome>" / "De <nome>" na mesma linha, ou o rótulo sozinho e o nome na linha seguinte
  const label = kind === 'in' ? /^(de|origem|pagador|quem pagou)\b:?\s*(.*)$/i : /^(para|destino|favorecido|recebedor|quem recebeu)\b:?\s*(.*)$/i
  let who = ''
  for (let i = 0; i < lines.length && !who; i++) {
    const m = lines[i].match(label)
    if (!m) continue
    who = m[2].trim() || (lines[i + 1] && /[A-Za-zÀ-ÿ]{3}/.test(lines[i + 1]) ? lines[i + 1] : '')
    who = who.replace(/\s*(CPF|CNPJ|Ag[eê]ncia|Institui[cç][aã]o).*/i, '').trim()
  }
  return { kind, who, totalCents: Number.isFinite(totalCents) ? totalCents : null, date: findDate(raw) }
}
