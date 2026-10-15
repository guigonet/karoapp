# KaRo

App de finanças pessoais (PWA) que lê cupom fiscal / NFC-e pela câmera, **sem API de IA externa**.
Tudo roda no aparelho: OCR local, parser em código, categorização por regras e banco local (IndexedDB).

Contexto e decisões: [app-financas-ocr.md](app-financas-ocr.md).

## Rodar

```bash
npm install
npm run dev      # desenvolvimento
npm test         # parser, categorização, QR
npm run build    # produção (gera PWA em dist/)
npm run icons    # regenera a moeda 8-bit (public/icon*.png)
```

## Como funciona

`foto → QR da NFC-e (chave de acesso) → OCR (Tesseract.js, pt-BR) → parser → categoria → conferência → IndexedDB`

| Arquivo | Papel |
|---|---|
| `src/lib/ocr.ts` | pré-processa a imagem (cinza + contraste) e roda o Tesseract |
| `src/lib/parser.ts` | extrai loja, CNPJ, data, total e itens do texto do OCR |
| `src/lib/categorize.ts` | categoria por palavras-chave |
| `src/lib/qr.ts` | lê o QR e extrai UF, mês, CNPJ e nº da nota da chave de 44 dígitos |
| `src/lib/db.ts` | banco local (Dexie) |
| `src/App.tsx` | telas: início, ler cupom, conferência |

## Observações

- O Tesseract baixa o idioma português (`por`) na primeira leitura e depois guarda em cache. Para uso 100% offline desde o primeiro uso, falta empacotar o `por.traineddata` em `public/`.
- O parser foi escrito contra um cupom de exemplo. Precisa de ajuste com cupons reais (passo 5 do plano).
- O QR traz só a chave de acesso. Total e itens exigem consulta à SEFAZ (ainda não implementada).

## Deploy

Vercel: importar o repositório. Framework Vite, build `npm run build`, saída `dist`.

## Ler com IA (opcional)

Botão "✨ Ler com IA" na tela de conferência: manda a foto para o Claude (Haiku 5.5) por uma função da Vercel
([api/read.ts](api/read.ts)). A chave da Anthropic fica só na Vercel, nunca no app.

Variáveis em Vercel → Settings → Environment Variables (depois, redeploy):

| Variável | O que é |
|---|---|
| `ANTHROPIC_API_KEY` | chave criada em console.anthropic.com |
| `KARO_TEST_TOKEN` | senha de teste; sem ela a função recusa o pedido (protege o seu crédito) |

Modo de teste: abra o app com `?debug=1` para ver o balão vermelho de gasto. Toque nele para informar a senha de teste.
`?debug=0` desliga.

O app só guarda loja, CNPJ da empresa, valores e itens. CPF nunca é salvo.
