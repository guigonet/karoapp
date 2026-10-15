import Dexie, { type Table } from 'dexie'
import type { Category } from './categorize'
import type { ReceiptItem } from './parser'

export interface Receipt {
  id?: number
  merchant: string
  cnpj: string | null
  /** AAAA-MM-DD */
  date: string
  totalCents: number
  category: Category
  items: ReceiptItem[]
  /** chave de acesso da NFC-e, se o QR foi lido (evita duplicar nota) */
  nfceKey?: string
  createdAt: number
}

class KaroDB extends Dexie {
  receipts!: Table<Receipt, number>
  constructor() {
    super('karo')
    this.version(1).stores({ receipts: '++id, date, category, nfceKey' })
  }
}

export const db = new KaroDB()
