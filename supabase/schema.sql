-- ============================================================================
-- Gap — Schema Supabase (Etapa 1)
-- ============================================================================
-- Rode este arquivo INTEIRO no SQL Editor do painel do Supabase.
-- É idempotente o suficiente para rodar de novo (usa "if not exists" / "drop
-- policy if exists"). Não migra dados — só cria estrutura + RLS.
--
-- Convenções (todas as tabelas):
--   id         uuid   default gen_random_uuid() primary key
--   user_id    uuid   not null default auth.uid() references auth.users
--   created_at timestamptz default now()
--
-- Segurança: RLS ativo em TODAS as tabelas. A política padrão deixa o usuário
-- autenticado ler/inserir/atualizar/deletar SOMENTE as próprias linhas
-- (user_id = auth.uid()). Nenhuma tabela é acessível sem autenticação.
--
-- Os campos espelham o que os módulos guardam hoje no localStorage — não há
-- campos inventados. Campos de estrutura variável (arrays, objetos) são jsonb.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. produtos
--    Módulo Produtos: { nome, prefixo, insumos:[{insumoId,nome,qtd,custo}],
--    custosProd:[{nome,valor}] }. custo = custo unitário calculado
--    (soma insumos + custos de produção), guardado para consulta rápida.
-- ----------------------------------------------------------------------------
create table if not exists public.produtos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  prefixo_sku text not null,
  nome        text not null default '',
  custo       numeric not null default 0,   -- custo unitário calculado
  insumos     jsonb not null default '[]'::jsonb,
  custos_prod jsonb not null default '[]'::jsonb,
  unique (user_id, prefixo_sku)
);

-- ----------------------------------------------------------------------------
-- 2. custos_fixos
--    Módulo Custos fixos: { nome, valor }.
-- ----------------------------------------------------------------------------
create table if not exists public.custos_fixos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  nome       text not null default '',
  valor      numeric not null default 0
);

-- ----------------------------------------------------------------------------
-- 3. saidas_variaveis
--    Módulo Financeiro (saídas variáveis / despesas):
--    { fornecedor, categoria, descricao, valor, vencimento, pago, dataPagamento }.
-- ----------------------------------------------------------------------------
create table if not exists public.saidas_variaveis (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  created_at      timestamptz not null default now(),
  fornecedor      text not null default '',
  categoria       text not null default '',
  descricao       text not null default '',
  valor           numeric not null default 0,
  vencimento      date,
  pago            boolean not null default false,
  data_pagamento  date
);

-- ----------------------------------------------------------------------------
-- 4. pedidos
--    Importados da planilha Shopee (hoje NÃO persistidos — reimportados por
--    sessão). A deduplicação passa a ser do banco: unique (user_id, pedido_id, sku).
--    No import, usar upsert com on conflict do nothing.
--
--    REGRAS INEGOCIÁVEIS:
--    - Receita usa preco_acordado, NUNCA valor_total (que inclui frete do comprador).
--      valor_total fica só para referência/auditoria.
--    - custo_congelado é CÓPIA do custo do produto no momento do import —
--      nunca é FK/join com produtos.custo. Editar produto não altera pedido passado.
--    - aplica_imposto marca a 1ª linha de pedidos multi-variação (é o
--      `primeiraLinha` do código): só essa linha recebe imposto/taxas fixas.
-- ----------------------------------------------------------------------------
create table if not exists public.pedidos (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users on delete cascade,
  created_at             timestamptz not null default now(),

  pedido_id              text not null,          -- id do pedido na Shopee
  sku                    text not null default '',
  prefixo_sku            text,                   -- extrairPrefixoSKU(sku)
  nome_produto           text,
  variacao               text,

  preco_original         numeric,
  preco_acordado         numeric,                -- FONTE DA RECEITA
  quantidade             integer not null default 1,
  valor_total            numeric,                -- só referência/auditoria (inclui frete)

  comissao_liq           numeric,
  servico_liq            numeric,
  total_global           numeric,
  cupom_vendedor         numeric,
  leve_mais_vendedor     numeric,
  ajuste_acao_comercial  numeric,

  custo_congelado        numeric,                -- cópia do custo no import (sem FK)
  nome_produto_congelado text,

  aplica_imposto         boolean not null default false,  -- = primeiraLinha

  status                 text,
  devolucao              text,
  cancelado              boolean not null default false,
  entregue               boolean not null default false,
  enviado                boolean not null default false,
  a_enviar               boolean not null default false,
  em_devolucao           boolean not null default false,

  data_criacao           text,                   -- data de criação do pedido
  data_entrega           text,                   -- data de entrega
  mes_criacao            text,                   -- chave "YYYY-MM"
  mes_entrega            text,

  unique (user_id, pedido_id, sku)
);

-- ----------------------------------------------------------------------------
-- 5. fechamentos
--    Snapshot consolidado do DRE mensal calculado no módulo Financeiro.
--    O detalhe (resumoTotal + escalares derivados + rankingSKU) vai em jsonb.
-- ----------------------------------------------------------------------------
create table if not exists public.fechamentos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  created_at     timestamptz not null default now(),
  mes_referencia text not null,                  -- competência "YYYY-MM"
  receita_total  numeric not null default 0,     -- soma de preco_acordado do mês
  dre            jsonb not null default '{}'::jsonb,  -- snapshot completo do DRE
  unique (user_id, mes_referencia)
);

-- ----------------------------------------------------------------------------
-- 6. tarefas
--    Módulo Tarefas: { titulo, descricao, prioridade, categoria, marketplace,
--    prazo, recorrente, concluida, geradoPorIA }.
-- ----------------------------------------------------------------------------
create table if not exists public.tarefas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  created_at    timestamptz not null default now(),
  titulo        text not null default '',
  descricao     text not null default '',
  prioridade    text not null default 'media',
  categoria     text not null default 'Outros',
  marketplace   text not null default 'todas',
  prazo         date,
  recorrente    boolean not null default false,
  concluida     boolean not null default false,
  gerado_por_ia boolean not null default false
);

-- ----------------------------------------------------------------------------
-- 7. metas
--    Módulo Metas (singleton por usuário): { metaDiaria, metaPrazo,
--    metaContexto, ultimaAnalise }.
-- ----------------------------------------------------------------------------
create table if not exists public.metas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  created_at     timestamptz not null default now(),
  meta_diaria    numeric not null default 20,
  meta_prazo     date,
  meta_contexto  text not null default '',
  ultima_analise text not null default '',
  unique (user_id)
);

-- ----------------------------------------------------------------------------
-- 8. fichas_produto
--    Ficha usada no módulo Imagens (singleton por usuário hoje). Estrutura rica
--    e em migração (cores→variacoes) — jsonb guarda o objeto inteiro.
-- ----------------------------------------------------------------------------
create table if not exists public.fichas_produto (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  ficha      jsonb not null default '{}'::jsonb,
  unique (user_id)
);

-- ----------------------------------------------------------------------------
-- 9. skills_config
--    Configuração de skills por vendedor (futura camada de identidade do
--    onboarding): { modulo, config }.
-- ----------------------------------------------------------------------------
create table if not exists public.skills_config (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  modulo     text not null,
  config     jsonb not null default '{}'::jsonb,
  unique (user_id, modulo)
);

-- ----------------------------------------------------------------------------
-- 10. repertorio
--     Estilos favoritos do módulo Imagens (promptsFavoritos):
--     { prompt(EN), promptPt, tipo(slot), produto, data }.
-- ----------------------------------------------------------------------------
create table if not exists public.repertorio (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  prompt_en  text not null default '',           -- prompt em inglês (campo `prompt`)
  prompt_pt  text not null default '',           -- tradução PT (campo `promptPt`)
  tipo       text,                               -- slot/posição (ex: hero_capa, inspiracao)
  produto    text,
  metadados  jsonb not null default '{}'::jsonb  -- data + extras
);

-- ============================================================================
-- Row Level Security — habilita e aplica a política padrão em TODAS as tabelas.
-- Política única por tabela: o usuário autenticado só acessa as próprias linhas.
-- ============================================================================
do $$
declare
  t text;
  tabelas text[] := array[
    'produtos','custos_fixos','saidas_variaveis','pedidos','fechamentos',
    'tarefas','metas','fichas_produto','skills_config','repertorio'
  ];
begin
  foreach t in array tabelas loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "own_rows" on public.%I;', t);
    execute format($f$
      create policy "own_rows" on public.%I
        for all
        to authenticated
        using (user_id = auth.uid())
        with check (user_id = auth.uid());
    $f$, t);
  end loop;
end $$;

-- ============================================================================
-- Índices auxiliares (consultas por usuário e por mês são as mais comuns).
-- ============================================================================
create index if not exists idx_pedidos_user_mes    on public.pedidos     (user_id, mes_criacao);
create index if not exists idx_saidas_user_venc     on public.saidas_variaveis (user_id, vencimento);
create index if not exists idx_fechamentos_user_mes on public.fechamentos (user_id, mes_referencia);
create index if not exists idx_tarefas_user         on public.tarefas     (user_id, concluida);
create index if not exists idx_repertorio_user      on public.repertorio  (user_id);
