import { useState, type ReactNode } from 'react'

/** Troque este número quando o texto mudar de forma relevante: todo mundo vai precisar aceitar de novo. */
export const TERMS_VERSION = '1'
const KEY = 'karo.terms'

export const TERMS: { title: string; text: string }[] = [
  {
    title: 'Versão de teste',
    text: 'O KaRo está em beta: pode ter erros e mudar sem aviso. Confira sempre os valores antes de salvar. Não é consultoria financeira.',
  },
  {
    title: 'Seus dados ficam só no seu celular',
    text: 'Lançamentos, categorias e local (se você ativar) não vão para nenhum servidor. Se você limpar os dados do navegador ou desinstalar o app, perde tudo. Faça backup.',
  },
  {
    title: 'Exceção: ✨ Ler com IA',
    text: 'Ao usar, a foto do documento é enviada à Anthropic (empresa do Claude) para ser lida. Pode conter nome e CPF parcial. Ela passa pelo servidor do KaRo só para chegar lá, e o KaRo não a guarda. A Anthropic trata os dados conforme a política dela. Se não concorda, não use esse botão.',
  },
]

export const termsAccepted = () => {
  try { return localStorage.getItem(KEY) === TERMS_VERSION } catch { return false }
}

/** Tela de entrada (vermelha, uma tela só). Sem aceitar, o app nem é carregado. */
export function Welcome({ onAccept }: { onAccept: () => void }) {
  const [checked, setChecked] = useState(false)
  return (
    <main className="welcome">
      <header>
        <span className="beta">BETA</span>
        <h1>KaRo</h1>
      </header>
      <p className="lead">Leia antes de entrar.</p>
      <ul>
        {TERMS.map((t) => (
          <li key={t.title}>
            <b>{t.title}</b>
            {t.text}
          </li>
        ))}
      </ul>
      <label className="agree">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        Li e aceito estas condições.
      </label>
      <button className="enter" disabled={!checked} onClick={onAccept}>Entrar</button>
    </main>
  )
}

/** Só mostra o app depois do aceite. Antes disso nada do app roda: nem o banco de dados é aberto. */
export function TermsGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(termsAccepted)
  if (ok) return <>{children}</>
  return (
    <Welcome
      onAccept={() => {
        try {
          localStorage.setItem(KEY, TERMS_VERSION)
          localStorage.setItem('karo.termsAt', String(Date.now()))
        } catch { /* sem storage: vale só nesta sessão */ }
        setOk(true)
      }}
    />
  )
}
