# App de Finanças com leitura de cupom/nota fiscal (OCR local)

Documento de contexto para continuar o projeto no Claude Code, GitHub e Vercel.

## Objetivo

App de finanças em que o usuário tira foto de um cupom ou nota fiscal e o app lê e interpreta os dados (loja, data, itens, total, categoria), **sem depender de API de IA externa**.

## Decisões já tomadas

- **Não precisa ser app nativo puro.** PWA ou híbrido (Capacitor / React Native com Expo) resolve.
- **Sem API de IA.** Tudo roda no aparelho: OCR local + parser em código + categorização por regras.
- **Tela de conferência obrigatória.** O usuário corrige o que o OCR errou antes de salvar.
- **Deploy:** GitHub + Vercel.

## Arquitetura proposta

```
Foto (câmera/arquivo)
   -> QR code da NFC-e? (atalho, se existir)
   -> OCR local (ML Kit ou Tesseract.js)
   -> Parser (regex + heurísticas)
   -> Categorização por regras
   -> Tela de conferência
   -> Banco local (IndexedDB/SQLite) ou Supabase
```

## As 3 peças principais

### 1. OCR no aparelho

| Opção | Onde roda | Prós | Contras |
|---|---|---|---|
| ML Kit (Google) | Android/iOS (Capacitor ou React Native) | Grátis, offline, melhor qualidade | Exige app híbrido/nativo |
| Tesseract.js | Navegador (PWA) | Offline, sem instalar nada | Mais fraco em cupom térmico |

Câmera no PWA: `<input type="file" accept="image/*" capture="environment">`.

### 2. Parser

Código próprio que extrai do texto do OCR:
- CNPJ, data, valor total, itens
- Cupom fiscal tem padrões fixos ("VALOR TOTAL", CNPJ etc.), mas cada mercado imprime de um jeito, então o parser precisa de ajuste contínuo.
- Guardar um conjunto de cupons reais (anonimizados) para testes.

### 3. Categorização por regras

Dicionário de palavras-chave, por exemplo: "POSTO", "IPIRANGA" -> Combustível; "SUPERMERCADO" -> Mercado.

## QR code da NFC-e

- O QR traz a **chave de acesso de 44 dígitos** (contém CNPJ, data e número da nota).
- Na emissão normal, o QR **não** traz total nem itens. Para obtê-los é preciso consultar a SEFAZ (exige internet).
- **A verificar:** em notas emitidas em contingência offline o QR pode incluir valor total e data. Confirmar na documentação oficial (Manual de Orientação do Contribuinte da NFC-e).
- O acesso à consulta varia por estado e alguns usam captcha. **Testar primeiro com notas de SC.**
- Usar o QR como atalho e o OCR como plano B para cupom sem QR ou ilegível.

## IA pequena rodando no aparelho (opcional, fase futura)

- Existe (modelos de visão pequenos via ONNX ou WebGPU), mas pesa gigas e é lenta em celular comum.
- Só considerar depois que OCR + parser estiverem funcionando e a precisão ainda incomodar.

## Riscos e limitações aceitas

- Cupom amassado, desbotado ou torto gera erro de leitura (inevitável com OCR puro).
- Trabalho contínuo de manutenção do parser.
- Se a precisão ficar insuficiente, plano B: plugar uma API de visão **atrás de uma função serverless** (nunca colocar chave de API dentro do app).

## Plano de execução sugerido

1. [x] Definir formato: PWA puro ou Capacitor (decide qual OCR usar)
2. [x] Criar repositório no GitHub e projeto no Vercel
3. [x] Tela de captura de foto + pré-visualização
4. [x] Integrar OCR (Tesseract.js no PWA ou ML Kit no Capacitor)
5. [ ] Montar banco de teste com 20 a 30 cupons reais
6. [ ] Escrever o parser (total, data, CNPJ, itens) e medir a taxa de acerto
7. [x] Categorização por regras
8. [x] Tela de conferência/edição
9. [ ] Leitura do QR code + teste de consulta na SEFAZ-SC
10. [~] Armazenamento (local ou Supabase) e telas de relatório

## Stack sugerida

- Front: React/Next.js (PWA) ou React Native + Expo / Capacitor
- OCR: Tesseract.js ou ML Kit
- Leitura de QR: `jsQR` ou `html5-qrcode` (web); ML Kit Barcode Scanning (nativo)
- Dados: IndexedDB / SQLite local, ou Supabase
- Deploy: Vercel

## Pontos em aberto

- PWA puro ou Capacitor? Começamos com PWA + Tesseract.js; reavaliar se a precisão ficar ruim
- Dados só no aparelho ou sincronizados na nuvem?
- App de uso individual/familiar ou multiusuário?
