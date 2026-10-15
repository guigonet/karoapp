import Dexie, { type Table } from 'dexie'
import type { Category, Kind } from './categorize'
import type { ReceiptItem } from './parser'

export interface Receipt {
  id?: number
  /** 'in' = entrou dinheiro, 'out' = gastei */
  kind: Kind
  merchant: string
  cnpj: string | null
  /** AAAA-MM-DD (dia local) */
  date: string
  /** momento exato do lançamento (ms), com hora, minuto e segundo */
  occurredAt: number
  totalCents: number
  category: Category
  items: ReceiptItem[]
  /** chave de acesso da NFC-e, se lida (evita duplicar nota) */
  nfceKey?: string
  /** só guardado se a pessoa ativar "guardar local" */
  location?: { lat: number; lng: number; accuracy: number }
  createdAt: number
}

/** O que o app aprendeu: esta loja (CNPJ, ou nome se não houver) é desta categoria. */
export interface Rule {
  key: string
  category: Category
  updatedAt: number
}

class KaroDB extends Dexie {
  receipts!: Table<Receipt, number>
  rules!: Table<Rule, string>
  constructor() {
    super('karo')
    this.version(1).stores({ receipts: '++id, date, category, nfceKey' })
    this.version(2)
      .stores({ receipts: '++id, date, category, nfceKey, occurredAt, kind' })
      .upgrade((tx) =>
        tx.table('receipts').toCollection().modify((r) => {
          r.kind ??= 'out'
          r.occurredAt ??= r.createdAt ?? Date.now()
        }))
    this.version(3).stores({ receipts: '++id, date, category, nfceKey, occurredAt, kind', rules: 'key' })
  }
}

export const db = new KaroDB()

export const ruleKey = (cnpj: string | null, merchant: string) => {
  const digits = cnpj?.replace(/\D/g, '')
  if (digits && digits.length === 14) return `cnpj:${digits}`
  const name = merchant.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  return name.length >= 4 ? `nome:${name}` : null
}

/** Categoria que a pessoa já escolheu para esta loja, se houver. */
export async function findRule(cnpj: string | null, merchant: string): Promise<Category | null> {
  for (const k of [ruleKey(cnpj, ''), ruleKey(null, merchant)]) {
    const r = k ? await db.rules.get(k) : undefined
    if (r) return r.category
  }
  return null
}

/** Guarda a escolha da pessoa. "Outros" não é escolha, é a falta dela, então não ensina nada. */
export async function learnRule(cnpj: string | null, merchant: string, category: Category) {
  if (category === 'Outros' || category === 'Transferência própria') return
  for (const k of [ruleKey(cnpj, ''), ruleKey(null, merchant)])
    if (k) await db.rules.put({ key: k, category, updatedAt: Date.now() })
}

export const localDate = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Pede a posição ao navegador sem travar o salvamento. */
export function getLocation(): Promise<Receipt['location'] | undefined> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(undefined)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(undefined),
      { timeout: 6000, maximumAge: 60000 },
    )
  })
}
