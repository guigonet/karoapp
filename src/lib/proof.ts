import type { Kind } from './categorize'
import { toCents } from './parser'

export interface ParsedProof {
  kind: Kind
  /** nome da outra pessoa (quem recebeu, ou quem enviou se foi dinheiro recebido) */
  who: string
  totalCents: number | null
  /** AAAA-MM-DD */
  date: string | null
  /** momento da transação (ms), se o comprovante trouxer a hora */
  occurredAt: number | null
  /** origem e destino são a mesma pessoa: movimentação entre contas dela, não é gasto nem ganho */
  ownTransfer: boolean
}

// A palavra "Pix" sozinha não basta: todo cupom pago no Pix a tem em "FORMA DE PAGAMENTO".
const PROOF_MARKERS = /comprovante\s+de\s+(transfer|pagamento|pix)|pix\s+(enviado|recebido)|voc[eê]\s+(enviou|recebeu|pagou|transferiu)|transfer[eê]ncia\s+(enviada|recebida|realizada)|dados\s+de\s+quem\s+(recebeu|pagou)/i
const RECEIPT_MARKERS = /NFC-?e|CUPOM\s+FISCAL|DANFE|NOTA\s+FISCAL|DOCUMENTO\s+AUXILIAR|CONSUMIDOR|CHAVE\s+DE\s+ACESSO/i

/** Texto parece comprovante/print de transferência, e não cupom fiscal? */
export const looksLikeProof = (text: string) => PROOF_MARKERS.test(text) && !RECEIPT_MARKERS.test(text)

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const TIME = '(?:\\s*[-–]?\\s*(\\d{2}):(\\d{2})(?::(\\d{2}))?)?'
const DT_NUM = new RegExp(`(\\d{2})[/.-](\\d{2})[/.-](\\d{4})${TIME}`, 'g')
const DT_MON = new RegExp(`(\\d{1,2})\\s+(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{4})${TIME}`, 'gi')

interface Moment { date: string; at: number | null; line: string }

function moments(lines: string[]): Moment[] {
  const out: Moment[] = []
  for (const line of lines) {
    const push = (d: number, mo: number, y: number, h?: string, mi?: string, s?: string) => {
      if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 2000 || y > 2100) return
      const date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const at = h ? new Date(y, mo - 1, d, +h, +mi!, +(s ?? 0)).getTime() : null
      out.push({ date, at, line })
    }
    for (const m of line.matchAll(DT_NUM)) push(+m[1], +m[2], +m[3], m[4], m[5], m[6])
    for (const m of line.matchAll(DT_MON)) push(+m[1], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[3], m[4], m[5], m[6])
  }
  return out
}

const small = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
const clean = (s: string) => {
  const t = s.replace(/\s*(CPF|CNPJ)\b.*/i, '').replace(/[\s\d.*•\-/+»]+$/, '').trim()
  if (t !== t.toUpperCase() && t !== t.toLowerCase()) return t
  return t.toLowerCase().split(/\s+/).map((w, i) => (i && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const DEST = /^(destino|dados de quem recebeu|quem recebeu|favorecido|recebedor|para)\s*:?$/i
const ORIG = /^(origem|dados de quem pagou|quem pagou|pagador|de)\s*:?$/i
const OTHER_HEAD = /^(dados d[oa]s? |autentica|telefones)/i
const LABEL = /^(nome|cpf|cnpj|institui|ag[eê]ncia|conta|tipo|valor|id\b|identificador|n[uú]mero|chave|data)/i
const hasName = (s: string | undefined) => !!s && /[A-Za-zÀ-ÿ]{3}/.test(s) && !LABEL.test(s)

/** Nomes de destino e origem, lendo as seções "Destino"/"Dados de quem recebeu" etc. */
function parties(lines: string[]) {
  const names: { dest?: string; orig?: string } = {}
  let section: 'dest' | 'orig' | null = null
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (DEST.test(l)) { section = 'dest'; if (!names.dest && hasName(lines[i + 1])) names.dest = lines[i + 1]; continue }
    if (ORIG.test(l)) { section = 'orig'; if (!names.orig && hasName(lines[i + 1])) names.orig = lines[i + 1]; continue }
    if (OTHER_HEAD.test(l)) { section = null; continue }
    const nome = l.match(/^nome\b:?\s*(.*)$/i)
    if (nome && section && !names[section]) names[section] = nome[1].trim() || lines[i + 1]
    // forma curta: "Para Ana Souza" / "De Carlos Lima"
    const short = l.match(/^(para|de)\s+([^\d]{3,40})$/i)
    if (short && short[2].split(/\s+/).length <= 5) names[short[1].toLowerCase() === 'para' ? 'dest' : 'orig'] ??= short[2]
  }
  return { dest: names.dest ? clean(names.dest) : '', orig: names.orig ? clean(names.orig) : '' }
}

export function parseProof(raw: string): ParsedProof {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const received = /voc[eê] recebeu|pix recebido|transfer[eê]ncia recebida|recebido de/i.test(raw)
  const sent = /voc[eê] (enviou|pagou|transferiu)|pix enviado|transfer[eê]ncia (enviada|realizada)|pagamento realizado/i.test(raw)
  const kind: Kind = received && !sent ? 'in' : 'out'

  const amount = raw.match(/R\$\s*(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/)
  const cents = amount ? toCents(`${amount[1]},${amount[2]}`) : NaN

  const { dest, orig } = parties(lines)
  const ms = moments(lines)
  // se houver mais de um horário (emissão do comprovante x débito), vale o da transação
  const when = ms.find((m) => /d[eé]bito|efetiva|realiza|cr[eé]dito/i.test(m.line)) ?? ms[0]

  return {
    kind,
    who: kind === 'in' ? orig : dest,
    totalCents: Number.isFinite(cents) ? cents : null,
    date: when?.date ?? null,
    occurredAt: when?.at ?? null,
    ownTransfer: !!dest && !!orig && norm(dest) === norm(orig),
  }
}
