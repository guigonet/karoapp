import type { Receipt, Rule } from './db'

/**
 * Backup em arquivo .json: os lançamentos e as categorias que o app aprendeu.
 * Não inclui senha da IA, aceite de privacidade nem a foto dos cupons (o KaRo não guarda fotos).
 */
export interface Backup {
  app: 'karo'
  version: 1
  exportedAt: number
  receipts: Receipt[]
  rules: Rule[]
}

export function buildBackup(receipts: Receipt[], rules: Rule[], now = Date.now()): Backup {
  // o id é do banco deste aparelho; ao importar, cada aparelho gera os seus
  return { app: 'karo', version: 1, exportedAt: now, receipts: receipts.map(({ id: _id, ...r }) => r), rules }
}

export const backupFileName = (now = Date.now()) => {
  const d = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  return `karo-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

function validReceipt(r: unknown): r is Receipt {
  if (!r || typeof r !== 'object') return false
  const x = r as Record<string, unknown>
  return (
    (x.kind === 'in' || x.kind === 'out') &&
    isStr(x.merchant) &&
    isStr(x.category) && x.category.length > 0 &&
    isStr(x.date) && /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
    isNum(x.occurredAt) &&
    isNum(x.totalCents) && x.totalCents >= 0 &&
    Array.isArray(x.items)
  )
}

const validRule = (r: unknown): r is Rule =>
  !!r && typeof r === 'object' && isStr((r as Rule).key) && isStr((r as Rule).category) && isNum((r as Rule).updatedAt)

/** Lê e valida o arquivo. Erro em português se não for um backup do KaRo; lançamentos inválidos são descartados e contados. */
export function parseBackup(text: string): { receipts: Receipt[]; rules: Rule[]; skipped: number } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Este arquivo não é um backup do KaRo.')
  }
  const b = data as Partial<Backup> | null
  if (!b || b.app !== 'karo' || !Array.isArray(b.receipts)) throw new Error('Este arquivo não é um backup do KaRo.')
  if (b.version !== 1) throw new Error('Este backup é de uma versão do KaRo que este aparelho não conhece.')
  const receipts = b.receipts.filter(validReceipt)
  const rules = (Array.isArray(b.rules) ? b.rules : []).filter(validRule)
  return { receipts, rules, skipped: b.receipts.length - receipts.length }
}

/** Mesma nota (pela chave de 44 dígitos) ou mesmo lançamento (momento, valor e nome iguais). */
export const sameEntry = (a: Receipt, b: Receipt) =>
  (!!a.nfceKey && a.nfceKey === b.nfceKey) ||
  (a.occurredAt === b.occurredAt && a.totalCents === b.totalCents && a.merchant === b.merchant && a.kind === b.kind)

/** O que do arquivo ainda não está no aparelho. Importar duas vezes não duplica nada. */
export const newOnes = (existing: Receipt[], incoming: Receipt[]) =>
  incoming.filter((i, idx) => !existing.some((e) => sameEntry(e, i)) && !incoming.slice(0, idx).some((e) => sameEntry(e, i)))
