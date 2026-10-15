import { TRANSFER } from './categorize'
import type { Receipt } from './db'
import { localDate } from './db'

/** Resposta da função /api/read (esquema definido em api/read.ts). */
export interface AIDoc {
  document_type: 'cupom_fiscal' | 'comprovante_pix' | 'outro'
  merchant: string | null
  cnpj: string | null
  date: string | null
  time: string | null
  total: number | null
  category: string | null
  items: { description: string; qty: number; unit_price: number; total_price: number; category: string | null }[]
  direction: 'out' | 'in' | 'own_transfer' | 'none' | null
  counterparty: string | null
  confidence: 'high' | 'medium' | 'low'
}

export type DraftData = Omit<Receipt, 'id' | 'createdAt'>

const cents = (reais: number | null | undefined) => (typeof reais === 'number' && isFinite(reais) ? Math.round(reais * 100) : 0)

/** Traduz a leitura da IA para o formato do app (valores em centavos). Nunca guarda CPF. */
export function docToDraft(doc: AIDoc, now = Date.now()): DraftData {
  const isPix = doc.document_type === 'comprovante_pix'
  const own = isPix && doc.direction === 'own_transfer'
  const kind = isPix && doc.direction === 'in' ? 'in' : 'out'
  const at = doc.date && doc.time ? new Date(`${doc.date}T${doc.time}`).getTime() : NaN
  const occurredAt = Number.isFinite(at) ? at : now
  const who = doc.counterparty?.trim()
  return {
    kind,
    merchant: own ? 'Transferência entre minhas contas' : isPix ? (who ? `Pix ${kind === 'in' ? 'de' : 'para'} ${who}` : 'Pix') : (doc.merchant ?? '').trim(),
    cnpj: isPix ? null : doc.cnpj,
    date: doc.date ?? localDate(occurredAt),
    occurredAt,
    totalCents: cents(doc.total),
    category: own ? TRANSFER : (doc.category ?? 'Outros'),
    items: doc.items.map((i) => ({
      description: i.description,
      qty: i.qty,
      unitCents: cents(i.unit_price),
      totalCents: cents(i.total_price),
      // só marca o item quando ele difere da loja (ex.: cigarro num mercado)
      category: i.category && i.category !== doc.category ? i.category : undefined,
    })),
  }
}

// ---- foto -> base64 reduzida (a Vercel aceita até 4,5 MB por pedido, e foto menor custa menos tokens)
export async function downscale(file: Blob, maxSide = 1600): Promise<{ image: string; mediaType: 'image/jpeg' }> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * k)
  canvas.height = Math.round(bmp.height * k)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('canvas vazio'))), 'image/jpeg', 0.82))
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return { image: btoa(bin), mediaType: 'image/jpeg' }
}

// ---- preferências e contador de gasto (só para o modo de teste)
const safe = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sem storage */ } },
  del: (k: string) => { try { localStorage.removeItem(k) } catch { /* sem storage */ } },
}

export const aiConsent = () => safe.get('karo.aiConsent') === '1'
export const setAiConsent = () => safe.set('karo.aiConsent', '1')
export const clearAiConsent = () => safe.del('karo.aiConsent')
export const aiToken = () => safe.get('karo.aiToken') ?? ''
export const setAiToken = (t: string) => safe.set('karo.aiToken', t.trim())

/** ?debug=1 liga o balão de custo neste aparelho; ?debug=0 desliga. */
export function debugOn() {
  try {
    const q = new URLSearchParams(location.search).get('debug')
    if (q === '1') safe.set('karo.debug', '1')
    if (q === '0') safe.del('karo.debug')
  } catch { /* sem location */ }
  return safe.get('karo.debug') === '1'
}

export interface AIStats { usd: number; calls: number; inTok: number; outTok: number }
export const getStats = (): AIStats => {
  try { return { usd: 0, calls: 0, inTok: 0, outTok: 0, ...JSON.parse(safe.get('karo.aiStats') ?? '{}') } } catch { return { usd: 0, calls: 0, inTok: 0, outTok: 0 } }
}
export const resetStats = () => { safe.del('karo.aiStats'); window.dispatchEvent(new Event('karo-ai-stats')) }
function addStats(usage: { input: number; output: number }, usd: number) {
  const s = getStats()
  safe.set('karo.aiStats', JSON.stringify({ usd: s.usd + usd, calls: s.calls + 1, inTok: s.inTok + usage.input, outTok: s.outTok + usage.output }))
  window.dispatchEvent(new Event('karo-ai-stats'))
}

export class AIError extends Error {}

/** Envia a imagem para a função da Vercel e devolve a leitura. Conta o gasto mesmo quando a leitura falha. */
export async function readWithAI(file: Blob): Promise<AIDoc> {
  const token = aiToken()
  if (!token) throw new AIError('Falta a senha de teste. Toque no balão vermelho para informar.')
  const { image, mediaType } = await downscale(file)
  const res = await fetch('/api/read', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-karo-token': token },
    body: JSON.stringify({ image, mediaType }),
  })
  const data = await res.json().catch(() => ({}))
  if (data.usage) addStats(data.usage, data.costUsd ?? 0)
  if (!res.ok) throw new AIError(data.error ?? `Erro ${res.status} ao chamar a IA.`)
  return data.result as AIDoc
}
