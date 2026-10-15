// Função da Vercel: recebe a foto de um cupom/comprovante, pede ao Claude para ler e devolve os campos.
// A chave da Anthropic fica SÓ aqui (variável de ambiente), nunca no app.
//
// Variáveis na Vercel (Settings -> Environment Variables):
//   ANTHROPIC_API_KEY  chave criada no console.anthropic.com
//   KARO_TEST_TOKEN    senha de teste: sem ela ninguém mais consegue gastar o seu crédito
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-haiku-5-5'
// US$ por milhão de tokens (Haiku 5.5, prompts até 100 mil tokens)
const PRICE_IN = 0.1
const PRICE_OUT = 0.5
const MAX_BODY = 4_000_000

const CATEGORIES = [
  'Mercado', 'Bebida e cigarro', 'Combustível', 'Restaurante', 'Farmácia', 'Transporte', 'Casa',
  'Dízimo e ofertas', 'Lazer', 'Outros',
]

const SYSTEM = `Você lê fotos de cupons fiscais brasileiros (NFC-e/SAT), comprovantes e prints de Pix/transferência e devolve os dados em JSON.

Regras:
- Responda só com os campos do esquema. Não invente: se não conseguir ler um campo, use null.
- merchant: só o nome da empresa, sem LTDA, S/A, ME, CNPJ, endereço, telefone ou filial. Em comprovante de Pix, deixe null.
- cnpj: só o CNPJ da empresa que emitiu o cupom (formato 00.000.000/0000-00). Nunca devolva CPF. Em comprovante de Pix, deixe null.
- date em AAAA-MM-DD e time em HH:MM:SS (a hora da transação, não a de emissão do comprovante, se forem diferentes).
- total e valores em reais, como número (ex.: 39.95). total é o valor total pago.
- items: um por produto do cupom, com a quantidade e os preços impressos. Lista vazia se não for cupom ou se não der para ler.
- category de cada item e do documento: use uma da lista. Cigarro e bebida alcoólica são "Bebida e cigarro" mesmo comprados num mercado. Se a loja é um mercado e o item é comida ou limpeza, use "Mercado".
- category é sempre uma da lista; se não souber, "Outros".
- direction: "none" se o documento não é comprovante de Pix.
- Comprovante de Pix: direction é "out" se quem enviou é o dono do comprovante, "in" se ele recebeu, "own_transfer" se origem e destino são a mesma pessoa. counterparty é o nome da outra pessoa (nunca CPF).
- confidence: "high" se leu tudo com clareza, "medium" se houve dúvida em algum campo, "low" se a imagem está ruim.`

const ITEM = {
  type: 'object',
  additionalProperties: false,
  required: ['description', 'qty', 'unit_price', 'total_price', 'category'],
  properties: {
    description: { type: 'string' },
    qty: { type: 'number' },
    unit_price: { type: 'number' },
    total_price: { type: 'number' },
    category: { type: 'string', enum: CATEGORIES },
  },
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['document_type', 'merchant', 'cnpj', 'date', 'time', 'total', 'category', 'items', 'direction', 'counterparty', 'confidence'],
  properties: {
    document_type: { type: 'string', enum: ['cupom_fiscal', 'comprovante_pix', 'outro'] },
    merchant: { type: ['string', 'null'] },
    cnpj: { type: ['string', 'null'] },
    date: { type: ['string', 'null'] },
    time: { type: ['string', 'null'] },
    total: { type: ['number', 'null'] },
    category: { type: 'string', enum: CATEGORIES },
    items: { type: 'array', items: ITEM },
    direction: { type: 'string', enum: ['out', 'in', 'own_transfer', 'none'] },
    counterparty: { type: ['string', 'null'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export async function POST(request: Request) {
  const expected = process.env.KARO_TEST_TOKEN
  if (!expected || request.headers.get('x-karo-token') !== expected) return json({ error: 'Não autorizado.' }, 401)
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'Falta a ANTHROPIC_API_KEY na Vercel.' }, 500)

  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return json({ error: 'Imagem grande demais.' }, 413)
  let body: { image?: string; mediaType?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Pedido inválido.' }, 400)
  }
  const { image, mediaType } = body
  if (!image || image.length > MAX_BODY || !['image/jpeg', 'image/png', 'image/webp'].includes(mediaType ?? ''))
    return json({ error: 'Imagem inválida.' }, 400)

  try {
    const client = new Anthropic()
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp', data: image } },
            { type: 'text', text: 'Leia este documento.' },
          ],
        },
      ],
    })

    const usage = { input: msg.usage.input_tokens, output: msg.usage.output_tokens }
    const costUsd = (usage.input * PRICE_IN + usage.output * PRICE_OUT) / 1_000_000
    if (msg.stop_reason === 'refusal') return json({ error: 'A IA recusou ler esta imagem.', usage, costUsd }, 422)
    if (msg.stop_reason === 'max_tokens') return json({ error: 'A resposta foi cortada (cupom muito longo).', usage, costUsd }, 422)

    const text = msg.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') return json({ error: 'Resposta vazia.', usage, costUsd }, 502)
    return json({ result: JSON.parse(text.text), usage, costUsd })
  } catch (e) {
    if (e instanceof Anthropic.APIError) return json({ error: `Anthropic: ${e.status} ${e.message}` }, e.status && e.status >= 400 ? e.status : 502)
    return json({ error: 'Erro ao ler a resposta da IA.' }, 502)
  }
}
