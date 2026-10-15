import { describe, expect, it } from 'vitest'
import { cnpjValid, doubts } from './doubt'

const NOW = new Date('2026-10-15T12:00:00').getTime()
const ok = { merchant: 'E de Casa Supermercados', cnpj: '33.030.242/0006-91', date: '2026-10-13', totalCents: 3995, items: [{ totalCents: 598 }, { totalCents: 897 }, { totalCents: 2500 }] }

describe('cnpjValid', () => {
  it('aceita o CNPJ do cupom real e recusa um dígito trocado', () => {
    expect(cnpjValid('33.030.242/0006-91')).toBe(true)
    expect(cnpjValid('33.030.242/0006-81')).toBe(false)
    expect(cnpjValid('11.111.111/1111-11')).toBe(false)
  })
})

describe('doubts', () => {
  it('leitura boa não gera aviso', () => expect(doubts(ok, NOW)).toEqual([]))

  it('o caso real do celular: 2 de 3 itens, total certo', () => {
    const r = doubts({ ...ok, items: [{ totalCents: 299 }, { totalCents: 2500 }] }, NOW)
    expect(r).toContain('Os itens lidos não somam o total.')
  })

  it('pega loja vazia, total ausente e data estranha', () => {
    const r = doubts({ merchant: '', cnpj: null, date: '2019-01-01', totalCents: null, items: [] }, NOW)
    expect(r).toEqual(expect.arrayContaining(['Não encontrei o total.', 'Não encontrei o nome da loja.', 'A data lida parece estranha.']))
  })
})
