import { expect, it } from 'vitest'
import { parseNfceQr } from './qr'

it('extrai dados da chave de acesso da NFC-e', () => {
  const key = '42250312345678000190650010000012341000012349'
  const r = parseNfceQr(`https://sat.sef.sc.gov.br/nfce/consulta?p=${key}|2|1|1|ABCD`)
  expect(r).toMatchObject({ uf: 'SC', month: '2025-03', cnpj: '12345678000190', number: '1234' })
  expect(r?.url).toContain('sef.sc.gov.br')
})

it('ignora QR sem chave', () => expect(parseNfceQr('https://exemplo.com')).toBeNull())
