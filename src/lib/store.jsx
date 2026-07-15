import { createContext, useContext, useState, useEffect } from "react";
import storage from "./storage";
import { MPS_DEFAULT, CUSTOS_FIXOS_DEFAULT, CATEGORIAS_SAIDA_DEFAULT } from "./constants";

const GapContext = createContext(null);
export const useGap = () => useContext(GapContext);

export function GapProvider({ children }) {
  const [loaded, setLoaded] = useState(false);
  const [salvando, setSalvando] = useState("");

  // ── Compartilhado / persistido ──
  const [produtos, setProdutos]       = useState([]);          // prefixo + insumos + custosProd
  const [custosFixos, setCustosFixos] = useState(CUSTOS_FIXOS_DEFAULT);
  const [imposto, setImposto]         = useState(6);
  const [mps, setMps]                 = useState(MPS_DEFAULT);
  const [saidasVar, setSaidasVar]     = useState([]);
  const [categorias, setCategorias]   = useState(CATEGORIAS_SAIDA_DEFAULT);
  const [fornecedores, setFornecedores] = useState([]);
  const [insumosCadastro, setInsumosCadastro] = useState([]);
  const [tarefas, setTarefas]         = useState([]);
  const [logAlt, setLogAlt]           = useState([]);
  const [analyticsRaw, setAnalyticsRaw] = useState(null);
  const [alertasAn, setAlertasAn]     = useState([]);
  const [analyticsShopee, setAnalyticsShopee] = useState({
    lojaHistorico: {},      // { "YYYY-MM-DD": { horas:[...], resumo:{...} } }
    anuncios: {},           // { itemId: { nome, importacoes: [{ dataImportacao, periodo, horas:[], resumo:{}, fontesTrafego:{} }] } }
    diagnostico: null,      // último diagnostico { dataImportacao, quedas:[], avaliacoes:[], devolucoes:[], envios:[], conversao:[] }
    composicao: null,       // última composição { data, categorias:[], faixas:[], tipoCompradores:[] }
  });
  const [metaDiaria, setMetaDiaria]   = useState(20);
  const [metaPrazo, setMetaPrazo]     = useState("");
  const [metaContexto, setMetaContexto] = useState("");
  const [ultimaAnalise, setUltimaAnalise] = useState("");
  const [fichaProduto, setFichaProduto] = useState({ nome:"",categoria:"",material:"",publico:"",cores:"",numeracao:"",diferenciais:"",extra:"" });
  const [historicoGerador, setHistoricoGerador] = useState([]);
  const [promptsFavoritos, setPromptsFavoritos] = useState([]);  // biblioteca de prompts aprovados (texto, leve)
  const [historicoAB, setHistoricoAB] = useState([]);

  // ── Sessão (NÃO persistido — reimporte a cada sessão) ──
  const [pedidos, setPedidos]       = useState([]);
  const [transacoes, setTransacoes] = useState([]);

  // ── Carrega ──
  useEffect(() => { (async () => {
    const j = async (k, set) => { try { const r = await storage.get(k); if (r?.value) set(JSON.parse(r.value)); } catch {} };
    await j("produtos", setProdutos);
    try { const r = await storage.get("config"); if (r?.value) { const d = JSON.parse(r.value); if (d.imposto !== undefined) setImposto(d.imposto); if (d.mps) setMps(d.mps); } } catch {}
    await j("custosFixos", setCustosFixos);
    await j("saidas", setSaidasVar);
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
    setLoaded(true);
  })(); }, []);

  // ── Salva ──
  useEffect(() => { if (!loaded) return; (async () => {
    try {
      setSalvando("saving");
      await storage.set("produtos", JSON.stringify(produtos));
      await storage.set("config", JSON.stringify({ imposto, mps }));
      await storage.set("custosFixos", JSON.stringify(custosFixos));
      await storage.set("saidas", JSON.stringify(saidasVar));
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
      setSalvando("ok"); setTimeout(() => setSalvando(""), 1400);
    } catch { setSalvando(""); }
  })(); }, [produtos, custosFixos, imposto, mps, saidasVar, categorias, fornecedores, insumosCadastro, tarefas, logAlt, analyticsRaw, alertasAn, analyticsShopee, metaDiaria, metaPrazo, metaContexto, ultimaAnalise, fichaProduto, historicoGerador, historicoAB, promptsFavoritos, loaded]);

  const value = {
    loaded, salvando,
    produtos, setProdutos,
    custosFixos, setCustosFixos,
    imposto, setImposto,
    mps, setMps,
    saidasVar, setSaidasVar,
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
    pedidos, setPedidos,
    transacoes, setTransacoes,
  };

  return <GapContext.Provider value={value}>{children}</GapContext.Provider>;
}
