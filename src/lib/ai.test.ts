import { describe, expect, it } from 'vitest'
import { docToDraft, type AIDoc } from './ai'

const base: AIDoc = {
  document_type: 'cupom_fiscal', merchant: 'E de Casa Supermercados', cnpj: '33.030.242/0006-91', date: '2026-10-13', time: '13:13:07',
  total: 39.95, category: 'Mercado', direction: null, counterparty: null, confidence: 'high',
  items: [
    { description: 'AGUA MIN STA CATAR.C/GAS', qty: 2, unit_price: 2.99, total_price: 5.98, category: 'Mercado' },
    { description: 'CIGARRO CHESTERFIELD TERRAS', qty: 2, unit_price: 12.5, total_price: 25, category: 'Bebida e cigarro' },
  ],
}

describe('docToDraft', () => {
  it('cupom: centavos, hora exata e item com categoria própria só quando difere da loja', () => {
    const d = docToDraft(base)
    expect(d).toMatchObject({ kind: 'out', merchant: 'E de Casa Supermercados', totalCents: 3995, category: 'Mercado', date: '2026-10-13' })
    expect(new Date(d.occurredAt).getSeconds()).toBe(7)
    expect(d.items[0]).toMatchObject({ unitCents: 299, totalCents: 598, category: undefined })
    expect(d.items[1].category).toBe('Bebida e cigarro')
  })

  it('Pix recebido vira Entrou, sem CNPJ', () => {
    const d = docToDraft({ ...base, document_type: 'comprovante_pix', merchant: null, cnpj: null, direction: 'in', counterparty: 'Carlos Lima', items: [], total: 150 })
    expect(d).toMatchObject({ kind: 'in', merchant: 'Pix de Carlos Lima', totalCents: 15000, cnpj: null })
  })

  it('transferência entre contas próprias fica fora das somas', () => {
    const d = docToDraft({ ...base, document_type: 'comprovante_pix', direction: 'own_transfer', items: [], total: 750 })
    expect(d.category).toBe('Transferência própria')
  })

  it('campos que a IA não leu viram valores seguros', () => {
    const d = docToDraft({ ...base, total: null, date: null, time: null, merchant: null, category: null, items: [] }, new Date('2026-10-15T11:00:00').getTime())
    expect(d).toMatchObject({ totalCents: 0, merchant: '', category: 'Outros', date: '2026-10-15' })
  })
})
