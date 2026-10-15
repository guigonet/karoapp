import { describe, expect, it } from 'vitest'
import { looksLikeProof, parseProof } from './proof'

// PDF real do Bradesco (texto extraído)
const BRADESCO = `Comprovante de pagamento Pix
15/10/2026 - 11:01:57
Valor: R$ 6,00
Dados de quem recebeu
Nome: LUCIANO SANTOS MACHADO
CPF/CNPJ: ***.903.350-**
Instituição: CAIXA ECONOMICA FEDERAL
Dados do pagamento
Tipo: Pix
Valor: R$ 6,00
Identificador: ***
Data do débito: 15/10/2026 - 09:02:18
Número de controle: E60746948202610151202A2304GwlN0k
Dados de quem pagou
Nome: RODRIGO BRITO DE OLIVEIRA
CPF: ***.388.498-**
Esta transação foi feita via App Bradesco`

// Saída do OCR no print real do Nubank (transferência entre contas da mesma pessoa)
const NUBANK = `Comprovante de
transferência
09 OUT 2026 - 15:06:10
Valor R$750,00
Tipo de transferência Pix
Destino
Nome Rodrigo Brito de Oliveira
CPF +» 388.498 ---
Instituição BCO BRADESCO S.A.
Origem
Nome RODRIGO BRITO DE OLIVEIRA
29338849848
Instituição NU PAGAMENTOS - IP
Nu Pagamentos S.A. - Instituição de
Pagamento
CNPJ 18.236.120/0001-58`

describe('parseProof', () => {
  it('Bradesco: Pix pago a outra pessoa', () => {
    expect(looksLikeProof(BRADESCO)).toBe(true)
    const r = parseProof(BRADESCO)
    expect(r).toMatchObject({ kind: 'out', who: 'Luciano Santos Machado', totalCents: 600, date: '2026-10-15', ownTransfer: false })
    // vale a hora do débito (09:02:18), não a da emissão do comprovante
    expect(new Date(r.occurredAt!).getHours()).toBe(9)
    expect(new Date(r.occurredAt!).getSeconds()).toBe(18)
  })

  it('Nubank: data por extenso e transferência entre contas próprias', () => {
    expect(looksLikeProof(NUBANK)).toBe(true)
    const r = parseProof(NUBANK)
    expect(r).toMatchObject({ totalCents: 75000, date: '2026-10-09', ownTransfer: true })
    expect(new Date(r.occurredAt!).getMinutes()).toBe(6)
  })

  it('Nubank de 15/10: valor, hora do Pix e transferência própria (print real)', () => {
    const t = `Comprovante de\ntransferência\n15 OUT 2026 - 16:10:04\nValor R$ 20,00\nTipo de transferência Pix\nDestino\nNome Rodrigo Brito de Oliveira\nCPF +» 388.498 ---\nInstituição BCO BRADESCO S.A.\nOrigem\nNome RODRIGO BRITO DE OLIVEIRA\n29338849848\nInstituição NU PAGAMENTOS - IP`
    const r = parseProof(t)
    expect(r).toMatchObject({ totalCents: 2000, date: '2026-10-15', ownTransfer: true })
    const d = new Date(r.occurredAt!)
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([16, 10, 4])
  })

  it('formas curtas: "Para <nome>" e Pix recebido', () => {
    expect(parseProof('Pix enviado\nR$ 150,00\nPara\nAna Souza\nCPF ***.123.456-**\n13/10/2026')).toMatchObject({ kind: 'out', who: 'Ana Souza', totalCents: 15000 })
    expect(parseProof('Você recebeu um Pix\nR$ 1.200,50\nDe Carlos Lima\n05/10/2026')).toMatchObject({ kind: 'in', who: 'Carlos Lima', totalCents: 120050 })
  })

  it('cupom fiscal não é comprovante', () => expect(looksLikeProof('NFC-e CUPOM FISCAL\nFORMA DE PAGAMENTO PIX')).toBe(false))

  it('cupom pago no Pix, mesmo sem "NFC-e" legível (caso real do celular)', () => {
    const topo = 'E DE CASA SUPERMERCADOS LTDA\nCNPJ: 33.030.242/0006-91\nFORMA DE PAGAMENTO\nPIX 39,95\nVALOR TOTAL R$ 39,95'
    expect(looksLikeProof(topo)).toBe(false)
  })
})
