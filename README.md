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
