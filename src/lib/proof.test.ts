import { describe, expect, it } from 'vitest'
import { looksLikeProof, parseProof } from './proof'

// Textos inventados no formato típico; trocar por comprovantes reais assim que houver.
describe('parseProof', () => {
  it('Pix enviado', () => {
    const t = `Comprovante de Pix\nPix enviado\nValor\nR$ 150,00\nPara\nAna Souza\nCPF ***.123.456-**\n13/10/2026 - 14:02:11`
    expect(looksLikeProof(t)).toBe(true)
    expect(parseProof(t)).toEqual({ kind: 'out', who: 'Ana Souza', totalCents: 15000, date: '2026-10-13' })
  })
  it('Pix recebido', () => {
    const t = `Você recebeu um Pix\nR$ 1.200,50\nDe Carlos Lima\n05/10/2026`
    expect(parseProof(t)).toMatchObject({ kind: 'in', who: 'Carlos Lima', totalCents: 120050 })
  })
  it('cupom fiscal não é comprovante', () => expect(looksLikeProof('NFC-e CUPOM FISCAL\nFORMA DE PAGAMENTO PIX')).toBe(false))
})
