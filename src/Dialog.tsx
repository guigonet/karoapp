import { useEffect, useRef, useState } from 'react'

/** Caixas de diálogo do próprio app, no lugar de confirm()/prompt() do navegador. */
interface Opts {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  /** 'danger' pinta a caixa e o botão de vermelho (ações que pedem atenção) */
  tone?: 'default' | 'danger'
}
interface InputOpts extends Opts {
  input: { value?: string; placeholder?: string; secret?: boolean }
}
interface ChoiceOpts extends Opts {
  choices: { value: string; label: string; hint?: string }[]
}
type Req = (Opts | InputOpts | ChoiceOpts) & { resolve: (v: boolean | string | null) => void }

let push: ((r: Req) => void) | null = null

export const confirmDialog = (o: Opts) =>
  new Promise<boolean>((res) => {
    if (!push) return res(window.confirm(`${o.title}\n\n${o.body ?? ''}`))
    push({ ...o, resolve: (v) => res(v === true) })
  })

/** Devolve o texto digitado, ou null se a pessoa cancelou. */
export const promptDialog = (o: InputOpts) =>
  new Promise<string | null>((res) => {
    if (!push) return res(window.prompt(`${o.title}\n\n${o.body ?? ''}`, o.input.value ?? ''))
    push({ ...o, resolve: (v) => res(typeof v === 'string' ? v : null) })
  })

/** Lista de opções: devolve o `value` escolhido, ou null se a pessoa cancelou. */
export const chooseDialog = (o: ChoiceOpts) =>
  new Promise<string | null>((res) => {
    if (!push) return res(o.choices[0]?.value ?? null)
    push({ ...o, resolve: (v) => res(typeof v === 'string' ? v : null) })
  })

export function DialogHost() {
  const [queue, setQueue] = useState<Req[]>([])
  useEffect(() => {
    push = (r) => setQueue((q) => [...q, r])
    return () => { push = null }
  }, [])
  const cur = queue[0]
  if (!cur) return null
  return <Modal key={queue.length + cur.title} req={cur} onClose={(v) => { cur.resolve(v); setQueue((q) => q.slice(1)) }} />
}

function Modal({ req, onClose }: { req: Req; onClose: (v: boolean | string | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const input = 'input' in req ? req.input : null
  const choices = 'choices' in req ? req.choices : null
  const [text, setText] = useState(input?.value ?? '')
  // <dialog> nativo: já trava o foco dentro da caixa e fecha com Esc
  useEffect(() => { ref.current?.showModal() }, [])
  const cancelValue = input || choices ? null : false

  return (
    <dialog ref={ref} className={`dlg ${req.tone === 'danger' ? 'danger' : ''}`} aria-labelledby="dlg-title"
      onCancel={(e) => { e.preventDefault(); onClose(cancelValue) }}>
      <form onSubmit={(e) => { e.preventDefault(); if (!choices) onClose(input ? text : true) }}>
        <h2 id="dlg-title">{req.title}</h2>
        {req.body && <p className="dlg-body">{req.body}</p>}
        {input && (
          <input type={input.secret ? 'password' : 'text'} value={text} placeholder={input.placeholder} autoFocus
            autoComplete="off" onChange={(e) => setText(e.target.value)} />
        )}
        {choices && (
          <div className="choices">
            {choices.map((c) => (
              <button type="button" key={c.value} onClick={() => onClose(c.value)}>
                <b>{c.label}</b>
                {c.hint && <small>{c.hint}</small>}
              </button>
            ))}
          </div>
        )}
        <div className="actions">
          {!choices && <button type="submit" className="primary">{req.confirmLabel ?? 'OK'}</button>}
          <button type="button" onClick={() => onClose(cancelValue)}>{req.cancelLabel ?? 'Cancelar'}</button>
        </div>
      </form>
    </dialog>
  )
}
