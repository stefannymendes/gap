// Parser dos relatórios da Shopee.
// Recebe uma workbook (via SheetJS) e detecta o tipo pelo cabeçalho.
// Nunca lança exceção — retorna { tipo, dados } ou { tipo:"desconhecido", ... }.

import * as XLSX from "xlsx";

// ── Utils ─────────────────────────────────────────────
export const pnBR = (v) => {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (!s || s === "-" || s === "—") return 0;
  // "1.834,90" → 1834.90 ; "22,52%" → 22.52
  const clean = s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(clean);
  return isNaN(n) ? 0 : n;
};

// Extrai "YYYY-MM-DD" de qualquer célula da Shopee
export const extrairData = (v) => {
  if (!v) return null;
  const s = String(v);
  // formato "06/07/2026" ou "06/07/2026 15:00"
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
};

// Extrai hora de string tipo "06/07/2026 15:00" → 15
export const extrairHora = (v) => {
  if (!v) return null;
  const s = String(v);
  const m = s.match(/(\d{2}):(\d{2})/);
  if (m) return Number(m[1]);
  return null;
};

const norm = (s) => String(s || "").toLowerCase().trim().replace(/\s+/g, " ");

// ── Detecção do tipo de relatório ─────────────────────
// Retorna: "sales_overview" | "shop_stats" | "product_overview" | "product_performance"
// | "product_traffic" | "product_diagnostics" | "sales_composition" | "parent_sku"
// | "flash_sale" | "desconhecido"
function detectarTipo(wb) {
  const nomesAbas = wb.SheetNames.map(norm);
  const primeiraLinhas = wb.SheetNames.map(n => {
    const ws = wb.Sheets[n];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    return rows.slice(0, 6).map(r => r.map(c => norm(c)));
  });

  const contem = (frase) => primeiraLinhas.some(rows => rows.some(r => r.some(c => c.includes(frase))));

  // Ordem importa: mais específico primeiro
  if (contem("taxa de conversão (visitados a feitos)") && contem("taxa de conversão (visitados a pagos)")) return "sales_overview";

  // Diagnóstico: identificar pelo nome das abas (mais específico)
  if (nomesAbas.some(n => n.includes("diminuição nas vendas") || n.includes("diminuicao nas vendas") ||
                          n.includes("avaliações ruins") || n.includes("avaliacoes ruins") ||
                          n.includes("cancelamento") || n.includes("envio atrasado") ||
                          n.includes("baixa de conversão") || n.includes("baixa taxa de conversão") ||
                          n.includes("baixa de conversao") || n.includes("solicitações"))) return "product_diagnostics";

  // Parent SKU: identificar pela aba "Produtos com Melhor Desempenho" + coluna SKU Principle
  if (nomesAbas.some(n => n.includes("produtos com melhor desempenho")) && contem("sku principle")) return "parent_sku";

  // Shop Stats: aba "Pedido Feito"/"Produto Pago" com colunas Vendas + Visitantes na aba principal, sem Impressões AI aba principal
  const abaPrincipal = primeiraLinhas[0] || [];
  const abaPrincipalTem = (frase) => abaPrincipal.some(r => r.some(c => c.includes(frase)));
  if (nomesAbas.some(n => n === "pedido feito" || n === "produto pago") &&
      abaPrincipalTem("vendas (brl)") && abaPrincipalTem("visitantes") && !abaPrincipalTem("impressões de produto") && !abaPrincipalTem("impressão do produto")) return "shop_stats";

  // Performance vs Traffic — chave é o nome da PRIMEIRA aba
  const primeiraAbaNorm = norm(wb.SheetNames[0]);
  if (primeiraAbaNorm.includes("performance do produto")) return "product_performance";
  // Se não é Performance, pode ser Traffic (aba única tipo "(pedido pago)Tráfego")
  if (nomesAbas.some(n => n.includes("tráfego") || n.includes("trafego"))) {
    // Ambos têm "impressões" — decide pela ausência de "Performance do Produto"
    return "product_traffic";
  }
  // Fallback antigo (caso o nome da aba mude no futuro)
  if (abaPrincipalTem("impressões de produto") && abaPrincipalTem("cliques por produto") && abaPrincipalTem("taxa de conversão de pedido")) {
    const temHora = primeiraLinhas.some(rows => rows.some(r => r.some(c => /\d{2}\/\d{2}\/\d{4} \d{2}:00/.test(c))));
    const primeiroCabecalho = primeiraLinhas[0]?.[0] || [];
    const isTraffic = primeiroCabecalho.some(c => c === "id do item") && !temHora;
    if (isTraffic) return "product_traffic";
    return "product_performance";
  }

  if (contem("visitantes do produto (visita)") && contem("visitantes do produto (adicionar ao carrinho)") && !contem("performance")) return "product_overview";
  if (nomesAbas.some(n => n.includes("composição")) || contem("categoria shopee") || contem("variação de preço")) return "sales_composition";
  if (contem("vendas por comprador") && contem("compradores (pedidos feitos)")) return "flash_sale";

  return "desconhecido";
}

// ── Encontra cabeçalho e mapeia colunas ───────────────
function acharCabecalho(rows, camposObrigatorios) {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i].map(norm);
    const encontrou = camposObrigatorios.every(campo =>
      r.some(c => c.includes(campo))
    );
    if (encontrou) return i;
  }
  return -1;
}

function mapearColunas(header, mapa) {
  const h = header.map(norm);
  const idx = {};
  for (const [chave, aliases] of Object.entries(mapa)) {
    idx[chave] = -1;
    for (const alias of aliases) {
      const i = h.findIndex(c => c.includes(alias));
      if (i >= 0) { idx[chave] = i; break; }
    }
  }
  return idx;
}

// ── Parsers específicos ───────────────────────────────

function parseSalesOverview(wb) {
  // Aba única "Visão Geral das Vendas" — resumo total + linhas por hora
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const hIdx = acharCabecalho(rows, ["data", "visitantes", "vendas por comprador"]);
  if (hIdx < 0) return null;
  const cols = mapearColunas(rows[hIdx], {
    data: ["data"],
    visitantes: ["visitantes (visitar)", "visitantes"],
    compradoresFeitos: ["compradores (pedidos feitos)"],
    unidadesFeitos: ["unidades (pedidos feitos)"],
    pedidosFeitos: ["pedidos (pedidos feitos)"],
    vendasFeitos: ["vendas (pedidos feitos)"],
    convVisitFeitos: ["taxa de conversão (visitados a feitos)"],
    compradoresPagos: ["compradores (pedidos pagos)"],
    unidadesPagos: ["unidades (pedidos pagos)"],
    pedidosPagos: ["pedidos (pedidos pagos)"],
    vendasPagos: ["vendas (pedidos pagos)"],
    ticketPagos: ["vendas por comprador (pedidos pagos)"],
    convVisitPagos: ["taxa de conversão (visitados a pagos)"],
    convFeitosPagos: ["taxa de conversão (feitos a pagos)"],
  });
  const horas = [];
  let resumo = null;
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => !c)) continue;
    const rawData = r[cols.data];
    const hora = extrairHora(rawData);
    const data = extrairData(rawData);
    if (!data) continue;
    const entry = {
      hora, data,
      visitantes: pnBR(r[cols.visitantes]),
      pedidos: pnBR(r[cols.pedidosPagos]),
      vendas: pnBR(r[cols.vendasPagos]),
      compradores: pnBR(r[cols.compradoresPagos]),
      unidades: pnBR(r[cols.unidadesPagos]),
      ticket: pnBR(r[cols.ticketPagos]),
      conversaoVP: pnBR(r[cols.convVisitPagos]),
      conversaoFP: pnBR(r[cols.convFeitosPagos]),
      pedidosFeitos: pnBR(r[cols.pedidosFeitos]),
      vendasFeitos: pnBR(r[cols.vendasFeitos]),
    };
    if (hora === null) resumo = entry;
    else horas.push(entry);
  }
  if (!horas.length && !resumo) return null;
  return { tipo: "sales_overview", data: horas[0]?.data || resumo?.data, horas, resumo };
}

function parseProductOverview(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const hIdx = acharCabecalho(rows, ["data", "visitantes do produto (visita)", "taxa de rejeição"]);
  if (hIdx < 0) return null;
  const cols = mapearColunas(rows[hIdx], {
    data: ["data"],
    visitantes: ["visitantes do produto (visita)"],
    pageviews: ["visualizações da página do produto"],
    itens: ["itens visitados"],
    bounce: ["taxa de rejeição do produto"],
    cliquesBusca: ["cliques em buscas"],
    curtidas: ["curtidas"],
    addCartVisit: ["visitantes do produto (adicionar ao carrinho)"],
    addCartUn: ["unidades (adicionar ao carrinho)"],
    addCartConv: ["taxa de conversão (adicionar ao carrinho)"],
    convFeitos: ["taxa de conversão (pedido realizado)"],
    convPagos: ["taxa de conversão (pedido pago)"],
    pedidosPagos: ["compradores (pedidos pago)", "compradores (pedidos pagos)"],
    unidadesPagos: ["unidades (pedido pago)"],
    vendasPagos: ["vendas (pedido pago)"],
  });
  const horas = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || r.every(c => !c)) continue;
    const rawData = r[cols.data];
    const hora = extrairHora(rawData); const data = extrairData(rawData);
    if (!data || hora === null) continue;
    horas.push({
      hora, data,
      visitantes: pnBR(r[cols.visitantes]),
      pageviews: pnBR(r[cols.pageviews]),
      bounce: pnBR(r[cols.bounce]),
      cliquesBusca: pnBR(r[cols.cliquesBusca]),
      curtidas: pnBR(r[cols.curtidas]),
      addCart: pnBR(r[cols.addCartUn]),
      convFeitos: pnBR(r[cols.convFeitos]),
      convPagos: pnBR(r[cols.convPagos]),
      vendasPagos: pnBR(r[cols.vendasPagos]),
    });
  }
  if (!horas.length) return null;
  return { tipo: "product_overview", data: horas[0].data, horas };
}

function parseShopStats(wb) {
  // Duas abas: "Pedido Feito" e "Produto Pago" — pegamos a Pago
  const abaPago = wb.SheetNames.find(n => norm(n).includes("pago")) || wb.SheetNames[0];
  const ws = wb.Sheets[abaPago];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const hIdx = acharCabecalho(rows, ["tempo", "vendas", "pedidos", "visitantes"]);
  if (hIdx < 0) return null;
  const cols = mapearColunas(rows[hIdx], {
    tempo: ["tempo", "data"],
    vendas: ["vendas (brl)"],
    pedidos: ["pedidos"],
    ticket: ["vendas por pedido"],
    cliques: ["cliques por produto"],
    visitantes: ["visitantes"],
    conversao: ["taxa de conversão"],
  });
  const horas = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || r.every(c => !c)) continue;
    const raw = r[cols.tempo];
    const hora = extrairHora(raw); const data = extrairData(raw);
    if (!data || hora === null) continue;
    horas.push({
      hora, data,
      vendas: pnBR(r[cols.vendas]),
      pedidos: pnBR(r[cols.pedidos]),
      ticket: pnBR(r[cols.ticket]),
      cliques: pnBR(r[cols.cliques]),
      visitantes: pnBR(r[cols.visitantes]),
      conversao: pnBR(r[cols.conversao]),
    });
  }
  if (!horas.length) return null;
  return { tipo: "shop_stats", data: horas[0].data, horas };
}

function parseProductPerformance(wb) {
  // Aba 1: "Performance do Produto" com 2 blocos (agregado + por hora)
  // Aba 2/3: fontes de tráfego
  const abaPrincipal = wb.SheetNames.find(n => norm(n).includes("performance")) || wb.SheetNames[0];
  const ws = wb.Sheets[abaPrincipal];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // Encontra o cabeçalho que tem "Etiqueta" (bloco por hora)
  let hIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].map(norm);
    if (r.some(c => c === "etiqueta") && r.some(c => c === "data")) { hIdx = i; break; }
  }
  if (hIdx < 0) return null;

  const cols = mapearColunas(rows[hIdx], {
    data: ["data"],
    nome: ["produto"],
    itemId: ["id do item"],
    impressoes: ["impressões de produto"],
    cliques: ["cliques por produto"],
    ctr: ["ctr"],
    visitantes: ["visitantes do produto (visita)"],
    pageviews: ["visualizações da página do produto"],
    bounce: ["taxa de rejeição"],
    curtidas: ["curtidas"],
    addCart: ["unidades (adicionar ao carrinho)"],
    convAdd: ["taxa de conversão (adicionar ao carrinho)"],
    pedidosFeitos: ["pedidos (pedidos feitos)"],
    unidadesFeitos: ["unidades (pedido realizado)"],
    vendasFeitos: ["vendas (pedido realizado)"],
    convFeitos: ["taxa de conversão (pedido realizado)"],
    pedidosPagos: ["pedidos (pedidos pagos)"],
    unidadesPagos: ["unidades (pedido pago)"],
    vendasPagos: ["vendas (pedido pago)"],
    convPagos: ["taxa de conversão (pedido pago)"],
    ticketPago: ["vendas por pedido (pedido pago)"],
  });

  const horas = [];
  let nome = null, itemId = null;
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || r.every(c => !c)) continue;
    const raw = r[cols.data];
    const hora = extrairHora(raw); const data = extrairData(raw);
    if (!data || hora === null) break; // acaba o bloco de horas
    if (!nome && r[cols.nome]) nome = String(r[cols.nome]);
    if (!itemId && r[cols.itemId]) itemId = String(r[cols.itemId]);
    horas.push({
      hora, data,
      impressoes: pnBR(r[cols.impressoes]),
      cliques: pnBR(r[cols.cliques]),
      ctr: pnBR(r[cols.ctr]),
      visitantes: pnBR(r[cols.visitantes]),
      pageviews: pnBR(r[cols.pageviews]),
      addCart: pnBR(r[cols.addCart]),
      pedidosPagos: pnBR(r[cols.pedidosPagos]),
      unidadesPagos: pnBR(r[cols.unidadesPagos]),
      vendasPagos: pnBR(r[cols.vendasPagos]),
      convPagos: pnBR(r[cols.convPagos]),
      ticket: pnBR(r[cols.ticketPago]),
    });
  }

  // Extrai fontes de tráfego (2ª e 3ª abas geralmente)
  const fontesTrafego = {};
  for (const nomeAba of wb.SheetNames) {
    if (norm(nomeAba).includes("fontes de tr")) {
      const wsF = wb.Sheets[nomeAba];
      const rowsF = XLSX.utils.sheet_to_json(wsF, { header: 1, defval: "" });
      let tipoOrdem = norm(nomeAba).includes("pago") ? "pagos" : "feitos";
      let categoriaAtual = null;
      for (let i = 0; i < rowsF.length; i++) {
        const r = rowsF[i]; if (!r) continue;
        const c0 = norm(r[0]);
        // Detecta cabeçalho de categoria (linhas soltas tipo "Card do Produto", "Lives", etc.)
        if (["card do produto", "lives", "vídeo do vendedor", "afiliado shopee"].includes(c0)) {
          categoriaAtual = String(r[0]);
          continue;
        }
        // Linhas com dados: "Fontes de Tráfego", "Recomendação", "Pesquisar", etc.
        if (c0 === "fontes de tráfego" || !c0) continue;
        const vendas = pnBR(r[2]);
        const pedidos = pnBR(r[5]);
        if (vendas > 0 || pedidos > 0) {
          if (!fontesTrafego[tipoOrdem]) fontesTrafego[tipoOrdem] = [];
          fontesTrafego[tipoOrdem].push({
            fonte: String(r[0]),
            categoria: categoriaAtual,
            vendas,
            pedidos,
            impressoes: pnBR(r[3]),
            cliques: pnBR(r[4]),
          });
        }
      }
    }
  }

  if (!horas.length || !itemId) return null;

  const resumo = horas.reduce((acc, h) => ({
    impressoes: acc.impressoes + h.impressoes,
    cliques: acc.cliques + h.cliques,
    visitantes: acc.visitantes + h.visitantes,
    pageviews: acc.pageviews + h.pageviews,
    addCart: acc.addCart + h.addCart,
    pedidos: acc.pedidos + h.pedidosPagos,
    unidades: acc.unidades + h.unidadesPagos,
    vendas: acc.vendas + h.vendasPagos,
  }), { impressoes:0, cliques:0, visitantes:0, pageviews:0, addCart:0, pedidos:0, unidades:0, vendas:0 });
  resumo.ctr = resumo.impressoes > 0 ? (resumo.cliques / resumo.impressoes * 100) : 0;
  resumo.conversao = resumo.cliques > 0 ? (resumo.pedidos / resumo.cliques * 100) : 0;
  resumo.ticket = resumo.pedidos > 0 ? (resumo.vendas / resumo.pedidos) : 0;

  return { tipo: "product_performance", itemId, nome, data: horas[0].data, horas, resumo, fontesTrafego };
}

function parseProductTraffic(wb) {
  // Aba "(pedido pago)Tráfego" — ranking agregado por produto
  const aba = wb.SheetNames.find(n => norm(n).includes("pago")) || wb.SheetNames[0];
  const ws = wb.Sheets[aba];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const hIdx = acharCabecalho(rows, ["id do item", "produto", "vendas", "impressões"]);
  if (hIdx < 0) return null;
  const cols = mapearColunas(rows[hIdx], {
    itemId: ["id do item"],
    nome: ["produto"],
    status: ["status atual do item"],
    taxaVendas: ["taxa de vendas"],
    vendas: ["vendas (brl)"],
    impressoes: ["impressões de produto"],
    cliques: ["cliques por produto"],
    pedidos: ["pedidos"],
    unidades: ["unidades"],
    ctr: ["ctr"],
    convPed: ["taxa de conversão de pedidos"],
    ticket: ["vendas por pedido"],
  });
  const produtos = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || r.every(c => !c)) continue;
    const itemId = String(r[cols.itemId] || "").trim();
    if (!itemId || itemId === "-") continue;
    produtos.push({
      itemId,
      nome: String(r[cols.nome] || ""),
      status: String(r[cols.status] || ""),
      vendas: pnBR(r[cols.vendas]),
      impressoes: pnBR(r[cols.impressoes]),
      cliques: pnBR(r[cols.cliques]),
      pedidos: pnBR(r[cols.pedidos]),
      unidades: pnBR(r[cols.unidades]),
      ctr: pnBR(r[cols.ctr]),
      conversao: pnBR(r[cols.convPed]),
      ticket: pnBR(r[cols.ticket]),
    });
  }
  if (!produtos.length) return null;
  return { tipo: "product_traffic", data: null, produtos };
}

function parseDiagnostics(wb) {
  const result = { tipo: "product_diagnostics", quedas: [], avaliacoes: [], devolucoes: [], envios: [], conversao: [], visualizacoes: [] };
  for (const nomeAba of wb.SheetNames) {
    const n = norm(nomeAba);
    const ws = wb.Sheets[nomeAba];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (!rows.length) continue;
    const header = rows[0].map(norm);
    if (n.includes("diminuição nas vendas") || n.includes("diminuicao nas vendas")) {
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || !r[0]) continue;
        // Só linhas de produto pai (não variação)
        if (r[2] === "-" || !r[2]) {
          result.quedas.push({ itemId: String(r[0]), nome: String(r[1]), antes: pnBR(r[6]), depois: pnBR(r[7]), variacao: String(r[8]) });
        }
      }
    } else if (n.includes("avaliações ruins") || n.includes("avaliacoes ruins")) {
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || !r[0]) continue;
        result.avaliacoes.push({ itemId: String(r[0]), nome: String(r[1]), total: pnBR(r[2]), ruins: pnBR(r[3]) });
      }
    } else if (n.includes("devoluç") || n.includes("devoluc")) {
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || !r[0]) continue;
        if (r[2] === "-" || !r[2]) {
          result.devolucoes.push({ itemId: String(r[0]), nome: String(r[1]), qtd: pnBR(r[6]), taxa: String(r[7]) });
        }
      }
    } else if (n.includes("envio atrasado")) {
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || !r[0]) continue;
        if (r[2] === "-" || !r[2]) {
          result.envios.push({ itemId: String(r[0]), nome: String(r[1]), qtd: pnBR(r[6]), taxa: String(r[7]) });
        }
      }
    } else if (n.includes("baixa de conversão") || n.includes("baixa taxa de conversão") || n.includes("baixa de conversao")) {
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || !r[0]) continue;
        result.conversao.push({ itemId: String(r[0]), nome: String(r[1]), visitantes: pnBR(r[2]), conversao: String(r[3]) });
      }
    } else if (n.includes("diminuição de visualiz") || n.includes("diminuicao de visualiz")) {
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || !r[0]) continue;
        result.visualizacoes.push({ itemId: String(r[0]), nome: String(r[1]), antes: pnBR(r[2]), depois: pnBR(r[3]), variacao: String(r[4]) });
      }
    }
  }
  const temAlgo = result.quedas.length || result.avaliacoes.length || result.devolucoes.length || result.envios.length || result.conversao.length || result.visualizacoes.length;
  if (!temAlgo) return null;
  return result;
}

function parseSalesComposition(wb) {
  // Aba "Pedidos Pagos"
  const aba = wb.SheetNames.find(n => norm(n).includes("pagos")) || wb.SheetNames[0];
  const ws = wb.Sheets[aba];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const result = { tipo: "sales_composition", data: null, categorias: [], subcategorias: [], faixas: [], tipoCompradores: [] };
  let modo = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]; if (!r || r.every(c => !c)) continue;
    const c0 = norm(r[0]);
    if (c0 === "data period" || c0 === "data") { const d = extrairData(r[1]); if (d) result.data = d; continue; }
    // detecta blocos por cabeçalho
    if (c0 === "categoria shopee" && norm(r[1]) === "vendas (brl)") { modo = "categoria"; continue; }
    if (c0 === "categoria shopee" && norm(r[1]).includes("subcategoria")) { modo = "subcategoria"; continue; }
    if (c0.includes("variação de preço") || c0.includes("variacao de preco")) { modo = "faixa"; continue; }
    if (c0.includes("tipos de vendedores") || c0.includes("tipo de comprador") || c0 === "tipos de vendedores") { modo = "tipo"; continue; }
    // pula linhas com "Nota:" ou vazias
    if (c0.startsWith("nota:") || !c0) continue;
    // parse conforme modo
    if (modo === "categoria" && r[1]) {
      result.categorias.push({ categoria: String(r[0]), vendas: pnBR(r[1]), pct: String(r[2]) });
    } else if (modo === "subcategoria" && r[1] && r[2]) {
      result.subcategorias.push({ categoria: String(r[0]), sub: String(r[1]), compradores: pnBR(r[2]), vendas: pnBR(r[3]), conversao: String(r[5]) });
    } else if (modo === "faixa" && r[1]) {
      result.faixas.push({ faixa: String(r[0]), compradores: pnBR(r[1]), vendas: pnBR(r[3]) });
    } else if (modo === "tipo" && r[1]) {
      result.tipoCompradores.push({ tipo: String(r[0]), compradores: pnBR(r[1]), pctCompradores: String(r[2]), vendas: pnBR(r[3]) });
    }
  }
  if (!result.categorias.length && !result.faixas.length) return null;
  return result;
}

// ── Função pública ────────────────────────────────────
export function parseShopeeReport(arrayBuffer) {
  let wb;
  try { wb = XLSX.read(arrayBuffer, { type: "array" }); }
  catch (e) { return { tipo: "erro", erro: "Não consegui abrir o arquivo. Confirme que é .xlsx." }; }

  const tipo = detectarTipo(wb);
  try {
    switch (tipo) {
      case "sales_overview":       return parseSalesOverview(wb) || { tipo: "erro", erro: "Não consegui extrair os dados do Sales Overview." };
      case "product_overview":     return parseProductOverview(wb) || { tipo: "erro", erro: "Não consegui extrair os dados do Product Overview." };
      case "shop_stats":           return parseShopStats(wb) || { tipo: "erro", erro: "Não consegui extrair os dados do Shop Stats." };
      case "product_performance":  return parseProductPerformance(wb) || { tipo: "erro", erro: "Não consegui extrair os dados do Performance do Produto." };
      case "product_traffic":      return parseProductTraffic(wb) || { tipo: "erro", erro: "Não consegui extrair os dados do Tráfego do Produto." };
      case "product_diagnostics":  return parseDiagnostics(wb) || { tipo: "erro", erro: "O Diagnóstico veio vazio." };
      case "sales_composition":    return parseSalesComposition(wb) || { tipo: "erro", erro: "Não consegui extrair a composição de vendas." };
      case "flash_sale":           return { tipo: "flash_sale", info: "Reconhecido, mas ainda não processado nesta versão." };
      case "parent_sku":           return { tipo: "parent_sku", info: "Reconhecido, mas ainda não processado nesta versão." };
      default:                     return { tipo: "desconhecido", erro: "Não reconheci este relatório. Suportados: Visão Geral em Tempo Real, Visão Geral das Vendas, Visão Geral do Produto, Performance do Produto, Tráfego do Produto, Diagnóstico do Produto, Composição de Vendas." };
    }
  } catch (e) {
    return { tipo: "erro", erro: "Erro ao processar: " + (e?.message || String(e)) };
  }
}

// ── Rótulos amigáveis ─────────────────────────────────
export const TIPO_LABEL = {
  sales_overview: "Visão Geral das Vendas",
  product_overview: "Visão Geral do Produto",
  shop_stats: "Visão Geral em Tempo Real",
  product_performance: "Performance do Produto",
  product_traffic: "Tráfego do Produto",
  product_diagnostics: "Diagnóstico do Produto",
  sales_composition: "Composição de Vendas",
  flash_sale: "Ofertas Relâmpago",
  parent_sku: "Detalhamento de SKU",
};
