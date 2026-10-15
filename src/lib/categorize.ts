export type Category = string
export type Kind = 'in' | 'out'

/** Dinheiro que só mudou de conta (mesma pessoa): não entra nas somas de ganho e gasto. */
export const TRANSFER: Category = 'Transferência própria'

export const DEFAULT_OUT: Category[] = [
  'Mercado', 'Bebida e cigarro', 'Combustível', 'Restaurante', 'Farmácia', 'Transporte', 'Casa',
  'Dízimo e ofertas', 'Lazer', 'Outros',
]
export const DEFAULT_IN: Category[] = ['Salário', 'Serviço', 'Presente', 'Reembolso', 'Outros']

const RULES: Record<string, string[]> = {
  'Bebida e cigarro': [
    'CIGARRO', 'CHESTERFIELD', 'MARLBORO', 'FUMO', 'CERVEJA', 'VINHO', 'VODKA', 'WHISKY', 'WISKY', 'CACHACA',
    'GIN ', 'ESPUMANTE', 'HEINEKEN', 'SKOL', 'BRAHMA', 'ANTARCTICA', 'BUDWEISER', 'LONG NECK',
  ],
  Combustível: ['POSTO', 'IPIRANGA', 'SHELL', 'PETROBRAS', 'BR MANIA', 'GASOLINA', 'ETANOL', 'DIESEL', 'COMBUSTIV'],
  Mercado: ['SUPERMERCADO', 'MERCADO', 'ATACADO', 'ATACADAO', 'ASSAI', 'ANGELONI', 'BISTEK', 'HORTIFRUTI', 'PADARIA', 'ACOUGUE'],
  Farmácia: ['FARMACIA', 'DROGARIA', 'DROGA', 'PANVEL', 'RAIA', 'PACHECO', 'CATARINENSE'],
  Restaurante: ['RESTAURANTE', 'LANCHONETE', 'PIZZARIA', 'CAFE', 'BURGER', 'SORVETERIA', 'CHURRASCARIA'],
  Transporte: ['ESTACIONAMENTO', 'PEDAGIO', 'UBER', 'MECANICA', 'AUTO PECAS', 'BORRACHARIA'],
  Casa: ['CONSTRUCAO', 'MATERIAIS', 'FERRAGEM', 'MOVEIS', 'LEROY', 'TELHA'],
  'Dízimo e ofertas': ['IGREJA', 'DIZIMO', 'OFERTA', 'MINISTERIO', 'PARÓQUIA', 'PAROQUIA', 'CONGREGACAO'],
  Lazer: ['CINEMA', 'TEATRO', 'INGRESSO', 'LIVRARIA', 'BRINQUEDO'],
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

function match(text: string, cats: string[]): Category | null {
  const t = strip(text)
  for (const cat of cats) if (RULES[cat].some((w) => t.includes(strip(w)))) return cat
  return null
}

/** Categoria de uma LOJA pelo nome, ou null se nenhuma regra bate. */
export const matchCategory = (text: string) => match(text, Object.keys(RULES))

/**
 * Categoria de um PRODUTO. Só as categorias que têm "cara de produto": o resto do dicionário
 * serve para nome de loja (ex.: "CAFE" é restaurante, mas "CAFE EM PO" num mercado é mercado).
 */
export const matchItemCategory = (text: string) => match(text, ['Bebida e cigarro', 'Combustível'])

export const categorize = (text: string): Category => matchCategory(text) ?? 'Outros'
