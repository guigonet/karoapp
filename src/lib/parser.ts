import { categorize, type Category } from './categorize'

export interface ReceiptItem {
  description: string
  qty: number
  /** valores em centavos */
  unitCents: number
  totalCents: number
}

export interface ParsedReceipt {
  merchant: string
  cnpj: string | null
  /** AAAA-MM-DD */
  date: string | null
  /** centavos */
  totalCents: number | null
  items: ReceiptItem[]
  category: Category
}

const MONEY = /(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})(?!\d)/g
const UNIT = '(?:UN|KG|L|PC|CX)'

export const toCents = (s: string) => {
  const m = s.match(/^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/)
  return m ? parseInt(m[1].replace(/\./g, '') + m[2], 10) : NaN
}

function findCnpj(text: string) {
  const m = text.match(/\b(\d{2})\.?(\d{3})\.?(\d{3})\/?(\d{4})-?(\d{2})\b/)
  return m ? `${m[1]}.${m[2]}.${m[3]}/${m[4]}-${m[5]}` : null
}

function findDate(text: string) {
  for (const m of text.matchAll(/\b(\d{2})[/.-](\d{2})[/.-](\d{4}|\d{2})\b/g)) {
    const d = +m[1], mo = +m[2]
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100)
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return null
}

function findTotal(lines: string[]) {
  const key = /(VALOR\s*TOTAL|TOTAL\s*(A\s*PAGAR|R\$|GERAL)?|A\s*PAGAR)/i
  const skip = /(SUBTOTAL|DESCONTO|TROCO|TRIBUT|IMPOSTO|DINHEIRO|CART)/i
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!key.test(lines[i]) || skip.test(lines[i])) continue
    const vals = [...lines[i].matchAll(MONEY)].map((m) => toCents(m[0]))
    if (vals.length) return vals[vals.length - 1]
  }
  // plano B: maior valor do cupom
  const all = lines.flatMap((l) => [...l.matchAll(MONEY)].map((m) => toCents(m[0])))
  return all.length ? Math.max(...all) : null
}

/** Linha de item: "001 7891000100103 LEITE INTEGRAL 2 UN x 4,99 9,98" (e variações). */
function parseItem(line: string): ReceiptItem | null {
  if (/TOTAL|TROCO|DESCONTO|CNPJ|CPF|DINHEIRO|CART|TRIBUT/i.test(line)) return null
  const prices = [...line.matchAll(MONEY)]
  if (!prices.length) return null
  const totalCents = toCents(prices[prices.length - 1][0])
  const unitCents = prices.length > 1 ? toCents(prices[prices.length - 2][0]) : totalCents
  const qtyRe = new RegExp(`(\\d+(?:,\\d{1,3})?)\\s*${UNIT}?\\s*[xX*]\\s*$`, 'i')
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
  return { description, qty, unitCents, totalCents }
}

export function parseReceipt(raw: string): ParsedReceipt {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const merchant = lines.find((l) => /[A-Za-zÀ-ÿ]{4}/.test(l) && !/^(CNPJ|CPF|DOCUMENTO|NFC)/i.test(l)) ?? ''
  const items = lines.map(parseItem).filter((i): i is ReceiptItem => !!i)
  return {
    merchant,
    cnpj: findCnpj(raw),
    date: findDate(raw),
    totalCents: findTotal(lines),
    items,
    category: categorize(`${merchant} ${items.map((i) => i.description).join(' ')}`),
  }
}

export const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
