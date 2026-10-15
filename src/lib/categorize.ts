export type Category = string
export type Kind = 'in' | 'out'

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

/** Categoria pelas regras, ou null se nenhuma bate. */
export function matchCategory(text: string): Category | null {
  const t = strip(text)
  for (const [cat, words] of Object.entries(RULES)) if (words.some((w) => strip(w).trim() && t.includes(strip(w)))) return cat
  return null
}

export const categorize = (text: string): Category => matchCategory(text) ?? 'Outros'
