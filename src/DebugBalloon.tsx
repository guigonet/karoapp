import { useEffect, useState } from 'react'
import { aiToken, getStats, resetStats, setAiToken } from './lib/ai'

/** Balão vermelho de teste: quanto a leitura com IA já custou neste aparelho. Só aparece com ?debug=1. */
export function DebugBalloon() {
  const [s, setS] = useState(getStats)
  useEffect(() => {
    const on = () => setS(getStats())
    window.addEventListener('karo-ai-stats', on)
    return () => window.removeEventListener('karo-ai-stats', on)
  }, [])

  function open() {
    const t = window.prompt(
      `Senha de teste da IA (a mesma KARO_TEST_TOKEN da Vercel).\n${aiToken() ? 'Já há uma salva; deixe como está para manter.' : 'Ainda não há senha salva.'}\n\n` +
      `Gasto até agora: US$ ${s.usd.toFixed(4)} em ${s.calls} leituras (${s.inTok} tokens de entrada, ${s.outTok} de saída).`,
      aiToken(),
    )
    if (t !== null) setAiToken(t)
    if (s.calls > 0 && window.confirm('Zerar o contador de gasto?')) resetStats()
  }

  return (
    <button className="balloon" onClick={open} aria-label="Gasto com IA (modo de teste)">
      IA US$ {s.usd.toFixed(4)} · {s.calls} {s.calls === 1 ? 'leitura' : 'leituras'}
    </button>
  )
}
