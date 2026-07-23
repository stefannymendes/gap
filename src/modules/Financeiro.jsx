import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { useGap } from "../lib/store";
import { fmt, fmtN, pn, labelMes, mesAtual, extrairMes, extrairPrefixoSKU, calcCustoUnitario } from "../lib/utils";
import { Topbar } from "../lib/ui";

async function lerXLSX(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
    reader.readAsArrayBuffer(file);
  });
}

function processarPedidos(rows) {
  if (!rows || rows.length < 2) throw new Error("Arquivo vazio ou inválido");
  const headers = rows[0].map(h => String(h || "").trim().toLowerCase());
  const col = aliases => {
    for (const a of aliases) {
      const i = headers.findIndex(h => h.includes(a.toLowerCase()));
      if (i >= 0) return i;
    }
    return -1;
  };
  const C = {
    id: col(["id do pedido"]),
    status: col(["status do pedido"]),
    devolucao: col(["status da devolução", "devolução / reembolso"]),
    dataCriacao: col(["data de criação do pedido"]),
    dataEntrega: col(["domestic delivered date", "hora completa do pedido"]),
    skuPrincipal: col(["nº de referência do sku principal", "sku principal"]),
    nomeProduto: col(["nome do produto"]),
    sku: col(["número de referência sku", "referência sku"]),
    variacao: col(["nome da variação"]),
    precoOriginal: col(["preço original"]),
    precoAcordado: col(["preço acordado"]),
    quantidade: col(["quantidade"]),
    valorTotal: col(["valor total"]),
    comissao: col(["taxa de comissão líquida"]),
    servico: col(["taxa de serviço líquida"]),
    totalGlobal: col(["total global"]),
    cupomVendedor: col(["cupom do vendedor"]),
    leveMais: col(["desconto da leve mais por menos do vendedor"]),
    ajusteAcao: col(["ajuste por participação em ação comercial"]),
  };
  const pedidos = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[C.id] || String(r[C.id]).trim() === "") continue;
    const status = String(r[C.status] || "").trim();
    const devolucao = String(r[C.devolucao] || "").trim();
    const sku = String(r[C.sku] || r[C.skuPrincipal] || "").trim();
    const dataCriacao = String(r[C.dataCriacao] || "").trim();
    const dataEntrega = String(r[C.dataEntrega] || "").trim();
    pedidos.push({
      id: String(r[C.id] || "").trim(),
      status, devolucao, dataCriacao, dataEntrega,
      mesCriacao: extrairMes(dataCriacao),
      mesEntrega: extrairMes(dataEntrega),
      nomeProduto: String(r[C.nomeProduto] || "").trim(),
      sku, prefixoSKU: extrairPrefixoSKU(sku),
      variacao: String(r[C.variacao] || "").trim(),
      precoOriginal: pn(r[C.precoOriginal]),
      precoAcordado: pn(r[C.precoAcordado]),
      quantidade: pn(r[C.quantidade]) || 1,
      valorTotal: pn(r[C.valorTotal]),
      comissaoLiq: pn(r[C.comissao]),
      servicoLiq: pn(r[C.servico]),
      totalGlobal: pn(r[C.totalGlobal]),
      cupomVendedor: pn(r[C.cupomVendedor]),
      leveMaisVendedor: pn(r[C.leveMais]),
      ajusteAcaoComercial: pn(r[C.ajusteAcao]),
      cancelado: status.toLowerCase().includes("cancel") || status.toLowerCase().includes("não pago") || status.toLowerCase().includes("nao pago"),
      entregue: status.toLowerCase().includes("entregue") || status.toLowerCase().includes("conclu") || status.toLowerCase().includes("comprador pode pedir"),
      enviado: status.toLowerCase().includes("enviado"),
      aEnviar: status.toLowerCase().includes("a enviar") || status.toLowerCase() === "order received",
      emDevolucao: devolucao.toLowerCase().includes("andamento") || devolucao.toLowerCase().includes("reembolso") || devolucao.toLowerCase().includes("conclu") || devolucao.toLowerCase().includes("aprovad") || devolucao.toLowerCase().includes("resolv") || devolucao.trim().length > 0,
      primeiraLinha: false,
    });
  }
  const vistos = new Set();
  pedidos.forEach(p => { if (!vistos.has(p.id)) { p.primeiraLinha = true; vistos.add(p.id); } });
  return pedidos;
}

function calcularLucro(pedido, imposto, produtos) {
  const { precoAcordado, quantidade, valorTotal, comissaoLiq, servicoLiq, cupomVendedor, leveMaisVendedor, ajusteAcaoComercial } = pedido;
  const descontosVendedor = (cupomVendedor || 0) + (leveMaisVendedor || 0);
  const receita = (precoAcordado - descontosVendedor) * quantidade;
  const taxasShopee = pedido.primeiraLinha ? comissaoLiq + servicoLiq : 0;
  const ajuste = pedido.primeiraLinha ? (ajusteAcaoComercial || 0) : 0;
  const impostoValor = pedido.primeiraLinha ? valorTotal * (imposto / 100) : 0;
  let custoProduto = 0, semCadastro = false, produto = null;
  if (pedido.custoCongelado !== null && pedido.custoCongelado !== undefined) {
    custoProduto = pedido.custoCongelado * quantidade;
    produto = { nome: pedido.nomeProdutoCongelado || pedido.nomeProduto };
  } else {
    produto = produtos.find(p => p.prefixo && pedido.sku.toUpperCase().startsWith(p.prefixo.toUpperCase()));
    custoProduto = produto ? produto.custoUnitario * quantidade : 0;
    semCadastro = !produto;
  }
  const lucro = receita - taxasShopee + ajuste - impostoValor - custoProduto;
  const margem = receita > 0 ? (lucro / receita) * 100 : 0;
  return { receita, taxasShopee, ajuste, impostoValor, custoProduto, lucro, margem, produto, semCadastro, descontosVendedor };
}

function parsearRelatorioFinanceiro(rows) {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(25, rows.length); i++) {
    const r = rows[i];
    if (r && String(r[0] || "").toLowerCase().includes("data") && String(r[1] || "").toLowerCase().includes("tipo")) { headerIdx = i; break; }
  }
  if (headerIdx < 0) throw new Error("Formato inválido. Use o Relatório de Saldo de Transações da Shopee.");
  const headers = rows[headerIdx].map(h => String(h || "").trim().toLowerCase());
  const f = als => { for (const a of als) { const i = headers.findIndex(h => h.includes(a)); if (i >= 0) return i; } return -1; };
  const cData = f(["data"]), cTipo = f(["tipo"]), cDesc = f(["descri"]), cID = f(["id do pedido", "id pedido"]);
  const cDir = f(["dire", "entrada", "saída"]), cValor = f(["valor"]);
  const result = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[cData] || String(r[cData]).trim() === "") continue;
    const dataStr = String(r[cData] || "").trim();
    const tipo = String(r[cTipo] || "").trim();
    const desc = String(r[cDesc] || "").trim();
    const idPedido = cID >= 0 ? String(r[cID] || "").trim() : "";
    const direcao = String(r[cDir] || "").trim().toLowerCase();
    const valor = pn(r[cValor]);
    result.push({ data: dataStr, mes: extrairMes(dataStr), tipo, desc, idPedido, direcao, valor: Math.abs(valor), entrada: direcao.includes("entrada") });
  }
  return result;
}

const NUM_WRAP = { display: "flex", alignItems: "center", border: "1px solid #DDDDD8", borderRadius: 8, overflow: "hidden", background: "#fff" };
const NUM_PFX = { padding: "0 10px", fontSize: 12, color: "#888", background: "#F9F9F7", borderRight: "1px solid #DDDDD8", display: "flex", alignItems: "center", whiteSpace: "nowrap", height: 38 };
const NUM_FLD = { flex: 1, border: "none", padding: "8px 10px", fontSize: 13.5, color: "#0D0D0F", outline: "none", minWidth: 0, fontFamily: "inherit" };
function NumInput({ value, onChange, prefix = "R$", step = "0.01", min = "0" }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { if (String(value) !== local && Math.abs(Number(local) - Number(value)) > 0.001) setLocal(String(value)); }, [value]); // eslint-disable-line
  return (
    <div style={NUM_WRAP}>
      <span style={NUM_PFX}>{prefix}</span>
      <input type="number" min={min} step={step} value={local} onChange={e => { setLocal(e.target.value); onChange(e.target.value); }} style={NUM_FLD} />
    </div>
  );
}
function Badge({ children, color = "#EFF6FF", text = "#1D4ED8" }) {
  return <span style={{ fontSize: 11.5, fontWeight: 500, padding: "3px 9px", borderRadius: 20, background: color, color: text }}>{children}</span>;
}
const BTN_DANGER_SM = { background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
const BTN_SEC_SM = { background: "#F5F5F3", color: "#0D0D0F", border: "1px solid #DDDDD8", borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" };
function ConfirmButtons({ onConfirm, onCancel, confirmLabel = "Confirmar" }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <button style={BTN_DANGER_SM} onClick={onConfirm}>{confirmLabel}</button>
      <button style={BTN_SEC_SM} onClick={onCancel}>Cancelar</button>
    </div>
  );
}

export default function Financeiro({ onMenu }) {
  const {
    imposto, custosFixos, produtos,
    pedidos, importPedidos, limparPedidos,
    transacoes, setTransacoes,
    saidasVar, addSaida, updateSaida, removeSaida,
    categorias, setCategorias,
    fornecedores, setFornecedores,
    salvando,
    dbLoading, dbErro,
    saidasMigraveis, importarSaidasLocal,
    fechamentos, saveFechamento,
  } = useGap();

  const [tab, setTab] = useState("fechamento");
  const [mesFechamento, setMesFechamento] = useState(mesAtual());
  const [importando, setImportando] = useState(false);
  const [importErro, setImportErro] = useState("");
  const [importInfo, setImportInfo] = useState(null);
  const [fechaTab, setFechaTab] = useState("resumo");
  const [ordemSKU, setOrdemSKU] = useState("lucro");
  const [buscaPedidos, setBuscaPedidos] = useState("");
  const [importandoFin, setImportandoFin] = useState(false);
  const [importErroFin, setImportErroFin] = useState("");
  const [cruzamentoAlertas, setCruzamentoAlertas] = useState([]);
  const [cruzamentoExecutado, setCruzamentoExecutado] = useState(false);
  const [mesFin, setMesFin] = useState(mesAtual());
  const [novaCategoria, setNovaCategoria] = useState("");
  const [novoFornecedor, setNovoFornecedor] = useState({ nome: "", categoria: "", contato: "" });
  const [showFornecedorForm, setShowFornecedorForm] = useState(false);
  const [showFornecedoresList, setShowFornecedoresList] = useState(false);
  const [editFornecedorId, setEditFornecedorId] = useState(null);
  const [confirmDeleteForn, setConfirmDeleteForn] = useState(null);
  const [showNovaSaida, setShowNovaSaida] = useState(false);
  const [editSaidaId, setEditSaidaId] = useState(null);
  const [confirmDeleteSaida, setConfirmDeleteSaida] = useState(null);
  const [formSaida, setFormSaida] = useState({ fornecedor: "", categoria: categorias[0] || "Materia-prima", descricao: "", valor: 0, vencimento: "", pago: false, dataPagamento: "" });
  const [mesSaidas, setMesSaidas] = useState(mesAtual());
  const [confirmLimparPedidos, setConfirmLimparPedidos] = useState(false);
  const [confirmLimparTransacoes, setConfirmLimparTransacoes] = useState(false);
  const vendasFileRef = useRef(null);
  const finFileRef = useRef(null);

  useEffect(() => { setCruzamentoAlertas([]); setCruzamentoExecutado(false); }, [mesFechamento]);

  const produtosComCusto = produtos.map(p => ({ ...p, custoUnitario: calcCustoUnitario(p) }));

  const handleImport = async e => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    setImportando(true); setImportErro(""); setImportInfo(null); e.target.value = "";
    try {
      const rows = await lerXLSX(file);
      const novos = processarPedidos(rows);
      if (!novos.length) throw new Error("Nenhum pedido encontrado.");
      // Congela o custo do produto no momento do import (cópia — nunca join depois).
      const produtosAtivos = produtos.map(p => ({ prefixo: p.prefixo, custoUnitario: calcCustoUnitario(p), nome: p.nome }));
      const novosComCusto = novos.map(p => {
        const prod = produtosAtivos.find(x => x.prefixo && p.sku.toUpperCase().startsWith(x.prefixo.toUpperCase()));
        return { ...p, custoCongelado: prod ? prod.custoUnitario : null, nomeProdutoCongelado: prod ? prod.nome : null };
      });
      // O banco deduplica por (pedido_id, sku): reimportar a mesma planilha não duplica.
      const { novos: novosInseridos, existentes } = await importPedidos(novosComCusto);
      const meses = [...new Set(novos.map(p => p.mesCriacao).filter(Boolean))].sort();
      const comCusto = novosComCusto.filter(p => p.custoCongelado !== null).length;
      const semCusto = novosComCusto.filter(p => p.custoCongelado === null && !p.cancelado).length;
      setImportInfo({ total: novos.length, cancelados: novos.filter(p => p.cancelado).length, semSKU: novos.filter(p => !p.sku).length, meses, comCusto, semCusto, novosInseridos, existentes });
      if (meses.length === 1) setMesFechamento(meses[0]);
    } catch (err) { setImportErro(err.message || "Erro ao processar"); }
    setImportando(false);
  };

  const handleImportFinanceiro = async e => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    setImportandoFin(true); setImportErroFin(""); e.target.value = "";
    try {
      const rows = await lerXLSX(file);
      const novas = parsearRelatorioFinanceiro(rows);
      if (!novas.length) throw new Error("Nenhuma transacao encontrada.");
      const keysExistentes = new Set(transacoes.map(t => t.data + t.tipo + t.valor + t.desc));
      const aInserir = novas.filter(t => !keysExistentes.has(t.data + t.tipo + t.valor + t.desc));
      setTransacoes(prev => [...prev, ...aInserir]);
      const mesesNovas = [...new Set(novas.map(t => t.mes).filter(Boolean))].sort();
      if (mesesNovas.length > 0) setMesFin(mesesNovas[mesesNovas.length - 1]);
    } catch (err) { setImportErroFin(err.message || "Erro ao processar"); }
    setImportandoFin(false);
  };

  const pedidosDoMes = pedidos.filter(p => p.mesCriacao === mesFechamento && !p.cancelado);
  const canceladosDoMes = pedidos.filter(p => p.mesCriacao === mesFechamento && p.cancelado);
  const devolucoesDoMes = pedidosDoMes.filter(p => p.emDevolucao);
  const pedidosValidos = pedidosDoMes.filter(p => !p.emDevolucao);
  const pedidosEntregues = pedidosValidos.filter(p => p.entregue);
  const pedidosAReceber = pedidosValidos.filter(p => !p.entregue);

  const calcResumo = lista => lista.reduce((acc, p) => {
    const c = calcularLucro(p, imposto, produtosComCusto);
    acc.qtd += p.quantidade; acc.pedidos += 1; acc.receita += c.receita;
    acc.descontos += c.descontosVendedor * p.quantidade; acc.taxas += c.taxasShopee;
    acc.ajuste += c.ajuste; acc.imposto += c.impostoValor; acc.custoProd += c.custoProduto;
    acc.lucroOp += c.lucro; if (c.semCadastro) acc.semCadastro++;
    return acc;
  }, { qtd: 0, pedidos: 0, receita: 0, descontos: 0, taxas: 0, ajuste: 0, imposto: 0, custoProd: 0, lucroOp: 0, semCadastro: 0 });

  const resumoTotal = calcResumo(pedidosValidos);
  const resumoEntregue = calcResumo(pedidosEntregues);
  const resumoAReceber = calcResumo(pedidosAReceber);
  const resumoDevolvidos = calcResumo(devolucoesDoMes);
  const totalCustosFixos = custosFixos.reduce((s, c) => s + pn(c.valor), 0);
  const lucroLiquido = resumoTotal.lucroOp - totalCustosFixos;

  const ticketMedio = resumoTotal.qtd > 0 ? resumoTotal.receita / resumoTotal.qtd : 0;
  const adsDoMesFin = transacoes.filter(t => t.mes === mesFechamento && !t.entrada && t.desc.toLowerCase().includes("ads")).reduce((s, t) => s + t.valor, 0);
  const custoAquisicao = resumoTotal.pedidos > 0 && adsDoMesFin > 0 ? adsDoMesFin / resumoTotal.pedidos : 0;
  const taxaDevolucao = pedidosDoMes.length > 0 ? (devolucoesDoMes.length / pedidosDoMes.length) * 100 : 0;
  const cancelamentoRate = (pedidosDoMes.length + canceladosDoMes.length) > 0 ? (canceladosDoMes.length / (pedidosDoMes.length + canceladosDoMes.length)) * 100 : 0;
  const margemContribPorPar = resumoTotal.qtd > 0 ? (resumoTotal.lucroOp + totalCustosFixos) / resumoTotal.qtd : 0;
  const pontoEquilibrio = margemContribPorPar > 0 ? Math.ceil(totalCustosFixos / margemContribPorPar) : 0;
  const percentualPE = pontoEquilibrio > 0 ? Math.min(100, (resumoTotal.qtd / pontoEquilibrio) * 100) : 0;

  const saquesDoMesFin = transacoes.filter(t => t.mes === mesFechamento && !t.entrada && t.tipo.toLowerCase().includes("saque")).reduce((s, t) => s + t.valor, 0);
  const ajustesNegDoMesFin = transacoes.filter(t => t.mes === mesFechamento && !t.entrada && t.tipo.toLowerCase().includes("ajuste")).reduce((s, t) => s + t.valor, 0);
  const saidasVarPagasMes = saidasVar.filter(s => s.pago && extrairMes(s.dataPagamento) === mesFechamento).reduce((s, x) => s + pn(x.valor), 0);
  const saidasVarPagasMesItens = saidasVar.filter(s => s.pago && extrairMes(s.dataPagamento) === mesFechamento);
  const saldoPeriodo = saquesDoMesFin - totalCustosFixos - saidasVarPagasMes - adsDoMesFin - ajustesNegDoMesFin;
  const temExtrato = transacoes.some(t => t.mes === mesFechamento);

  const historicoMensal = (() => {
    const mesesDisp = [...new Set(pedidos.map(p => p.mesCriacao).filter(Boolean))].sort().slice(-6);
    return mesesDisp.map(mes => {
      const pedMes = pedidos.filter(p => p.mesCriacao === mes && !p.cancelado && !p.emDevolucao);
      const res = pedMes.reduce((acc, p) => {
        const c = calcularLucro(p, imposto, produtosComCusto);
        acc.receita += c.receita; acc.lucroOp += c.lucro; acc.qtd += p.quantidade; acc.pedidos += 1;
        return acc;
      }, { receita: 0, lucroOp: 0, qtd: 0, pedidos: 0 });
      return { mes, label: labelMes(mes), receita: res.receita, lucroOp: res.lucroOp, lucroLiq: res.lucroOp - totalCustosFixos, qtd: res.qtd, pedidos: res.pedidos };
    });
  })();

  const rankingSKU = (() => {
    const map = {};
    pedidosValidos.forEach(p => {
      const c = calcularLucro(p, imposto, produtosComCusto);
      const key = p.prefixoSKU || p.sku || "sem-sku";
      if (!map[key]) map[key] = { prefixo: key, nomeProduto: (c.produto && c.produto.nome) || p.nomeProduto, qtd: 0, receita: 0, taxas: 0, imposto: 0, custoProd: 0, lucro: 0, semCadastro: c.semCadastro };
      map[key].qtd += p.quantidade; map[key].receita += c.receita; map[key].taxas += c.taxasShopee;
      map[key].imposto += c.impostoValor; map[key].custoProd += c.custoProduto; map[key].lucro += c.lucro;
    });
    return Object.values(map).sort((a, b) => ordemSKU === "receita" ? b.receita - a.receita : ordemSKU === "qtd" ? b.qtd - a.qtd : b.lucro - a.lucro);
  })();

  const mesesDisponiveis = [...new Set(pedidos.map(p => p.mesCriacao).filter(Boolean))].sort().reverse();
  const mesesExtrato = [...new Set(transacoes.map(t => t.mes).filter(Boolean))].sort().reverse();
  const mesFinValido = mesesExtrato.includes(mesFin) ? mesFin : (mesesExtrato[0] || mesFin);
  const transDoMes = transacoes.filter(t => t.mes === mesFinValido);
  const entradasPedidosMes = transDoMes.filter(t => t.entrada && t.tipo.toLowerCase().includes("renda")).reduce((s, t) => s + t.valor, 0);
  const ajustesPos = transDoMes.filter(t => t.entrada && t.tipo.toLowerCase().includes("ajuste")).reduce((s, t) => s + t.valor, 0);
  const ajustesNeg = transDoMes.filter(t => !t.entrada && t.tipo.toLowerCase().includes("ajuste")).reduce((s, t) => s + t.valor, 0);
  const adsExtrato = transDoMes.filter(t => !t.entrada && t.desc.toLowerCase().includes("ads")).reduce((s, t) => s + t.valor, 0);
  const saques = transDoMes.filter(t => !t.entrada && t.tipo.toLowerCase().includes("saque")).reduce((s, t) => s + t.valor, 0);
  const debitosDevolucao = transacoes.filter(t => t.mes === mesFechamento && !t.entrada && t.tipo.toLowerCase().includes("ajuste") && t.desc.toLowerCase().includes("solicit")).reduce((s, t) => s + t.valor, 0);

  const saidasDoMes = saidasVar.filter(s => extrairMes(s.vencimento) === mesSaidas || extrairMes(s.dataPagamento) === mesSaidas);
  const totalSaidasVar = saidasDoMes.reduce((s, x) => s + pn(x.valor), 0);
  const totalSaidasVarPagas = saidasDoMes.filter(x => x.pago).reduce((s, x) => s + pn(x.valor), 0);
  const totalSaidasVarPendentes = saidasDoMes.filter(x => !x.pago).reduce((s, x) => s + pn(x.valor), 0);

  const corMargem = m => m >= 25 ? "#22C55E" : m >= 15 ? "#F59E0B" : "#EF4444";

  const executarCruzamento = () => {
    setCruzamentoExecutado(true);
    const idsPagos = new Set();
    transacoes.forEach(t => {
      if (!t.entrada) return;
      const tipo = t.tipo.toLowerCase();
      if (tipo.includes("renda") || tipo.includes("pedido") || tipo.includes("order")) {
        if (t.idPedido) idsPagos.add(t.idPedido.trim());
        const matchDesc = t.desc.match(/(\d{14,20}[A-Z0-9]{4,})/);
        if (matchDesc) idsPagos.add(matchDesc[1]);
      }
    });
    const entregues = pedidosEntregues.filter(p => !p.emDevolucao);
    if (transacoes.length === 0) {
      setCruzamentoAlertas([{ id: "SEM_EXTRATO", sku: "", valor: 0, data: "", mensagem: "Importe o extrato Shopee na aba Extrato Shopee antes de cruzar." }]);
      return;
    }
    if (idsPagos.size === 0) {
      const valoresPagos = new Set(transacoes.filter(t => t.entrada).map(t => t.valor.toFixed(2)));
      const alertas = entregues.filter(p => { const c = calcularLucro(p, imposto, produtosComCusto); return !valoresPagos.has(c.receita.toFixed(2)); })
        .map(p => { const c = calcularLucro(p, imposto, produtosComCusto); return { id: p.id, sku: p.sku, valor: c.receita, data: p.dataCriacao }; });
      setCruzamentoAlertas(alertas.slice(0, 50));
      return;
    }
    const alertas = entregues.filter(p => !idsPagos.has(p.id)).map(p => { const c = calcularLucro(p, imposto, produtosComCusto); return { id: p.id, sku: p.sku, valor: c.receita, data: p.dataCriacao }; });
    setCruzamentoAlertas(alertas);
  };

  const salvarSaida = () => {
    if (!formSaida.fornecedor.trim() || !pn(formSaida.valor)) { alert("Preencha fornecedor e valor."); return; }
    const dados = { ...formSaida, valor: pn(formSaida.valor) };
    if (editSaidaId) updateSaida(editSaidaId, { ...dados, id: editSaidaId });
    else addSaida(dados);
    setFormSaida({ fornecedor: "", categoria: categorias[0] || "", descricao: "", valor: 0, vencimento: "", pago: false, dataPagamento: "" });
    setEditSaidaId(null); setShowNovaSaida(false);
  };
  const baixarSaida = id => {
    const s = saidasVar.find(x => x.id === id);
    updateSaida(id, { pago: true, dataPagamento: (s && s.dataPagamento) || new Date().toISOString().slice(0, 10) });
  };

  const S = {
    card: { background: "#fff", border: "1px solid #EBEBEB", borderRadius: 12, padding: "18px 20px" },
    input: { border: "1px solid #DDDDD8", borderRadius: 8, padding: "8px 12px", fontSize: 13.5, color: "#0D0D0F", outline: "none", background: "#fff", width: "100%", fontFamily: "inherit" },
    select: { border: "1px solid #DDDDD8", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#0D0D0F", outline: "none", background: "#fff", fontFamily: "inherit" },
    btnPrimary: { background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
    btnSecondary: { background: "#F5F5F3", color: "#0D0D0F", border: "1px solid #DDDDD8", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
    btnDanger: { background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
    btnGhost: { background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#888", fontFamily: "inherit", padding: "4px 8px" },
    label: { fontSize: 12, fontWeight: 500, color: "#555", display: "block", marginBottom: 5 },
    muted: { color: "#888", fontSize: 12.5 },
    mono: { fontFamily: "monospace", fontSize: 12 },
    dreRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", fontSize: 13.5, borderBottom: "1px solid #F5F5F3" },
  };

  const pedidosAgrupados = (() => {
    const lista = []; const mapaId = {};
    pedidosDoMes.forEach(p => {
      const c = calcularLucro(p, imposto, produtosComCusto);
      if (!mapaId[p.id]) { mapaId[p.id] = { id: p.id, skus: [], variacoes: [], receita: 0, taxasShopee: 0, impostoValor: 0, custoProduto: 0, lucro: 0, qtd: 0, pedido: p, semCadastro: false }; lista.push(mapaId[p.id]); }
      const g = mapaId[p.id];
      g.skus.push(p.sku || "--"); g.variacoes.push(p.variacao);
      g.receita += c.receita; g.taxasShopee += c.taxasShopee; g.impostoValor += c.impostoValor; g.custoProduto += c.custoProduto; g.lucro += c.lucro; g.qtd += p.quantidade;
      if (c.semCadastro) g.semCadastro = true;
    });
    return lista;
  })();

  const subTabs = [{ id: "fechamento", l: "Fechamento" }, { id: "financeiro", l: "Extrato Shopee" }, { id: "saidas", l: "Saídas Variáveis" }];
  const fechaTabs = [{ id: "resumo", l: "DRE" }, { id: "fluxo", l: "Fluxo de Caixa" }, { id: "cruzamento", l: "Cruzamento" }, { id: "saude", l: "Indicadores" }, { id: "historico", l: "Historico" }, { id: "recebido", l: "Recebido vs A Receber" }, { id: "skus", l: "Ranking SKUs" }, { id: "pedidos", l: "Pedidos" }];

  return (
    <>
      <Topbar title="Financeiro" salvando={salvando} onMenu={onMenu} />
      <div className="gap-content">
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #EBEBEB", overflowX: "auto" }}>
            {subTabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "12px 16px", fontSize: 13.5, fontWeight: tab === t.id ? 500 : 400, color: tab === t.id ? "#0D0D0F" : "#888", border: "none", background: "none", cursor: "pointer", borderBottom: tab === t.id ? "2px solid #2563EB" : "2px solid transparent", whiteSpace: "nowrap", fontFamily: "inherit" }}>{t.l}</button>
            ))}
          </div>

          {dbErro && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#DC2626", marginBottom: 12 }}>{dbErro}</div>
          )}
          {dbLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", padding: 16, marginBottom: 12, background: "#F9F9F7", border: "1px solid #EBEBEB", borderRadius: 10 }}>
              <div className="gap-ia-spinner" /><span className="gap-muted">Carregando seus dados…</span>
            </div>
          )}

          {tab === "fechamento" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <select value={mesFechamento} onChange={e => setMesFechamento(e.target.value)} style={S.select}>
                  {mesesDisponiveis.length > 0 ? mesesDisponiveis.map(m => <option key={m} value={m}>{labelMes(m)}</option>) : <option value={mesFechamento}>{labelMes(mesFechamento)}</option>}
                </select>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <label style={{ ...S.btnPrimary, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                    {importando ? "Importando..." : "Importar planilha Shopee"}
                    <input ref={vendasFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} style={{ display: "none" }} disabled={importando} />
                  </label>
                  {pedidos.length > 0 && (
                    confirmLimparPedidos
                      ? <ConfirmButtons onConfirm={() => { limparPedidos(); setConfirmLimparPedidos(false); }} onCancel={() => setConfirmLimparPedidos(false)} confirmLabel="Limpar pedidos" />
                      : <button style={{ ...S.btnSecondary, fontSize: 12 }} onClick={() => setConfirmLimparPedidos(true)}>Limpar pedidos</button>
                  )}
                </div>
              </div>

              {importErro && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#DC2626" }}>{importErro}</div>}
              {importInfo && (
                <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#1E40AF", marginBottom: 4 }}>Importacao concluida</div>
                  <div style={{ fontSize: 12.5, color: "#1D4ED8" }}>
                    {importInfo.novosInseridos} pedidos novos importados
                    {importInfo.existentes > 0 && (", " + importInfo.existentes + " já existiam e foram ignorados")}
                    {" (de " + importInfo.total + " linhas)"}
                    {importInfo.cancelados > 0 && (" — " + importInfo.cancelados + " cancelados")}
                    {importInfo.semSKU > 0 && (" — " + importInfo.semSKU + " sem SKU")}
                    {" — Meses: "}{importInfo.meses.map(labelMes).join(", ")}
                    {importInfo.comCusto > 0 && (<span style={{ display: "block", marginTop: 3, fontSize: 12 }}>{"Custo congelado em " + importInfo.comCusto + " pedidos" + (importInfo.semCusto > 0 ? " — " + importInfo.semCusto + " sem cadastro" : "")}</span>)}
                  </div>
                </div>
              )}

              {resumoTotal.semCadastro > 0 && produtos.length > 0 && (
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#92400E" }}>{resumoTotal.semCadastro} SKU(s) sem produto cadastrado — custo zerado no DRE</div>
                  <div style={{ fontSize: 12.5, color: "#B45309", marginTop: 2 }}>Cadastre os prefixos na seção Produtos (na barra lateral) para um fechamento preciso.</div>
                </div>
              )}

              {pedidosDoMes.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Sem pedidos em {labelMes(mesFechamento)}</div>
                  <div style={{ ...S.muted, marginBottom: 8 }}>Exporte "Todos os Pedidos" do painel Shopee e importe aqui.</div>
                  <div style={{ fontSize: 12.5, color: "#2563EB", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "8px 14px", maxWidth: 380, margin: "0 auto" }}>
                    Os pedidos ficam salvos na sua conta. Cada importação adiciona os pedidos novos ao histórico — reimportar a mesma planilha não duplica nada.
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ background: "#0D0D0F", borderRadius: 14, padding: "22px 24px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>Fechamento - {labelMes(mesFechamento)}</div>
                        <div style={{ fontSize: 36, fontWeight: 600, color: lucroLiquido >= 0 ? "#4ADE80" : "#F87171", letterSpacing: -1 }}>{fmt(lucroLiquido)}</div>
                        <div style={{ fontSize: 13, color: "rgba(255,255,255,.4)", marginTop: 6 }}>{fmtN(resumoTotal.pedidos)} pedidos - {fmtN(resumoTotal.qtd)} pares</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                        <span style={{ fontSize: 12, padding: "5px 12px", borderRadius: 20, background: "rgba(34,197,94,.14)", color: "#4ADE80", fontWeight: 500 }}>{fmt(resumoEntregue.lucroOp - totalCustosFixos)} ja recebido</span>
                        <span style={{ fontSize: 12, padding: "5px 12px", borderRadius: 20, background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.5)" }}>{fmt(resumoAReceber.lucroOp)} a receber</span>
                        {devolucoesDoMes.length > 0 && <span style={{ fontSize: 12, padding: "5px 12px", borderRadius: 20, background: "rgba(251,191,36,.14)", color: "#FCD34D" }}>⚠ {devolucoesDoMes.length} em devolucao</span>}
                      </div>
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "rgba(255,255,255,.4)", marginBottom: 5 }}>
                        <span>Recebido vs total de vendas</span>
                        <span>{resumoTotal.receita > 0 ? ((resumoEntregue.receita / resumoTotal.receita) * 100).toFixed(0) : 0}%</span>
                      </div>
                      <div style={{ background: "rgba(255,255,255,.1)", borderRadius: 99, height: 5, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 99, background: "#4ADE80", width: (resumoTotal.receita > 0 ? (resumoEntregue.receita / resumoTotal.receita) * 100 : 0) + "%", transition: "width .4s" }} />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }}>
                    {[
                      { l: "Receita bruta", v: fmt(resumoTotal.receita), c: "#2563EB" },
                      { l: "Taxas Shopee", v: fmt(resumoTotal.taxas), c: "#EF4444" },
                      { l: "Imposto", v: fmt(resumoTotal.imposto), c: "#F59E0B" },
                      { l: "Custo produtos", v: resumoTotal.custoProd === 0 && resumoTotal.semCadastro > 0 ? "Sem cadastro" : fmt(resumoTotal.custoProd), c: resumoTotal.custoProd === 0 && resumoTotal.semCadastro > 0 ? "#F59E0B" : "#8B5CF6" },
                      { l: "Lucro operacional", v: fmt(resumoTotal.lucroOp), c: resumoTotal.lucroOp >= 0 ? "#22C55E" : "#EF4444" },
                      { l: "Custos fixos", v: fmt(totalCustosFixos), c: "#EF4444" },
                      { l: "Lucro liquido", v: fmt(lucroLiquido), c: lucroLiquido >= 0 ? "#22C55E" : "#EF4444" },
                      { l: "Margem liquida", v: resumoTotal.receita > 0 ? ((lucroLiquido / resumoTotal.receita) * 100).toFixed(1) + "%" : "--", c: lucroLiquido / resumoTotal.receita * 100 >= 15 ? "#22C55E" : "#EF4444" },
                    ].map(x => (
                      <div key={x.l} style={{ ...S.card, padding: "12px 14px" }}>
                        <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{x.l}</div>
                        <div style={{ fontSize: 18, fontWeight: 600, color: x.c, letterSpacing: -0.3 }}>{x.v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ ...S.card, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <div style={{ fontSize: 12.5, color: "#555" }}>
                      {(() => { const f = fechamentos.find(x => x.mesReferencia === mesFechamento); return f ? `Fechamento de ${labelMes(mesFechamento)} salvo na sua conta.` : `Salve o consolidado de ${labelMes(mesFechamento)} para manter o histórico na sua conta.`; })()}
                      {fechamentos.length > 0 && <span style={{ color: "#888" }}>{" "}Meses salvos: {fechamentos.map(f => labelMes(f.mesReferencia)).join(", ")}.</span>}
                    </div>
                    <button style={S.btnSecondary} onClick={() => saveFechamento(mesFechamento, resumoTotal.receita, {
                      resumoTotal, resumoEntregue, resumoAReceber, resumoDevolvidos,
                      totalCustosFixos, lucroLiquido, ticketMedio, adsDoMesFin, custoAquisicao,
                      taxaDevolucao, cancelamentoRate, margemContribPorPar, pontoEquilibrio, percentualPE,
                      saquesDoMesFin, ajustesNegDoMesFin, saidasVarPagasMes, saldoPeriodo,
                      margemLiquida: resumoTotal.receita > 0 ? (lucroLiquido / resumoTotal.receita) * 100 : 0,
                    })}>Salvar fechamento do mês</button>
                  </div>

                  <div style={{ display: "flex", gap: 2, background: "#F0F0EE", borderRadius: 9, padding: 3, width: "100%", overflowX: "auto" }}>
                    {fechaTabs.map(t => (
                      <button key={t.id} onClick={() => setFechaTab(t.id)} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 12.5, fontWeight: fechaTab === t.id ? 500 : 400, color: fechaTab === t.id ? "#0D0D0F" : "#666", border: "none", cursor: "pointer", background: fechaTab === t.id ? "#fff" : "none", boxShadow: fechaTab === t.id ? "0 1px 3px rgba(0,0,0,.08)" : "none", whiteSpace: "nowrap", fontFamily: "inherit" }}>{t.l}</button>
                    ))}
                  </div>

                  {fechaTab === "resumo" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div style={S.card}>
                        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>DRE - Competencia - {labelMes(mesFechamento)}</div>
                        {[
                          { l: "(+) Receita bruta (preco acordado)", v: resumoTotal.receita + resumoTotal.descontos, pos: true },
                          ...(resumoTotal.descontos > 0 ? [{ l: "(-) Cupons e descontos do vendedor", v: -resumoTotal.descontos, pos: false }] : []),
                          { l: "(=) Receita liquida", v: resumoTotal.receita, pos: true, sub: true },
                          { l: "(-) Taxas da Shopee", v: -resumoTotal.taxas, pos: false },
                          { l: "(-) Imposto s/ nota fiscal", v: -resumoTotal.imposto, pos: false },
                          { l: "(-) Custo dos produtos", v: -resumoTotal.custoProd, pos: false },
                          ...(resumoTotal.ajuste > 0 ? [{ l: "(+) Reembolso acao comercial", v: resumoTotal.ajuste, pos: true }] : []),
                        ].map(x => (
                          <div key={x.l} style={{ ...S.dreRow, fontWeight: x.sub ? 500 : 400, borderTop: x.sub ? "1px solid #EBEBEB" : "none", paddingTop: x.sub ? 8 : 7 }}>
                            <span style={{ color: x.sub ? "#0D0D0F" : "#555" }}>{x.l}</span>
                            <span style={{ color: x.pos ? "#22C55E" : "#EF4444", fontWeight: x.sub ? 600 : 500 }}>{x.pos ? fmt(x.v) : "- " + fmt(-x.v)}</span>
                          </div>
                        ))}
                        {devolucoesDoMes.length > 0 && (
                          <div style={{ ...S.dreRow, background: "#FFF8F8", margin: "4px -4px", padding: "6px 4px", borderRadius: 6 }}>
                            <span style={{ color: "#EF4444", fontSize: 12.5 }}>⚠ {devolucoesDoMes.length} em devolucao - excluidas</span>
                            <span style={{ color: "#EF4444", fontSize: 12 }}>-{fmt(resumoDevolvidos.receita)}</span>
                          </div>
                        )}
                        <div style={{ ...S.dreRow, borderTop: "2px solid #EBEBEB", paddingTop: 10, fontWeight: 600 }}>
                          <span>Lucro operacional</span>
                          <span style={{ color: resumoTotal.lucroOp >= 0 ? "#22C55E" : "#EF4444" }}>{fmt(resumoTotal.lucroOp)}</span>
                        </div>
                        <div style={S.dreRow}>
                          <span style={{ color: "#555" }}>(-) Custos fixos</span>
                          <span style={{ color: "#EF4444" }}>- {fmt(totalCustosFixos)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: 15, fontWeight: 700, borderTop: "2px solid #EBEBEB" }}>
                          <span>= Lucro liquido</span>
                          <span style={{ color: lucroLiquido >= 0 ? "#22C55E" : "#EF4444", fontSize: 18 }}>{fmt(lucroLiquido)}</span>
                        </div>
                        <div style={{ marginTop: 8, padding: "10px 12px", background: "#F5F5F3", borderRadius: 8 }}>
                          {[
                            { l: "Margem liquida", v: resumoTotal.receita > 0 ? ((lucroLiquido / resumoTotal.receita) * 100).toFixed(1) + "%" : "--" },
                            { l: "Cancelados no mes", v: canceladosDoMes.length },
                            { l: "Em devolucao", v: devolucoesDoMes.length },
                          ].map(x => (
                            <div key={x.l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                              <span style={{ color: "#888" }}>{x.l}</span>
                              <span style={{ fontWeight: 500 }}>{x.v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={S.card}>
                        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>Composicao das deducoes</div>
                        {resumoTotal.receita > 0 && [
                          { l: "Taxas Shopee", v: resumoTotal.taxas, pct: resumoTotal.taxas / resumoTotal.receita * 100, cor: "#2563EB" },
                          { l: "Imposto", v: resumoTotal.imposto, pct: resumoTotal.imposto / resumoTotal.receita * 100, cor: "#F59E0B" },
                          { l: "Custo produtos", v: resumoTotal.custoProd, pct: resumoTotal.custoProd / resumoTotal.receita * 100, cor: "#8B5CF6" },
                          { l: "Custos fixos", v: totalCustosFixos, pct: totalCustosFixos / resumoTotal.receita * 100, cor: "#EF4444" },
                          ...(resumoTotal.descontos > 0 ? [{ l: "Descontos vendedor", v: resumoTotal.descontos, pct: resumoTotal.descontos / resumoTotal.receita * 100, cor: "#EC4899" }] : []),
                        ].map(x => (
                          <div key={x.l} style={{ marginBottom: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                              <span style={{ color: "#555" }}>{x.l}</span>
                              <span style={{ fontWeight: 500 }}>{fmt(x.v)} <span style={{ color: "#888", fontWeight: 400 }}>({x.pct.toFixed(1)}%)</span></span>
                            </div>
                            <div style={{ background: "#F0F0EE", borderRadius: 99, height: 6, overflow: "hidden" }}>
                              <div style={{ height: "100%", borderRadius: 99, background: x.cor, width: Math.min(x.pct, 100) + "%", transition: "width .4s" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {fechaTab === "fluxo" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div style={S.card}>
                        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Fluxo de Caixa - {labelMes(mesFechamento)}</div>
                        <div style={{ ...S.muted, marginBottom: 16 }}>Dinheiro que realmente entrou e saiu da conta</div>
                        {!temExtrato && (
                          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 9, padding: "10px 14px", marginBottom: 14, fontSize: 12.5, color: "#92400E" }}>
                            Importe o extrato Shopee na aba Extrato Shopee para ver os valores reais.
                          </div>
                        )}
                        <div style={{ fontSize: 11, fontWeight: 500, color: "#888", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Entradas</div>
                        <div style={S.dreRow}><span style={{ color: "#555" }}>Saques recebidos da Shopee</span><span style={{ color: "#22C55E", fontWeight: 500 }}>{fmt(saquesDoMesFin)}</span></div>
                        <div style={{ ...S.dreRow, fontWeight: 500, borderTop: "1px solid #EBEBEB", paddingTop: 8 }}><span>Total entradas</span><span style={{ color: "#22C55E", fontWeight: 600 }}>{fmt(saquesDoMesFin)}</span></div>
                        <div style={{ height: 16 }} />
                        <div style={{ fontSize: 11, fontWeight: 500, color: "#888", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Saidas</div>
                        <div style={S.dreRow}><span style={{ color: "#555" }}>Custos fixos</span><span style={{ color: "#EF4444", fontWeight: 500 }}>- {fmt(totalCustosFixos)}</span></div>
                        {adsDoMesFin > 0 && <div style={S.dreRow}><span style={{ color: "#555" }}>ADS Shopee</span><span style={{ color: "#EF4444", fontWeight: 500 }}>- {fmt(adsDoMesFin)}</span></div>}
                        {ajustesNegDoMesFin > 0 && <div style={S.dreRow}><span style={{ color: "#555" }}>Ajustes negativos</span><span style={{ color: "#EF4444", fontWeight: 500 }}>- {fmt(ajustesNegDoMesFin)}</span></div>}
                        {saidasVarPagasMes > 0 && <div style={S.dreRow}><span style={{ color: "#555" }}>Compras de insumos pagas</span><span style={{ color: "#EF4444", fontWeight: 500 }}>- {fmt(saidasVarPagasMes)}</span></div>}
                        <div style={{ ...S.dreRow, fontWeight: 500, borderTop: "1px solid #EBEBEB", paddingTop: 8 }}><span>Total saidas</span><span style={{ color: "#EF4444", fontWeight: 600 }}>- {fmt(totalCustosFixos + adsDoMesFin + ajustesNegDoMesFin + saidasVarPagasMes)}</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: 15, fontWeight: 700, borderTop: "2px solid #EBEBEB" }}>
                          <span>Saldo do periodo</span>
                          <span style={{ color: saldoPeriodo >= 0 ? "#22C55E" : "#EF4444", fontSize: 18 }}>{fmt(saldoPeriodo)}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ background: "#0D0D0F", borderRadius: 12, padding: "18px 20px" }}>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Competencia vs Caixa</div>
                          {[
                            { l: "Lucro liquido (competencia)", v: lucroLiquido, desc: "O que o negocio gerou" },
                            { l: "Saldo de caixa (real)", v: saldoPeriodo, desc: "O que entrou na conta" },
                          ].map(x => (
                            <div key={x.l} style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginBottom: 3 }}>{x.l}</div>
                              <div style={{ fontSize: 24, fontWeight: 600, color: x.v >= 0 ? "#4ADE80" : "#F87171", letterSpacing: -0.5 }}>{fmt(x.v)}</div>
                              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.3)", marginTop: 2 }}>{x.desc}</div>
                            </div>
                          ))}
                          {temExtrato && (
                            <div style={{ borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 12, marginTop: 4 }}>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginBottom: 3 }}>Diferenca</div>
                              <div style={{ fontSize: 16, fontWeight: 500, color: saldoPeriodo - lucroLiquido >= 0 ? "#4ADE80" : "#FCD34D" }}>{saldoPeriodo - lucroLiquido >= 0 ? "+" : ""}{fmt(saldoPeriodo - lucroLiquido)}</div>
                              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.3)", marginTop: 2, lineHeight: 1.5 }}>
                                {saldoPeriodo - lucroLiquido > 0 ? "Mais dinheiro entrou do que o lucro indica - pode ter recebimentos de meses anteriores." : saldoPeriodo - lucroLiquido < 0 ? "Menos dinheiro entrou do que o lucro indica - parte das vendas ainda nao foi recebida." : "Competencia e caixa alinhados."}
                              </div>
                            </div>
                          )}
                          {!temExtrato && <div style={{ borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 12, fontSize: 12, color: "rgba(255,255,255,.3)" }}>Importe o extrato para ver a comparacao real.</div>}
                        </div>
                        {saidasVarPagasMesItens.length > 0 && (
                          <div style={S.card}>
                            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Compras pagas em {labelMes(mesFechamento)}</div>
                            {saidasVarPagasMesItens.map(s => (
                              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F5F5F3" }}>
                                <div>
                                  <div style={{ fontSize: 13 }}>{s.fornecedor}</div>
                                  <div style={S.muted}>{s.categoria}{s.descricao ? " - " + s.descricao : ""}</div>
                                </div>
                                <span style={{ fontSize: 13.5, fontWeight: 600, color: "#EF4444" }}>- {fmt(pn(s.valor))}</span>
                              </div>
                            ))}
                            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "2px solid #EBEBEB" }}>
                              <span style={{ fontWeight: 500 }}>Total</span>
                              <span style={{ fontSize: 15, fontWeight: 600, color: "#EF4444" }}>- {fmt(saidasVarPagasMes)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {fechaTab === "saude" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ background: "#0D0D0F", borderRadius: 14, padding: "20px 24px" }}>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Ponto de equilibrio - {labelMes(mesFechamento)}</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,.45)", marginBottom: 4 }}>Voce precisa vender</div>
                            <div style={{ fontSize: 40, fontWeight: 600, color: "#fff", letterSpacing: -1, lineHeight: 1 }}>{fmtN(pontoEquilibrio)}</div>
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,.35)", marginTop: 4 }}>pares/mes para cobrir os custos fixos</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,.45)", marginBottom: 4 }}>Voce vendeu</div>
                            <div style={{ fontSize: 28, fontWeight: 600, color: resumoTotal.qtd >= pontoEquilibrio ? "#4ADE80" : "#FCD34D", letterSpacing: -0.5 }}>{fmtN(resumoTotal.qtd)} pares</div>
                            <div style={{ fontSize: 13, color: resumoTotal.qtd >= pontoEquilibrio ? "#4ADE80" : "#FCD34D", marginTop: 4 }}>{resumoTotal.qtd >= pontoEquilibrio ? "Acima do ponto de equilibrio" : "Abaixo do ponto de equilibrio"}</div>
                          </div>
                        </div>
                        <div style={{ marginTop: 16 }}>
                          <div style={{ background: "rgba(255,255,255,.1)", borderRadius: 99, height: 8, overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 99, background: resumoTotal.qtd >= pontoEquilibrio ? "#4ADE80" : "#FCD34D", width: percentualPE + "%", transition: "width .5s" }} />
                          </div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,.3)", marginTop: 6 }}>Margem de contribuicao por par: {fmt(margemContribPorPar)}</div>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }}>
                        {[
                          { l: "Ticket medio", v: fmt(ticketMedio), desc: "Por par vendido", ok: true },
                          { l: "Taxa de devolucao", v: taxaDevolucao.toFixed(1) + "%", desc: devolucoesDoMes.length + " de " + pedidosDoMes.length, ok: taxaDevolucao < 3 },
                          { l: "Taxa cancelamento", v: cancelamentoRate.toFixed(1) + "%", desc: canceladosDoMes.length + " pedidos", ok: cancelamentoRate < 5 },
                          { l: "Custo por pedido ADS", v: custoAquisicao > 0 ? fmt(custoAquisicao) : "sem ADS", desc: adsDoMesFin > 0 ? "Total: " + fmt(adsDoMesFin) : "Importe extrato", ok: custoAquisicao === 0 || custoAquisicao < ticketMedio * 0.1 },
                          { l: "Margem operacional", v: resumoTotal.receita > 0 ? ((resumoTotal.lucroOp / resumoTotal.receita) * 100).toFixed(1) + "%" : "--", desc: "Antes dos fixos", ok: resumoTotal.receita > 0 && (resumoTotal.lucroOp / resumoTotal.receita) * 100 >= 20 },
                          { l: "Margem liquida", v: resumoTotal.receita > 0 ? ((lucroLiquido / resumoTotal.receita) * 100).toFixed(1) + "%" : "--", desc: "Apos todos os custos", ok: lucroLiquido / resumoTotal.receita * 100 >= 10 },
                          { l: "Pedidos no mes", v: fmtN(resumoTotal.pedidos), desc: fmtN(resumoTotal.qtd) + " pares", ok: true },
                          { l: "Receita por dia", v: fmt(resumoTotal.receita / 30), desc: "Media do mes", ok: true },
                        ].map(x => (
                          <div key={x.l} style={{ ...S.card, padding: "14px 16px", borderLeft: "3px solid " + (x.ok ? "#22C55E" : "#EF4444") }}>
                            <div style={{ fontSize: 11, color: "#888", marginBottom: 5 }}>{x.l}</div>
                            <div style={{ fontSize: 20, fontWeight: 600, color: x.ok ? "#22C55E" : "#EF4444", letterSpacing: -0.3 }}>{x.v}</div>
                            <div style={{ fontSize: 11.5, color: "#888", marginTop: 3 }}>{x.desc}</div>
                          </div>
                        ))}
                      </div>
                      {debitosDevolucao > 0 && (
                        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "12px 14px" }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "#92400E" }}>Debitos de devolucao no extrato: {fmt(debitosDevolucao)}</div>
                          <div style={{ fontSize: 12.5, color: "#B45309", marginTop: 2 }}>A Shopee debitou {fmt(debitosDevolucao)} referente a reembolsos. Ja abatido no fluxo de caixa.</div>
                        </div>
                      )}
                    </div>
                  )}

                  {fechaTab === "historico" && (
                    historicoMensal.length < 2 ? (
                      <div style={{ textAlign: "center", padding: "60px 20px" }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>📅</div>
                        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Dados insuficientes</div>
                        <div style={S.muted}>Importe pedidos de pelo menos 2 meses para ver o comparativo.</div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={S.card}>
                          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 16 }}>Receita vs Lucro liquido</div>
                          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160, paddingBottom: 24 }}>
                            {historicoMensal.map(m => {
                              const maxVal = Math.max(...historicoMensal.map(x => x.receita));
                              const hR = maxVal > 0 ? (m.receita / maxVal) * 130 : 0;
                              const hL = maxVal > 0 ? (Math.max(0, m.lucroLiq) / maxVal) * 130 : 0;
                              const isAtual = m.mes === mesFechamento;
                              return (
                                <div key={m.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                                  <div style={{ width: "100%", display: "flex", gap: 2, alignItems: "flex-end", height: 140 }}>
                                    <div style={{ flex: 1, background: isAtual ? "#2563EB" : "#DBEAFE", borderRadius: "4px 4px 0 0", height: hR, minHeight: 2 }} />
                                    <div style={{ flex: 1, background: isAtual ? "#22C55E" : m.lucroLiq < 0 ? "#FCA5A5" : "#BBF7D0", borderRadius: "4px 4px 0 0", height: hL, minHeight: m.lucroLiq < 0 ? 2 : 0 }} />
                                  </div>
                                  <div style={{ fontSize: 10, color: isAtual ? "#2563EB" : "#888", fontWeight: isAtual ? 600 : 400 }}>{m.label}</div>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
                            {[{ c: "#2563EB", l: "Receita" }, { c: "#22C55E", l: "Lucro liquido" }].map(x => (
                              <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 2, background: x.c }} />
                                <span style={{ fontSize: 12, color: "#555" }}>{x.l}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div style={S.card}>
                          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>Tabela comparativa</div>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                              <thead><tr>{["Mes", "Pedidos", "Pares", "Receita", "Lucro op.", "Lucro liq.", "Var. receita"].map(h => <th key={h} style={{ textAlign: h === "Mes" ? "left" : "right", fontWeight: 500, color: "#888", padding: "8px 12px", borderBottom: "1px solid #EBEBEB", fontSize: 11.5 }}>{h}</th>)}</tr></thead>
                              <tbody>
                                {historicoMensal.slice().reverse().map((m, i, arr) => {
                                  const prev = arr[i + 1];
                                  const varR = prev && prev.receita > 0 ? ((m.receita - prev.receita) / prev.receita) * 100 : null;
                                  const isAtual = m.mes === mesFechamento;
                                  return (
                                    <tr key={m.mes} style={{ background: isAtual ? "#F0F4FF" : "" }}>
                                      <td style={{ padding: "9px 12px", fontWeight: isAtual ? 600 : 400, color: isAtual ? "#2563EB" : "#0D0D0F" }}>{m.label}</td>
                                      <td style={{ padding: "9px 12px", textAlign: "right" }}>{fmtN(m.pedidos)}</td>
                                      <td style={{ padding: "9px 12px", textAlign: "right" }}>{fmtN(m.qtd)}</td>
                                      <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 500 }}>{fmt(m.receita)}</td>
                                      <td style={{ padding: "9px 12px", textAlign: "right", color: m.lucroOp >= 0 ? "#22C55E" : "#EF4444", fontWeight: 500 }}>{fmt(m.lucroOp)}</td>
                                      <td style={{ padding: "9px 12px", textAlign: "right", color: m.lucroLiq >= 0 ? "#22C55E" : "#EF4444", fontWeight: 600 }}>{fmt(m.lucroLiq)}</td>
                                      <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 500, color: varR === null ? "#888" : varR >= 0 ? "#22C55E" : "#EF4444" }}>{varR === null ? "--" : (varR >= 0 ? "+" : "") + varR.toFixed(1) + "%"}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )
                  )}

                  {fechaTab === "recebido" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {[
                        { titulo: "Ja recebido (Entregues)", resumo: resumoEntregue, lucro: resumoEntregue.lucroOp - totalCustosFixos, cor: "#22C55E", bg: "#F0FDF4", border: "#BBF7D0" },
                        { titulo: "A receber (Em transito)", resumo: resumoAReceber, lucro: resumoAReceber.lucroOp, cor: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
                      ].map(x => (
                        <div key={x.titulo} style={{ background: x.bg, border: "1px solid " + x.border, borderRadius: 12, padding: "18px 20px" }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: x.cor, marginBottom: 8 }}>{x.titulo}</div>
                          <div style={{ fontSize: 28, fontWeight: 600, color: x.cor, letterSpacing: -0.5, marginBottom: 4 }}>{fmt(x.lucro)}</div>
                          <div style={{ fontSize: 12.5, color: "#555", marginBottom: 14 }}>{fmtN(x.resumo.pedidos)} pedidos - {fmtN(x.resumo.qtd)} pares</div>
                          {[{ l: "Receita", v: x.resumo.receita }, { l: "Taxas Shopee", v: -x.resumo.taxas }, { l: "Imposto", v: -x.resumo.imposto }, { l: "Custo produtos", v: -x.resumo.custoProd }].map(r => (
                            <div key={r.l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
                              <span style={{ color: "#555" }}>{r.l}</span>
                              <span style={{ color: r.v >= 0 ? "#22C55E" : "#EF4444", fontWeight: 500 }}>{r.v >= 0 ? fmt(r.v) : "- " + fmt(-r.v)}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {fechaTab === "skus" && (
                    <div style={S.card}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>Ranking de produtos</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {[{ id: "lucro", l: "Lucro" }, { id: "receita", l: "Receita" }, { id: "qtd", l: "Qtd" }].map(o => (
                            <button key={o.id} onClick={() => setOrdemSKU(o.id)} style={{ ...S.btnSecondary, padding: "4px 10px", fontSize: 12, background: ordemSKU === o.id ? "#0D0D0F" : "", color: ordemSKU === o.id ? "#fff" : "" }}>{o.l}</button>
                          ))}
                        </div>
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                          <thead><tr>{["#", "Produto", "Qtd", "Receita", "Taxas", "Imposto", "Custo", "Lucro", "Margem"].map(h => <th key={h} style={{ textAlign: h === "#" || h === "Produto" ? "left" : "right", fontWeight: 500, color: "#888", padding: "8px 12px", borderBottom: "1px solid #EBEBEB", fontSize: 11.5, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {rankingSKU.map((s, i) => {
                              const margem = s.receita > 0 ? (s.lucro / s.receita) * 100 : 0;
                              return (
                                <tr key={s.prefixo} style={{ borderBottom: "1px solid #F5F5F3" }}>
                                  <td style={{ padding: "9px 12px", color: "#BBB", fontWeight: 500 }}>{i + 1}</td>
                                  <td style={{ padding: "9px 12px" }}>
                                    <div style={{ fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.nomeProduto}</div>
                                    <div style={{ ...S.mono, color: "#888", marginTop: 2 }}>{s.prefixo}{s.semCadastro && <span style={{ color: "#F59E0B", marginLeft: 6 }}>sem custo</span>}</div>
                                  </td>
                                  <td style={{ padding: "9px 12px", textAlign: "right" }}>{fmtN(s.qtd)}</td>
                                  <td style={{ padding: "9px 12px", textAlign: "right" }}>{fmt(s.receita)}</td>
                                  <td style={{ padding: "9px 12px", textAlign: "right", color: "#EF4444" }}>-{fmt(s.taxas)}</td>
                                  <td style={{ padding: "9px 12px", textAlign: "right", color: "#F59E0B" }}>-{fmt(s.imposto)}</td>
                                  <td style={{ padding: "9px 12px", textAlign: "right", color: "#8B5CF6" }}>-{fmt(s.custoProd)}</td>
                                  <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600, color: s.lucro >= 0 ? "#22C55E" : "#EF4444" }}>{fmt(s.lucro)}</td>
                                  <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600, color: corMargem(margem) }}>{margem.toFixed(1)}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {fechaTab === "cruzamento" && (
                    <div style={S.card}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>Cruzamento: pedidos entregues x pagamentos</div>
                          <div style={S.muted}>Verifica se a Shopee pagou todos os pedidos ja entregues</div>
                        </div>
                        <button style={{ ...S.btnPrimary, fontSize: 12.5, padding: "8px 16px" }} onClick={executarCruzamento}>Verificar agora</button>
                      </div>
                      {cruzamentoExecutado && cruzamentoAlertas.length > 0 && !cruzamentoAlertas[0].mensagem && (
                        <div>
                          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9, padding: "10px 14px", marginBottom: 12 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: "#DC2626" }}>{cruzamentoAlertas.length} pedido(s) entregue(s) sem pagamento identificado</div>
                            <div style={{ fontSize: 12.5, color: "#EF4444", marginTop: 2 }}>Verifique no painel da Shopee.</div>
                          </div>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                              <thead><tr>{["ID do pedido", "SKU", "Data criacao", "Valor esperado"].map(h => <th key={h} style={{ textAlign: h === "Valor esperado" ? "right" : "left", fontWeight: 500, color: "#888", padding: "8px 12px", borderBottom: "1px solid #EBEBEB", fontSize: 11.5 }}>{h}</th>)}</tr></thead>
                              <tbody>
                                {cruzamentoAlertas.map(a => (
                                  <tr key={a.id}>
                                    <td style={{ padding: "9px 12px" }}><span style={{ ...S.mono, color: "#DC2626" }}>{a.id}</span></td>
                                    <td style={{ padding: "9px 12px" }}><span style={S.mono}>{a.sku}</span></td>
                                    <td style={{ padding: "9px 12px", color: "#888", fontSize: 12.5 }}>{a.data ? a.data.slice(0, 10) : ""}</td>
                                    <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600, color: "#DC2626" }}>{fmt(a.valor)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {cruzamentoExecutado && cruzamentoAlertas.length === 0 && pedidosValidos.filter(p => p.entregue).length > 0 && transacoes.length > 0 && (
                        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 9, padding: "10px 14px", fontSize: 13, color: "#15803D", fontWeight: 500 }}>
                          Cruzamento concluido - todos os {pedidosValidos.filter(p => p.entregue).length} pedidos entregues foram pagos
                        </div>
                      )}
                      {cruzamentoExecutado && cruzamentoAlertas.length > 0 && cruzamentoAlertas[0].mensagem && (
                        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 9, padding: "10px 14px", fontSize: 13, color: "#92400E" }}>{cruzamentoAlertas[0].mensagem}</div>
                      )}
                      {cruzamentoExecutado && pedidosValidos.filter(p => p.entregue).length === 0 && (
                        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 9, padding: "10px 14px", fontSize: 13, color: "#92400E" }}>Importe pedidos na aba Fechamento para cruzar com o extrato.</div>
                      )}
                    </div>
                  )}

                  {fechaTab === "pedidos" && (
                    <div style={S.card}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>Pedidos de {labelMes(mesFechamento)}</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <div style={S.muted}>{pedidosAgrupados.length} pedidos ({pedidosDoMes.length} linhas)</div>
                          <input style={{ ...S.input, width: 200, fontSize: 12.5, padding: "6px 10px" }} placeholder="Buscar por ID ou SKU..." value={buscaPedidos} onChange={e => setBuscaPedidos(e.target.value)} />
                          {buscaPedidos && <button style={{ ...S.btnGhost, fontSize: 12, color: "#888" }} onClick={() => setBuscaPedidos("")}>✕ Limpar</button>}
                        </div>
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                          <thead>
                            <tr>
                              {["Pedido", "SKUs / Variacoes", "Qtd", "Receita", "Taxas+Imp", "Custo", "Lucro", "Status"].map(h => (
                                <th key={h} style={{ textAlign: h === "Pedido" || h === "SKUs / Variacoes" || h === "Status" ? "left" : "right", fontWeight: 500, color: "#888", padding: "8px 12px", borderBottom: "1px solid #EBEBEB", fontSize: 11.5, whiteSpace: "nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pedidosAgrupados.filter(g => !buscaPedidos || g.id.toLowerCase().includes(buscaPedidos.toLowerCase()) || g.skus.some(s => s.toLowerCase().includes(buscaPedidos.toLowerCase()))).slice(0, 100).map(g => {
                              const p = g.pedido;
                              const multiSku = g.skus.length > 1;
                              return (
                                <tr key={g.id} style={{ borderBottom: "1px solid #F5F5F3", background: multiSku ? "#FAFEFF" : "" }}>
                                  <td style={{ padding: "9px 12px" }}>
                                    <span style={S.mono}>{g.id}</span>
                                    {multiSku && <div style={{ fontSize: 10, color: "#2563EB", marginTop: 2 }}>{g.skus.length} variacoes</div>}
                                  </td>
                                  <td style={{ padding: "9px 12px", maxWidth: 180 }}>
                                    {multiSku ? (
                                      <div>
                                        {g.skus.map((sku, i) => (
                                          <div key={i} style={{ fontSize: 11.5, color: "#555", lineHeight: 1.6 }}>
                                            <span style={S.mono}>{sku}</span>
                                            {g.variacoes[i] && <span style={{ color: "#888", marginLeft: 4, fontSize: 11 }}>{g.variacoes[i]}</span>}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div>
                                        <span style={S.mono}>{g.skus[0] || "--"}</span>
                                        {g.variacoes[0] && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{g.variacoes[0]}</div>}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: "9px 12px", textAlign: "right" }}>{g.qtd}</td>
                                  <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: multiSku ? 600 : 400 }}>{fmt(g.receita)}</td>
                                  <td style={{ padding: "9px 12px", textAlign: "right", color: "#EF4444" }}>-{fmt(g.taxasShopee + g.impostoValor)}</td>
                                  <td style={{ padding: "9px 12px", textAlign: "right", color: "#8B5CF6" }}>{g.semCadastro ? <span style={{ color: "#F59E0B" }}>s/cad</span> : "-" + fmt(g.custoProduto)}</td>
                                  <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600, color: g.lucro >= 0 ? "#22C55E" : "#EF4444" }}>{fmt(g.lucro)}</td>
                                  <td style={{ padding: "9px 12px" }}>
                                    {p.cancelado ? <Badge color="#FEF2F2" text="#DC2626">Cancelado</Badge>
                                      : p.emDevolucao ? <Badge color="#FFF7ED" text="#C2410C">Devolucao</Badge>
                                        : p.aEnviar ? <Badge color="#F5F5F3" text="#555">A Enviar</Badge>
                                          : p.entregue ? <Badge color="#F0FDF4" text="#15803D">Entregue</Badge>
                                            : <Badge color="#EFF6FF" text="#1D4ED8">Em transito</Badge>}
                                  </td>
                                </tr>
                              );
                            })}
                            {buscaPedidos && pedidosAgrupados.filter(g => g.id.toLowerCase().includes(buscaPedidos.toLowerCase()) || g.skus.some(s => s.toLowerCase().includes(buscaPedidos.toLowerCase()))).length === 0 && (
                              <tr><td colSpan={8} style={{ textAlign: "center", color: "#888", fontSize: 12, padding: 20 }}>Nenhum pedido encontrado para "{buscaPedidos}"</td></tr>
                            )}
                            {!buscaPedidos && pedidosAgrupados.length > 100 && (
                              <tr><td colSpan={8} style={{ textAlign: "center", color: "#888", fontSize: 12, padding: 12 }}>Mostrando 100 de {pedidosAgrupados.length} pedidos</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "financeiro" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>Extrato Shopee</div>
                  <div style={S.muted}>Importe o relatorio de saldo de transacoes - um mes por vez</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <select value={mesFinValido} onChange={e => setMesFin(e.target.value)} style={S.select}>
                    {mesesExtrato.length > 0 ? mesesExtrato.map(m => <option key={m} value={m}>{labelMes(m)}</option>) : <option value={mesFinValido}>{labelMes(mesFinValido)}</option>}
                  </select>
                  <label style={{ ...S.btnPrimary, cursor: "pointer" }}>
                    {importandoFin ? "Importando..." : "+ Importar extrato"}
                    <input ref={finFileRef} type="file" accept=".xlsx,.xls" onChange={handleImportFinanceiro} style={{ display: "none" }} disabled={importandoFin} />
                  </label>
                  {transacoes.length > 0 && (
                    confirmLimparTransacoes
                      ? <ConfirmButtons onConfirm={() => { setTransacoes([]); setConfirmLimparTransacoes(false); }} onCancel={() => setConfirmLimparTransacoes(false)} confirmLabel="Limpar extrato" />
                      : <button style={{ ...S.btnSecondary, fontSize: 12 }} onClick={() => setConfirmLimparTransacoes(true)}>Limpar extrato</button>
                  )}
                </div>
              </div>
              {importErroFin && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#DC2626" }}>{importErroFin}</div>}
              {transacoes.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px" }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Nenhum extrato importado</div>
                  <div style={{ ...S.muted, maxWidth: 360, margin: "0 auto 16px", lineHeight: 1.6 }}>No painel Shopee acesse <strong>Financas - Minha Carteira - Relatorio de Saldo</strong>. Exporte mes a mes e importe aqui.</div>
                </div>
              ) : (
                <>
                  <div style={{ background: "#0D0D0F", borderRadius: 14, padding: "20px 24px" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>{labelMes(mesFinValido)} - {transDoMes.length} transacoes</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8 }}>
                      {[
                        { l: "Entradas pedidos", v: fmt(entradasPedidosMes), c: "#4ADE80" },
                        { l: "Ajustes positivos", v: fmt(ajustesPos), c: "#60A5FA" },
                        { l: "Ajustes negativos", v: fmt(ajustesNeg), c: "#F87171" },
                        { l: "Gasto ADS", v: fmt(adsExtrato), c: "#FB923C" },
                        { l: "Saques", v: fmt(saques), c: "#C084FC" },
                      ].map(x => (
                        <div key={x.l} style={{ background: "rgba(255,255,255,.05)", borderRadius: 8, padding: "10px 12px" }}>
                          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.35)", marginBottom: 4 }}>{x.l}</div>
                          <div style={{ fontSize: 17, fontWeight: 600, color: x.c, letterSpacing: -0.3 }}>{x.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={S.card}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>Transacoes de {labelMes(mesFinValido)}</div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                        <thead><tr>{["Data", "Tipo", "Descricao", "ID Pedido", "Valor", "Dir."].map(h => <th key={h} style={{ textAlign: h === "Valor" ? "right" : "left", fontWeight: 500, color: "#888", padding: "8px 12px", borderBottom: "1px solid #EBEBEB", fontSize: 11.5 }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {transDoMes.slice(0, 100).map((t, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid #F5F5F3" }}>
                              <td style={{ padding: "9px 12px", fontSize: 11.5, color: "#888", whiteSpace: "nowrap" }}>{t.data ? t.data.slice(0, 16) : ""}</td>
                              <td style={{ padding: "9px 12px" }}><span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, background: "#F5F5F3", color: "#555", fontWeight: 500 }}>{t.tipo}</span></td>
                              <td style={{ padding: "9px 12px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5 }}>{t.desc}</td>
                              <td style={{ padding: "9px 12px" }}><span style={{ ...S.mono, color: "#888" }}>{t.idPedido || "--"}</span></td>
                              <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600, color: t.entrada ? "#22C55E" : "#EF4444" }}>{t.entrada ? "+" : "-"}{fmt(t.valor)}</td>
                              <td style={{ padding: "9px 12px" }}><Badge color={t.entrada ? "#F0FDF4" : "#FEF2F2"} text={t.entrada ? "#15803D" : "#DC2626"}>{t.entrada ? "Entrada" : "Saida"}</Badge></td>
                            </tr>
                          ))}
                          {transDoMes.length > 100 && <tr><td colSpan={6} style={{ textAlign: "center", color: "#888", fontSize: 12, padding: 12 }}>Mostrando 100 de {transDoMes.length}</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "saidas" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>Saidas Variaveis</div>
                  <div style={S.muted}>Compras e gastos nao fixos</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <select value={mesSaidas} onChange={e => setMesSaidas(e.target.value)} style={S.select}>
                    {[...new Set([mesAtual(), ...saidasVar.map(s => extrairMes(s.vencimento) || extrairMes(s.dataPagamento)).filter(Boolean)])].sort().reverse().map(m => <option key={m} value={m}>{labelMes(m)}</option>)}
                  </select>
                  <button style={S.btnPrimary} onClick={() => { setFormSaida({ fornecedor: "", categoria: categorias[0] || "", descricao: "", valor: 0, vencimento: "", pago: false, dataPagamento: "" }); setEditSaidaId(null); setShowNovaSaida(true); }}>+ Registrar saida</button>
                </div>
              </div>

              {saidasMigraveis.length > 0 && (
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#92400E", marginBottom: 4 }}>Encontrei {saidasMigraveis.length} saída(s) salvas neste navegador</div>
                  <div style={{ fontSize: 12.5, color: "#B45309", marginBottom: 10 }}>Importe para a sua conta. Seus dados locais continuam intactos como backup.</div>
                  <button style={S.btnPrimary} onClick={importarSaidasLocal}>Importar {saidasMigraveis.length} saída(s)</button>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {[{ l: "Total do mes", v: fmt(totalSaidasVar), c: "#0D0D0F" }, { l: "Pago", v: fmt(totalSaidasVarPagas), c: "#22C55E" }, { l: "Pendente", v: fmt(totalSaidasVarPendentes), c: totalSaidasVarPendentes > 0 ? "#F59E0B" : "#888" }].map(x => (
                  <div key={x.l} style={{ ...S.card, padding: "12px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{x.l}</div>
                    <div style={{ fontSize: 20, fontWeight: 600, color: x.c }}>{x.v}</div>
                  </div>
                ))}
              </div>
              <div style={S.card}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Categorias</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {categorias.map(cat => (
                    <div key={cat} style={{ display: "flex", alignItems: "center", gap: 4, background: "#F0F4FF", border: "1px solid #DBEAFE", borderRadius: 20, padding: "4px 10px 4px 12px" }}>
                      <span style={{ fontSize: 12.5, color: "#1D4ED8" }}>{cat}</span>
                      <button onClick={() => setCategorias(p => p.filter(c => c !== cat))} style={{ background: "none", border: "none", cursor: "pointer", color: "#93C5FD", fontSize: 14, lineHeight: 1, padding: "0 2px" }}>x</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)} style={{ ...S.input, flex: 1 }} placeholder="Nova categoria..." onKeyDown={e => { if (e.key === "Enter" && novaCategoria.trim()) { setCategorias(p => [...p, novaCategoria.trim()]); setNovaCategoria(""); } }} />
                  <button style={S.btnSecondary} onClick={() => { if (novaCategoria.trim()) { setCategorias(p => [...p, novaCategoria.trim()]); setNovaCategoria(""); } }}>Adicionar</button>
                </div>
              </div>
              <div style={{ ...S.card, padding: "12px 16px" }}>
                <button style={{ ...S.btnGhost, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: 0, fontSize: 13, fontWeight: 500, color: "#0D0D0F" }} onClick={() => setShowFornecedoresList(p => !p)}>
                  <span>Fornecedores cadastrados ({fornecedores.length})</span>
                  <span style={{ fontSize: 12, color: "#888" }}>{showFornecedoresList ? "▲ Recolher" : "▼ Expandir"}</span>
                </button>
                {showFornecedoresList && (
                  <div style={{ marginTop: 12 }}>
                    {fornecedores.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                        {fornecedores.map(f => (
                          <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#F9F9F7", borderRadius: 8 }}>
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 500 }}>{f.nome}</span>
                              {f.categoria && <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>{f.categoria}</span>}
                              {f.contato && <span style={{ fontSize: 12, color: "#aaa", marginLeft: 8 }}>{f.contato}</span>}
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button style={{ ...S.btnSecondary, fontSize: 11, padding: "4px 8px" }} onClick={() => { setNovoFornecedor({ nome: f.nome, categoria: f.categoria, contato: f.contato }); setEditFornecedorId(f.id); setShowFornecedorForm(true); setShowFornecedoresList(true); }}>Editar</button>
                              {confirmDeleteForn === f.id
                                ? <ConfirmButtons onConfirm={() => { setFornecedores(p => p.filter(x => x.id !== f.id)); setConfirmDeleteForn(null); }} onCancel={() => setConfirmDeleteForn(null)} confirmLabel="Excluir" />
                                : <button style={{ ...S.btnDanger, padding: "4px 8px", fontSize: 11 }} onClick={() => setConfirmDeleteForn(f.id)}>Del</button>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {showFornecedorForm ? (
                      <div style={{ background: "#F0F4FF", borderRadius: 10, padding: "12px 14px", border: "1px solid #DBEAFE" }}>
                        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>{editFornecedorId ? "Editar fornecedor" : "Novo fornecedor"}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <div><label style={S.label}>Nome *</label><input style={S.input} value={novoFornecedor.nome} onChange={e => setNovoFornecedor(p => ({ ...p, nome: e.target.value }))} placeholder="Nome do fornecedor" /></div>
                            <div><label style={S.label}>Categoria</label>
                              <select style={{ ...S.select, width: "100%" }} value={novoFornecedor.categoria} onChange={e => setNovoFornecedor(p => ({ ...p, categoria: e.target.value }))}>
                                <option value="">Selecione...</option>
                                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          </div>
                          <div><label style={S.label}>Contato</label><input style={S.input} value={novoFornecedor.contato} onChange={e => setNovoFornecedor(p => ({ ...p, contato: e.target.value }))} placeholder="Telefone, email..." /></div>
                          <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                            <button style={S.btnPrimary} onClick={() => {
                              if (!novoFornecedor.nome.trim()) { alert("Informe o nome."); return; }
                              const dados = { ...novoFornecedor, id: editFornecedorId || Date.now() };
                              if (editFornecedorId) setFornecedores(p => p.map(x => x.id === editFornecedorId ? dados : x));
                              else setFornecedores(p => [...p, dados]);
                              setShowFornecedorForm(false); setEditFornecedorId(null);
                              setNovoFornecedor({ nome: "", categoria: "", contato: "" });
                            }}>Salvar</button>
                            <button style={S.btnSecondary} onClick={() => { setShowFornecedorForm(false); setEditFornecedorId(null); }}>Cancelar</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button style={{ ...S.btnSecondary, fontSize: 12, padding: "6px 14px" }} onClick={() => { setNovoFornecedor({ nome: "", categoria: "", contato: "" }); setEditFornecedorId(null); setShowFornecedorForm(true); }}>+ Novo fornecedor</button>
                    )}
                  </div>
                )}
              </div>
              {showNovaSaida && (
                <div style={{ ...S.card, border: "1.5px solid #DBEAFE" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{editSaidaId ? "Editar saida" : "Registrar saida"}</span>
                    <button style={S.btnGhost} onClick={() => { setShowNovaSaida(false); setEditSaidaId(null); }}>x</button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={S.label}>Fornecedor *</label>
                        {fornecedores.length > 0 ? (
                          <select style={{ ...S.select, width: "100%" }} value={formSaida.fornecedor} onChange={e => setFormSaida(p => ({ ...p, fornecedor: e.target.value }))}>
                            <option value="">Selecione ou digite abaixo...</option>
                            {fornecedores.map(f => <option key={f.id} value={f.nome}>{f.nome}{f.categoria ? " - " + f.categoria : ""}</option>)}
                            <option value="__outro">Outro (digitar)</option>
                          </select>
                        ) : null}
                        {(fornecedores.length === 0 || formSaida.fornecedor === "__outro") && (
                          <input style={{ ...S.input, marginTop: fornecedores.length > 0 ? 6 : 0 }} value={formSaida.fornecedor === "__outro" ? "" : formSaida.fornecedor} onChange={e => setFormSaida(p => ({ ...p, fornecedor: e.target.value }))} placeholder="Nome do fornecedor" />
                        )}
                      </div>
                      <div><label style={S.label}>Categoria</label><select style={{ ...S.select, width: "100%" }} value={formSaida.categoria} onChange={e => setFormSaida(p => ({ ...p, categoria: e.target.value }))}>{categorias.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                    </div>
                    <div><label style={S.label}>Descricao</label><input style={S.input} value={formSaida.descricao} onChange={e => setFormSaida(p => ({ ...p, descricao: e.target.value }))} placeholder="O que foi comprado..." /></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div><label style={S.label}>Valor *</label><NumInput key="saida-valor" value={formSaida.valor} onChange={v => setFormSaida(p => ({ ...p, valor: v }))} /></div>
                      <div><label style={S.label}>Vencimento</label><input type="date" style={S.input} value={formSaida.vencimento} onChange={e => setFormSaida(p => ({ ...p, vencimento: e.target.value }))} /></div>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13.5, color: "#555" }}>
                      <input type="checkbox" checked={formSaida.pago} onChange={e => setFormSaida(p => ({ ...p, pago: e.target.checked }))} style={{ accentColor: "#2563EB" }} />
                      Ja pago
                    </label>
                    {formSaida.pago && <div><label style={S.label}>Data do pagamento</label><input type="date" style={{ ...S.input, maxWidth: 200 }} value={formSaida.dataPagamento} onChange={e => setFormSaida(p => ({ ...p, dataPagamento: e.target.value }))} /></div>}
                    <div style={{ display: "flex", gap: 8, paddingTop: 8, borderTop: "1px solid #EBEBEB" }}>
                      <button style={S.btnPrimary} onClick={salvarSaida}>Salvar</button>
                      <button style={S.btnSecondary} onClick={() => { setShowNovaSaida(false); setEditSaidaId(null); }}>Cancelar</button>
                    </div>
                  </div>
                </div>
              )}
              {saidasDoMes.length === 0 && !showNovaSaida ? (
                <div style={{ textAlign: "center", padding: "60px 20px" }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>💸</div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Nenhuma saida em {labelMes(mesSaidas)}</div>
                  <div style={{ ...S.muted, marginBottom: 16 }}>Registre compras de insumos e outros gastos variaveis.</div>
                  <button style={S.btnPrimary} onClick={() => setShowNovaSaida(true)}>+ Registrar primeira saida</button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {saidasDoMes.slice().sort((a, b) => a.pago - b.pago).map(s => {
                    const vencida = s.vencimento && !s.pago && new Date(s.vencimento) < new Date();
                    return (
                      <div key={s.id} style={{ ...S.card, opacity: s.pago ? 0.85 : 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", gap: 8, marginBottom: 5, flexWrap: "wrap", alignItems: "center" }}>
                              <span style={{ fontSize: 14, fontWeight: 500 }}>{s.fornecedor}</span>
                              <Badge color="#EFF6FF" text="#1D4ED8">{s.categoria}</Badge>
                              {s.pago ? <Badge color="#F0FDF4" text="#15803D">Pago{s.dataPagamento ? " - " + s.dataPagamento : ""}</Badge>
                                : vencida ? <Badge color="#FEF2F2" text="#DC2626">Vencida - {s.vencimento}</Badge>
                                  : <Badge color="#FEFCE8" text="#A16207">Pendente{s.vencimento ? " - " + s.vencimento : ""}</Badge>}
                            </div>
                            {s.descricao && <div style={{ ...S.muted, marginBottom: 4 }}>{s.descricao}</div>}
                            <div style={{ fontSize: 18, fontWeight: 600 }}>{fmt(pn(s.valor))}</div>
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                            {!s.pago && <button style={{ ...S.btnPrimary, fontSize: 12, padding: "6px 12px" }} onClick={() => baixarSaida(s.id)}>Baixar</button>}
                            <button style={{ ...S.btnSecondary, fontSize: 12, padding: "6px 10px" }} onClick={() => { setFormSaida({ ...s }); setEditSaidaId(s.id); setShowNovaSaida(true); }}>Editar</button>
                            {confirmDeleteSaida === s.id
                              ? <ConfirmButtons onConfirm={() => { removeSaida(s.id); setConfirmDeleteSaida(null); }} onCancel={() => setConfirmDeleteSaida(null)} confirmLabel="Excluir" />
                              : <button style={{ ...S.btnDanger, padding: "6px 10px", fontSize: 12 }} onClick={() => setConfirmDeleteSaida(s.id)}>Del</button>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
