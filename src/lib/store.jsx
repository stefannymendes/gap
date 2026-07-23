import { createContext, useContext, useState, useEffect, useRef } from "react";
import storage from "./storage";
import { useAuth } from "./auth";
import * as db from "./db";
import { uuid } from "./utils";
import { MPS_DEFAULT, CUSTOS_FIXOS_DEFAULT, CATEGORIAS_SAIDA_DEFAULT } from "./constants";

const GapContext = createContext(null);
export const useGap = () => useContext(GapContext);

export function GapProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id;

  const [loaded, setLoaded] = useState(false);
  const [salvando, setSalvando] = useState("");
  const okFlag = () => { setSalvando("ok"); setTimeout(() => setSalvando(""), 1400); };

  // ── Migrados para o Supabase (Etapa 3) ──
  const [produtos, setProdutos]       = useState([]);
  const [custosFixos, setCustosFixos] = useState(CUSTOS_FIXOS_DEFAULT);
  const [saidasVar, setSaidasVar]     = useState([]);
  const [pedidos, setPedidos]         = useState([]);
  const [fechamentos, setFechamentos] = useState([]);

  const [dbLoading, setDbLoading] = useState(true);
  const [dbErro, setDbErro]       = useState("");
  // Dados locais (localStorage) disponíveis para importar quando a tabela está vazia.
  const [produtosMigraveis, setProdutosMigraveis]       = useState([]);
  const [custosFixosMigraveis, setCustosFixosMigraveis] = useState([]);
  const [saidasMigraveis, setSaidasMigraveis]           = useState([]);

  // Refs com o valor mais recente (para rollback e para o debounce de custos fixos).
  // Atualizadas em efeito (não durante o render) — já estão corretas quando um
  // handler ou timer async as lê, pois isso acontece bem após o commit.
  const produtosRef = useRef([]);
  const custosFixosRef = useRef([]);
  const saidasVarRef = useRef([]);
  const pedidosRef = useRef([]);
  const cfTimers = useRef({});
  useEffect(() => { produtosRef.current = produtos; }, [produtos]);
  useEffect(() => { custosFixosRef.current = custosFixos; }, [custosFixos]);
  useEffect(() => { saidasVarRef.current = saidasVar; }, [saidasVar]);
  useEffect(() => { pedidosRef.current = pedidos; }, [pedidos]);

  // ── Compartilhado / persistido em localStorage (NÃO migrado) ──
  const [imposto, setImposto]         = useState(6);
  const [mps, setMps]                 = useState(MPS_DEFAULT);
  const [categorias, setCategorias]   = useState(CATEGORIAS_SAIDA_DEFAULT);
  const [fornecedores, setFornecedores] = useState([]);
  const [insumosCadastro, setInsumosCadastro] = useState([]);
  const [tarefas, setTarefas]         = useState([]);
  const [logAlt, setLogAlt]           = useState([]);
  const [analyticsRaw, setAnalyticsRaw] = useState(null);
  const [alertasAn, setAlertasAn]     = useState([]);
  const [analyticsShopee, setAnalyticsShopee] = useState({
    lojaHistorico: {},
    anuncios: {},
    diagnostico: null,
    composicao: null,
  });
  const [metaDiaria, setMetaDiaria]   = useState(20);
  const [metaPrazo, setMetaPrazo]     = useState("");
  const [metaContexto, setMetaContexto] = useState("");
  const [ultimaAnalise, setUltimaAnalise] = useState("");
  const [fichaProduto, setFichaProduto] = useState({ nome:"",categoria:"",material:"",publico:"",cores:"",numeracao:"",diferenciais:"",extra:"" });
  const [historicoGerador, setHistoricoGerador] = useState([]);
  const [promptsFavoritos, setPromptsFavoritos] = useState([]);
  const [historicoAB, setHistoricoAB] = useState([]);
  const [atendimentoConfig, setAtendimentoConfig] = useState({ loja:"", prazoEnvio:"", politicaTroca:"", tom:"cordial", assinatura:"", observacoes:"" });

  // ── Sessão (NÃO persistido — reimporte a cada sessão) ──
  const [transacoes, setTransacoes] = useState([]);

  // ── Carrega localStorage (slices NÃO migrados) ──
  useEffect(() => { (async () => {
    const j = async (k, set) => { try { const r = await storage.get(k); if (r?.value) set(JSON.parse(r.value)); } catch {} };
    try { const r = await storage.get("config"); if (r?.value) { const d = JSON.parse(r.value); if (d.imposto !== undefined) setImposto(d.imposto); if (d.mps) setMps(d.mps); } } catch {}
    await j("categorias", setCategorias);
    await j("fornecedores", setFornecedores);
    await j("insumosCadastro", setInsumosCadastro);
    await j("tarefas", setTarefas);
    await j("logalt", setLogAlt);
    try { const r = await storage.get("meta"); if (r?.value) { const d = JSON.parse(r.value); if (d.metaDiaria) setMetaDiaria(d.metaDiaria); if (d.metaPrazo) setMetaPrazo(d.metaPrazo); if (d.metaContexto) setMetaContexto(d.metaContexto); if (d.ultimaAnalise) setUltimaAnalise(d.ultimaAnalise); } } catch {}
    try { const r = await storage.get("analytics"); if (r?.value) { const d = JSON.parse(r.value); setAnalyticsRaw(d.raw || null); setAlertasAn(d.alertas || []); } } catch {}
    try { const r = await storage.get("analyticsShopee"); if (r?.value) setAnalyticsShopee(JSON.parse(r.value)); } catch {}
    await j("anuncios_ficha", setFichaProduto);
    await j("anuncios_historico", setHistoricoGerador);
    await j("anuncios_ab", setHistoricoAB);
    await j("prompts_favoritos", setPromptsFavoritos);
    await j("atendimento_config", setAtendimentoConfig);
    setLoaded(true);
  })(); }, []);

  // ── Salva localStorage (slices NÃO migrados) ──
  useEffect(() => { if (!loaded) return; (async () => {
    try {
      setSalvando("saving");
      await storage.set("config", JSON.stringify({ imposto, mps }));
      await storage.set("categorias", JSON.stringify(categorias));
      await storage.set("fornecedores", JSON.stringify(fornecedores));
      await storage.set("insumosCadastro", JSON.stringify(insumosCadastro));
      await storage.set("tarefas", JSON.stringify(tarefas));
      await storage.set("logalt", JSON.stringify(logAlt));
      await storage.set("meta", JSON.stringify({ metaDiaria, metaPrazo, metaContexto, ultimaAnalise }));
      if (analyticsRaw) await storage.set("analytics", JSON.stringify({ raw: analyticsRaw, alertas: alertasAn }));
      await storage.set("analyticsShopee", JSON.stringify(analyticsShopee));
      await storage.set("anuncios_ficha", JSON.stringify(fichaProduto));
      await storage.set("anuncios_historico", JSON.stringify(historicoGerador));
      await storage.set("anuncios_ab", JSON.stringify(historicoAB));
      await storage.set("prompts_favoritos", JSON.stringify(promptsFavoritos));
      await storage.set("atendimento_config", JSON.stringify(atendimentoConfig));
      setSalvando("ok"); setTimeout(() => setSalvando(""), 1400);
    } catch { setSalvando(""); }
  })(); }, [imposto, mps, categorias, fornecedores, insumosCadastro, tarefas, logAlt, analyticsRaw, alertasAn, analyticsShopee, metaDiaria, metaPrazo, metaContexto, ultimaAnalise, fichaProduto, historicoGerador, historicoAB, promptsFavoritos, atendimentoConfig, loaded]);

  // ── Carrega do Supabase (slices migrados) ──
  useEffect(() => {
    if (!userId) return;
    let ativo = true;
    (async () => {
      setDbLoading(true); setDbErro("");
      try {
        const [pr, cf, sv, pd, fc] = await Promise.all([
          db.fetchProdutos(), db.fetchCustosFixos(), db.fetchSaidas(), db.fetchPedidos(), db.fetchFechamentos(),
        ]);
        if (!ativo) return;
        const primeiroErro = pr.error || cf.error || sv.error || pd.error || fc.error;
        if (primeiroErro) throw primeiroErro;
        setProdutos(pr.data); setCustosFixos(cf.data); setSaidasVar(sv.data);
        setPedidos(pd.data); setFechamentos(fc.data);

        // Oferta de migração dos dados locais quando a tabela está vazia.
        const naoMigrado = async k => (await storage.get("migrated:" + k))?.value !== "1";
        const local = async k => { try { const r = await storage.get(k); return r?.value ? JSON.parse(r.value) : []; } catch { return []; } };
        if (pr.data.length === 0 && await naoMigrado("produtos"))    { const l = await local("produtos");    if (ativo && l.length) setProdutosMigraveis(l); }
        if (cf.data.length === 0 && await naoMigrado("custosFixos")) { const l = await local("custosFixos"); if (ativo && l.length) setCustosFixosMigraveis(l); }
        if (sv.data.length === 0 && await naoMigrado("saidas"))      { const l = await local("saidas");      if (ativo && l.length) setSaidasMigraveis(l); }
      } catch {
        if (ativo) setDbErro("Não foi possível carregar seus dados. Verifique sua conexão e recarregue a página.");
      }
      if (ativo) setDbLoading(false);
    })();
    return () => { ativo = false; };
  }, [userId]);

  // ── Produtos: CRUD no banco (atualização otimista + rollback) ──
  const addProduto = async (p) => {
    const item = { ...p, id: p.id || uuid() };
    setProdutos(prev => [...prev, item]);
    setSalvando("saving");
    const { error } = await db.insertProduto(userId, item);
    if (error) { setProdutos(prev => prev.filter(x => x.id !== item.id)); setDbErro("Falha ao salvar o produto. Tente novamente."); setSalvando(""); }
    else okFlag();
  };
  const updateProduto = async (id, dados) => {
    const snap = produtosRef.current;
    const novo = { ...dados, id };
    setProdutos(prev => prev.map(x => x.id === id ? novo : x));
    setSalvando("saving");
    const { error } = await db.updateProdutoDb(userId, novo);
    if (error) { setProdutos(snap); setDbErro("Falha ao atualizar o produto."); setSalvando(""); }
    else okFlag();
  };
  const removeProduto = async (id) => {
    const snap = produtosRef.current;
    setProdutos(prev => prev.filter(x => x.id !== id));
    setSalvando("saving");
    const { error } = await db.deleteProdutoDb(id);
    if (error) { setProdutos(snap); setDbErro("Falha ao excluir o produto."); setSalvando(""); }
    else okFlag();
  };
  const importarProdutosLocal = async () => {
    const loc = produtosMigraveis; if (!loc.length) return;
    setSalvando("saving");
    const list = loc.map(p => ({ ...p, id: uuid() }));
    const { error } = await db.bulkInsertProdutos(userId, list);
    if (error) { setDbErro("Falha ao importar os produtos locais."); setSalvando(""); return; }
    const pr = await db.fetchProdutos(); setProdutos(pr.data);
    await storage.set("migrated:produtos", "1"); setProdutosMigraveis([]); okFlag();
  };

  // ── Custos fixos: CRUD (update com debounce por causa da edição contínua) ──
  const addCustoFixo = async (c) => {
    const item = { ...c, id: c.id || uuid() };
    setCustosFixos(prev => [...prev, item]);
    setSalvando("saving");
    const { error } = await db.insertCustoFixo(userId, item);
    if (error) { setCustosFixos(prev => prev.filter(x => x.id !== item.id)); setDbErro("Falha ao salvar o custo fixo."); setSalvando(""); }
    else okFlag();
  };
  const updateCustoFixo = (id, patch) => {
    setCustosFixos(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x));
    clearTimeout(cfTimers.current[id]);
    cfTimers.current[id] = setTimeout(async () => {
      const row = custosFixosRef.current.find(x => x.id === id);
      if (!row) return;
      setSalvando("saving");
      const { error } = await db.updateCustoFixoDb(userId, row);
      if (error) { setDbErro("Falha ao salvar o custo fixo."); setSalvando(""); } else okFlag();
    }, 600);
  };
  const removeCustoFixo = async (id) => {
    const snap = custosFixosRef.current;
    setCustosFixos(prev => prev.filter(x => x.id !== id));
    setSalvando("saving");
    const { error } = await db.deleteCustoFixoDb(id);
    if (error) { setCustosFixos(snap); setDbErro("Falha ao excluir o custo fixo."); setSalvando(""); } else okFlag();
  };
  const importarCustosFixosLocal = async () => {
    const loc = custosFixosMigraveis; if (!loc.length) return;
    setSalvando("saving");
    const list = loc.map(c => ({ ...c, id: uuid() }));
    const { error } = await db.bulkInsertCustosFixos(userId, list);
    if (error) { setDbErro("Falha ao importar os custos fixos locais."); setSalvando(""); return; }
    const cf = await db.fetchCustosFixos(); setCustosFixos(cf.data);
    await storage.set("migrated:custosFixos", "1"); setCustosFixosMigraveis([]); okFlag();
  };

  // ── Saídas variáveis: CRUD ──
  const addSaida = async (s) => {
    const item = { ...s, id: s.id || uuid() };
    setSaidasVar(prev => [...prev, item]);
    setSalvando("saving");
    const { error } = await db.insertSaida(userId, item);
    if (error) { setSaidasVar(prev => prev.filter(x => x.id !== item.id)); setDbErro("Falha ao salvar a saída."); setSalvando(""); }
    else okFlag();
  };
  const updateSaida = async (id, patch) => {
    const snap = saidasVarRef.current;
    const cur = snap.find(x => x.id === id) || { id };
    const novo = { ...cur, ...patch };
    setSaidasVar(prev => prev.map(x => x.id === id ? novo : x));
    setSalvando("saving");
    const { error } = await db.updateSaidaDb(userId, novo);
    if (error) { setSaidasVar(snap); setDbErro("Falha ao atualizar a saída."); setSalvando(""); } else okFlag();
  };
  const removeSaida = async (id) => {
    const snap = saidasVarRef.current;
    setSaidasVar(prev => prev.filter(x => x.id !== id));
    setSalvando("saving");
    const { error } = await db.deleteSaidaDb(id);
    if (error) { setSaidasVar(snap); setDbErro("Falha ao excluir a saída."); setSalvando(""); } else okFlag();
  };
  const importarSaidasLocal = async () => {
    const loc = saidasMigraveis; if (!loc.length) return;
    setSalvando("saving");
    const list = loc.map(s => ({ ...s, id: uuid() }));
    const { error } = await db.bulkInsertSaidas(userId, list);
    if (error) { setDbErro("Falha ao importar as saídas locais."); setSalvando(""); return; }
    const sv = await db.fetchSaidas(); setSaidasVar(sv.data);
    await storage.set("migrated:saidas", "1"); setSaidasMigraveis([]); okFlag();
  };

  // ── Pedidos: importação acumulada no banco + limpar ──
  const importPedidos = async (lista) => {
    // Dedup do lote (mesmo id+sku aparece só uma vez) antes de mandar ao banco.
    const seen = new Set(); const batch = [];
    for (const p of lista) { const k = p.id + "|" + p.sku; if (!seen.has(k)) { seen.add(k); batch.push(p); } }
    setSalvando("saving");
    const { novos, existentes, error } = await db.upsertPedidos(userId, batch);
    if (error) { setSalvando(""); throw new Error("Falha ao salvar os pedidos no banco."); }
    const pd = await db.fetchPedidos(); setPedidos(pd.data);
    okFlag();
    return { novos, existentes };
  };
  const limparPedidos = async () => {
    const snap = pedidosRef.current;
    setPedidos([]);
    setSalvando("saving");
    const { error } = await db.deleteAllPedidos(userId);
    if (error) { setPedidos(snap); setDbErro("Falha ao limpar os pedidos."); setSalvando(""); } else okFlag();
  };

  // ── Fechamentos: salvar snapshot do mês (upsert por mês) ──
  const saveFechamento = async (mesReferencia, receitaTotal, dre) => {
    setSalvando("saving");
    const { error } = await db.saveFechamentoDb(userId, mesReferencia, receitaTotal, dre);
    if (error) { setDbErro("Falha ao salvar o fechamento."); setSalvando(""); return false; }
    const fc = await db.fetchFechamentos(); setFechamentos(fc.data);
    okFlag(); return true;
  };

  const value = {
    loaded, salvando,
    dbLoading, dbErro,
    // migrados (banco)
    produtos, addProduto, updateProduto, removeProduto, produtosMigraveis, importarProdutosLocal,
    custosFixos, addCustoFixo, updateCustoFixo, removeCustoFixo, custosFixosMigraveis, importarCustosFixosLocal,
    saidasVar, addSaida, updateSaida, removeSaida, saidasMigraveis, importarSaidasLocal,
    pedidos, importPedidos, limparPedidos,
    fechamentos, saveFechamento,
    // não migrados (localStorage)
    imposto, setImposto,
    mps, setMps,
    categorias, setCategorias,
    fornecedores, setFornecedores,
    insumosCadastro, setInsumosCadastro,
    tarefas, setTarefas,
    logAlt, setLogAlt,
    analyticsRaw, setAnalyticsRaw,
    alertasAn, setAlertasAn,
    analyticsShopee, setAnalyticsShopee,
    metaDiaria, setMetaDiaria, metaPrazo, setMetaPrazo, metaContexto, setMetaContexto, ultimaAnalise, setUltimaAnalise,
    fichaProduto, setFichaProduto,
    historicoGerador, setHistoricoGerador,
    historicoAB, setHistoricoAB,
    promptsFavoritos, setPromptsFavoritos,
    atendimentoConfig, setAtendimentoConfig,
    // sessão
    transacoes, setTransacoes,
  };

  return <GapContext.Provider value={value}>{children}</GapContext.Provider>;
}
