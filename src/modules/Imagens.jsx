import { useState, useRef } from "react";
import { useGap } from "../lib/store";
import { Topbar, Card, CardTitle, EmptyState, ConfirmButtons } from "../lib/ui";
import { generateImage, apiFetch } from "../lib/api";
import { comprimirImagem } from "../lib/utils";

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

const FICHA_PADRAO = { nome: "", categoria: "", material: "", publico: "", cores: "", numeracao: "", diferenciais: "", extra: "" };

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

export default function Imagens({ onMenu }) {
  const { fichaProduto, setFichaProduto, salvando } = useGap();
  const [qtdSlots, setQtdSlots] = useState("6");
  const [estilo, setEstilo] = useState("ecommerce");
  const [slots, setSlots] = useState([]);        // [{ id, label, hint, prompt, imagem, loading, error }]
  const [gerandoTodos, setGerandoTodos] = useState(false);
  const [sugestaoLoading, setSugestaoLoading] = useState(false);
  const [sugestao, setSugestao] = useState("");
  const [imgBase, setImgBase] = useState(null);   // opcional: foto real do produto p/ variação
  const [confirmLimpar, setConfirmLimpar] = useState(false);
  const inputBaseRef = useRef(null);

  const ficha = fichaProduto || FICHA_PADRAO;
  const updateFicha = (k, v) => setFichaProduto(prev => ({ ...(prev || FICHA_PADRAO), [k]: v }));

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
    <>
      <Topbar title="Imagens IA" salvando={salvando} onMenu={onMenu} />
      <div className="gap-content">
        <div className="gap-stack" style={{ maxWidth: 900 }}>

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
                <SlotCard key={slot.id} slot={slot}
                  onGerar={() => gerarUm(slot.id)}
                  onEditarPrompt={(v) => editarPrompt(slot.id, v)}
                  onRegerarPrompt={() => regerarPrompt(slot.id)}
                  onDownload={() => downloadImg(slot)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SlotCard({ slot, onGerar, onEditarPrompt, onRegerarPrompt, onDownload }) {
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
