import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Receipt } from './lib/db'
import { readText } from './lib/ocr'
import { scanQr } from './lib/qr'
import { formatBRL, parseReceipt, toCents } from './lib/parser'
import { CATEGORIES, type Category } from './lib/categorize'

type Draft = Omit<Receipt, 'id' | 'createdAt'> & { id?: number }

const today = () => new Date().toISOString().slice(0, 10)
const monthOf = (d: string) => d.slice(0, 7)

export function App() {
  const receipts = useLiveQuery(() => db.receipts.orderBy('date').reverse().toArray(), []) ?? []
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onPhoto(file: File) {
    setError(null)
    try {
      setBusy('Procurando QR code…')
      const qr = await scanQr(file).catch(() => null)
      setBusy('Lendo o cupom… 0%')
      const text = await readText(file, (p) => setBusy(`Lendo o cupom… ${Math.round(p * 100)}%`))
      const p = parseReceipt(text)
      setDraft({
        merchant: p.merchant,
        cnpj: p.cnpj ?? qr?.cnpj ?? null,
        date: p.date ?? (qr ? `${qr.month}-01` : today()),
        totalCents: p.totalCents ?? 0,
        category: p.category,
        items: p.items,
        nfceKey: qr?.key ?? p.nfceKey ?? undefined,
      })
    } catch (e) {
      setError('Não consegui ler a imagem. Tente de novo ou preencha manualmente.')
      console.error(e)
    } finally {
      setBusy(null)
    }
  }

  async function save(d: Draft) {
    if (d.nfceKey && !d.id) {
      const dup = await db.receipts.where('nfceKey').equals(d.nfceKey).first()
      if (dup && !confirm('Essa nota já foi salva. Salvar de novo?')) return
    }
    await db.receipts.put({ ...d, createdAt: Date.now() })
    setDraft(null)
  }

  if (draft) return <Review draft={draft} onCancel={() => setDraft(null)} onSave={save} />

  const month = monthOf(today())
  const monthTotal = receipts.filter((r) => monthOf(r.date) === month).reduce((s, r) => s + r.totalCents, 0)
  const byCat = new Map<Category, number>()
  receipts.filter((r) => monthOf(r.date) === month).forEach((r) => byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.totalCents))

  return (
    <main>
      <header>
        <img src="/icon.svg" alt="" width={40} height={40} />
        <h1>KaRo</h1>
      </header>

      <section className="card total">
        <small>Gasto em {new Date().toLocaleDateString('pt-BR', { month: 'long' })}</small>
        <strong>{formatBRL(monthTotal)}</strong>
        <ul className="cats">
          {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => (
            <li key={c}><span>{c}</span><span>{formatBRL(v)}</span></li>
          ))}
        </ul>
      </section>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f) }} />
      <div className="actions">
        <button className="primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy ?? '📷 Ler cupom'}
        </button>
        <button disabled={!!busy} onClick={() => setDraft({ merchant: '', cnpj: null, date: today(), totalCents: 0, category: 'Outros', items: [] })}>
          Lançar manual
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      <h2>Lançamentos</h2>
      {receipts.length === 0 && <p className="muted">Nenhum cupom ainda. Fotografe o primeiro!</p>}
      <ul className="list">
        {receipts.map((r) => (
          <li key={r.id} onClick={() => setDraft(r)}>
            <div><b>{r.merchant || 'Sem nome'}</b><small>{r.date.split('-').reverse().join('/')} · {r.category}</small></div>
            <span>{formatBRL(r.totalCents)}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}

function Review({ draft, onSave, onCancel }: { draft: Draft; onSave: (d: Draft) => void; onCancel: () => void }) {
  const [d, setD] = useState(draft)
  const [total, setTotal] = useState((d.totalCents / 100).toFixed(2).replace('.', ','))
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const cents = toCents(total.includes(',') ? total : `${total},00`)
  const valid = d.merchant.trim() && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && Number.isFinite(cents) && cents > 0

  return (
    <main>
      <h1>Conferir</h1>
      <p className="muted">Confira o que o leitor entendeu e corrija o que precisar.</p>
      <label>Loja<input value={d.merchant} onChange={(e) => set('merchant', e.target.value)} /></label>
      <label>Data<input type="date" value={d.date} onChange={(e) => set('date', e.target.value)} /></label>
      <label>Total (R$)<input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></label>
      <label>Categoria
        <select value={d.category} onChange={(e) => set('category', e.target.value as Category)}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      {d.items.length > 0 && (
        <>
          <h2>Itens ({d.items.length})</h2>
          <ul className="list items">
            {d.items.map((it, i) => (
              <li key={i}><div><b>{it.description}</b><small>{it.qty} × {formatBRL(it.unitCents)}</small></div><span>{formatBRL(it.totalCents)}</span></li>
            ))}
          </ul>
        </>
      )}
      <div className="actions">
        <button className="primary" disabled={!valid} onClick={() => onSave({ ...d, merchant: d.merchant.trim(), totalCents: cents })}>Salvar</button>
        <button onClick={onCancel}>Cancelar</button>
        {d.id && <button className="danger" onClick={async () => { if (confirm('Excluir este lançamento?')) { await db.receipts.delete(d.id!); onCancel() } }}>Excluir</button>}
      </div>
    </main>
  )
}
