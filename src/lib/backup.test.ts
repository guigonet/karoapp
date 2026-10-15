import { describe, expect, it } from 'vitest'
import { backupFileName, buildBackup, newOnes, parseBackup } from './backup'
import type { Receipt } from './db'

const r = (over: Partial<Receipt> = {}): Receipt => ({
  id: 7, kind: 'out', merchant: 'E de Casa Supermercados', cnpj: '33.030.242/0006-91', date: '2026-10-13',
  occurredAt: 1_760_000_000_000, totalCents: 3995, category: 'Mercado', items: [], createdAt: 1, ...over,
})

describe('backup', () => {
  it('exporta sem o id do banco e importa de volta igual', () => {
    const b = buildBackup([r()], [{ key: 'cnpj:33030242000691', category: 'Mercado', updatedAt: 5 }], 99)
    expect(b.receipts[0]).not.toHaveProperty('id')
    const back = parseBackup(JSON.stringify(b))
    expect(back.receipts).toHaveLength(1)
    expect(back.receipts[0]).toMatchObject({ merchant: 'E de Casa Supermercados', totalCents: 3995 })
    expect(back.rules).toHaveLength(1)
    expect(back.skipped).toBe(0)
  })

  it('recusa arquivo que não é do KaRo, com mensagem clara', () => {
    expect(() => parseBackup('isso não é json')).toThrow('não é um backup do KaRo')
    expect(() => parseBackup('{"app":"outro","receipts":[]}')).toThrow('não é um backup do KaRo')
    expect(() => parseBackup('{"app":"karo","version":9,"receipts":[]}')).toThrow('versão')
  })

  it('descarta lançamentos inválidos e conta quantos', () => {
    const text = JSON.stringify({ app: 'karo', version: 1, exportedAt: 1, rules: [], receipts: [r(), { kind: 'out' }, r({ totalCents: -5 })] })
    const out = parseBackup(text)
    expect(out.receipts).toHaveLength(1)
    expect(out.skipped).toBe(2)
  })

  it('importar duas vezes não duplica (mesmo momento+valor+nome, ou mesma chave de nota)', () => {
    const existing = [r({ id: 1 })]
    expect(newOnes(existing, [r({ id: undefined })])).toHaveLength(0)
    expect(newOnes(existing, [r({ occurredAt: 1, nfceKey: 'k' }), r({ occurredAt: 2, nfceKey: 'k' })])).toHaveLength(1)
    expect(newOnes([r({ nfceKey: 'k' })], [r({ occurredAt: 9, nfceKey: 'k' })])).toHaveLength(0)
    expect(newOnes(existing, [r({ occurredAt: 3 })])).toHaveLength(1)
  })

  it('nome do arquivo com a data', () => expect(backupFileName(new Date(2026, 9, 15, 12).getTime())).toBe('karo-backup-2026-10-15.json'))
})
