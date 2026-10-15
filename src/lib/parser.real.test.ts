import { describe, expect, it } from 'vitest'
import { parseReceipt } from './parser'

// Cupom real (SC, 13/10/2026): itens no formato "2 UNID 2,99 5,98", sem "x".
const LIMPO = `E DE CASA SUPERMERCADOS LTDA - ARIRIU
CNPJ: 33.030.242/0006-91 IE: 262343258
AVENIDA BOM JESUS DE NAZARE, SN, ARIRIU, PALHOCA, SC
DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR ELETRONICA
CODIGO DESCRICAO QTDE UN UNIT TOTAL
7896567400185 AGUA MIN STA CATAR.C/GAS 2 UNID 2,99 5,98
7891000247648 BISC NESTLE COOKIE GOTAS CHO 3 UNID 2,99 8,97
78947214 CIGARRO CHESTERFIELD TERRAS 2 UNID 12,50 25,00
QUANTIDADE TOTAL DE ITENS 3
VALOR TOTAL R$ 39,95
FORMA DE PAGAMENTO VALOR PAGO R$
PIX 39,95
4226 1033 0302 4200 0691 6500 5000 2501 6810 6610 1053
Emissao: 13/10/2026 13:13:07`

// Saída bruta do Tesseract na foto torta: valor do total em linha separada, lixo no meio.
const RUIDO = `DE UM UNIT TOTAL
—— DESCRICÃO é carr C/GAS h 2 UNO 2,99 5/38
67400185 AGUA WIN SN o TE oras CHO — 3 UNID 2,27 2:20
1000247608 BISC NESTLE CONRTE TERRAS — 2 UNIO 12,50 25,00
QUANTIDADE TOTAL DE ITENS ã é
- 39,95
VALOR TOTAL R$ paão Rs
a DE PAGAMENTO VALOR PASSOS
4226 1033 0302 4200 0691 6500 5000 2501 6810 6610 1053
Enissao: 13/10/2026 13:13:07
VENDA PIX COXHPRA-==
VALOR TOTAL R$ 39 95`

describe('cupom real E DE CASA', () => {
  it('lê o cupom limpo', () => {
    const r = parseReceipt(LIMPO)
    expect(r.merchant).toBe('E DE CASA SUPERMERCADOS LTDA - ARIRIU')
    expect(r.cnpj).toBe('33.030.242/0006-91')
    expect(r.date).toBe('2026-10-13')
    expect(r.totalCents).toBe(3995)
    expect(r.category).toBe('Mercado')
    expect(r.nfceKey).toBe('42261033030242000691650050002501681066101053')
    expect(r.items.map((i) => [i.description, i.qty, i.unitCents, i.totalCents])).toEqual([
      ['AGUA MIN STA CATAR.C/GAS', 2, 299, 598],
      ['BISC NESTLE COOKIE GOTAS CHO', 3, 299, 897],
      ['CIGARRO CHESTERFIELD TERRAS', 2, 1250, 2500],
    ])
  })

  it('aguenta o ruído do OCR: total, data e chave', () => {
    const r = parseReceipt(RUIDO)
    expect(r.totalCents).toBe(3995)
    expect(r.date).toBe('2026-10-13')
    expect(r.nfceKey).toHaveLength(44)
    expect(r.cnpj).toBe('33.030.242/0006-91')
  })
})
