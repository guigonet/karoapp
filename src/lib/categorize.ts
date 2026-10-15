export const CATEGORIES = [
  'Combustível', 'Mercado', 'Farmácia', 'Restaurante', 'Transporte', 'Casa', 'Lazer', 'Outros',
] as const
export type Category = (typeof CATEGORIES)[number]

const RULES: Record<Exclude<Category, 'Outros'>, string[]> = {
  Combustível: ['POSTO', 'IPIRANGA', 'SHELL', 'PETROBRAS', 'BR MANIA', 'GASOLINA', 'ETANOL', 'DIESEL', 'COMBUSTIV'],
  Mercado: ['SUPERMERCADO', 'MERCADO', 'ATACADO', 'ATACADAO', 'ASSAI', 'ANGELONI', 'BISTEK', 'HORTIFRUTI', 'PADARIA', 'ACOUGUE'],
  Farmácia: ['FARMACIA', 'DROGARIA', 'DROGA', 'PANVEL', 'RAIA', 'PACHECO', 'CATARINENSE'],
  Restaurante: ['RESTAURANTE', 'LANCHONETE', 'PIZZARIA', 'CAFE', 'BURGER', 'SORVETERIA', 'CHURRASCARIA'],
  Transporte: ['ESTACIONAMENTO', 'PEDAGIO', 'UBER', 'MECANICA', 'AUTO PECAS', 'BORRACHARIA'],
  Casa: ['CONSTRUCAO', 'MATERIAIS', 'FERRAGEM', 'MOVEIS', 'LEROY', 'TELHA'],
  Lazer: ['CINEMA', 'TEATRO', 'INGRESSO', 'LIVRARIA', 'BRINQUEDO'],
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

export function categorize(text: string): Category {
  const t = strip(text)
  for (const [cat, words] of Object.entries(RULES))
    if (words.some((w) => t.includes(w))) return cat as Category
  return 'Outros'
}
