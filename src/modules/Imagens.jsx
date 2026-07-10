import { useState, useRef } from "react";
import { useGap } from "../lib/store";
import { Topbar, Card, CardTitle, EmptyState, ConfirmButtons, SubTabs, CopyBtn, NumInput } from "../lib/ui";
import { generateImage, apiFetch, traduzir } from "../lib/api";
import { comprimirImagem } from "../lib/utils";
import { REGRAS_SEQUENCIA } from "../skills/regrasSequencia";
import { ESTILO_VISUAL } from "../skills/estiloVisual";

// ═══════════════════════════════════════════════════════════
//  AGENTE DE IMAGENS — dois agentes em sequência:
//  Agente 1 (Planejador): decide a sequência ideal p/ o produto
//  Agente 2 (Prompts): escreve cada prompt no estilo da marca
//  Comportamento definido pelas skills em src/skills/.
//  Recursos: upload múltiplo de referência, referência por cor,
//  prompt bilíngue (EN gera / PT edita), dimensão 1:1, tela cheia.
// ═══════════════════════════════════════════════════════════

const TIPOS_LABEL = {
  tonal_monocolor:      "Tonal monocolor",
  on_feet_real:         "On-feet real",
  variacoes_floating:   "Variações — floating",
  variacoes_lined_up:   "Variações — enfileiradas",
  diptych_funcional:    "Diptych funcional",
  dual_angle_sola:      "Dual angle + sola",
  close_narrativo:      "Close narrativo",
  infografico_callouts: "Infográfico c/ callouts",
  prova_social:         "Prova social",
  selos_confianca:      "Selos de confiança",
  tabela_medidas:       "Tabela de medidas",
  kit_completo:         "Kit completo",
};

const DIFERENCIAIS = [
  { id: "material",      label: "Material / qualidade" },
  { id: "conforto",      label: "Conforto" },
  { id: "versatilidade", label: "Versatilidade" },
  { id: "cores",         label: "Variedade de cores" },
  { id: "preco",         label: "Preço / custo-benefício" },
];

const OCASIOES = [
  { id: "casual",   label: "Casual / dia a dia" },
  { id: "festa",    label: "Festa / social" },
  { id: "trabalho", label: "Trabalho" },
  { id: "infantil", label: "Infantil" },
];

// Papéis que uma imagem de referência pode ter (ajuda o modelo a saber pra que serve cada uma)
const PAPEIS_REF = [
  { id: "produto",   label: "Produto (estrutura)" },
  { id: "textura",   label: "Textura / material" },
  { id: "estilo",    label: "Estilo / composição" },
  { id: "detalhe",   label: "Detalhe (sola, fivela...)" },
];

const FICHA_PADRAO = {
  nome: "", categoria: "", material: "", publico: "", cores: "",
  numeracao: "", diferenciais: "", extra: "",
  preco: "", diferencialPrincipal: "conforto", ocasiao: "casual",
  ehKit: false, qtdPares: "2", comentarioCliente: "",
};

function extrairJSON(texto) {
  const limpo = String(texto).replace(/```json|```/gi, "").trim();
  const ini = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  if (ini === -1 || fim === -1) throw new Error("A IA não retornou um plano válido. Tente novamente.");
  return JSON.parse(limpo.slice(ini, fim + 1));
}

function listaCores(str) {
  return String(str || "").split(/[,;/]/).map(c => c.trim()).filter(Boolean);
}

// Descreve o produto para os agentes, incluindo os papéis das imagens de referência
function descreverProduto(f, refs = []) {
  const linhas = [];
  if (f.nome) linhas.push(`Nome: ${f.nome}`);
  if (f.categoria) linhas.push(`Categoria: ${f.categoria}`);
  if (f.material) linhas.push(`Material: ${f.material}`);
  if (f.publico) linhas.push(`Público-alvo: ${f.publico}`);
  const cores = listaCores(f.cores);
  if (cores.length) linhas.push(`Cores (${cores.length}): ${cores.join(", ")}`);
  if (f.numeracao) linhas.push(`Numeração: ${f.numeracao}`);
  if (f.preco) linhas.push(`Preço: R$ ${f.preco}`);
  linhas.push(`Vendido em kit: ${f.ehKit ? `sim, ${f.qtdPares || 2} pares` : "não"}`);
  const dif = DIFERENCIAIS.find(d => d.id === f.diferencialPrincipal);
  if (dif) linhas.push(`Diferencial principal: ${dif.label}`);
  const oca = OCASIOES.find(o => o.id === f.ocasiao);
  if (oca) linhas.push(`Ocasião de uso: ${oca.label}`);
  if (f.diferenciais) linhas.push(`Outros diferenciais: ${f.diferenciais}`);
  if (f.comentarioCliente) linhas.push(`Comentário real de cliente (para prova social): "${f.comentarioCliente}"`);
  if (f.extra) linhas.push(`Observações: ${f.extra}`);
  if (refs.length) {
    const papeis = refs.map(r => PAPEIS_REF.find(p => p.id === r.papel)?.label || r.papel);
    linhas.push(`Imagens de referência anexadas (${refs.length}), com papéis: ${papeis.join("; ")}. Use cada uma conforme seu papel.`);
  }
  return linhas.join("\n");
}

export default function Imagens({ onMenu }) {
  const { salvando } = useGap();
  const [aba, setAba] = useState("agente");

  return (
    <>
      <Topbar title="Imagens IA" salvando={salvando} onMenu={onMenu} />
      <div className="gap-content">
        <div className="gap-stack" style={{ maxWidth: 980 }}>
          <SubTabs
            tabs={[{ id: "agente", label: "🤖 Agente de sequência" }, { id: "manual", label: "Modo manual" }]}
            active={aba} onChange={setAba}
          />
          {aba === "agente" ? <AbaAgente /> : <AbaManual />}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════ ABA DO AGENTE ═══════════════════════

function AbaAgente() {
  const { fichaProduto, setFichaProduto } = useGap();
  const ficha = { ...FICHA_PADRAO, ...(fichaProduto || {}) };
  const updateFicha = (k, v) => setFichaProduto(prev => ({ ...FICHA_PADRAO, ...(prev || {}), [k]: v }));

  const [slots, setSlots] = useState([]);
  const [observacao, setObservacao] = useState("");
  const [variacao, setVariacao] = useState(null);
  const [planejando, setPlanejando] = useState(false);
  const [erroPlano, setErroPlano] = useState("");
  const [gerandoTudo, setGerandoTudo] = useState(false);
  const [refs, setRefs] = useState([]);            // [{ base64, preview, papel }]
  const [refsCor, setRefsCor] = useState({});      // { "preto": {base64, preview}, ... }
  const [confirmLimpar, setConfirmLimpar] = useState(false);
  const [zoom, setZoom] = useState(null);          // imagem em tela cheia
  const inputRefProduto = useRef(null);
  const inputRefCor = useRef({});

  const preencheu = ficha.nome && ficha.preco;
  const cores = listaCores(ficha.cores);

  const custoEstimado = () => {
    const nCores = variacao?.necessaria ? cores.length : 0;
    const total = slots.filter(s => s.tipo !== "tabela_medidas").length + nCores;
    return (total * 0.20).toFixed(2).replace(".", ",");
  };

  // imagens de referência do produto no formato do proxy
  const refsPayload = () => refs.map(r => ({ base64: r.base64, mimeType: "image/jpeg" }));

  // ── AGENTE 1: planejar ──
  const planejar = async () => {
    if (!preencheu) { setErroPlano("Preencha ao menos nome e preço do produto."); return; }
    setPlanejando(true); setErroPlano(""); setSlots([]); setVariacao(null); setObservacao("");
    try {
      const user = `Planeje a sequência de imagens para este produto:\n\n${descreverProduto(ficha, refs)}`;
      const resp = await apiFetch([{ role: "user", content: user }], 2000, REGRAS_SEQUENCIA);
      const plano = extrairJSON(resp);
      if (!Array.isArray(plano.sequencia) || plano.sequencia.length === 0) {
        throw new Error("O plano veio vazio. Tente novamente.");
      }
      setSlots(plano.sequencia.map((s, i) => ({
        posicao: i + 1,
        tipo: TIPOS_LABEL[s.tipo] ? s.tipo : "tonal_monocolor",
        job: s.job || "",
        porque: s.porque || "",
        promptEn: "", promptPt: "", imagem: null,
        loadingPrompt: false, loadingImg: false, loadingTrad: false, error: "",
      })));
      if (plano.variacao_individual?.necessaria) {
        setVariacao({
          necessaria: true,
          fundo: plano.variacao_individual.fundo || "branco",
          porque: plano.variacao_individual.porque || "",
          promptEn: "", promptPt: "", loadingPrompt: false,
          cores: cores.map(cor => ({ cor, imagem: null, loading: false, error: "" })),
        });
      }
      setObservacao(plano.observacao || "");
    } catch (e) {
      setErroPlano(e.message);
    }
    setPlanejando(false);
  };

  // ── AGENTE 2: gerar prompt (EN) + tradução (PT) ──
  const gerarPrompt = async (posicao) => {
    const slot = slots.find(s => s.posicao === posicao);
    if (!slot) return null;
    setSlots(prev => prev.map(s => s.posicao === posicao ? { ...s, loadingPrompt: true, error: "" } : s));
    try {
      const user = `Gere o prompt para este slot da sequência:\n\nTipo: ${slot.tipo}\nPosição: ${slot.posicao}\nJob desta imagem: ${slot.job}\n\nProduto:\n${descreverProduto(ficha, refs)}`;
      const promptEn = (await apiFetch([{ role: "user", content: user }], 900, ESTILO_VISUAL)).trim();
      const promptPt = await traduzir(promptEn, "en2pt");
      setSlots(prev => prev.map(s => s.posicao === posicao ? { ...s, promptEn, promptPt, loadingPrompt: false } : s));
      return promptEn;
    } catch (e) {
      setSlots(prev => prev.map(s => s.posicao === posicao ? { ...s, loadingPrompt: false, error: e.message } : s));
      return null;
    }
  };

  // ── Editar em PT → traduz de volta pra EN (é o EN que gera) ──
  const salvarPromptPt = async (posicao, novoPt) => {
    setSlots(prev => prev.map(s => s.posicao === posicao ? { ...s, promptPt: novoPt, loadingTrad: true } : s));
    try {
      const novoEn = await traduzir(novoPt, "pt2en");
      setSlots(prev => prev.map(s => s.posicao === posicao ? { ...s, promptEn: novoEn, loadingTrad: false } : s));
    } catch (e) {
      setSlots(prev => prev.map(s => s.posicao === posicao ? { ...s, loadingTrad: false, error: "Erro ao traduzir: " + e.message } : s));
    }
  };

  // ── FASE 3: gerar imagem (usa sempre o EN) ──
  const gerarImagem = async (posicao, promptDireto) => {
    const slot = slots.find(s => s.posicao === posicao);
    if (!slot) return;
    const prompt = promptDireto || slot.promptEn;
    if (!prompt) return;
    setSlots(prev => prev.map(s => s.posicao === posicao ? { ...s, loadingImg: true, error: "" } : s));
    try {
      const img = await generateImage(prompt, refsPayload(), "1:1");
      setSlots(prev => prev.map(s => s.posicao === posicao ? { ...s, imagem: img, loadingImg: false } : s));
    } catch (e) {
      setSlots(prev => prev.map(s => s.posicao === posicao ? { ...s, loadingImg: false, error: e.message } : s));
    }
  };

  const gerarTudo = async () => {
    setGerandoTudo(true);
    for (const slot of slots) {
      if (slot.tipo === "tabela_medidas") continue;
      let promptEn = slot.promptEn;
      if (!promptEn) promptEn = await gerarPrompt(slot.posicao);
      if (promptEn && !slot.imagem) {
        await gerarImagem(slot.posicao, promptEn);
        await new Promise(r => setTimeout(r, 700));
      }
    }
    setGerandoTudo(false);
  };

  // ── Edição da sequência ──
  const removerSlot = (posicao) =>
    setSlots(prev => prev.filter(s => s.posicao !== posicao).map((s, i) => ({ ...s, posicao: i + 1 })));
  const moverSlot = (posicao, dir) => {
    setSlots(prev => {
      const i = prev.findIndex(s => s.posicao === posicao);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const copia = [...prev];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia.map((s, k) => ({ ...s, posicao: k + 1 }));
    });
  };
  // Trocar tipo LIMPA prompt e imagem (corrige o bug do dropdown que mantinha o prompt antigo)
  const trocarTipo = (posicao, tipo) =>
    setSlots(prev => prev.map(s => s.posicao === posicao
      ? { ...s, tipo, promptEn: "", promptPt: "", imagem: null, error: "" } : s));

  // ── Variação individual ──
  const gerarPromptVariacao = async () => {
    setVariacao(prev => ({ ...prev, loadingPrompt: true }));
    try {
      const user = `Gere o prompt-base para o tipo variacao_individual (foto padrão por cor):\n\nFundo definido: ${variacao.fundo}\n\nProduto:\n${descreverProduto(ficha, refs)}\n\nLembre: use [COLOR] como variável de cor e descreva a pose exata de forma reproduzível.`;
      const promptEn = (await apiFetch([{ role: "user", content: user }], 900, ESTILO_VISUAL)).trim();
      const promptPt = await traduzir(promptEn, "en2pt");
      setVariacao(prev => ({ ...prev, promptEn, promptPt, loadingPrompt: false }));
    } catch (e) {
      setVariacao(prev => ({ ...prev, loadingPrompt: false }));
      alert("Erro ao gerar prompt-base: " + e.message);
    }
  };
  const gerarImagemCor = async (cor) => {
    if (!variacao?.promptEn) return;
    setVariacao(prev => ({ ...prev, cores: prev.cores.map(c => c.cor === cor ? { ...c, loading: true, error: "" } : c) }));
    try {
      const prompt = variacao.promptEn.replaceAll("[COLOR]", cor);
      // Se há referência específica dessa cor, usa ela; senão, usa as refs gerais do produto
      const refCor = refsCor[cor];
      const imagens = refCor ? [{ base64: refCor.base64, mimeType: "image/jpeg" }] : refsPayload();
      const img = await generateImage(prompt, imagens, "1:1");
      setVariacao(prev => ({ ...prev, cores: prev.cores.map(c => c.cor === cor ? { ...c, imagem: img, loading: false } : c) }));
    } catch (e) {
      setVariacao(prev => ({ ...prev, cores: prev.cores.map(c => c.cor === cor ? { ...c, loading: false, error: e.message } : c) }));
    }
  };

  // ── Uploads ──
  const addRefProduto = async (files) => {
    for (const file of files) {
      const r = await comprimirImagem(file, 900, 0.85);
      setRefs(prev => [...prev, { base64: r.base64, preview: r.preview, papel: "produto" }]);
    }
  };
  const setPapelRef = (idx, papel) =>
    setRefs(prev => prev.map((r, i) => i === idx ? { ...r, papel } : r));
  const removerRef = (idx) => setRefs(prev => prev.filter((_, i) => i !== idx));

  const addRefCor = async (cor, file) => {
    if (!file) return;
    const r = await comprimirImagem(file, 900, 0.85);
    setRefsCor(prev => ({ ...prev, [cor]: { base64: r.base64, preview: r.preview } }));
  };
  const removerRefCor = (cor) =>
    setRefsCor(prev => { const c = { ...prev }; delete c[cor]; return c; });

  const download = (imagem, sufixo) => {
    if (!imagem) return;
    const a = document.createElement("a");
    a.href = `data:${imagem.mimeType};base64,${imagem.base64}`;
    const nome = (ficha.nome || "produto").replace(/[^a-zA-Z0-9]/g, "_");
    a.download = `${nome}_${sufixo}.${imagem.mimeType.split("/")[1] || "png"}`;
    a.click();
  };

  const limparTudo = () => {
    setSlots([]); setVariacao(null); setObservacao("");
    setConfirmLimpar(false); setErroPlano("");
  };

  return (
    <div className="gap-stack">
      {/* Lightbox de tela cheia */}
      {zoom && (
        <div onClick={() => setZoom(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
          <img src={zoom} alt="ampliada" style={{ maxWidth: "95%", maxHeight: "95%", objectFit: "contain", borderRadius: 8 }} />
          <button onClick={() => setZoom(null)}
            style={{ position: "absolute", top: 20, right: 24, background: "#fff", border: "none", borderRadius: 20, width: 40, height: 40, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
      )}

      <div className="gap-alert gap-alert-info">
        <div className="gap-alert-dot dot-info" />
        <div>
          <div className="gap-alert-title">Agente de sequência de imagens</div>
          <div className="gap-alert-desc">
            O agente analisa o produto e propõe a sequência ideal de imagens. Anexe fotos reais de referência para o agente gerar imagens do SEU produto (~R$ 0,20 por imagem).
          </div>
        </div>
      </div>

      {/* ─── Ficha do produto ─── */}
      <Card>
        <CardTitle>Ficha do produto</CardTitle>
        <div className="gap-grid-2">
          <div><label className="gap-label">Nome *</label><input className="gap-input" value={ficha.nome} onChange={e => updateFicha("nome", e.target.value)} placeholder="Kit 2 Rasteirinhas Comfy" /></div>
          <div><label className="gap-label">Categoria</label><input className="gap-input" value={ficha.categoria} onChange={e => updateFicha("categoria", e.target.value)} placeholder="Rasteirinha / Sandália / Babuche" /></div>
          <div><label className="gap-label">Preço de venda *</label><NumInput value={ficha.preco} onChange={v => updateFicha("preco", v)} /></div>
          <div><label className="gap-label">Material</label><input className="gap-input" value={ficha.material} onChange={e => updateFicha("material", e.target.value)} placeholder="PVC glitter / sintético" /></div>
          <div><label className="gap-label">Cores (separadas por vírgula)</label><input className="gap-input" value={ficha.cores} onChange={e => updateFicha("cores", e.target.value)} placeholder="Preto, nude, rosa, transparente" /></div>
          <div><label className="gap-label">Público-alvo</label><input className="gap-input" value={ficha.publico} onChange={e => updateFicha("publico", e.target.value)} placeholder="Meninas 2-8 anos" /></div>
          <div>
            <label className="gap-label">Diferencial principal *</label>
            <select className="gap-input" value={ficha.diferencialPrincipal} onChange={e => updateFicha("diferencialPrincipal", e.target.value)}>
              {DIFERENCIAIS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="gap-label">Ocasião de uso *</label>
            <select className="gap-input" value={ficha.ocasiao} onChange={e => updateFicha("ocasiao", e.target.value)}>
              {OCASIOES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="gap-label">Vendido em kit?</label>
            <div className="gap-row" style={{ alignItems: "center", gap: 10 }}>
              <button className={`gap-btn-${ficha.ehKit ? "primary" : "secondary"}`} style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => updateFicha("ehKit", !ficha.ehKit)}>
                {ficha.ehKit ? "Sim, é kit" : "Não é kit"}
              </button>
              {ficha.ehKit && (
                <input className="gap-input" style={{ width: 90 }} value={ficha.qtdPares} onChange={e => updateFicha("qtdPares", e.target.value)} placeholder="2 pares" />
              )}
            </div>
          </div>
          <div><label className="gap-label">Outros diferenciais</label><input className="gap-input" value={ficha.diferenciais} onChange={e => updateFicha("diferenciais", e.target.value)} placeholder="Antiderrapante, alça regulável" /></div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label className="gap-label">Comentário real de cliente (opcional — usado na prova social)</label>
          <input className="gap-input" value={ficha.comentarioCliente} onChange={e => updateFicha("comentarioCliente", e.target.value)} placeholder='"Super confortável, minha filha amou!"' />
        </div>
      </Card>

      {/* ─── Fotos de referência do produto (múltiplas, com papel) ─── */}
      <Card>
        <CardTitle>Fotos de referência do produto</CardTitle>
        <p className="gap-muted" style={{ marginBottom: 12 }}>
          Quanto mais ângulos você anexar, mais fiel a IA fica ao seu produto real. Marque o papel de cada foto para o agente saber pra que usá-la.
        </p>
        <div className="gap-grid-3" style={{ gap: 10 }}>
          {refs.map((r, i) => (
            <div key={i} style={{ border: "1.5px solid #EBEBEB", borderRadius: 10, padding: 8 }}>
              <img src={r.preview} alt={`ref ${i + 1}`} onClick={() => setZoom(r.preview)}
                style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, cursor: "zoom-in", marginBottom: 6 }} />
              <select value={r.papel} onChange={e => setPapelRef(i, e.target.value)}
                style={{ width: "100%", fontSize: 11.5, border: "1px solid #EBEBEB", borderRadius: 6, padding: "4px 6px", marginBottom: 4 }}>
                {PAPEIS_REF.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <button className="gap-btn-ghost" style={{ fontSize: 11, color: "#DC2626", width: "100%" }} onClick={() => removerRef(i)}>remover</button>
            </div>
          ))}
          <button onClick={() => inputRefProduto.current?.click()}
            style={{ border: "1.5px dashed #CBD5E1", borderRadius: 10, background: "#FAFAF8", minHeight: 140, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "#64748B" }}>
            <span style={{ fontSize: 26 }}>+</span>
            <span style={{ fontSize: 12 }}>Adicionar foto(s)</span>
          </button>
        </div>
        <input ref={inputRefProduto} type="file" accept="image/*" multiple style={{ display: "none" }}
          onChange={e => { addRefProduto([...e.target.files]); e.target.value = ""; }} />
      </Card>

      {/* ─── Ação principal ─── */}
      <Card>
        <div className="gap-row-between" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="gap-muted" style={{ fontSize: 12.5, flex: 1, minWidth: 200 }}>
            {refs.length > 0 ? `${refs.length} foto(s) de referência anexada(s).` : "Sem referência: a IA cria um produto aproximado."}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            <button className="gap-btn-primary" disabled={planejando || !preencheu} onClick={planejar}>
              {planejando ? "Planejando..." : slots.length > 0 ? "🤖 Replanejar sequência" : "🤖 Planejar sequência"}
            </button>
            {!preencheu && <span className="gap-muted" style={{ fontSize: 11.5, color: "#B45309" }}>Preencha nome e preço para planejar</span>}
          </div>
        </div>
        {erroPlano && <p style={{ color: "#DC2626", fontSize: 12.5, marginTop: 8 }}>❌ {erroPlano}</p>}
      </Card>

      {slots.length === 0 && !planejando && (
        <EmptyState icon="🤖" title="O agente está pronto"
          desc="Preencha a ficha, anexe fotos de referência e clique em Planejar sequência." />
      )}

      {/* ─── Sequência ─── */}
      {slots.length > 0 && (
        <>
          <Card>
            <div className="gap-row-between" style={{ flexWrap: "wrap", gap: 8 }}>
              <div>
                <CardTitle>Sequência proposta — {slots.length} imagens</CardTitle>
                {observacao && <p className="gap-muted" style={{ fontSize: 12.5 }}>💡 {observacao}</p>}
              </div>
              <div className="gap-row" style={{ gap: 6, flexWrap: "wrap" }}>
                <button className="gap-btn-primary" disabled={gerandoTudo} onClick={gerarTudo}>
                  {gerandoTudo ? "Gerando tudo..." : `⚡ Gerar tudo (~R$ ${custoEstimado()})`}
                </button>
                {confirmLimpar
                  ? <ConfirmButtons onConfirm={limparTudo} onCancel={() => setConfirmLimpar(false)} confirmLabel="Limpar" />
                  : <button className="gap-btn-ghost" style={{ fontSize: 12 }} onClick={() => setConfirmLimpar(true)}>Limpar tudo</button>}
              </div>
            </div>
          </Card>

          <div className="gap-grid-2" style={{ gap: 12 }}>
            {slots.map(slot => (
              <SlotAgente key={`${slot.posicao}-${slot.tipo}`} slot={slot} total={slots.length}
                onGerarPrompt={() => gerarPrompt(slot.posicao)}
                onGerarImagem={() => gerarImagem(slot.posicao)}
                onSalvarPt={(v) => salvarPromptPt(slot.posicao, v)}
                onTrocarTipo={(t) => trocarTipo(slot.posicao, t)}
                onRemover={() => removerSlot(slot.posicao)}
                onMover={(dir) => moverSlot(slot.posicao, dir)}
                onDownload={() => download(slot.imagem, `${slot.posicao}_${slot.tipo}`)}
                onZoom={(src) => setZoom(src)} />
            ))}
          </div>
        </>
      )}

      {/* ─── Variação individual por cor (com referência por cor) ─── */}
      {variacao?.necessaria && (
        <Card>
          <CardTitle>Foto padrão por cor — galeria de variações</CardTitle>
          <p className="gap-muted" style={{ marginBottom: 10 }}>
            Fundo sugerido: <strong>{variacao.fundo}</strong>. {variacao.porque}
            {" "}Anexe uma foto real de cada cor para a IA acertar o tom — sem isso, ela pode inventar a cor.
          </p>

          {!variacao.promptEn ? (
            <button className="gap-btn-primary" disabled={variacao.loadingPrompt} onClick={gerarPromptVariacao}>
              {variacao.loadingPrompt ? "Escrevendo prompt-base..." : "✍️ Gerar prompt-base"}
            </button>
          ) : (
            <div className="gap-stack" style={{ gap: 10 }}>
              <PromptBilingue promptEn={variacao.promptEn} promptPt={variacao.promptPt} readOnly />
              <div className="gap-grid-2" style={{ gap: 10 }}>
                {variacao.cores.map(c => (
                  <div key={c.cor} style={{ border: "1.5px solid #EBEBEB", borderRadius: 10, padding: 10 }}>
                    <div className="gap-row-between" style={{ marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, textTransform: "capitalize" }}>{c.cor}</span>
                      <button className="gap-btn-primary" style={{ fontSize: 11, padding: "5px 10px" }} disabled={c.loading} onClick={() => gerarImagemCor(c.cor)}>
                        {c.loading ? "gerando..." : c.imagem ? "regerar" : "gerar"}
                      </button>
                    </div>
                    {/* referência da cor */}
                    <div className="gap-row" style={{ gap: 6, marginBottom: 8, alignItems: "center" }}>
                      {refsCor[c.cor] ? (
                        <>
                          <img src={refsCor[c.cor].preview} alt={c.cor} onClick={() => setZoom(refsCor[c.cor].preview)}
                            style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", cursor: "zoom-in" }} />
                          <button className="gap-btn-ghost" style={{ fontSize: 10.5 }} onClick={() => removerRefCor(c.cor)}>trocar ref</button>
                        </>
                      ) : (
                        <>
                          <button className="gap-btn-secondary" style={{ fontSize: 10.5, padding: "4px 8px" }}
                            onClick={() => inputRefCor.current[c.cor]?.click()}>+ ref desta cor</button>
                          <input ref={el => inputRefCor.current[c.cor] = el} type="file" accept="image/*" style={{ display: "none" }}
                            onChange={e => { addRefCor(c.cor, e.target.files?.[0]); e.target.value = ""; }} />
                        </>
                      )}
                    </div>
                    <div onClick={() => c.imagem && setZoom(`data:${c.imagem.mimeType};base64,${c.imagem.base64}`)}
                      style={{ aspectRatio: "1", background: "#FAFAF8", border: "1.5px dashed #E5E7EB", borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", cursor: c.imagem ? "zoom-in" : "default" }}>
                      {c.loading ? <span className="gap-muted">🎨 gerando...</span>
                        : c.error ? <span style={{ color: "#DC2626", fontSize: 11.5, padding: 8, textAlign: "center" }}>❌ {c.error}</span>
                        : c.imagem ? <img src={`data:${c.imagem.mimeType};base64,${c.imagem.base64}`} alt={c.cor} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <span style={{ color: "#CBD5E1", fontSize: 12 }}>aguardando</span>}
                    </div>
                    {c.imagem && (
                      <button className="gap-btn-secondary" style={{ fontSize: 11, padding: "5px 10px", marginTop: 8 }} onClick={() => download(c.imagem, `variacao_${c.cor.replace(/\s/g, "_")}`)}>baixar</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ─── Componente reutilizável: prompt bilíngue (EN só leitura / PT editável) ───
function PromptBilingue({ promptEn, promptPt, onSalvarPt, readOnly = false, loadingTrad = false }) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState("");

  return (
    <div style={{ border: "1px solid #EBEBEB", borderRadius: 8, overflow: "hidden" }}>
      {/* EN — só leitura */}
      <div style={{ padding: "8px 10px", background: "#F5F5F3", borderBottom: "1px solid #EBEBEB" }}>
        <div className="gap-row-between" style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5 }}>
            🇬🇧 Prompt (gera a imagem) {loadingTrad && "· traduzindo..."}
          </span>
          <CopyBtn text={promptEn} label="copiar" />
        </div>
        <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{promptEn}</div>
      </div>
      {/* PT — editável */}
      <div style={{ padding: "8px 10px" }}>
        <div className="gap-row-between" style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5 }}>🇧🇷 Tradução (edite aqui)</span>
          {!readOnly && !editando && (
            <button className="gap-btn-ghost" style={{ fontSize: 11 }} onClick={() => { setRascunho(promptPt); setEditando(true); }}>editar</button>
          )}
        </div>
        {editando ? (
          <div className="gap-stack" style={{ gap: 6 }}>
            <textarea className="gap-input" rows={5} value={rascunho} onChange={e => setRascunho(e.target.value)} style={{ fontSize: 11.5, resize: "vertical" }} />
            <div className="gap-row">
              <button className="gap-btn-primary" style={{ fontSize: 11, padding: "5px 10px" }}
                onClick={() => { onSalvarPt?.(rascunho); setEditando(false); }}>Salvar e traduzir</button>
              <button className="gap-btn-secondary" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => setEditando(false)}>Cancelar</button>
            </div>
            <span className="gap-muted" style={{ fontSize: 10.5 }}>Ao salvar, o texto vira inglês automaticamente e é ele que gera a imagem.</span>
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: "#1E293B", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{promptPt}</div>
        )}
      </div>
    </div>
  );
}

// ─── Card de um slot da sequência ───
function SlotAgente({ slot, total, onGerarPrompt, onGerarImagem, onSalvarPt, onTrocarTipo, onRemover, onMover, onDownload, onZoom }) {
  const ehTemplate = slot.tipo === "tabela_medidas";
  const imgSrc = slot.imagem ? `data:${slot.imagem.mimeType};base64,${slot.imagem.base64}` : null;

  return (
    <Card style={{ padding: 12 }}>
      <div className="gap-row-between" style={{ marginBottom: 6 }}>
        <div className="gap-row" style={{ alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, background: "#0D0D0F", color: "#fff", borderRadius: 20, padding: "2px 9px" }}>#{slot.posicao}</span>
          <select value={slot.tipo} onChange={e => onTrocarTipo(e.target.value)}
            style={{ fontSize: 12, fontWeight: 500, border: "1px solid #EBEBEB", borderRadius: 6, padding: "3px 6px", background: "#fff", maxWidth: 170 }}>
            {Object.entries(TIPOS_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
        <div className="gap-row" style={{ gap: 2 }}>
          <button className="gap-btn-ghost" style={{ fontSize: 12, padding: "2px 7px" }} disabled={slot.posicao === 1} onClick={() => onMover(-1)}>↑</button>
          <button className="gap-btn-ghost" style={{ fontSize: 12, padding: "2px 7px" }} disabled={slot.posicao === total} onClick={() => onMover(1)}>↓</button>
          <button className="gap-btn-ghost" style={{ fontSize: 12, padding: "2px 7px", color: "#DC2626" }} onClick={onRemover}>✕</button>
        </div>
      </div>

      <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
        <div><strong>Job:</strong> {slot.job}</div>
        <div className="gap-muted" style={{ marginTop: 2 }}><strong>Por quê:</strong> {slot.porque}</div>
      </div>

      {/* Imagem */}
      <div onClick={() => imgSrc && onZoom(imgSrc)}
        style={{ aspectRatio: "1", background: "#FAFAF8", border: "1.5px dashed #E5E7EB", borderRadius: 10, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8, cursor: imgSrc ? "zoom-in" : "default", position: "relative" }}>
        {slot.loadingImg ? (
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 24, marginBottom: 6 }}>🎨</div><div className="gap-muted">gerando imagem...</div></div>
        ) : slot.error ? (
          <div style={{ textAlign: "center", padding: 14, color: "#DC2626", fontSize: 12 }}>❌ {slot.error}</div>
        ) : imgSrc ? (
          <>
            <img src={imgSrc} alt={TIPOS_LABEL[slot.tipo]} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <span style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 10, padding: "2px 7px", borderRadius: 10 }}>⛶ ampliar</span>
          </>
        ) : ehTemplate ? (
          <div style={{ textAlign: "center", padding: 14, fontSize: 12 }} className="gap-muted">📋 Slot de template — use sua tabela de medidas padrão</div>
        ) : (
          <div style={{ textAlign: "center", color: "#CBD5E1" }}><div style={{ fontSize: 22 }}>+</div><div className="gap-muted">aguardando</div></div>
        )}
      </div>

      {/* Prompt bilíngue */}
      {!ehTemplate && (
        slot.loadingPrompt ? (
          <div className="gap-muted" style={{ fontSize: 11.5, marginBottom: 8 }}>✍️ escrevendo prompt no estilo da marca...</div>
        ) : slot.promptEn ? (
          <details style={{ marginBottom: 8 }}>
            <summary className="gap-muted" style={{ cursor: "pointer", fontSize: 11.5 }}>ver / editar prompt (PT/EN)</summary>
            <div style={{ marginTop: 6 }}>
              <PromptBilingue promptEn={slot.promptEn} promptPt={slot.promptPt} onSalvarPt={onSalvarPt} loadingTrad={slot.loadingTrad} />
              <button className="gap-btn-ghost" style={{ fontSize: 11, marginTop: 4 }} onClick={onGerarPrompt}>regerar prompt do zero</button>
            </div>
          </details>
        ) : null
      )}

      {/* Ações */}
      {!ehTemplate && (
        <div className="gap-row" style={{ gap: 6, flexWrap: "wrap" }}>
          {!slot.promptEn && (
            <button className="gap-btn-secondary" style={{ fontSize: 11.5, padding: "6px 10px" }} disabled={slot.loadingPrompt} onClick={onGerarPrompt}>
              ✍️ gerar prompt
            </button>
          )}
          <button className="gap-btn-primary" style={{ fontSize: 11.5, padding: "6px 10px" }} disabled={slot.loadingImg || slot.loadingPrompt || !slot.promptEn} onClick={onGerarImagem}>
            {slot.imagem ? "🎨 regerar imagem" : "🎨 gerar imagem"}
          </button>
          {slot.imagem && (
            <button className="gap-btn-secondary" style={{ fontSize: 11.5, padding: "6px 10px" }} onClick={onDownload}>baixar</button>
          )}
        </div>
      )}
    </Card>
  );
}

// ═══════════════════════ ABA MANUAL (fluxo original preservado) ═══════════════════════

// ─── Estruturas pré-definidas de sequência ─────────
const SEQUENCIAS = {
  "4": [
    { id: "principal",  label: "Foto principal",      hint: "Fundo branco puro, produto centralizado, todo visível" },
    { id: "angulo",     label: "Ângulo lateral",      hint: "Vista lateral em 3/4 mostrando forma e altura" },
    { id: "detalhe",    label: "Detalhe / textura",   hint: "Close no material, costura ou detalhe distintivo" },
    { id: "uso",        label: "No pé / em uso",      hint: "Sendo usado, mostrando caimento e estilo" },
  ],
  "6": [
    { id: "principal",  label: "Foto principal",      hint: "Fundo branco puro, produto centralizado" },
    { id: "angulo",     label: "Ângulo lateral",      hint: "Vista lateral em 3/4" },
    { id: "traseira",   label: "Traseira",            hint: "Vista de trás, ideal para calçados fechados" },
    { id: "sola",       label: "Sola / solado",       hint: "Solado visível, mostrando tração e material" },
    { id: "detalhe",    label: "Detalhe / textura",   hint: "Close no material ou costura" },
    { id: "uso",        label: "No pé / em uso",      hint: "Sendo usado" },
  ],
  "8": [
    { id: "principal",  label: "Foto principal",      hint: "Fundo branco puro" },
    { id: "angulo",     label: "Ângulo lateral",      hint: "Vista lateral em 3/4" },
    { id: "traseira",   label: "Traseira",            hint: "Vista de trás" },
    { id: "topo",       label: "Vista superior",      hint: "Foto de cima, mostrando abertura e palmilha" },
    { id: "sola",       label: "Sola / solado",       hint: "Solado visível" },
    { id: "detalhe",    label: "Detalhe do material", hint: "Close no material" },
    { id: "uso",        label: "No pé / em uso",      hint: "Sendo usado em cenário casual" },
    { id: "infografico",label: "Infográfico",         hint: "Card com especificações: numeração, cores, materiais" },
  ],
};


// Estilos visuais que o usuário pode aplicar sobre TODA a sequência
const ESTILOS = [
  { id: "ecommerce", label: "E-commerce clean", desc: "Fundo branco, iluminação uniforme, sem sombras — padrão marketplace" },
  { id: "premium",   label: "Premium", desc: "Iluminação suave lateral, fundo cinza claro, aspecto sofisticado" },
  { id: "lifestyle", label: "Lifestyle", desc: "Ambiente real, luz natural, casual e humano" },
  { id: "vibrante",  label: "Vibrante", desc: "Fundo colorido, alto contraste, ideal para redes sociais" },
];

// Monta prompt para 1 slot, considerando ficha + estilo
function montarPromptSlot(slot, ficha, estilo) {
  const partes = [];
  const desc = [];
  if (ficha.nome) desc.push(ficha.nome);
  if (ficha.categoria) desc.push(`categoria ${ficha.categoria}`);
  if (ficha.material) desc.push(`material ${ficha.material}`);
  if (ficha.cores) desc.push(`cor ${ficha.cores}`);
  if (ficha.publico) desc.push(`para ${ficha.publico}`);
  if (ficha.diferenciais) desc.push(ficha.diferenciais);

  partes.push(`Foto profissional de produto para e-commerce, alta resolução, formato quadrado.`);
  partes.push(`Produto: ${desc.join(", ") || "calçado"}.`);
  partes.push(`Tomada: ${slot.hint}.`);

  if (estilo === "ecommerce") partes.push("Fundo branco puro (#FFFFFF), iluminação de estúdio uniforme, sem sombras duras, produto nítido e centralizado, aspecto profissional de marketplace.");
  else if (estilo === "premium") partes.push("Fundo cinza claro (#F5F5F5), iluminação lateral suave criando profundidade, aspecto de fotografia comercial premium, foco nítido no produto.");
  else if (estilo === "lifestyle") partes.push("Ambiente real (casa, rua ou natureza conforme a categoria), luz natural, casual, humano, mas com o produto em destaque.");
  else if (estilo === "vibrante") partes.push("Fundo colorido vibrante contrastante com o produto, iluminação alta, aspecto moderno e chamativo para redes sociais.");

  partes.push("Sem texto, sem logos, sem marca d'água. Apenas o produto e o cenário descrito.");
  return partes.join(" ");
}


function AbaManual() {
  const { fichaProduto, setFichaProduto } = useGap();
  const [qtdSlots, setQtdSlots] = useState("6");
  const [estilo, setEstilo] = useState("ecommerce");
  const [slots, setSlots] = useState([]);        // [{ id, label, hint, prompt, imagem, loading, error }]
  const [gerandoTodos, setGerandoTodos] = useState(false);
  const [sugestaoLoading, setSugestaoLoading] = useState(false);
  const [sugestao, setSugestao] = useState("");
  const [imgBase, setImgBase] = useState(null);   // opcional: foto real do produto p/ variação
  const [confirmLimpar, setConfirmLimpar] = useState(false);
  const inputBaseRef = useRef(null);

  const ficha = { ...FICHA_PADRAO, ...(fichaProduto || {}) };
  const updateFicha = (k, v) => setFichaProduto(prev => ({ ...FICHA_PADRAO, ...(prev || {}), [k]: v }));

  const preencheuFicha = ficha.nome || ficha.categoria || ficha.material;

  // Prepara os slots (mantém o que já foi gerado)
  const prepararSlots = () => {
    const base = SEQUENCIAS[qtdSlots] || SEQUENCIAS["6"];
    setSlots(base.map(s => ({
      ...s,
      prompt: montarPromptSlot(s, ficha, estilo),
      imagem: null,
      loading: false,
      error: "",
    })));
  };

  // Regera o prompt de um slot mantendo a imagem existente
  const regerarPrompt = (id) => {
    setSlots(prev => prev.map(s => s.id === id ? { ...s, prompt: montarPromptSlot(s, ficha, estilo) } : s));
  };

  const editarPrompt = (id, novo) => {
    setSlots(prev => prev.map(s => s.id === id ? { ...s, prompt: novo } : s));
  };

  const gerarUm = async (id) => {
    setSlots(prev => prev.map(s => s.id === id ? { ...s, loading: true, error: "" } : s));
    try {
      const slot = slots.find(s => s.id === id);
      const imagens = imgBase ? [{ base64: imgBase.base64, mimeType: "image/jpeg" }] : [];
      const img = await generateImage(slot.prompt, imagens);
      setSlots(prev => prev.map(s => s.id === id ? { ...s, imagem: img, loading: false } : s));
    } catch (e) {
      setSlots(prev => prev.map(s => s.id === id ? { ...s, loading: false, error: e.message } : s));
    }
  };

  const gerarTodos = async () => {
    if (slots.length === 0) prepararSlots();
    setGerandoTodos(true);
    // Regera prompts com valores atuais antes de gerar (caso o usuário mudou ficha/estilo)
    const base = SEQUENCIAS[qtdSlots] || SEQUENCIAS["6"];
    const novos = base.map(s => {
      const existente = slots.find(x => x.id === s.id);
      return {
        ...s,
        prompt: existente?.prompt || montarPromptSlot(s, ficha, estilo),
        imagem: existente?.imagem || null,
        loading: false,
        error: "",
      };
    });
    setSlots(novos);
    // Gera um a um (evita rate limit)
    for (const s of novos) {
      if (s.imagem) continue; // pula os que já têm
      setSlots(prev => prev.map(x => x.id === s.id ? { ...x, loading: true, error: "" } : x));
      try {
        const imagens = imgBase ? [{ base64: imgBase.base64, mimeType: "image/jpeg" }] : [];
        const img = await generateImage(s.prompt, imagens);
        setSlots(prev => prev.map(x => x.id === s.id ? { ...x, imagem: img, loading: false } : x));
      } catch (e) {
        setSlots(prev => prev.map(x => x.id === s.id ? { ...x, loading: false, error: e.message } : x));
      }
      await new Promise(r => setTimeout(r, 700));
    }
    setGerandoTodos(false);
  };

  const sugerirEstrutura = async () => {
    if (!preencheuFicha) { alert("Preencha ao menos o nome do produto na ficha."); return; }
    setSugestaoLoading(true); setSugestao("");
    try {
      const ctx = [];
      if (ficha.nome) ctx.push("Produto: " + ficha.nome);
      if (ficha.categoria) ctx.push("Categoria: " + ficha.categoria);
      if (ficha.material) ctx.push("Material: " + ficha.material);
      if (ficha.publico) ctx.push("Público: " + ficha.publico);
      if (ficha.cores) ctx.push("Cores: " + ficha.cores);
      if (ficha.diferenciais) ctx.push("Diferenciais: " + ficha.diferenciais);

      const prompt = `Você é especialista em fotografia de produto para marketplace de calçados brasileiros (Shopee, ML). Baseado nas informações abaixo, sugira a SEQUÊNCIA IDEAL de imagens para maximizar conversão neste produto específico — considerando três objetivos: 1) parar o scroll, 2) convencer o comprador, 3) eliminar dúvidas.

${ctx.join("\n")}

Responda em no máximo 200 palavras, em português direto e prático. Estrutura:
- Quantas imagens recomenda (4, 6 ou 8) e por quê
- Ordem sugerida com breve descrição de cada
- 1 dica específica para ESTE produto que ajudaria a converter mais

Sem markdown, sem asteriscos, sem emojis nos títulos.`;

      const r = await apiFetch([{ role: "user", content: prompt }], 700);
      setSugestao(r);
    } catch (e) {
      setSugestao("Erro: " + e.message);
    }
    setSugestaoLoading(false);
  };

  const uploadBase = async (file) => {
    if (!file) return;
    const r = await comprimirImagem(file, 800, 0.85);
    setImgBase(r);
  };

  const downloadImg = (slot) => {
    if (!slot.imagem) return;
    const a = document.createElement("a");
    a.href = `data:${slot.imagem.mimeType};base64,${slot.imagem.base64}`;
    const nome = (ficha.nome || "produto").replace(/[^a-zA-Z0-9]/g, "_");
    a.download = `${nome}_${slot.id}.${slot.imagem.mimeType.split("/")[1] || "png"}`;
    a.click();
  };

  const limparTudo = () => {
    setSlots([]); setImgBase(null); setSugestao(""); setConfirmLimpar(false);
  };

  return (
    <div className="gap-stack">

          <div className="gap-alert gap-alert-info">
            <div className="gap-alert-dot dot-info" />
            <div>
              <div className="gap-alert-title">Gere imagens de produto direto no Gap</div>
              <div className="gap-alert-desc">
                Preencha a ficha do produto, escolha a sequência e o estilo, e a IA gera imagens prontas para colar no anúncio.
                Você pode editar o prompt de cada imagem, regerar individualmente e baixar. Custo do Google: ~US$ 0,04 por imagem.
              </div>
            </div>
          </div>

          <Card>
            <CardTitle>Ficha do produto</CardTitle>
            <p className="gap-muted" style={{ marginBottom: 12 }}>Esta ficha é a mesma usada em Anúncios IA — o que preencher aqui vale nos dois lugares.</p>
            <div className="gap-grid-2">
              <div><label className="gap-label">Nome *</label><input className="gap-input" value={ficha.nome} onChange={e => updateFicha("nome", e.target.value)} placeholder="Sandália Xereta Infantil" /></div>
              <div><label className="gap-label">Categoria</label><input className="gap-input" value={ficha.categoria} onChange={e => updateFicha("categoria", e.target.value)} placeholder="Sandália / Tênis / Bota" /></div>
              <div><label className="gap-label">Material</label><input className="gap-input" value={ficha.material} onChange={e => updateFicha("material", e.target.value)} placeholder="Couro sintético" /></div>
              <div><label className="gap-label">Público-alvo</label><input className="gap-input" value={ficha.publico} onChange={e => updateFicha("publico", e.target.value)} placeholder="Crianças 1-8 anos" /></div>
              <div><label className="gap-label">Cores</label><input className="gap-input" value={ficha.cores} onChange={e => updateFicha("cores", e.target.value)} placeholder="Rosa, azul" /></div>
              <div><label className="gap-label">Diferenciais</label><input className="gap-input" value={ficha.diferenciais} onChange={e => updateFicha("diferenciais", e.target.value)} placeholder="Solado antiderrapante" /></div>
            </div>
          </Card>

          <Card>
            <div className="gap-row-between" style={{ marginBottom: 8 }}>
              <CardTitle>Sugestão de estrutura por IA</CardTitle>
              <button className="gap-btn-secondary" style={{ fontSize: 12, padding: "6px 12px" }} disabled={sugestaoLoading || !preencheuFicha} onClick={sugerirEstrutura}>
                {sugestaoLoading ? "Analisando..." : "Sugerir para este produto"}
              </button>
            </div>
            <p className="gap-muted">A IA olha sua ficha e recomenda quantas e quais imagens seriam ideais neste produto específico.</p>
            {sugestao && (
              <div style={{ marginTop: 12, padding: "12px 14px", background: "#F5F5F3", borderRadius: 10, fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{sugestao}</div>
            )}
          </Card>

          <Card>
            <CardTitle>Configuração da geração</CardTitle>
            <div className="gap-stack" style={{ gap: 12 }}>

              <div>
                <label className="gap-label">Quantas imagens gerar</label>
                <div className="gap-row" style={{ gap: 6 }}>
                  {["4", "6", "8"].map(n => (
                    <button key={n} onClick={() => setQtdSlots(n)}
                      className={`gap-btn-${qtdSlots === n ? "primary" : "secondary"}`}
                      style={{ padding: "6px 14px", fontSize: 12.5 }}>{n} imagens</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="gap-label">Estilo visual</label>
                <div className="gap-grid-2" style={{ gap: 8 }}>
                  {ESTILOS.map(e => (
                    <button key={e.id} onClick={() => setEstilo(e.id)}
                      style={{
                        textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                        border: estilo === e.id ? "2px solid #2563EB" : "1.5px solid #EBEBEB",
                        background: estilo === e.id ? "#EFF6FF" : "#fff",
                      }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: estilo === e.id ? "#1D4ED8" : "#0D0D0F" }}>{e.label}</div>
                      <div className="gap-muted" style={{ marginTop: 2 }}>{e.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="gap-label">Foto real do produto (opcional)</label>
                {imgBase ? (
                  <div className="gap-row" style={{ alignItems: "center", gap: 10 }}>
                    <img src={imgBase.preview} alt="base" style={{ width: 80, height: 80, borderRadius: 10, objectFit: "cover", border: "1.5px solid #EBEBEB" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>Foto base enviada</div>
                      <div className="gap-muted">A IA vai usar esta foto como referência ao gerar as variações.</div>
                    </div>
                    <button className="gap-btn-secondary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => setImgBase(null)}>Remover</button>
                  </div>
                ) : (
                  <>
                    <button className="gap-btn-secondary" style={{ fontSize: 12, padding: "8px 14px" }} onClick={() => inputBaseRef.current?.click()}>+ Enviar foto base (opcional)</button>
                    <input ref={inputBaseRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { uploadBase(e.target.files?.[0]); e.target.value = ""; }} />
                    <div className="gap-muted" style={{ marginTop: 6 }}>Se enviar, a IA usa como referência do produto real.</div>
                  </>
                )}
              </div>

              <div className="gap-row" style={{ paddingTop: 8, borderTop: "1px solid #EBEBEB", flexWrap: "wrap" }}>
                <button className="gap-btn-primary" disabled={gerandoTodos || !preencheuFicha} onClick={gerarTodos}>
                  {gerandoTodos ? "Gerando..." : (slots.length === 0 ? "🎨 Gerar todas as imagens" : "🎨 Continuar / regerar faltantes")}
                </button>
                {slots.length > 0 && (
                  <button className="gap-btn-secondary" onClick={prepararSlots}>Recalcular prompts (não regera imagens)</button>
                )}
                {slots.length > 0 && (
                  confirmLimpar
                    ? <ConfirmButtons onConfirm={limparTudo} onCancel={() => setConfirmLimpar(false)} confirmLabel="Limpar tudo" />
                    : <button className="gap-btn-ghost" style={{ fontSize: 12 }} onClick={() => setConfirmLimpar(true)}>Limpar tudo</button>
                )}
              </div>
              {!preencheuFicha && <p className="gap-muted" style={{ fontSize: 12, color: "#B45309" }}>⚠ Preencha ao menos o nome do produto na ficha antes de gerar.</p>}
            </div>
          </Card>

          {slots.length === 0 && (
            <EmptyState icon="🎨" title="Configure e clique em Gerar" desc="Ao clicar em 'Gerar todas as imagens', o sistema cria uma imagem por slot da sequência escolhida." />
          )}

          {slots.length > 0 && (
            <div className="gap-grid-2" style={{ gap: 12 }}>
              {slots.map(slot => (
                <SlotManual key={slot.id} slot={slot}
                  onGerar={() => gerarUm(slot.id)}
                  onEditarPrompt={(v) => editarPrompt(slot.id, v)}
                  onRegerarPrompt={() => regerarPrompt(slot.id)}
                  onDownload={() => downloadImg(slot)} />
              ))}
            </div>
          )}
    </div>
  );
}

function SlotManual({ slot, onGerar, onEditarPrompt, onRegerarPrompt, onDownload }) {
  const [editando, setEditando] = useState(false);
  const [promptEdit, setPromptEdit] = useState(slot.prompt);

  const salvarPrompt = () => { onEditarPrompt(promptEdit); setEditando(false); };

  return (
    <Card style={{ padding: 12 }}>
      <div className="gap-row-between" style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{slot.label}</div>
        <span style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 20, background: "#F5F5F3", color: "#666" }}>{slot.id}</span>
      </div>

      <div style={{ aspectRatio: "1", background: "#FAFAF8", border: "1.5px dashed #E5E7EB", borderRadius: 10, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
        {slot.loading ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>🎨</div>
            <div className="gap-muted">gerando...</div>
          </div>
        ) : slot.error ? (
          <div style={{ textAlign: "center", padding: 14, color: "#DC2626", fontSize: 12 }}>❌ {slot.error}</div>
        ) : slot.imagem ? (
          <img src={`data:${slot.imagem.mimeType};base64,${slot.imagem.base64}`} alt={slot.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ textAlign: "center", color: "#CBD5E1" }}>
            <div style={{ fontSize: 22 }}>+</div>
            <div className="gap-muted">aguardando</div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 11.5, color: "#666", marginBottom: 8, lineHeight: 1.5 }}>{slot.hint}</div>

      {editando ? (
        <div className="gap-stack" style={{ gap: 6 }}>
          <textarea className="gap-input" rows={4} value={promptEdit} onChange={e => setPromptEdit(e.target.value)} style={{ fontSize: 11.5, resize: "vertical" }} />
          <div className="gap-row">
            <button className="gap-btn-primary" style={{ fontSize: 11, padding: "5px 10px" }} onClick={salvarPrompt}>Salvar</button>
            <button className="gap-btn-secondary" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => { setPromptEdit(slot.prompt); setEditando(false); }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <details style={{ marginBottom: 8 }}>
          <summary className="gap-muted" style={{ cursor: "pointer", fontSize: 11.5 }}>ver / editar prompt</summary>
          <div style={{ fontSize: 11, padding: 8, background: "#F5F5F3", borderRadius: 6, marginTop: 4, lineHeight: 1.5 }}>{slot.prompt}</div>
          <div className="gap-row" style={{ marginTop: 4, gap: 4 }}>
            <button className="gap-btn-ghost" style={{ fontSize: 11 }} onClick={() => { setPromptEdit(slot.prompt); setEditando(true); }}>editar</button>
            <button className="gap-btn-ghost" style={{ fontSize: 11 }} onClick={onRegerarPrompt}>regerar prompt</button>
          </div>
        </details>
      )}

      <div className="gap-row" style={{ gap: 6, flexWrap: "wrap" }}>
        <button className="gap-btn-primary" style={{ fontSize: 11.5, padding: "6px 10px" }} disabled={slot.loading} onClick={onGerar}>
          {slot.imagem ? "regerar" : slot.loading ? "gerando..." : "gerar"}
        </button>
        {slot.imagem && (
          <button className="gap-btn-secondary" style={{ fontSize: 11.5, padding: "6px 10px" }} onClick={onDownload}>baixar</button>
        )}
      </div>
    </Card>
  );
}
