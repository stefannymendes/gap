# Gap — Gestão de vendas

Sistema de gestão para vendedores de marketplace. Esta é a **primeira etapa fora do
chat**: o módulo **Financeiro** completo, com **Produtos** como seção própria.
Sistema entregue **limpo** — sem dados de exemplo.

## O que já está nesta versão

- **Início** — primeiros passos e sazonalidade do mês
- **Produtos** — cadastro por prefixo de SKU (vincula automaticamente as variações ao custo)
- **Financeiro** — Fechamento (DRE, fluxo de caixa, indicadores, histórico, ranking de SKUs,
  cruzamento de pagamentos, pedidos), Extrato Shopee e Saídas Variáveis
- **Custos fixos** — seção própria
- **Configurações** — imposto e reset de dados

> Os módulos de **IA** (Anúncios, Analista) entram nas próximas etapas, porque dependem
> da chave de API. O financeiro **não usa IA** — é só cálculo, roda 100% offline.

Seus dados ficam salvos **neste navegador** (localStorage). Pedidos e extrato não são
salvos — reimporte a planilha a cada sessão (isso é de propósito, pra não pesar).

---

## Como rodar no seu computador

Você precisa do **Node.js** instalado (https://nodejs.org — versão LTS).

Abra o terminal na pasta do projeto e rode:

```bash
npm install      # só na primeira vez — baixa as dependências
npm run dev      # inicia o sistema
```

Vai aparecer um endereço tipo `http://localhost:5173` — abra no navegador.

Para gerar a versão final (build de produção):

```bash
npm run build    # cria a pasta dist/
npm run preview  # testa o build localmente
```

## Como colocar online (Vercel — grátis)

1. Crie conta em https://vercel.com
2. Suba o projeto (arraste a pasta ou conecte um repositório Git)
3. A Vercel detecta Vite automaticamente e publica

> O proxy de IA (`api/claude.js`) e a variável `ANTHROPIC_API_KEY` só são necessários
> quando os módulos de IA forem ativados, nas próximas etapas. Por enquanto, ignore.

---

## Estrutura

```
src/
  App.jsx              casca + barra lateral
  main.jsx             ponto de entrada
  index.css            design system
  lib/
    store.jsx          estado compartilhado (GapProvider)
    storage.js         salva no navegador (localStorage)
    constants.js       NAV, sazonalidade, listas (tudo limpo)
    utils.js           formatação e helpers
    ui.jsx             componentes compartilhados
    api.js             cliente de IA (usado nas próximas etapas)
  modules/
    Home.jsx
    Produtos.jsx
    Financeiro.jsx     fechamento + extrato + saídas
    CustosFixos.jsx
    Config.jsx
api/
  claude.js            proxy de IA (Vercel — próximas etapas)
```
