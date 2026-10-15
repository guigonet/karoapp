import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TERMS, Welcome } from './Terms'

describe('tela de entrada', () => {
  const html = renderToString(<Welcome onAccept={() => {}} />)

  it('o botão Entrar começa desligado (só liga depois de marcar que leu e aceitou)', () => {
    expect(html).toMatch(/<button[^>]*class="enter"[^>]*disabled/)
    expect(html).not.toMatch(/<input[^>]*checked/)
  })

  it('diz que é beta, que os dados ficam no celular e que a IA envia a foto à Anthropic', () => {
    expect(html).toContain('BETA')
    expect(html).toContain('Li e aceito')
    const all = TERMS.map((t) => t.text).join(' ')
    expect(all).toMatch(/nenhum servidor/)
    expect(all).toMatch(/Anthropic/)
    expect(all).toMatch(/não a guarda/)
  })

  it('é curta o bastante para caber numa tela (poucos blocos e texto enxuto)', () => {
    expect(TERMS.length).toBeLessThanOrEqual(3)
    expect(TERMS.map((t) => t.title + t.text).join('').length).toBeLessThan(900)
  })
})
