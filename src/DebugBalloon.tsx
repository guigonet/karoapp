import { useEffect, useState } from 'react'
import { confirmDialog, promptDialog } from './Dialog'
import { aiToken, getStats, resetStats, setAiToken } from './lib/ai'

/** Balão vermelho de teste: quanto a leitura com IA já custou neste aparelho. Só aparece com ?debug=1. */
export function DebugBalloon() {
  const [s, setS] = useState(getStats)
  useEffect(() => {
    const on = () => setS(getStats())
    window.addEventListener('karo-ai-stats', on)
    return () => window.removeEventListener('karo-ai-stats', on)
  }, [])

  async function open() {
    const t = await promptDialog({
      title: 'Modo de teste da IA',
      body:
        `Gasto até agora: US$ ${s.usd.toFixed(4)} em ${s.calls} ${s.calls === 1 ? 'leitura' : 'leituras'} ` +
        `(${s.inTok} tokens de entrada, ${s.outTok} de saída).\n\n` +
        `Senha de teste (a mesma KARO_TEST_TOKEN da Vercel). ${aiToken() ? 'Já há uma salva.' : 'Ainda não há senha salva.'}`,
      input: { value: aiToken(), placeholder: 'senha de teste', secret: true },
      confirmLabel: 'Salvar',
    })
    if (t === null) return
    setAiToken(t)
    if (s.calls > 0 && (await confirmDialog({ title: 'Zerar o contador de gasto?', confirmLabel: 'Zerar', cancelLabel: 'Manter' }))) resetStats()
  }

  return (
    <button className="balloon" onClick={open} aria-label="Gasto com IA (modo de teste)">
      IA US$ {s.usd.toFixed(4)} · {s.calls} {s.calls === 1 ? 'leitura' : 'leituras'}
    </button>
  )
}
