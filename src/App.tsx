import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, findRule, getLocation, learnRule, localDate, type Receipt } from './lib/db'
import { readText } from './lib/ocr'
import { scanQr } from './lib/qr'
import { formatBRL, parseReceipt, toCents } from './lib/parser'
import { looksLikeProof, parseProof } from './lib/proof'
import { DEFAULT_IN, DEFAULT_OUT, TRANSFER, type Category, type Kind } from './lib/categorize'
import { chooseDialog, confirmDialog, infoDialog } from './Dialog'
import { TERMS } from './Terms'
import { backupFileName, buildBackup, newOnes, parseBackup } from './lib/backup'
import { doubts } from './lib/doubt'
import { AIError, aiConsent, debugActive, docToDraft, readWithAI, setAiConsent } from './lib/ai'

type Draft = Omit<Receipt, 'id' | 'createdAt'> & { id?: number }

const monthOf = (d: string) => d.slice(0, 7)
const fmtWhen = (ms: number) =>
  new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

const getPref = (k: string) => { try { return localStorage.getItem(k) === '1' } catch { return false } }
const setPref = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? '1' : '0') } catch { /* sem storage */ } }

/** Valor de cada categoria no mês. Com itens (cupom), cada item conta na própria categoria. */
function spendByCategory(list: Receipt[]) {
  const m = new Map<Category, number>()
  const add = (c: Category, v: number) => m.set(c, (m.get(c) ?? 0) + v)
  for (const r of list) {
    const itemSum = r.items.reduce((s, i) => s + i.totalCents, 0)
    if (itemSum > 0 && itemSum <= r.totalCents) {
      r.items.forEach((i) => add(i.category ?? r.category, i.totalCents))
      if (r.totalCents > itemSum) add(r.category, r.totalCents - itemSum)
    } else add(r.category, r.totalCents)
  }
  return m
}

export function App() {
  const receipts = useLiveQuery(() => db.receipts.orderBy('occurredAt').reverse().toArray(), []) ?? []
  const [draft, setDraft] = useState<Draft | null>(null)
  const [quick, setQuick] = useState<Kind | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<File | null>(null)
  const [warn, setWarn] = useState<string[]>([])
  const [version, setVersion] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Arquivo vindo do menu "Compartilhar" do celular: o service worker guardou no cache e abriu /?shared=1
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('shared')) return
    history.replaceState(null, '', '/')
    ;(async () => {
      try {
        const cache = await caches.open('karo-shared')
        const res = await cache.match('/shared-file')
        if (!res) return
        const blob = await res.blob()
        await cache.delete('/shared-file')
        const name = decodeURIComponent(res.headers.get('x-filename') ?? 'compartilhado')
        void onFile(new File([blob], name, { type: blob.type }))
      } catch (e) {
        console.error(e)
      }
    })()
    // roda uma vez ao abrir o app
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const importRef = useRef<HTMLInputElement>(null)

  /** Salva um arquivo .json com tudo: pelo menu Compartilhar do celular (WhatsApp, Drive, e-mail) ou baixando. */
  async function exportBackup() {
    const file = new File(
      [JSON.stringify(buildBackup(await db.receipts.toArray(), await db.rules.toArray()), null, 2)],
      backupFileName(),
      { type: 'application/json' },
    )
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Backup do KaRo' })
        return
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return // a pessoa fechou o menu de compartilhar
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  async function importBackup(file: File) {
    try {
      const { receipts: incoming, rules, skipped } = parseBackup(await file.text())
      const fresh = newOnes(await db.receipts.toArray(), incoming)
      if (fresh.length === 0) {
        await infoDialog('Nada para importar', `Os ${incoming.length} lançamentos deste arquivo já estão neste aparelho.`)
        return
      }
      const dup = incoming.length - fresh.length
      const ok = await confirmDialog({
        title: `Importar ${fresh.length} ${fresh.length === 1 ? 'lançamento' : 'lançamentos'}?`,
        body:
          `${dup ? `${dup} já existem aqui e não serão repetidos.\n` : ''}` +
          `${skipped ? `${skipped} do arquivo estavam com defeito e foram ignorados.\n` : ''}` +
          'Os lançamentos que você já tem continuam como estão.',
        confirmLabel: 'Importar',
      })
      if (!ok) return
      await db.receipts.bulkAdd(fresh.map(({ id: _id, ...r }) => r))
      for (const rule of rules) if (!(await db.rules.get(rule.key))) await db.rules.put(rule)
      await infoDialog('Backup importado', `${fresh.length} ${fresh.length === 1 ? 'lançamento adicionado' : 'lançamentos adicionados'}.`)
    } catch (e) {
      await infoDialog('Não consegui importar', e instanceof Error ? e.message : 'O arquivo não pôde ser lido.')
    }
  }

  async function attach() {
    const where = await chooseDialog({
      title: 'Anexar de onde?',
      choices: [
        { value: 'gallery', label: '🖼️ Galeria e prints', hint: 'Fotos recentes, capturas de tela e álbuns' },
        { value: 'files', label: '📄 PDF ou arquivo', hint: 'Downloads e documentos recentes' },
      ],
    })
    if (where === 'gallery') galRef.current?.click()
    if (where === 'files') fileRef.current?.click()
  }

  async function onFile(input: File) {
    setError(null)
    try {
      const now = Date.now()
      const t0 = performance.now()
      let file: Blob = input
      let text = ''
      if (input.type === 'application/pdf') {
        setBusy('Lendo o PDF…')
        const { pdfText, pdfToImage } = await import('./lib/pdf')
        text = await pdfText(input)
        if (text.replace(/\s/g, '').length < 30) file = await pdfToImage(input) // PDF escaneado: cai no OCR
      }
      const qr = file.type.startsWith('image/') ? await scanQr(file).catch(() => null) : null
      if (!text) {
        setBusy('Lendo… 0%')
        text = await readText(file, (p) => setBusy(`Lendo… ${Math.round(p * 100)}%`))
      }
      setSource(input)
      const ocr = `Leitura local (OCR): ${((performance.now() - t0) / 1000).toFixed(1)} s, ${text.length} caracteres`
      const pr = looksLikeProof(text) ? parseProof(text) : null
      if (pr?.totalCents) {
        const at = pr.occurredAt ?? now
        setLog([ocr, 'Reconhecido como comprovante de Pix'])
        setWarn(pr.who ? [] : ['Não encontrei o nome da outra pessoa.'])
        setDraft({
          kind: pr.kind,
          merchant: pr.ownTransfer ? 'Transferência entre minhas contas' : pr.who ? `Pix ${pr.kind === 'in' ? 'de' : 'para'} ${pr.who}` : 'Pix',
          cnpj: null, date: pr.date ?? localDate(at), occurredAt: at, totalCents: pr.totalCents,
          category: pr.ownTransfer ? TRANSFER : 'Outros', items: [],
        })
        return
      }
      const p = parseReceipt(text)
      // o app aprende: se esta loja já foi categorizada antes, usa a categoria que a pessoa escolheu
      const learned = await findRule(p.cnpj ?? qr?.cnpj ?? null, p.merchant)
      if (learned) p.category = learned
      const w = doubts({ merchant: p.merchant, cnpj: p.cnpj ?? qr?.cnpj ?? null, date: p.date, totalCents: p.totalCents, items: p.items })
      setWarn(w)
      setLog([ocr, 'Reconhecido como cupom fiscal', `Itens lidos: ${p.items.length} · avisos de leitura: ${w.length}${qr ? ' · QR code lido' : ''}`])
      setDraft({
        kind: 'out',
        merchant: p.merchant,
        cnpj: p.cnpj ?? qr?.cnpj ?? null,
        date: p.date ?? localDate(now),
        occurredAt: now,
        totalCents: p.totalCents ?? 0,
        category: p.category,
        items: p.items,
        nfceKey: qr?.key ?? p.nfceKey ?? undefined,
      })
    } catch (e) {
      setError('Não consegui ler o arquivo. Tente de novo ou use os botões verde e vermelho para lançar o valor.')
      console.error(e)
    } finally {
      setBusy(null)
    }
  }

  /** Segunda opinião: manda a foto para o Claude (via /api/read) e troca a leitura da tela de conferência. */
  async function askAI() {
    if (!source) return
    if (!aiConsent()) {
      const ok = await confirmDialog({
        title: 'Enviar a foto para a IA?',
        body:
          'Para ler com IA, a foto deste documento é enviada para a Anthropic, a empresa do Claude.\n\n' +
          'A imagem pode ter nomes e CPF parcial. O KaRo não guarda a foto e só salva loja, CNPJ da empresa, valores e itens.',
        confirmLabel: 'Enviar e ler',
        cancelLabel: 'Agora não',
        tone: 'danger',
      })
      if (!ok) return
      setAiConsent()
    }
    setError(null)
    // a tela mostra o que está acontecendo e há quantos segundos, para não parecer travada
    let label = 'Preparando…'
    const started = Date.now()
    const tick = () => setBusy(`${label} ${Math.round((Date.now() - started) / 1000)} s`)
    const timer = setInterval(tick, 500)
    const step = (s: string) => { label = s; tick() }
    tick()
    try {
      step('Preparando a foto…')
      const img = source.type === 'application/pdf' ? await (await import('./lib/pdf')).pdfToImage(source) : source
      const run = await readWithAI(img, step)
      const { doc } = run
      const s = (ms: number) => (ms / 1000).toFixed(1)
      setLog((l) => [
        ...l,
        '— IA —',
        `Foto enviada: ${run.dims}, ${run.kb} KB (preparada em ${s(run.prepMs)} s)`,
        `A IA respondeu em ${s(run.waitMs)} s · documento: ${doc.document_type} · confiança: ${doc.confidence}`,
        `Tokens: ${run.usage.input} de entrada + ${run.usage.output} de saída = US$ ${run.costUsd.toFixed(4)}`,
        `Leu: ${doc.items.length} ${doc.items.length === 1 ? 'item' : 'itens'}, total ${doc.total ?? '—'}`,
      ])
      const d: Draft = { ...docToDraft(doc), nfceKey: draft?.nfceKey }
      if (d.kind === 'out' && d.category !== TRANSFER) d.category = (await findRule(d.cnpj, d.merchant)) ?? d.category
      setWarn(
        doc.confidence === 'low' ? ['A IA também não teve certeza. Confira com atenção.']
          : doc.document_type !== 'cupom_fiscal' ? []
          : doubts({ merchant: d.merchant, cnpj: d.cnpj, date: d.date, totalCents: d.totalCents, items: d.items }),
      )
      setDraft(d)
      setVersion((v) => v + 1)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não consegui ler com a IA.'
      setError(msg)
      setLog((l) => [...l, '— IA —', `Falhou: ${msg}`, ...(e instanceof AIError && e.costUsd ? [`Custo mesmo assim: US$ ${e.costUsd.toFixed(4)}`] : [])])
    } finally {
      clearInterval(timer)
      setBusy(null)
    }
  }

  const closeDraft = () => { setDraft(null); setSource(null); setWarn([]); setError(null); setLog([]) }

  async function save(d: Draft) {
    if (d.nfceKey && !d.id) {
      const dup = await db.receipts.where('nfceKey').equals(d.nfceKey).first()
      if (dup && !(await confirmDialog({ title: 'Nota repetida', body: 'Essa nota fiscal já foi salva. Salvar de novo?', confirmLabel: 'Salvar de novo', cancelLabel: 'Não salvar' }))) return
    }
    await db.receipts.put({ ...d, createdAt: Date.now() })
    if (d.kind === 'out') await learnRule(d.cnpj, d.merchant, d.category)
    closeDraft()
  }

  if (quick) return <QuickEntry kind={quick} receipts={receipts} onDone={() => setQuick(null)} />
  if (draft)
    return (
      <Review key={version} draft={draft} receipts={receipts} warn={warn} busy={busy} error={error} log={log}
        onAI={source ? askAI : undefined} onCancel={closeDraft} onSave={save} />
    )

  const month = monthOf(localDate(Date.now()))
  // transferência entre contas da própria pessoa não é ganho nem gasto
  const thisMonth = receipts.filter((r) => monthOf(r.date) === month && r.category !== TRANSFER)
  const income = thisMonth.filter((r) => r.kind === 'in').reduce((s, r) => s + r.totalCents, 0)
  const outList = thisMonth.filter((r) => r.kind === 'out')
  const spent = outList.reduce((s, r) => s + r.totalCents, 0)
  const byCat = spendByCategory(outList)

  return (
    <main>
      <header>
        <img src="/icon.svg" alt="" width={40} height={40} />
        <h1>KaRo</h1>
      </header>

      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
      {/* Dois seletores de propósito: só imagens abre a galeria do celular (recentes, capturas de tela, álbuns);
          só PDF abre o gerenciador de arquivos (recentes, Downloads). Misturar os dois tipos abre só o gerenciador. */}
      <input ref={galRef} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
      <input ref={fileRef} type="file" accept="application/pdf" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
      <div className="shoot">
        <button className="cam" disabled={!!busy} onClick={() => camRef.current?.click()} aria-label="Fotografar cupom">
          <span aria-hidden>📷</span>{busy ?? 'Fotografar cupom'}
        </button>
        <button className="clip" disabled={!!busy} onClick={attach} aria-label="Anexar print ou PDF">
          <span aria-hidden>📎</span>
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="duo">
        <button className="big in" disabled={!!busy} onClick={() => setQuick('in')}>＋ Entrou</button>
        <button className="big out" disabled={!!busy} onClick={() => setQuick('out')}>− Gastei</button>
      </div>

      <section className="card total">
        <small>Em {new Date().toLocaleDateString('pt-BR', { month: 'long' })}</small>
        <div className="row"><span>Entrou</span><b className="pos">{formatBRL(income)}</b></div>
        <div className="row"><span>Gastou</span><b className="neg">{formatBRL(spent)}</b></div>
        <div className="row"><span>Saldo</span><b className={income - spent < 0 ? 'neg' : 'pos'}>{formatBRL(income - spent)}</b></div>
        <ul className="cats">
          {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => (
            <li key={c}><span>{c}</span><span>{formatBRL(v)}</span></li>
          ))}
        </ul>
      </section>

      <h2>Lançamentos</h2>
      {receipts.length === 0 && <p className="muted">Nada ainda. Toque em Entrou ou Gastou.</p>}
      <ul className="list">
        {receipts.map((r) => (
          <li key={r.id} onClick={() => setDraft(r)}>
            <div>
              <b>{r.merchant || r.category}</b>
              <small>{r.merchant ? `${r.category} · ` : ''}{fmtWhen(r.occurredAt)}{r.location ? ' · 📍' : ''}</small>
            </div>
            <span className={r.kind === 'in' ? 'pos' : 'neg'}>{r.kind === 'in' ? '+' : '−'}{formatBRL(r.totalCents)}</span>
          </li>
        ))}
      </ul>

      <input ref={importRef} type="file" accept="application/json,.json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importBackup(f) }} />
      <h2>Seus dados</h2>
      <p className="muted small">
        Os lançamentos ficam só neste aparelho. Se você limpar os dados do navegador ou desinstalar o app, eles somem. Guarde um backup de vez em quando.
      </p>
      <div className="actions">
        <button onClick={() => void exportBackup()} disabled={receipts.length === 0}>⬇️ Exportar backup</button>
        <button onClick={() => importRef.current?.click()}>⬆️ Importar backup</button>
      </div>
      <button className="wide" onClick={() => void infoDialog('Condições de uso (beta)', TERMS.map((t) => `${t.title}\n${t.text}`).join('\n\n'))}>
        📄 Condições de uso
      </button>
    </main>
  )
}

/** Categorias da pessoa: padrão + as que ela já usou, mais usadas primeiro. */
function tagsFor(kind: Kind, receipts: Receipt[]) {
  const count = new Map<Category, number>()
  receipts.filter((r) => r.kind === kind).forEach((r) => count.set(r.category, (count.get(r.category) ?? 0) + 1))
  const base = kind === 'in' ? DEFAULT_IN : DEFAULT_OUT
  const all = [...new Set([...count.keys(), ...base])]
  return all.sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0) || base.indexOf(a) - base.indexOf(b))
}

function QuickEntry({ kind, receipts, onDone }: { kind: Kind; receipts: Receipt[]; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<Category | null>(null)
  const [adding, setAdding] = useState('')
  const [note, setNote] = useState('')
  const [useLoc, setUseLoc] = useState(() => getPref('karo.loc'))
  const [saving, setSaving] = useState(false)
  const cents = toCents(amount.includes(',') ? amount : `${amount || 0},00`)
  const tags = tagsFor(kind, receipts)
  const finalCat = adding.trim() || category
  const valid = Number.isFinite(cents) && cents > 0 && !!finalCat

  async function save() {
    setSaving(true)
    const now = Date.now()
    const location = useLoc ? await getLocation() : undefined
    await db.receipts.add({
      kind, merchant: note.trim(), cnpj: null, date: localDate(now), occurredAt: now, totalCents: cents,
      category: finalCat!, items: [], location, createdAt: now,
    })
    onDone()
  }

  return (
    <main className={kind}>
      <h1>{kind === 'in' ? 'Entrou' : 'Gastei'}</h1>
      <label>Valor (R$)
        <input className={`amount ${kind === 'in' ? 'pos' : 'neg'}`} inputMode="decimal" autoFocus placeholder="0,00"
          value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ''))} />
      </label>
      <div className="muted">{kind === 'in' ? 'De onde veio?' : 'Com o quê?'}</div>
      <div className="tags">
        {tags.map((t) => (
          <button key={t} className={`tag ${category === t && !adding ? 'on' : ''}`} onClick={() => { setCategory(t); setAdding('') }}>{t}</button>
        ))}
      </div>
      <label>Ou crie uma categoria nova
        <input value={adding} placeholder="Ex.: Manicure" onChange={(e) => setAdding(e.target.value)} />
      </label>
      <label>Observação (opcional)
        <input value={note} placeholder="Ex.: pix para a Ana" onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={useLoc} onChange={(e) => { setUseLoc(e.target.checked); setPref('karo.loc', e.target.checked) }} />
        Guardar o local do lançamento (só fica no seu aparelho)
      </label>
      <div className="actions">
        <button className={`primary ${kind}`} disabled={!valid || saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar'}</button>
        <button onClick={onDone}>Cancelar</button>
      </div>
    </main>
  )
}

interface ReviewProps {
  draft: Draft
  receipts: Receipt[]
  warn: string[]
  busy: string | null
  error: string | null
  /** relatório da leitura, mostrado só no modo de teste */
  log: string[]
  /** só existe quando há uma foto/arquivo de origem para reler */
  onAI?: () => void
  onSave: (d: Draft) => void
  onCancel: () => void
}

function Review({ draft, receipts, warn, busy, error, log, onAI, onSave, onCancel }: ReviewProps) {
  const [d, setD] = useState(draft)
  const [total, setTotal] = useState((d.totalCents / 100).toFixed(2).replace('.', ','))
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const cents = toCents(total.includes(',') ? total : `${total},00`)
  const valid = (d.kind === 'in' || d.merchant.trim()) && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && Number.isFinite(cents) && cents > 0
  const tags = tagsFor(d.kind, receipts)
  if (!tags.includes(d.category)) tags.unshift(d.category)

  return (
    <main>
      <h1>Conferir</h1>
      <p className="muted">Confira o que o leitor entendeu e corrija o que precisar.</p>
      {warn.length > 0 && (
        <div className="warn" role="alert">
          <b>Leitura duvidosa</b>
          <ul>{warn.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      {onAI && (
        <button className={`ai ${warn.length ? 'hot' : ''}`} disabled={!!busy} onClick={onAI}>
          {busy ?? '✨ Ler com IA'}
        </button>
      )}
      {error && <p className="error">{error}</p>}
      {log.length > 0 && debugActive() && <pre className="dbg" aria-label="Relatório da leitura (modo de teste)">{log.join('\n')}</pre>}
      {d.category === TRANSFER &&<p className="notice">Parece uma transferência entre contas suas. Ela fica na lista, mas não entra no saldo do mês.</p>}
      <div className="duo kind">
        <button className={`big in ${d.kind === 'in' ? '' : 'off'}`} onClick={() => set('kind', 'in')}>＋ Entrou</button>
        <button className={`big out ${d.kind === 'out' ? '' : 'off'}`} onClick={() => set('kind', 'out')}>− Gastei</button>
      </div>
      <label>{d.kind === 'in' ? 'Descrição' : 'Loja'}<input value={d.merchant} placeholder={d.kind === 'in' ? 'Ex.: Pagamento de cliente' : 'Digite o nome da loja'} onChange={(e) => set('merchant', e.target.value)} /></label>
      <label>Data<input type="date" value={d.date} onChange={(e) => set('date', e.target.value)} /></label>
      <label>Total (R$)<input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></label>
      <label>Categoria
        <select value={d.category} onChange={(e) => set('category', e.target.value)}>
          {tags.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      {d.items.length > 0 && (
        <>
          <h2>Itens ({d.items.length})</h2>
          <ul className="list items">
            {d.items.map((it, i) => (
              <li key={i}>
                <div><b>{it.description}</b><small>{it.qty} × {formatBRL(it.unitCents)}{it.category ? ` · ${it.category}` : ''}</small></div>
                <span>{formatBRL(it.totalCents)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <small className="muted">Lançado em {fmtWhen(d.occurredAt)}</small>
      <div className="actions">
        <button className="primary" disabled={!valid} onClick={() => onSave({ ...d, merchant: d.merchant.trim(), totalCents: cents })}>Salvar</button>
        <button onClick={onCancel}>Cancelar</button>
        {d.id && <button className="danger" onClick={async () => {
          if (await confirmDialog({ title: 'Excluir este lançamento?', body: 'Isso não pode ser desfeito.', confirmLabel: 'Excluir', cancelLabel: 'Manter', tone: 'danger' })) {
            await db.receipts.delete(d.id!)
            onCancel()
          }
        }}>Excluir</button>}
      </div>
    </main>
  )
}
