// Camada de dados do Supabase para os módulos migrados (Etapa 3):
// produtos, custos_fixos, saidas_variaveis, pedidos, fechamentos.
//
// Regra de ouro: o app continua usando as MESMAS formas em memória (camelCase)
// de antes. Aqui só traduzimos app <-> banco (snake_case). Assim nenhum leitor
// (Home, Metas, Analytics, o cálculo do fechamento) precisa mudar.
//
// RLS cuida do isolamento por usuário; ainda assim enviamos user_id nos
// inserts/upserts para casar com o índice de conflito (user_id, ...).

import { supabase } from "./supabase";
import { calcCustoUnitario, pn } from "./utils";

const num = v => (v === null || v === undefined || v === "" ? null : Number(v));
const numOr0 = v => Number(v) || 0;

// ───────────────────────── produtos ─────────────────────────
const rowToProduto = r => ({
  id: r.id,
  nome: r.nome || "",
  prefixo: r.prefixo_sku || "",
  insumos: r.insumos || [],
  custosProd: r.custos_prod || [],
});
const produtoToRow = (userId, p) => ({
  id: p.id,
  user_id: userId,
  prefixo_sku: p.prefixo,
  nome: p.nome || "",
  custo: calcCustoUnitario(p),
  insumos: p.insumos || [],
  custos_prod: p.custosProd || [],
});

export async function fetchProdutos() {
  const { data, error } = await supabase.from("produtos").select("*").order("created_at", { ascending: true });
  return { data: (data || []).map(rowToProduto), error };
}
export const insertProduto = (userId, p) => supabase.from("produtos").insert(produtoToRow(userId, p));
export const updateProdutoDb = (userId, p) => supabase.from("produtos").update(produtoToRow(userId, p)).eq("id", p.id);
export const deleteProdutoDb = id => supabase.from("produtos").delete().eq("id", id);
export const bulkInsertProdutos = (userId, list) => supabase.from("produtos").insert(list.map(p => produtoToRow(userId, p)));

// ─────────────────────── custos_fixos ───────────────────────
const rowToCusto = r => ({ id: r.id, nome: r.nome || "", valor: numOr0(r.valor) });
const custoToRow = (userId, c) => ({ id: c.id, user_id: userId, nome: c.nome || "", valor: pn(c.valor) });

export async function fetchCustosFixos() {
  const { data, error } = await supabase.from("custos_fixos").select("*").order("created_at", { ascending: true });
  return { data: (data || []).map(rowToCusto), error };
}
export const insertCustoFixo = (userId, c) => supabase.from("custos_fixos").insert(custoToRow(userId, c));
export const updateCustoFixoDb = (userId, c) => supabase.from("custos_fixos").update(custoToRow(userId, c)).eq("id", c.id);
export const deleteCustoFixoDb = id => supabase.from("custos_fixos").delete().eq("id", id);
export const bulkInsertCustosFixos = (userId, list) => supabase.from("custos_fixos").insert(list.map(c => custoToRow(userId, c)));

// ───────────────────── saidas_variaveis ─────────────────────
const rowToSaida = r => ({
  id: r.id,
  fornecedor: r.fornecedor || "",
  categoria: r.categoria || "",
  descricao: r.descricao || "",
  valor: numOr0(r.valor),
  vencimento: r.vencimento || "",
  pago: !!r.pago,
  dataPagamento: r.data_pagamento || "",
});
const saidaToRow = (userId, s) => ({
  id: s.id,
  user_id: userId,
  fornecedor: s.fornecedor || "",
  categoria: s.categoria || "",
  descricao: s.descricao || "",
  valor: pn(s.valor),
  vencimento: s.vencimento || null,
  pago: !!s.pago,
  data_pagamento: s.dataPagamento || null,
});

export async function fetchSaidas() {
  const { data, error } = await supabase.from("saidas_variaveis").select("*").order("created_at", { ascending: true });
  return { data: (data || []).map(rowToSaida), error };
}
export const insertSaida = (userId, s) => supabase.from("saidas_variaveis").insert(saidaToRow(userId, s));
export const updateSaidaDb = (userId, s) => supabase.from("saidas_variaveis").update(saidaToRow(userId, s)).eq("id", s.id);
export const deleteSaidaDb = id => supabase.from("saidas_variaveis").delete().eq("id", id);
export const bulkInsertSaidas = (userId, list) => supabase.from("saidas_variaveis").insert(list.map(s => saidaToRow(userId, s)));

// ───────────────────────── pedidos ──────────────────────────
// O `id` do app é o id do pedido na Shopee (= pedido_id). O uuid da linha é
// interno e nunca aparece no app. Dedup é do banco (user_id, pedido_id, sku).
const rowToPedido = r => ({
  id: r.pedido_id,
  status: r.status || "",
  devolucao: r.devolucao || "",
  dataCriacao: r.data_criacao || "",
  dataEntrega: r.data_entrega || "",
  mesCriacao: r.mes_criacao || "",
  mesEntrega: r.mes_entrega || "",
  nomeProduto: r.nome_produto || "",
  sku: r.sku || "",
  prefixoSKU: r.prefixo_sku || "",
  variacao: r.variacao || "",
  precoOriginal: numOr0(r.preco_original),
  precoAcordado: numOr0(r.preco_acordado),
  quantidade: numOr0(r.quantidade) || 1,
  valorTotal: numOr0(r.valor_total),
  comissaoLiq: numOr0(r.comissao_liq),
  servicoLiq: numOr0(r.servico_liq),
  totalGlobal: numOr0(r.total_global),
  cupomVendedor: numOr0(r.cupom_vendedor),
  leveMaisVendedor: numOr0(r.leve_mais_vendedor),
  ajusteAcaoComercial: numOr0(r.ajuste_acao_comercial),
  custoCongelado: r.custo_congelado === null || r.custo_congelado === undefined ? null : Number(r.custo_congelado),
  nomeProdutoCongelado: r.nome_produto_congelado ?? null,
  cancelado: !!r.cancelado,
  entregue: !!r.entregue,
  enviado: !!r.enviado,
  aEnviar: !!r.a_enviar,
  emDevolucao: !!r.em_devolucao,
  primeiraLinha: !!r.aplica_imposto,
});
const pedidoToRow = (userId, p) => ({
  user_id: userId,
  pedido_id: p.id,
  sku: p.sku || "",
  prefixo_sku: p.prefixoSKU || null,
  nome_produto: p.nomeProduto || null,
  variacao: p.variacao || null,
  preco_original: num(p.precoOriginal),
  preco_acordado: num(p.precoAcordado),
  quantidade: numOr0(p.quantidade) || 1,
  valor_total: num(p.valorTotal),
  comissao_liq: num(p.comissaoLiq),
  servico_liq: num(p.servicoLiq),
  total_global: num(p.totalGlobal),
  cupom_vendedor: num(p.cupomVendedor),
  leve_mais_vendedor: num(p.leveMaisVendedor),
  ajuste_acao_comercial: num(p.ajusteAcaoComercial),
  custo_congelado: p.custoCongelado === null || p.custoCongelado === undefined ? null : Number(p.custoCongelado),
  nome_produto_congelado: p.nomeProdutoCongelado ?? null,
  aplica_imposto: !!p.primeiraLinha,
  status: p.status || null,
  devolucao: p.devolucao || null,
  cancelado: !!p.cancelado,
  entregue: !!p.entregue,
  enviado: !!p.enviado,
  a_enviar: !!p.aEnviar,
  em_devolucao: !!p.emDevolucao,
  data_criacao: p.dataCriacao || null,
  data_entrega: p.dataEntrega || null,
  mes_criacao: p.mesCriacao || null,
  mes_entrega: p.mesEntrega || null,
});

export async function fetchPedidos() {
  // Paginação: o banco pode ter mais de 1000 pedidos (limite padrão do PostgREST).
  const PAGE = 1000;
  let from = 0, all = [], error = null;
  for (;;) {
    const { data, error: e } = await supabase
      .from("pedidos").select("*").order("created_at", { ascending: true }).range(from, from + PAGE - 1);
    if (e) { error = e; break; }
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return { data: all.map(rowToPedido), error };
}

// Insere pedidos novos; ignora os que já existem (on conflict do nothing).
// Retorna { novos, existentes } contando o que realmente entrou.
export async function upsertPedidos(userId, lista) {
  const rows = lista.map(p => pedidoToRow(userId, p));
  const { data, error } = await supabase
    .from("pedidos")
    .upsert(rows, { onConflict: "user_id,pedido_id,sku", ignoreDuplicates: true })
    .select("pedido_id");
  const novos = data ? data.length : 0;
  return { novos, existentes: rows.length - novos, error };
}
export const deleteAllPedidos = userId => supabase.from("pedidos").delete().eq("user_id", userId);

// ──────────────────────── fechamentos ───────────────────────
const rowToFechamento = r => ({
  id: r.id,
  mesReferencia: r.mes_referencia,
  receitaTotal: numOr0(r.receita_total),
  dre: r.dre || {},
  createdAt: r.created_at,
});

export async function fetchFechamentos() {
  const { data, error } = await supabase.from("fechamentos").select("*").order("mes_referencia", { ascending: false });
  return { data: (data || []).map(rowToFechamento), error };
}
// Upsert por mês (sobrescreve o snapshot do mês se já existir).
export const saveFechamentoDb = (userId, mesReferencia, receitaTotal, dre) =>
  supabase.from("fechamentos").upsert(
    { user_id: userId, mes_referencia: mesReferencia, receita_total: receitaTotal, dre },
    { onConflict: "user_id,mes_referencia" }
  );
