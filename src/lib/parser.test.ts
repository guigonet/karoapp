import { describe, expect, it } from 'vitest'
import { parseReceipt, toCents } from './parser'

const CUPOM = `SUPERMERCADO BOM PRECO LTDA
CNPJ: 12.345.678/0001-90
Rua das Flores, 100 - Florianopolis SC
CUPOM FISCAL ELETRONICO - NFC-e
12/03/2025 18:42:10
001 7891000100103 LEITE INTEGRAL 1L 2 UN x 4,99 9,98
002 7891234567895 ARROZ TIPO 1 5KG 1 UN x 27,90 27,90
003 0000000001234 BANANA PRATA KG 0,850 KG x 6,99 5,94
SUBTOTAL 43,82
DESCONTO 1,82
VALOR TOTAL R$ 42,00
DINHEIRO 50,00
TROCO 8,00`

describe('parseReceipt', () => {
  const r = parseReceipt(CUPOM)
  it('lê loja, CNPJ e data', () => {
    expect(r.merchant).toBe('SUPERMERCADO BOM PRECO LTDA')
    expect(r.cnpj).toBe('12.345.678/0001-90')
    expect(r.date).toBe('2025-03-12')
  })
  it('usa VALOR TOTAL e não subtotal/troco', () => expect(r.totalCents).toBe(4200))
  it('extrai itens com quantidade', () => {
    expect(r.items).toHaveLength(3)
    expect(r.items[0]).toMatchObject({ description: 'LEITE INTEGRAL 1L', qty: 2, unitCents: 499, totalCents: 998 })
    expect(r.items[2].qty).toBeCloseTo(0.85)
  })
  it('categoriza por regras', () => expect(r.category).toBe('Mercado'))
  it('toCents lida com milhar', () => expect(toCents('1.234,56')).toBe(123456))
})
