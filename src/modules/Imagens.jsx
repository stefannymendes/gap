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
  hero_capa:            "Capa (hero)",
  beneficio_cena:       "Benefício pela cena",
  on_body:              "No pé / corpo",
  na_mao:               "Na mão",
  variacoes_cor:        "Variações de cor",
  sobrepostos:          "Sobrepostos",
  close_material:       "Close de material",
  close_detalhe:        "Close de detalhe",
  dual_angle_sola:      "Dual angle + sola",
  escala_uso:           "Escala / uso",
  diptych_funcional:    "Diptych funcional",
  infografico_callouts: "Infográfico c/ callouts",
  selos_confianca:      "Selos de confiança",
  prova_social:         "Prova social",
  kit_completo:         "Kit completo",
  tabela_dados:         "Tabela de dados",
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

// Inclinação de tratamento visual — deixa o vendedor pesar a balança
// estúdio (comercial, produto-herói) vs contexto (ambiente, uso real).
const INCLINACOES = [
  { id: "auto",     label: "Automático (o agente decide)" },
  { id: "estudio",  label: "Mais estúdio / comercial" },
  { id: "contexto", label: "Mais contexto / ambiente" },
];

const FICHA_PADRAO = {
  nome: "", categoria: "", material: "", publico: "", variacoes: "",
  numeracao: "", diferenciais: "", extra: "",
  preco: "", diferencialPrincipal: "conforto", ocasiao: "casual",
  ehKit: false, qtdPares: "2", comentarioCliente: "", inclinacao: "auto",
  modoVariacao: "multi", variacaoEscolhida: "",
  tabelaTitulo: "", tabelaLinhas: [],   // [{ rotulo, valor }] — genérico p/ qualquer produto
};

function extrairJSON(texto) {
  const limpo = String(texto).replace(/```json|```/gi, "").trim();
  const ini = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  if (ini === -1 || fim === -1) throw new Error("A IA não retornou um plano válido. Tente novamente.");
  return JSON.parse(limpo.slice(ini, fim + 1));
}

function listaVariacoes(str) {
  return String(str || "").split(/[,;/]/).map(c => c.trim()).filter(Boolean);
}

// Descreve o produto para os agentes, incluindo os papéis das imagens de referência
function descreverProduto(f, refs = []) {
  const linhas = [];
  if (f.nome) linhas.push(`Nome: ${f.nome}`);
  if (f.categoria) linhas.push(`Categoria: ${f.categoria}`);
  if (f.material) linhas.push(`Material: ${f.material}`);
  if (f.publico) linhas.push(`Público-alvo: ${f.publico}`);
  const vars = listaVariacoes(f.variacoes);
  if (vars.length) linhas.push(`Variações (${vars.length}): ${vars.join(", ")}`);
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
  const tab = (f.tabelaLinhas || []).filter(l => l.rotulo?.trim() || l.valor?.trim());
  if (tab.length) {
    const conteudo = tab.map(l => `    "${l.rotulo}": "${l.valor}"`).join("\n");
    linhas.push(`TABELA DE DADOS preenchida pelo vendedor${f.tabelaTitulo ? ` (título: "${f.tabelaTitulo}")` : ""} — use o tipo tabela_dados se fizer sentido na sequência. Conteúdo EXATO (reproduza literalmente, sem traduzir nem alterar):\n${conteudo}`);
  }
  if (f.inclinacao === "estudio") {
    linhas.push("Inclinação visual do vendedor: MAIS ESTÚDIO/COMERCIAL — priorize tratamento de estúdio, produto-herói, fundo trabalhado, luz comercial; evite cenas de contexto de vida real, exceto quando o slot pedir (ex.: prova social).");
  } else if (f.inclinacao === "contexto") {
    linhas.push("Inclinação visual do vendedor: MAIS CONTEXTO/AMBIENTE — priorize o produto em ambiente e situação de uso real; o cenário faz parte do argumento de venda.");
  }
  // Modo de variação: anúncio de uma variação só, ou multi
  if (vars.length > 1) {
    if (f.modoVariacao === "single" && f.variacaoEscolhida) {
      linhas.push(`MODO DE ANÚNCIO: variação única — "${f.variacaoEscolhida}". TODAS as imagens da sequência devem mostrar EXCLUSIVAMENTE esta variação. Não misture outras variações nas imagens do anúncio (a imagem de "variações" pode mostrar o leque, mas o foco é ${f.variacaoEscolhida}).`);
    } else {
      linhas.push("MODO DE ANÚNCIO: multi-variação — a sequência pode mostrar e mesclar as diferentes variações conforme fizer sentido estratégico.");
    }
  }
  if (refs.length) {
    // Mapeia CADA imagem ao seu papel, na mesma ordem em que são enviadas ao gerador
    const linhasRef = refs.map((r, i) => {
      const papel = PAPEIS_REF.find(p => p.id === r.papel)?.label || r.papel;
      return `  - Imagem de referência ${i + 1}: ${papel}`;
    });
    linhas.push(`Imagens de referência anexadas (${refs.length}), na ordem em que são enviadas:\n${linhasRef.join("\n")}\nUse cada uma conforme o papel indicado.`);
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
            tabs={[
              { id: "agente", label: "🤖 Agente de sequência" },
              { id: "inspiracao", label: "✨ Inspiração" },
              { id: "branco", label: "⬜ Fundo branco" },
              { id: "manual", label: "Modo manual" },
            ]}
            active={aba} onChange={setAba}
          />
          {aba === "agente" ? <AbaAgente />
            : aba === "inspiracao" ? <AbaInspiracao />
            : aba === "branco" ? <AbaFundoBranco />
            : <AbaManual />}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════ ABA FUNDO BRANCO ═══════════════════════
// Gera imagens do produto em fundo branco puro, em vários ângulos,
// mantendo padrão consistente entre elas (para galeria de marketplace).

const ANGULOS_BRANCO = [
  { id: "tres_quartos", label: "Três-quartos", desc: "classic three-quarter front angle, showing front and side simultaneously" },
  { id: "lateral",      label: "Lateral (perfil)", desc: "straight side profile view, full silhouette visible" },
  { id: "frontal",      label: "Frontal", desc: "straight-on front view, symmetrical" },
  { id: "traseira",     label: "Traseira", desc: "straight-on back view" },
  { id: "superior",     label: "Superior (top)", desc: "top-down overhead view, product flat" },
  { id: "sola",         label: "Sola / base", desc: "bottom view showing the sole/base surface fully" },
  { id: "par",          label: "Par completo", desc: "both items of the pair together in a clean arrangement" },
  { id: "detalhe",      label: "Detalhe", desc: "close-up detail of the most relevant feature" },
];

function AbaFundoBranco() {
  const [imgsProd, setImgsProd] = useState([]);
  const [selecionados, setSelecionados] = useState(["tres_quartos", "lateral", "superior", "sola"]);
  const [obs, setObs] = useState("");
  const [resultados, setResultados] = useState({});   // { anguloId: {imagem, loading, error} }
  const [gerandoTudo, setGerandoTudo] = useState(false);
  const [zoom, setZoom] = useState(null);
  const inputProd = useRef(null);

  const pronto = imgsProd.length > 0 && selecionados.length > 0;

  const addProd = async (files) => {
    for (const file of files) {
      const r = await comprimirImagem(file, 900, 0.85);
      setImgsProd(prev => [...prev, { base64: r.base64, preview: r.preview }]);
    }
  };
  const toggleAngulo = (id) =>
    setSelecionados(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);

  // Parâmetros FIXOS compartilhados — garantem consistência entre os ângulos
  const PARAMS_BASE = "pure white seamless background (#FFFFFF), soft even studio lighting with a subtle natural contact shadow beneath the product (not a flat cutout), product centered and occupying approximately 80% of the square 1:1 frame, shot on Sony A7III with 50mm lens at f/5.6, real camera photo, photorealistic, true-to-life color, natural shadows, no CGI, no render, sharp product detail";

  const gerarAngulo = async (anguloId) => {
    const ang = ANGULOS_BRANCO.find(a => a.id === anguloId);
    if (!ang || !imgsProd.length) return;
    setResultados(prev => ({ ...prev, [anguloId]: { loading: true, error: "" } }));
    try {
      const prompt = `Product photography for e-commerce listing. Follow the attached reference images EXACTLY for the product's shape, color, material, proportions and every detail — do not alter the product. View: ${ang.desc}. ${PARAMS_BASE}.${obs ? ` Additional instruction: ${obs}.` : ""}`;
      const img = await generateImage(prompt, imgsProd.map(i => ({ base64: i.base64, mimeType: "image/jpeg" })), "1:1");
      setResultados(prev => ({ ...prev, [anguloId]: { imagem: img, loading: false, error: "" } }));
    } catch (e) {
      setResultados(prev => ({ ...prev, [anguloId]: { loading: false, error: e.message } }));
    }
  };

  const gerarTodos = async () => {
    setGerandoTudo(true);
    for (const id of selecionados) {
      await gerarAngulo(id);
      await new Promise(r => setTimeout(r, 700));
    }
    setGerandoTudo(false);
  };

  const baixar = (anguloId) => {
    const r = resultados[anguloId];
    if (!r?.imagem) return;
    const a = document.createElement("a");
    a.href = `data:${r.imagem.mimeType};base64,${r.imagem.base64}`;
    a.download = `fundo_branco_${anguloId}.${r.imagem.mimeType.split("/")[1] || "png"}`;
    a.click();
  };

  const custo = (selecionados.length * 0.20).toFixed(2).replace(".", ",");

  return (
    <div className="gap-stack">
      {zoom && (
        <div onClick={() => setZoom(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
          <img src={zoom} alt="ampliada" style={{ maxWidth: "95%", maxHeight: "95%", objectFit: "contain", borderRadius: 8 }} />
        </div>
      )}

      <div className="gap-alert gap-alert-info">
        <div className="gap-alert-dot dot-info" />
        <div>
          <div className="gap-alert-title">Imagens em fundo branco</div>
          <div className="gap-alert-desc">
            Vários ângulos do mesmo produto em fundo branco, com luz e enquadramento padronizados. Todos seguem os mesmos parâmetros — a galeria sai uniforme.
          </div>
        </div>
      </div>

      <Card>
        <CardTitle>Fotos do produto</CardTitle>
        <p className="gap-muted" style={{ marginBottom: 10, fontSize: 12.5 }}>Quanto mais ângulos reais você anexar, mais fiel o resultado.</p>
        <div className="gap-grid-3" style={{ gap: 8 }}>
          {imgsProd.map((im, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img src={im.preview} alt={`produto ${i + 1}`} onClick={() => setZoom(im.preview)}
                style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, cursor: "zoom-in" }} />
              <button onClick={() => setImgsProd(prev => prev.filter((_, j) => j !== i))}
                style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 12, width: 22, height: 22, fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
          ))}
          <button onClick={() => inputProd.current?.click()}
            style={{ border: "1.5px dashed #CBD5E1", borderRadius: 8, background: "#FAFAF8", aspectRatio: "1", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
            <span style={{ fontSize: 22 }}>+</span>
            <span style={{ fontSize: 11 }}>foto</span>
          </button>
        </div>
        <input ref={inputProd} type="file" accept="image/*" multiple style={{ display: "none" }}
          onChange={e => { addProd([...e.target.files]); e.target.value = ""; }} />
      </Card>

      <Card>
        <CardTitle>Ângulos que você quer</CardTitle>
        <div className="gap-row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {ANGULOS_BRANCO.map(a => (
            <button key={a.id} onClick={() => toggleAngulo(a.id)}
              className={`gap-btn-${selecionados.includes(a.id) ? "primary" : "secondary"}`}
              style={{ fontSize: 12, padding: "6px 12px" }}>
              {a.label}
            </button>
          ))}
        </div>
        <label className="gap-label">Observação (opcional)</label>
        <input className="gap-input" value={obs} onChange={e => setObs(e.target.value)}
          placeholder="Ex.: mostrar a etiqueta interna; sombra mais suave" />
        <div className="gap-row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="gap-btn-primary" disabled={gerandoTudo || !pronto} onClick={gerarTodos}>
            {gerandoTudo ? "Gerando..." : `⚡ Gerar ${selecionados.length} imagem(ns) (~R$ ${custo})`}
          </button>
          {!pronto && <span className="gap-muted" style={{ fontSize: 11.5, color: "#B45309" }}>Anexe ao menos uma foto e escolha um ângulo.</span>}
        </div>
      </Card>

      {selecionados.length > 0 && (
        <div className="gap-grid-3" style={{ gap: 12 }}>
          {selecionados.map(id => {
            const ang = ANGULOS_BRANCO.find(a => a.id === id);
            const r = resultados[id] || {};
            const src = r.imagem ? `data:${r.imagem.mimeType};base64,${r.imagem.base64}` : null;
            return (
              <Card key={id} style={{ padding: 10 }}>
                <div className="gap-row-between" style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>{ang.label}</span>
                  <button className="gap-btn-primary" style={{ fontSize: 11, padding: "4px 9px" }} disabled={r.loading || !imgsProd.length} onClick={() => gerarAngulo(id)}>
                    {r.loading ? "..." : r.imagem ? "regerar" : "gerar"}
                  </button>
                </div>
                <div onClick={() => src && setZoom(src)}
                  style={{ aspectRatio: "1", background: "#FAFAF8", border: "1.5px dashed #E5E7EB", borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", cursor: src ? "zoom-in" : "default" }}>
                  {r.loading ? <span className="gap-muted" style={{ fontSize: 12 }}>🎨 gerando...</span>
                    : r.error ? <span style={{ color: "#DC2626", fontSize: 11, padding: 8, textAlign: "center" }}>❌ {r.error}</span>
                    : src ? <img src={src} alt={ang.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ color: "#CBD5E1", fontSize: 11.5 }}>aguardando</span>}
                </div>
                {r.imagem && (
                  <button className="gap-btn-secondary" style={{ fontSize: 11, padding: "4px 10px", marginTop: 8, width: "100%" }} onClick={() => baixar(id)}>baixar</button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════ ABA INSPIRAÇÃO ═══════════════════════
// Gera uma imagem nova do SEU produto inspirada na composição de uma
// imagem de referência. A imagem de inspiração NÃO é salva — é usada
// apenas na geração.

function AbaInspiracao() {
  const { promptsFavoritos, setPromptsFavoritos } = useGap();
  const [imgInsp, setImgInsp] = useState(null);     // imagem de inspiração (composição)
  const [imgsProd, setImgsProd] = useState([]);     // fotos do produto
  const [obs, setObs] = useState("");
  const [promptEn, setPromptEn] = useState("");
  const [promptPt, setPromptPt] = useState("");
  const [imagem, setImagem] = useState(null);
  const [loading, setLoading] = useState("");
  const [erro, setErro] = useState("");
  const [zoom, setZoom] = useState(null);
  const inputInsp = useRef(null);
  const inputProd = useRef(null);

  const pronto = imgInsp && imgsProd.length > 0;

  const addInsp = async (file) => {
    if (!file) return;
    const r = await comprimirImagem(file, 900, 0.85);
    setImgInsp({ base64: r.base64, preview: r.preview });
  };
  const addProd = async (files) => {
    for (const file of files) {
      const r = await comprimirImagem(file, 900, 0.85);
      setImgsProd(prev => [...prev, { base64: r.base64, preview: r.preview }]);
    }
  };

  const gerar = async () => {
    if (!pronto) { setErro("Anexe a imagem de inspiração e ao menos uma foto do produto."); return; }
    setErro(""); setLoading("prompt"); setImagem(null);
    try {
      // Agente lê a imagem de inspiração e escreve o prompt da nova imagem
      const instru = `Analise a IMAGEM 1 (referência de INSPIRAÇÃO de composição/estilo) e as demais imagens (o PRODUTO REAL do vendedor).

Sua tarefa: escrever um prompt em inglês que gere uma NOVA imagem do PRODUTO REAL do vendedor, usando a composição, ângulo, luz e clima da imagem de inspiração como direção. O produto deve ser o do vendedor (siga as fotos dele exatamente), NUNCA o produto da imagem de inspiração.

${obs ? `Observação do vendedor: "${obs}"\n` : ""}
Descreva a composição da inspiração com precisão (posição dos elementos, ângulo, luz, fundo, clima) e instrua a aplicá-la ao produto real. Responda APENAS com o prompt em inglês.`;
      const imagens = [
        { base64: imgInsp.base64, mimeType: "image/jpeg" },
        ...imgsProd.map(i => ({ base64: i.base64, mimeType: "image/jpeg" })),
      ];
      const msg = [{
        role: "user",
        content: [
          ...imagens.map(i => ({ type: "image", source: { type: "base64", media_type: i.mimeType, data: i.base64 } })),
          { type: "text", text: instru },
        ],
      }];
      const pEn = (await apiFetch(msg, 900, ESTILO_VISUAL)).trim();
      const pPt = await traduzir(pEn, "en2pt");
      setPromptEn(pEn); setPromptPt(pPt);

      // Gera a imagem: manda só as fotos do PRODUTO (a inspiração já virou texto)
      setLoading("imagem");
      const img = await generateImage(pEn, imgsProd.map(i => ({ base64: i.base64, mimeType: "image/jpeg" })), "1:1");
      setImagem(img);
    } catch (e) {
      setErro(e.message);
    }
    setLoading("");
  };

  const regerarSoImagem = async () => {
    if (!promptEn) return;
    setLoading("imagem"); setErro("");
    try {
      const img = await generateImage(promptEn, imgsProd.map(i => ({ base64: i.base64, mimeType: "image/jpeg" })), "1:1");
      setImagem(img);
    } catch (e) { setErro(e.message); }
    setLoading("");
  };

  const salvarPt = async (novoPt) => {
    setPromptPt(novoPt); setLoading("trad");
    try { setPromptEn(await traduzir(novoPt, "pt2en")); } catch (e) { setErro(e.message); }
    setLoading("");
  };

  const favoritar = () => {
    const jaTem = promptsFavoritos?.some(f => f.prompt === promptEn);
    if (jaTem) setPromptsFavoritos(prev => prev.filter(f => f.prompt !== promptEn));
    else setPromptsFavoritos(prev => [...(prev || []), { id: Date.now(), prompt: promptEn, promptPt, tipo: "inspiracao", produto: "", data: new Date().toISOString() }]);
  };
  const ehFav = promptsFavoritos?.some(f => f.prompt === promptEn);

  const baixar = () => {
    if (!imagem) return;
    const a = document.createElement("a");
    a.href = `data:${imagem.mimeType};base64,${imagem.base64}`;
    a.download = `inspiracao_${Date.now()}.${imagem.mimeType.split("/")[1] || "png"}`;
    a.click();
  };

  return (
    <div className="gap-stack">
      {zoom && (
        <div onClick={() => setZoom(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
          <img src={zoom} alt="ampliada" style={{ maxWidth: "95%", maxHeight: "95%", objectFit: "contain", borderRadius: 8 }} />
        </div>
      )}

      <div className="gap-alert gap-alert-info">
        <div className="gap-alert-dot dot-info" />
        <div>
          <div className="gap-alert-title">Gerar a partir de uma inspiração</div>
          <div className="gap-alert-desc">
            Anexe uma imagem que você gostou (de qualquer lugar) e as fotos do seu produto. O agente lê a composição da inspiração e recria com o SEU produto. A imagem de inspiração não é salva.
          </div>
        </div>
      </div>

      <div className="gap-grid-2" style={{ gap: 12 }}>
        {/* Inspiração */}
        <Card>
          <CardTitle>1. Imagem de inspiração</CardTitle>
          <p className="gap-muted" style={{ marginBottom: 10, fontSize: 12.5 }}>A composição/estilo que você quer reproduzir.</p>
          {imgInsp ? (
            <>
              <img src={imgInsp.preview} alt="inspiração" onClick={() => setZoom(imgInsp.preview)}
                style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10, cursor: "zoom-in", marginBottom: 8 }} />
              <button className="gap-btn-ghost" style={{ fontSize: 11.5, color: "#DC2626" }} onClick={() => setImgInsp(null)}>remover</button>
            </>
          ) : (
            <>
              <button onClick={() => inputInsp.current?.click()}
                style={{ border: "1.5px dashed #CBD5E1", borderRadius: 10, background: "#FAFAF8", width: "100%", aspectRatio: "1", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "#64748B" }}>
                <span style={{ fontSize: 26 }}>✨</span>
                <span style={{ fontSize: 12 }}>Anexar inspiração</span>
              </button>
              <input ref={inputInsp} type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => { addInsp(e.target.files?.[0]); e.target.value = ""; }} />
            </>
          )}
        </Card>

        {/* Produto */}
        <Card>
          <CardTitle>2. Seu produto</CardTitle>
          <p className="gap-muted" style={{ marginBottom: 10, fontSize: 12.5 }}>Fotos reais — quanto mais ângulos, mais fiel.</p>
          <div className="gap-grid-2" style={{ gap: 8 }}>
            {imgsProd.map((im, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={im.preview} alt={`produto ${i + 1}`} onClick={() => setZoom(im.preview)}
                  style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, cursor: "zoom-in" }} />
                <button onClick={() => setImgsProd(prev => prev.filter((_, j) => j !== i))}
                  style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 12, width: 22, height: 22, fontSize: 12, cursor: "pointer" }}>✕</button>
              </div>
            ))}
            <button onClick={() => inputProd.current?.click()}
              style={{ border: "1.5px dashed #CBD5E1", borderRadius: 8, background: "#FAFAF8", aspectRatio: "1", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
              <span style={{ fontSize: 20 }}>+</span>
              <span style={{ fontSize: 11 }}>foto</span>
            </button>
          </div>
          <input ref={inputProd} type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={e => { addProd([...e.target.files]); e.target.value = ""; }} />
        </Card>
      </div>

      <Card>
        <label className="gap-label">Observação (opcional)</label>
        <input className="gap-input" value={obs} onChange={e => setObs(e.target.value)}
          placeholder="Ex.: quero o mesmo enquadramento, mas com fundo mais claro" />
        <div className="gap-row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
          <button className="gap-btn-primary" disabled={!!loading || !pronto} onClick={gerar}>
            {loading === "prompt" ? "Lendo a inspiração..." : loading === "imagem" ? "Gerando imagem..." : "✨ Gerar imagem inspirada (~R$ 0,20)"}
          </button>
          {!pronto && <span className="gap-muted" style={{ fontSize: 11.5, color: "#B45309" }}>Anexe a inspiração e ao menos uma foto do produto.</span>}
        </div>
        {erro && <p style={{ color: "#DC2626", fontSize: 12.5, marginTop: 8 }}>❌ {erro}</p>}
      </Card>

      {(imagem || promptEn) && (
        <Card>
          <CardTitle>Resultado</CardTitle>
          <div onClick={() => imagem && setZoom(`data:${imagem.mimeType};base64,${imagem.base64}`)}
            style={{ aspectRatio: "1", maxWidth: 460, background: "#FAFAF8", border: "1.5px dashed #E5E7EB", borderRadius: 10, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10, cursor: imagem ? "zoom-in" : "default" }}>
            {loading === "imagem" ? <span className="gap-muted">🎨 gerando...</span>
              : imagem ? <img src={`data:${imagem.mimeType};base64,${imagem.base64}`} alt="gerada" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span className="gap-muted">aguardando</span>}
          </div>
          <div className="gap-row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            <button className="gap-btn-primary" style={{ fontSize: 12 }} disabled={!!loading || !promptEn} onClick={regerarSoImagem}>🎨 regerar imagem</button>
            {imagem && <button className="gap-btn-secondary" style={{ fontSize: 12 }} onClick={baixar}>baixar</button>}
            {promptEn && (
              <button className="gap-btn-secondary" style={{ fontSize: 12 }} onClick={favoritar}
                title="Salva este estilo no repertório — o agente de sequência se inspira nele depois">
                {ehFav ? "⭐ salvo" : "☆ salvar estilo"}
              </button>
            )}
          </div>
          {promptEn && (
            <details>
              <summary className="gap-muted" style={{ cursor: "pointer", fontSize: 11.5 }}>ver / editar prompt (PT/EN)</summary>
              <div style={{ marginTop: 6 }}>
                <PromptBilingue promptEn={promptEn} promptPt={promptPt} onSalvarPt={salvarPt} loadingTrad={loading === "trad"} />
              </div>
            </details>
          )}
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════ ABA DO AGENTE ═══════════════════════

function AbaAgente() {
  const { fichaProduto, setFichaProduto, promptsFavoritos, setPromptsFavoritos } = useGap();
  const ficha = { ...FICHA_PADRAO, ...(fichaProduto || {}) };
  const updateFicha = (k, v) => setFichaProduto(prev => ({ ...FICHA_PADRAO, ...(prev || {}), [k]: v }));

  const [slots, setSlots] = useState([]);
  const [observacao, setObservacao] = useState("");
  const [variacao, setVariacao] = useState(null);
  const [planejando, setPlanejando] = useState(false);
  const [erroPlano, setErroPlano] = useState("");
  const [gerandoTudo, setGerandoTudo] = useState(false);
  const [refs, setRefs] = useState([]);            // refs gerais do produto: [{ base64, preview, papel }]
  const [refsVar, setRefsVar] = useState({});      // ref por variação: { "preto": {base64, preview}, ... }
  const [confirmLimpar, setConfirmLimpar] = useState(false);
  const [zoom, setZoom] = useState(null);
  const inputRefProduto = useRef(null);
  const inputRefVar = useRef({});

  const preencheu = ficha.nome && ficha.preco;
  const vars = listaVariacoes(ficha.variacoes);

  const custoEstimado = () => {
    const nVars = variacao?.necessaria ? vars.length : 0;
    const total = slots.length + nVars;
    return (total * 0.20).toFixed(2).replace(".", ",");
  };

  // Referências que vão para a geração das imagens do ANÚNCIO:
  // refs gerais do produto + as fotos de cada variação (para o agente
  // ter as cores/modelos reais ao compor imagens de variações).
  // Em modo "single", manda só a variação escolhida + refs gerais.
  const refsPayloadAnuncio = () => {
    const base = refs.map(r => ({ base64: r.base64, mimeType: "image/jpeg" }));
    let varsUsar = Object.entries(refsVar);
    if (ficha.modoVariacao === "single") {
      // Em variação única, só a escolhida (se nenhuma escolhida, não manda variação)
      varsUsar = ficha.variacaoEscolhida
        ? varsUsar.filter(([nome]) => nome === ficha.variacaoEscolhida)
        : [];
    }
    const doVar = varsUsar.map(([, v]) => ({ base64: v.base64, mimeType: "image/jpeg" }));
    return [...base, ...doVar];
  };

  // ── AGENTE 1: planejar ──
  // alternativa=true → pede uma estratégia DIFERENTE da atual (para testar variações de anúncio)
  const planejar = async (alternativa = false) => {
    if (!preencheu) { setErroPlano("Preencha ao menos nome e preço do produto."); return; }
    setPlanejando(true); setErroPlano("");
    const estrategiaAnterior = observacao;
    const tiposAnteriores = slots.map(s => s.tipo).join(", ");
    if (!alternativa) { setSlots([]); setVariacao(null); setObservacao(""); }
    try {
      let user = `Planeje a sequência de imagens para este produto:\n\n${descreverProduto(ficha, refs)}`;
      if (alternativa && estrategiaAnterior) {
        user += `\n\nESTA É UMA NOVA VERSÃO ALTERNATIVA do anúncio deste mesmo produto. A versão anterior usou a estratégia: "${estrategiaAnterior}" com os tipos: ${tiposAnteriores}. Proponha uma sequência GENUINAMENTE DIFERENTE — outra abordagem estratégica, outros tipos em destaque, outra ordem e composição. Não repita a mesma fórmula.`;
      }
      const resp = await apiFetch([{ role: "user", content: user }], 2000, REGRAS_SEQUENCIA);
      const plano = extrairJSON(resp);
      if (!Array.isArray(plano.sequencia) || plano.sequencia.length === 0) {
        throw new Error("O plano veio vazio. Tente novamente.");
      }
      setSlots(plano.sequencia.map((s, i) => ({
        posicao: i + 1,
        tipo: TIPOS_LABEL[s.tipo] ? s.tipo : "hero_capa",
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
          paramsFixos: "",
          cores: vars.map(cor => ({ cor, imagem: null, loading: false, error: "" })),
        });
      }
      setObservacao(plano.estrategia || plano.observacao || "");
    } catch (e) {
      setErroPlano(e.message);
    }
    setPlanejando(false);
  };

  // Repertório de prompts aprovados pelo vendedor — injetado como inspiração
  // (não é aprendizado do modelo; é contexto acumulado).
  const repertorioFavoritos = () => {
    if (!promptsFavoritos?.length) return "";
    const ultimos = promptsFavoritos.slice(-5); // os 5 mais recentes, para não inchar o contexto
    return `\n\nREPERTÓRIO DO VENDEDOR — prompts de imagens que ele aprovou anteriormente. Use-os como INSPIRAÇÃO de estilo e direção (o que agrada este vendedor), adaptando ao slot atual. NÃO copie literalmente:\n${ultimos.map((f, i) => `[${i + 1}] ${f.prompt}`).join("\n\n")}`;
  };

  const favoritar = (slot) => {
    const jaTem = promptsFavoritos?.some(f => f.prompt === slot.promptEn);
    if (jaTem) {
      setPromptsFavoritos(prev => prev.filter(f => f.prompt !== slot.promptEn));
    } else {
      setPromptsFavoritos(prev => [...(prev || []), {
        id: Date.now(),
        prompt: slot.promptEn,
        promptPt: slot.promptPt,
        tipo: slot.tipo,
        produto: ficha.nome || "",
        data: new Date().toISOString(),
      }]);
    }
  };
  const ehFavorito = (slot) => promptsFavoritos?.some(f => f.prompt === slot.promptEn);

  // ── AGENTE 2: gerar prompt (EN) + tradução (PT) ──
  const gerarPrompt = async (posicao) => {
    const slot = slots.find(s => s.posicao === posicao);
    if (!slot) return null;
    setSlots(prev => prev.map(s => s.posicao === posicao ? { ...s, loadingPrompt: true, error: "" } : s));
    try {
      const user = `Gere o prompt para este slot da sequência:\n\nTipo: ${slot.tipo}\nPosição: ${slot.posicao}\nJob desta imagem: ${slot.job}\n\nProduto:\n${descreverProduto(ficha, refs)}${repertorioFavoritos()}`;
      const promptEn = (await apiFetch([{ role: "user", content: user }], 900, ESTILO_VISUAL)).trim();
      const promptPt = await traduzir(promptEn, "en2pt");
      setSlots(prev => prev.map(s => s.posicao === posicao ? { ...s, promptEn, promptPt, loadingPrompt: false } : s));
      return promptEn;
    } catch (e) {
      setSlots(prev => prev.map(s => s.posicao === posicao ? { ...s, loadingPrompt: false, error: e.message } : s));
      return null;
    }
  };

  // ── CORREÇÃO: vendedor escreve o que ajustar (PT) → agente reescreve o prompt ──
  const corrigirPrompt = async (posicao, notaCorrecao) => {
    const slot = slots.find(s => s.posicao === posicao);
    if (!slot || !slot.promptEn) return;
    setSlots(prev => prev.map(s => s.posicao === posicao ? { ...s, loadingPrompt: true, error: "" } : s));
    try {
      const user = `Este é um prompt de imagem de produto que já existe. O vendedor pediu um ajuste. Reescreva o prompt aplicando o ajuste, mantendo tudo que já estava bom e o estilo/direção original. Responda APENAS com o novo prompt em inglês, sem preâmbulo.\n\nPROMPT ATUAL:\n${slot.promptEn}\n\nAJUSTE PEDIDO (em português): "${notaCorrecao}"\n\nProduto:\n${descreverProduto(ficha, refs)}`;
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

  // ── FASE 3: gerar imagem (usa sempre o EN + refs do produto e variações) ──
  const gerarImagem = async (posicao, promptDireto) => {
    const slot = slots.find(s => s.posicao === posicao);
    if (!slot) return;
    const prompt = promptDireto || slot.promptEn;
    if (!prompt) return;
    setSlots(prev => prev.map(s => s.posicao === posicao ? { ...s, loadingImg: true, error: "" } : s));
    try {
      const img = await generateImage(prompt, refsPayloadAnuncio(), "1:1");
      setSlots(prev => prev.map(s => s.posicao === posicao ? { ...s, imagem: img, loadingImg: false } : s));
    } catch (e) {
      setSlots(prev => prev.map(s => s.posicao === posicao ? { ...s, loadingImg: false, error: e.message } : s));
    }
  };

  const gerarTudo = async () => {
    setGerandoTudo(true);
    for (const slot of slots) {
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
  // Passo 1: define os PARÂMETROS VISUAIS FIXOS (ângulo, enquadramento, luz, fundo)
  // que TODAS as variações vão compartilhar — garante galeria uniforme.
  const gerarPromptVariacao = async () => {
    setVariacao(prev => ({ ...prev, loadingPrompt: true }));
    try {
      const user = `Defina os PARÂMETROS VISUAIS FIXOS para uma galeria de fotos de variação (uma foto por variação, todas idênticas exceto pela variação em si). Descreva de forma reproduzível e precisa: ângulo exato da câmera, enquadramento, distância, posição/orientação do produto, tipo de luz e direção, fundo (${variacao.fundo}), e proporção 1:1. NÃO descreva a cor/variação específica — apenas os parâmetros que se repetem em todas. Responda em inglês, um parágrafo curto e direto, só os parâmetros.\n\nProduto:\n${descreverProduto(ficha, refs)}`;
      const paramsFixos = (await apiFetch([{ role: "user", content: user }], 500, ESTILO_VISUAL)).trim();
      const paramsPt = await traduzir(paramsFixos, "en2pt");
      setVariacao(prev => ({ ...prev, paramsFixos, promptEn: paramsFixos, promptPt: paramsPt, loadingPrompt: false }));
    } catch (e) {
      setVariacao(prev => ({ ...prev, loadingPrompt: false }));
      alert("Erro ao definir parâmetros: " + e.message);
    }
  };

  // Passo 2: gera a imagem de uma variação — prompt individual que REPETE os
  // parâmetros fixos + a variação específica, ancorado na foto real dela.
  const gerarImagemCor = async (cor) => {
    if (!variacao?.paramsFixos) return;
    setVariacao(prev => ({ ...prev, cores: prev.cores.map(c => c.cor === cor ? { ...c, loading: true, error: "" } : c) }));
    try {
      // Monta o prompt final da variação: parâmetros travados + esta variação
      const prompt = `Real camera photo, photorealistic, true-to-life color. Product variation: "${cor}". Follow the attached reference image exactly for the product shape, color and details of this specific variation. Use EXACTLY these fixed visual parameters, identical across all variations: ${variacao.paramsFixos}`;
      const refCor = refsVar[cor];
      const gerais = refs.map(r => ({ base64: r.base64, mimeType: "image/jpeg" }));
      // A foto da própria variação vem PRIMEIRO (prioridade de fidelidade)
      const imagens = refCor ? [{ base64: refCor.base64, mimeType: "image/jpeg" }, ...gerais] : gerais;
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

  const addRefVar = async (nome, file) => {
    if (!file) return;
    const r = await comprimirImagem(file, 900, 0.85);
    setRefsVar(prev => ({ ...prev, [nome]: { base64: r.base64, preview: r.preview } }));
  };
  const removerRefVar = (nome) =>
    setRefsVar(prev => { const c = { ...prev }; delete c[nome]; return c; });

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
          <div><label className="gap-label">Variações (separadas por vírgula)</label><input className="gap-input" value={ficha.variacoes} onChange={e => updateFicha("variacoes", e.target.value)} placeholder="Preto, nude, rosa / P, M, G" /></div>
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
            <label className="gap-label">Tratamento visual</label>
            <select className="gap-input" value={ficha.inclinacao} onChange={e => updateFicha("inclinacao", e.target.value)}>
              {INCLINACOES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
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

        {/* Tabela de dados — genérica, serve a qualquer produto */}
        <div style={{ marginTop: 14, borderTop: "1px solid #EBEBEB", paddingTop: 12 }}>
          <div className="gap-row-between" style={{ marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
            <label className="gap-label" style={{ marginBottom: 0 }}>Tabela de dados (opcional)</label>
            <button className="gap-btn-secondary" style={{ fontSize: 11.5, padding: "4px 10px" }}
              onClick={() => updateFicha("tabelaLinhas", [...(ficha.tabelaLinhas || []), { rotulo: "", valor: "" }])}>
              + linha
            </button>
          </div>
          <p className="gap-muted" style={{ fontSize: 11.5, marginBottom: 8 }}>
            Medidas, dimensões, especificações — o que o comprador precisa saber. O agente usa esses dados exatos na imagem de tabela.
          </p>
          {(ficha.tabelaLinhas || []).length > 0 && (
            <>
              <input className="gap-input" style={{ marginBottom: 8 }} value={ficha.tabelaTitulo}
                onChange={e => updateFicha("tabelaTitulo", e.target.value)} placeholder="Título da tabela (ex.: Tabela de medidas)" />
              <div className="gap-stack" style={{ gap: 6 }}>
                {(ficha.tabelaLinhas || []).map((linha, i) => (
                  <div key={i} className="gap-row" style={{ gap: 6, alignItems: "center" }}>
                    <input className="gap-input" style={{ flex: "0 0 34%" }} value={linha.rotulo}
                      onChange={e => updateFicha("tabelaLinhas", ficha.tabelaLinhas.map((l, j) => j === i ? { ...l, rotulo: e.target.value } : l))}
                      placeholder="Rótulo (ex.: Numeração)" />
                    <input className="gap-input" style={{ flex: 1 }} value={linha.valor}
                      onChange={e => updateFicha("tabelaLinhas", ficha.tabelaLinhas.map((l, j) => j === i ? { ...l, valor: e.target.value } : l))}
                      placeholder="Valor (ex.: 20/21 · 22/23 · 24/25)" />
                    <button className="gap-btn-ghost" style={{ fontSize: 12, padding: "4px 8px", color: "#DC2626" }}
                      onClick={() => updateFicha("tabelaLinhas", ficha.tabelaLinhas.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
              </div>
            </>
          )}
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

      {/* ─── Variações: modo do anúncio + foto por variação ─── */}
      {vars.length > 0 && (
        <Card>
          <CardTitle>Variações</CardTitle>
          <p className="gap-muted" style={{ marginBottom: 12 }}>
            Anexe uma foto real de cada variação. Ela serve tanto para a galeria individual quanto para o agente compor as imagens do anúncio com a variação certa.
          </p>

          {vars.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <label className="gap-label">Este anúncio é de:</label>
              <div className="gap-row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button className={`gap-btn-${ficha.modoVariacao === "multi" ? "primary" : "secondary"}`} style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => updateFicha("modoVariacao", "multi")}>
                  Todas as variações
                </button>
                <button className={`gap-btn-${ficha.modoVariacao === "single" ? "primary" : "secondary"}`} style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => updateFicha("modoVariacao", "single")}>
                  Uma variação só
                </button>
                {ficha.modoVariacao === "single" && (
                  <select className="gap-input" style={{ width: "auto", minWidth: 140 }} value={ficha.variacaoEscolhida} onChange={e => updateFicha("variacaoEscolhida", e.target.value)}>
                    <option value="">escolha a variação</option>
                    {vars.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
              </div>
              {ficha.modoVariacao === "single" && !ficha.variacaoEscolhida && (
                <span className="gap-muted" style={{ fontSize: 11.5, color: "#B45309" }}>Selecione qual variação será o foco do anúncio.</span>
              )}
            </div>
          )}

          <div className="gap-grid-3" style={{ gap: 10 }}>
            {vars.map(nome => (
              <div key={nome} style={{ border: "1.5px solid #EBEBEB", borderRadius: 10, padding: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 6, textTransform: "capitalize" }}>{nome}</div>
                {refsVar[nome] ? (
                  <>
                    <img src={refsVar[nome].preview} alt={nome} onClick={() => setZoom(refsVar[nome].preview)}
                      style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, cursor: "zoom-in", marginBottom: 6 }} />
                    <button className="gap-btn-ghost" style={{ fontSize: 11, color: "#DC2626", width: "100%" }} onClick={() => removerRefVar(nome)}>remover</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => inputRefVar.current[nome]?.click()}
                      style={{ border: "1.5px dashed #CBD5E1", borderRadius: 8, background: "#FAFAF8", width: "100%", aspectRatio: "1", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: "#64748B" }}>
                      <span style={{ fontSize: 22 }}>+</span>
                      <span style={{ fontSize: 11 }}>foto</span>
                    </button>
                    <input ref={el => inputRefVar.current[nome] = el} type="file" accept="image/*" style={{ display: "none" }}
                      onChange={e => { addRefVar(nome, e.target.files?.[0]); e.target.value = ""; }} />
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ─── Ação principal ─── */}
      <Card>
        <div className="gap-row-between" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="gap-muted" style={{ fontSize: 12.5, flex: 1, minWidth: 200 }}>
            {refs.length > 0 ? `${refs.length} foto(s) de referência anexada(s).` : "Sem referência: a IA cria um produto aproximado."}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            <button className="gap-btn-primary" disabled={planejando || !preencheu} onClick={() => planejar(false)}>
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
                <button className="gap-btn-secondary" style={{ fontSize: 12.5 }} disabled={planejando} onClick={() => planejar(true)} title="Gera uma sequência com estratégia diferente, para você testar outra abordagem do mesmo produto">
                  {planejando ? "..." : "🎲 Outra estratégia"}
                </button>
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
                onCorrigir={async (nota) => { const p = await corrigirPrompt(slot.posicao, nota); if (p) await gerarImagem(slot.posicao, p); }}
                onTrocarTipo={(t) => trocarTipo(slot.posicao, t)}
                onRemover={() => removerSlot(slot.posicao)}
                onMover={(dir) => moverSlot(slot.posicao, dir)}
                onDownload={() => download(slot.imagem, `${slot.posicao}_${slot.tipo}`)}
                onFavoritar={() => favoritar(slot)}
                ehFavorito={ehFavorito(slot)}
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

          {!variacao.paramsFixos ? (
            <button className="gap-btn-primary" disabled={variacao.loadingPrompt} onClick={gerarPromptVariacao}>
              {variacao.loadingPrompt ? "Definindo padrão..." : "✍️ Definir padrão visual das variações"}
            </button>
          ) : (
            <div className="gap-stack" style={{ gap: 10 }}>
              <div style={{ fontSize: 11.5, color: "#64748B", background: "#F5F5F3", borderRadius: 8, padding: "8px 10px" }}>
                <strong>Padrão fixo</strong> (repetido em todas as variações para a galeria ficar uniforme):
                <div style={{ marginTop: 4, color: "#475569" }}>{variacao.promptPt}</div>
              </div>
              <div className="gap-grid-2" style={{ gap: 10 }}>
                {variacao.cores.map(c => (
                  <div key={c.cor} style={{ border: "1.5px solid #EBEBEB", borderRadius: 10, padding: 10 }}>
                    <div className="gap-row-between" style={{ marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, textTransform: "capitalize" }}>
                        {c.cor} {refsVar[c.cor] ? "📷" : ""}
                      </span>
                      <button className="gap-btn-primary" style={{ fontSize: 11, padding: "5px 10px" }} disabled={c.loading} onClick={() => gerarImagemCor(c.cor)}>
                        {c.loading ? "gerando..." : c.imagem ? "regerar" : "gerar"}
                      </button>
                    </div>
                    {!refsVar[c.cor] && (
                      <div className="gap-muted" style={{ fontSize: 10.5, marginBottom: 6 }}>Sem foto de referência — anexe na seção Variações acima para acertar a variação.</div>
                    )}
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
function SlotAgente({ slot, total, onGerarPrompt, onGerarImagem, onSalvarPt, onCorrigir, onTrocarTipo, onRemover, onMover, onDownload, onFavoritar, ehFavorito, onZoom }) {
  const imgSrc = slot.imagem ? `data:${slot.imagem.mimeType};base64,${slot.imagem.base64}` : null;
  const [nota, setNota] = useState("");
  const [abrirCorrecao, setAbrirCorrecao] = useState(false);

  const enviarCorrecao = async () => {
    if (!nota.trim()) return;
    await onCorrigir(nota.trim());
    setNota(""); setAbrirCorrecao(false);
  };

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
        ) : (
          <div style={{ textAlign: "center", color: "#CBD5E1" }}><div style={{ fontSize: 22 }}>+</div><div className="gap-muted">aguardando</div></div>
        )}
      </div>

      {/* Campo de correção — só aparece depois que há imagem */}
      {slot.imagem && !slot.loadingImg && (
        <div style={{ marginBottom: 8 }}>
          {!abrirCorrecao ? (
            <button className="gap-btn-secondary" style={{ fontSize: 11.5, padding: "6px 10px", width: "100%" }} onClick={() => setAbrirCorrecao(true)}>
              ✏️ Ajustar esta imagem
            </button>
          ) : (
            <div className="gap-stack" style={{ gap: 6 }}>
              <textarea className="gap-input" rows={2} value={nota} onChange={e => setNota(e.target.value)}
                placeholder="O que ajustar? Ex.: aproxime o pé e centralize; fundo com mais contraste; menos sombra..."
                style={{ fontSize: 11.5, resize: "vertical" }} />
              <div className="gap-row" style={{ gap: 6 }}>
                <button className="gap-btn-primary" style={{ fontSize: 11, padding: "5px 10px" }} disabled={slot.loadingPrompt || !nota.trim()} onClick={enviarCorrecao}>
                  {slot.loadingPrompt ? "ajustando..." : "Aplicar e regerar"}
                </button>
                <button className="gap-btn-ghost" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => { setNota(""); setAbrirCorrecao(false); }}>cancelar</button>
              </div>
              <span className="gap-muted" style={{ fontSize: 10.5 }}>Descreva em português o que quer mudar. O agente reescreve o prompt e gera de novo.</span>
            </div>
          )}
        </div>
      )}

      {/* Prompt bilíngue */}
      {slot.loadingPrompt && !abrirCorrecao ? (
        <div className="gap-muted" style={{ fontSize: 11.5, marginBottom: 8 }}>✍️ escrevendo prompt...</div>
      ) : slot.promptEn ? (
        <details style={{ marginBottom: 8 }}>
          <summary className="gap-muted" style={{ cursor: "pointer", fontSize: 11.5 }}>ver / editar prompt (PT/EN)</summary>
          <div style={{ marginTop: 6 }}>
            <PromptBilingue promptEn={slot.promptEn} promptPt={slot.promptPt} onSalvarPt={onSalvarPt} loadingTrad={slot.loadingTrad} />
            <button className="gap-btn-ghost" style={{ fontSize: 11, marginTop: 4 }} onClick={onGerarPrompt}>regerar prompt do zero</button>
          </div>
        </details>
      ) : null}

      {/* Ações */}
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
        {slot.imagem && slot.promptEn && (
          <button className="gap-btn-secondary" style={{ fontSize: 11.5, padding: "6px 10px" }} onClick={onFavoritar}
            title={ehFavorito ? "Remover do repertório" : "Salvar este estilo no repertório — o agente se inspira nele nas próximas gerações"}>
            {ehFavorito ? "⭐ salvo" : "☆ salvar estilo"}
          </button>
        )}
      </div>
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
