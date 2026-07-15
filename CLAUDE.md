# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Gap is a sales-management SaaS for marketplace sellers (Shopee-first, Portuguese-BR UI). It is a single-page React app with two thin serverless proxies. The financial modules are pure client-side math and run 100% offline; the AI modules (ad copy, image generation, analytics) call the proxies. All strings, variable names, and domain terms are in Portuguese — match that when writing code.

## Commands

```bash
npm install        # first run
npm run dev        # Vite dev server (http://localhost:5173) — AI proxies do NOT work here
npm run build      # production build to dist/
npm run preview    # serve the built dist/ locally
npm run lint       # ESLint (flat config; dist/ ignored)
vercel dev         # run locally WITH the /api serverless proxies (needed to exercise AI features)
```

There is no test suite. Deployment target is Vercel (auto-detects Vite). Set `ANTHROPIC_API_KEY` and `GOOGLE_API_KEY` in Vercel env for the AI proxies.

## Architecture

**State: one global context, localStorage-backed.** `src/lib/store.jsx` (`GapProvider` / `useGap`) holds all app state. On mount it loads each slice from localStorage; a single save-`useEffect` writes every persisted slice back whenever any of them change (debounced via the `salvando` status flag). To add persisted state you must touch three places in `store.jsx`: the `useState`, the load block, and the save block + dependency array. `storage.js` wraps localStorage behind an async `get/set/remove/list` interface (keys prefixed `gap:`) and also exposes it as `window.storage` for ported code.

**Session-only vs persisted.** `pedidos` (orders) and `transacoes` (Shopee statement) are deliberately NOT persisted — they are re-imported from spreadsheets each session to keep localStorage light. Everything else persists. Don't add these to the save block.

**Navigation is switch-based, no router.** `App.jsx` renders one module by a `section` string; `NAV`/`NAV_SECTIONS` in `constants.js` drive the sidebar. Adding a screen = add a `NAV` entry + a `case` in `App.jsx`'s `render()`.

**Modules** (`src/modules/`) are the screens; each is a self-contained default-export component taking `{ onMenu }`. Shared UI primitives (`Topbar`, `Card`, `EmptyState`, `NumInput`, `Badge`, `NavIcon`, …) live in `src/lib/ui.jsx`; formatting/helpers (`fmt` currency, `pct`, `pn` parse-number, SKU-prefix extraction, image compression) in `src/lib/utils.js`.

### AI proxies (`api/`)

Serverless functions that keep API keys server-side; the browser never sees them.
- `api/claude.js` → Anthropic Messages API (model `claude-sonnet-4-6`). Client calls it via `apiFetch(messages, maxTokens, system)` in `src/lib/api.js`.
- `api/gemini.js` → Google `gemini-2.5-flash-image` ("Nano Banana") for image generation. Client calls `generateImage(prompt, images, aspectRatio)`. Note the proxy must request `responseModalities: ["TEXT","IMAGE"]` — image-only fails.
- `api.js` also exports `traduzir()` (Claude-based EN↔PT prompt translation).

**AI "skills" are prompt strings, not code.** `src/skills/estiloVisual.js` (`ESTILO_VISUAL`) and `src/skills/regrasSequencia.js` (`REGRAS_SEQUENCIA`) are large Portuguese system prompts passed as the `system` argument to `apiFetch`. They define the two-agent image pipeline in `Imagens.jsx`: Agent 1 (strategist) plans a 6–8 image sequence as JSON via `REGRAS_SEQUENCIA`; Agent 2 (art director) writes an English generation prompt per slot via `ESTILO_VISUAL`, which is then translated to PT for the user and sent to Gemini. Edit these files to change AI behavior — prefer prompt edits over restructuring the calling code.

### Shopee spreadsheet parsing

Two separate import paths, both using `xlsx` (SheetJS):
- `src/lib/shopeeParser.js` — parses Shopee **analytics** reports for the Analista module. `parseShopeeReport(arrayBuffer)` sniffs the report type from sheet names/headers (`detectarTipo`) and dispatches to a type-specific parser, returning `{ tipo, ... }` and never throwing. Adding a report type = add detection + a parser + a `case` + a `TIPO_LABEL` entry.
- `Financeiro.jsx` has its own inline order/statement parsing (`processarPedidos`, statement reader) for the financial closing. Column matching everywhere is alias-based and tolerant — Shopee renames headers, so match on `includes()` against several aliases rather than exact strings, and use the `pnBR`/`pn` helpers for BR-formatted numbers ("1.834,90" → 1834.90).

### Domain model to know

- **Products key off an SKU prefix.** A product stores a `prefixo`; order rows are attributed to it via `extrairPrefixoSKU(sku)` (everything before the color/size suffix). Unit cost = sum of `insumos` (materials × qty) + `custosProd` (e.g. labor), computed by `calcCustoUnitario` (exported from `Produtos.jsx` and reused in `Financeiro.jsx`).
- **Marketplaces** (`MPS_DEFAULT` in `constants.js`) carry `comissao`/`afiliado`/`taxaFixa` rates used in margin/DRE math; only Shopee is active by default. `imposto` (tax %) is a separate global.
- The app ships with **no seed data** — all default lists are intentionally empty. Don't add example data.
