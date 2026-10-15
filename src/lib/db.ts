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

class KaroDB extends Dexie {
  receipts!: Table<Receipt, number>
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
  }
}

export const db = new KaroDB()

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
