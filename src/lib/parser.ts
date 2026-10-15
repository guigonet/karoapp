import { matchCategory, type Category } from './categorize'

export interface ReceiptItem {
  /** categoria própria do item, se as regras reconhecerem (ex.: cigarro) */
  category?: Category
  description: string
  qty: number
  /** valores em centavos */
  unitCents: number
  totalCents: number
}

export interface ParsedReceipt {
  merchant: string
  cnpj: string | null
  /** chave de acesso de 44 dígitos, se aparecer impressa */
  nfceKey: string | null
  /** AAAA-MM-DD */
  date: string | null
  /** centavos */
  totalCents: number | null
  items: ReceiptItem[]
  category: Category
}

const MONEY = /(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})(?!\d)/g
const UNIT = '(?:UNID|UN|KG|L|PC|CX)'

export const toCents = (s: string) => {
  const m = s.match(/^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/)
  return m ? parseInt(m[1].replace(/\./g, '') + m[2], 10) : NaN
}

function findCnpj(text: string) {
  const m = text.match(/\b(\d{2})\.?(\d{3})\.?(\d{3})\/?(\d{4})-?(\d{2})\b/)
  return m ? `${m[1]}.${m[2]}.${m[3]}/${m[4]}-${m[5]}` : null
}

/** Chave de acesso impressa: 44 dígitos em grupos de 4 separados por espaço. */
function findKey(raw: string) {
  const m = raw.match(/(?<!\d)(?:\d{4} ?){10}\d{4}(?!\d)/)
  return m ? m[0].replace(/\s/g, '') : null
}

export function findDate(text: string) {
  for (const m of text.matchAll(/\b(\d{2})[/.-](\d{2})[/.-](\d{4}|\d{2})\b/g)) {
    const d = +m[1], mo = +m[2]
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100)
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return null
}

function lineMoney(line: string) {
  const vals = [...line.matchAll(MONEY)].map((m) => toCents(m[0]))
  if (vals.length) return vals[vals.length - 1]
  // OCR às vezes troca a vírgula por espaço ("39 95") na linha do total
  const m = line.match(/(\d{1,3}(?:\.\d{3})*|\d+)[ .](\d{2})\s*$/)
  return m ? parseInt(m[1].replace(/\./g, '') + m[2], 10) : null
}

function findTotal(lines: string[]) {
  const key = /(VALOR\s*TOTAL|TOTAL\s*(A\s*PAGAR|R\$|GERAL)|A\s*PAGAR)/i
  const skip = /(SUBTOTAL|DESCONTO|TROCO|TRIBUT|IMPOSTO|DINHEIRO|CART|ITENS|VALOR\s*PAG)/i
  const onlyMoney = /^[R$\s]*[\d.]+[,\s]\d{2}$/
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!key.test(lines[i]) || skip.test(lines[i])) continue
    const v = lineMoney(lines[i])
    if (v !== null) return v
    // valor impresso em coluna: na linha anterior ou seguinte
    for (const j of [i - 1, i + 1]) if (lines[j] && onlyMoney.test(lines[j])) return lineMoney(lines[j])
  }
  // plano B: maior valor do cupom
  const all = lines.flatMap((l) => [...l.matchAll(MONEY)].map((m) => toCents(m[0])))
  return all.length ? Math.max(...all) : null
}

/** Linha de item: "001 7891000100103 LEITE INTEGRAL 2 UN x 4,99 9,98" (e variações). */
function parseItem(line: string): ReceiptItem | null {
  if (/TOTAL|TROCO|DESCONTO|CNPJ|CPF|DINHEIRO|CART|TRIBUT|PIX|CREDITO|DEBITO|PAGAMENTO|PAGO|VOUCHER/i.test(line)) return null
  const prices = [...line.matchAll(MONEY)]
  if (!prices.length) return null
  const totalCents = toCents(prices[prices.length - 1][0])
  const unitCents = prices.length > 1 ? toCents(prices[prices.length - 2][0]) : totalCents
  // "2 UN x", "2 UNID" (sem x) ou "2 x"
  const qtyRe = new RegExp(`(\\d+(?:,\\d{1,3})?)\\s*(?:${UNIT}\\s*[xX*]?|[xX*])\\s*$`, 'i')
  const head = line.slice(0, prices[0].index)
  const qtyM = head.match(qtyRe)
  const qty = qtyM ? parseFloat(qtyM[1].replace(',', '.')) : 1
  const description = head
    .replace(qtyRe, '')
    .replace(/^\s*\d{1,3}\s+/, '')
    .replace(/\b\d{8,14}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (description.length < 3 || !/[A-Za-zÀ-ÿ]{3}/.test(description)) return null
  return { description, qty, unitCents, totalCents, category: matchCategory(description) ?? undefined }
}

const HEADER = /\b(QTDE?|UNIT|TOTAL|DESCRI[CÇ][AÃ]O|C[OÓ]DIGO|UNID|VALOR|DOCUMENTO|CONSUMIDOR|NOTA FISCAL|CUPOM)\b/i
const BIZ = /(LTDA|S\.?\s?A\b|EIRELI|\bME\b|EPP|SUPERMERCADO|MERCADO|POSTO|FARMACIA|DROGARIA|RESTAURANTE|PADARIA|LANCHONETE|ATACAD)/i

/** Nome da loja: linha do topo que parece nome de empresa. Se o OCR só trouxe lixo, devolve '' para a pessoa digitar. */
function findMerchant(lines: string[]) {
  const ok = (l: string) => {
    const letters = (l.match(/[A-Za-zÀ-ÿ]/g) ?? []).length
    return letters >= 6 && letters / l.length >= 0.6 && !HEADER.test(l) && !/^(CNPJ|CPF|IE\b|\W*\d)/i.test(l)
  }
  const head = lines.slice(0, 8).filter(ok)
  return head.find((l) => BIZ.test(l)) ?? head[0] ?? ''
}

export function parseReceipt(raw: string): ParsedReceipt {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const merchant = findMerchant(lines)
  const nfceKey = findKey(raw)
  const items = lines.map(parseItem).filter((i): i is ReceiptItem => !!i)
  return {
    merchant,
    nfceKey,
    cnpj: findCnpj(raw) ?? (nfceKey ? findCnpj(nfceKey.slice(6, 20)) : null),
    date: findDate(raw),
    totalCents: findTotal(lines),
    items,
    // a loja define a categoria da nota; os itens (ex.: cigarro) guardam a própria
    category: matchCategory(merchant) ?? items.map((i) => i.category).find(Boolean) ?? 'Outros',
  }
}

export const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
