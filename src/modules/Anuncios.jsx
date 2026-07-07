import { useState, useRef } from "react";
import { useGap } from "../lib/store";
import { Topbar, Card, CardTitle, SubTabs, CopyBtn, EmptyState } from "../lib/ui";
import { apiFetch } from "../lib/api";
import { comprimirImagem } from "../lib/utils";
import { CHECKLIST_IMAGENS, SAZONALIDADE, MESES } from "../lib/constants";

const TABS = [
  { id: "gerador", label: "Gerador" },
  { id: "score", label: "Score" },
  { id: "titulo", label: "Título" },
  { id: "descricao", label: "Descrição" },
  { id: "palavras", label: "Palavras-chave" },
  { id: "ab", label: "Teste A/B" },
  { id: "imagens", label: "Imagens" },
  { id: "sazonalidade", label: "Sazonalidade" },
];

const FICHA_FIELDS = [
  { key: "nome", label: "Nome", ph: "Sandália Infantil Xereta" },
  { key: "categoria", label: "Categoria", ph: "Sandália / Tênis / Bota" },
  { key: "material", label: "Material", ph: "Couro sintético" },
  { key: "publico", label: "Público-alvo", ph: "Crianças 1-8 anos" },
  { key: "cores", label: "Cores", ph: "Rosa, azul" },
  { key: "numeracao", label: "Numeração", ph: "18 ao 26" },
];

// Remove markdown e separa título / palavras / descrição / score
function parseAnuncio(text) {
  if (!text || text.startsWith("❌")) return { titulos: [], palavrasChave: "", descricao: "", score: "", raw: text };
  const clean = text.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1");
  const linhas = clean.split(/\r?\n/);
  const tits = [];

  // Encontra cada "TÍTULO N:" e pega o texto real (ignora rótulos entre parênteses e linhas vazias)
  for (const n of [1, 2, 3]) {
    const re = new RegExp(`^\\s*T[ÍI]TULO\\s*${n}\\s*(?:\\([^)]*\\))?\\s*:\\s*(.*)$`, "i");
    for (let i = 0; i < linhas.length; i++) {
      const m = linhas[i].match(re);
      if (!m) continue;
      let texto = (m[1] || "").trim().replace(/^\[|\]$/g, "");
      // Se a linha só tem o rótulo, pega a próxima linha não vazia
      let j = i + 1;
      while (!texto && j < linhas.length) {
        const lt = linhas[j].trim().replace(/^\[|\]$/g, "");
        if (lt && !/^(T[ÍI]TULO|PALAVRAS|DESCRI|SCORE)/i.test(lt)) { texto = lt; break; }
        j++;
      }
      if (texto) tits.push(texto);
      break;
    }
  }
  if (tits.length === 0) {
    const s = clean.match(/T[ÍI]TULO[:\s]*([^\n]+)/i);
    if (s) tits.push(s[1].trim().replace(/^\[|\]$/g, ""));
  }

  const kw = clean.match(/PALAVRAS[- ]?CHAVE[:\s]*([\s\S]*?)(?=\n\s*(?:DESCRI[CÇ]|$))/i);
  const desc = clean.match(/DESCRI[CÇ][AÃ]O[:\s]*([\s\S]*?)(?=\n\s*SCORE|$)/i);
  const sc = clean.match(/SCORE\s*SEO[:\s]*([\s\S]*?)$/i);
  return { titulos: tits, palavrasChave: kw ? kw[1].trim() : "", descricao: desc ? desc[1].trim() : "", score: sc ? sc[1].trim() : "", raw: clean };
}

export default function Anuncios({ onMenu }) {
  const { fichaProduto, setFichaProduto, mps, salvando } = useGap();
  const [tab, setTab] = useState("gerador");
  const [fichaAberta, setFichaAberta] = useState(false);

  // imagens
  const [imgPrincipal, setImgPrincipal] = useState(null); // {preview, base64}
  const [imgsAdic, setImgsAdic] = useState([null, null, null]);
  const refPrinc = useRef(null);
  const refsAdic = [useRef(null), useRef(null), useRef(null)];

  // IA
  const [iaLoading, setIaLoading] = useState(false);
  const [iaResult, setIaResult] = useState("");
  const [mpsGerador, setMpsGerador] = useState(["shopee"]);
  const [resultados, setResultados] = useState({});
  const [mpViz, setMpViz] = useState(null);

  // sub-ferramentas
  const [mpAtivo, setMpAtivo] = useState("shopee");
  const [tituloScore, setTituloScore] = useState("");
  const [tituloMeu, setTituloMeu] = useState("");
  const [tituloConc, setTituloConc] = useState("");
  const [descAtual, setDescAtual] = useState("");
  const [descConc, setDescConc] = useState("");
  const [produtoKw, setProdutoKw] = useState("");
  const [checklist, setChecklist] = useState({});
  const [ab, setAb] = useState({ a: "", b: "", va: "", vb: "", sa: "", sb: "" });

  const mpsAtivos = mps.filter(m => m.ativo);
  const mpNome = id => mps.find(m => m.id === id)?.name || id;
  const totalImgs = (imgPrincipal ? 1 : 0) + imgsAdic.filter(Boolean).length;

  const setImg = async (file, slot) => {
    if (!file) return;
    const r = await comprimirImagem(file);
    if (slot === "principal") setImgPrincipal(r);
    else setImgsAdic(prev => { const u = [...prev]; u[slot] = r; return u; });
  };

  const getImageContents = () => [
    ...(imgPrincipal ? [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: imgPrincipal.base64 } }] : []),
    ...imgsAdic.filter(Boolean).map(i => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: i.base64 } })),
  ];

  const contextoFicha = () => {
    const f = fichaProduto, p = [];
    if (f.nome) p.push("Produto: " + f.nome);
    if (f.categoria) p.push("Categoria: " + f.categoria);
    if (f.material) p.push("Material: " + f.material);
    if (f.publico) p.push("Público: " + f.publico);
    if (f.cores) p.push("Cores: " + f.cores);
    if (f.numeracao) p.push("Numeração: " + f.numeracao);
    if (f.diferenciais) p.push("Diferenciais: " + f.diferenciais);
    if (f.extra) p.push("Extra: " + f.extra);
    return p.length ? "\n\nPRODUTO:\n" + p.join("\n") : "";
  };
  const updateFicha = (k, v) => setFichaProduto(prev => ({ ...prev, [k]: v }));
  const scoreChecklist = Object.values(checklist).filter(v => v === true).length;

  const runIA = async (prompt) => {
    setIaLoading(true); setIaResult("");
    try {
      const imgs = getImageContents();
      const msgs = imgs.length > 0 ? [{ role: "user", content: [...imgs, { type: "text", text: prompt }] }] : [{ role: "user", content: prompt }];
      setIaResult(await apiFetch(msgs, 900));
    } catch (e) { setIaResult("❌ " + e.message); }
    setIaLoading(false);
  };

  const gerarAnuncioCompleto = async () => {
    if (mpsGerador.length === 0) { setIaResult("Selecione ao menos um marketplace."); return; }
    setIaLoading(true); setResultados({}); setMpViz(null);
    let imgDesc = "";
    const imgs = getImageContents();
    if (imgs.length > 0) {
      try {
        imgDesc = await apiFetch([{ role: "user", content: [...imgs, { type: "text", text: `Descreva em 2 linhas este calçado: tipo, cor, material, gênero e público-alvo${imgs.length > 1 ? ", e os ângulos mostrados" : ""}.` }] }], 200);
      } catch { /* segue sem descrição */ }
    }
    const prodInfo = (imgDesc ? "\nImagens: " + imgDesc : "") + contextoFicha();
    for (let i = 0; i < mpsGerador.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 600));
      const mpId = mpsGerador[i];
      const permiteEmoji = mpId === "shopee" || mpId === "tiktok";
      const prompt = `Você é especialista em SEO para marketplaces de calçados brasileiros. NÃO faça perguntas — gere o anúncio direto.${prodInfo}

Regras OBRIGATÓRIAS:
- Títulos: PROIBIDO emojis, asteriscos ou símbolos especiais. Apenas texto puro.
- Descrição: PROIBIDO asteriscos (*), underline (_), hashtag (#) ou markdown.${permiteEmoji ? " Emojis permitidos SOMENTE na descrição, com moderação." : ""}

Crie o anúncio para ${mpNome(mpId)}. Os TRÊS títulos devem ser CLARAMENTE DIFERENTES entre si — mesmo produto, estratégias de busca opostas, palavras-chave iniciais diferentes.

Estratégias:
- Título 1: começa pelo TIPO/CATEGORIA do produto + material/característica. Ex: "Sandália Feminina Salto Baixo Rasteirinha Confortável".
- Título 2: começa pelo BENEFÍCIO ou PROBLEMA RESOLVIDO. Palavras diferentes das do Título 1. Ex: "Rasteirinha Antiderrapante Ortopédica para Dor no Pé Feminina".
- Título 3: começa pela OCASIÃO/PÚBLICO/ESTILO. Palavras diferentes das anteriores. Ex: "Rasteirinha Verão Praia Casual Feminina Estilosa Leve".

Cada título até 120 caracteres.

Responda EXATAMENTE neste formato, sem parênteses nas linhas dos títulos:

TÍTULO 1:
Sandália Feminina Salto Baixo Rasteirinha Confortável Numeração 34 ao 40

TÍTULO 2:
Rasteirinha Antiderrapante Ortopédica para Dor no Pé Feminina Bico Fino

TÍTULO 3:
Rasteirinha Verão Praia Casual Feminina Estilosa Leve Colorida

PALAVRAS-CHAVE:
[15 termos separados por vírgula, misturando cauda curta e longa]

DESCRIÇÃO:
[mínimo 400 caracteres, texto simples. Inclua material, conforto, ocasião, público, numeração, diferenciais e chamada para ação.]

SCORE SEO: [0-100] — [em 1 linha, qual dos 3 títulos tende a rankear melhor e por quê]`;
      try {
        const text = await apiFetch([{ role: "user", content: prompt }], 1000);
        setResultados(prev => ({ ...prev, [mpId]: text }));
        setMpViz(cur => cur || mpId);
      } catch (e) {
        setResultados(prev => ({ ...prev, [mpId]: "❌ " + mpNome(mpId) + ": " + e.message }));
        setMpViz(cur => cur || mpId);
      }
    }
    setIaLoading(false);
  };

  const IMG_SLOTS = [
    { label: "Principal", get: imgPrincipal, ref: refPrinc, on: f => setImg(f, "principal"), clear: () => setImgPrincipal(null) },
    { label: "Ângulo 2", get: imgsAdic[0], ref: refsAdic[0], on: f => setImg(f, 0), clear: () => setImgsAdic(p => { const u = [...p]; u[0] = null; return u; }) },
    { label: "Detalhe", get: imgsAdic[1], ref: refsAdic[1], on: f => setImg(f, 1), clear: () => setImgsAdic(p => { const u = [...p]; u[1] = null; return u; }) },
    { label: "Sola/Extra", get: imgsAdic[2], ref: refsAdic[2], on: f => setImg(f, 2), clear: () => setImgsAdic(p => { const u = [...p]; u[2] = null; return u; }) },
  ];

  const IaResult = () => {
    if (iaLoading && !Object.keys(resultados).length) return <Card style={{ textAlign: "center", padding: "32px 20px" }}><div className="gap-muted">IA processando…</div></Card>;
    if (!iaResult) return null;
    return (
      <Card>
        <div className="gap-row-between" style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Resultado</span>
          <div className="gap-row" style={{ gap: 6 }}>
            <CopyBtn text={iaResult} />
            <button className="gap-btn-ghost" style={{ fontSize: 12 }} onClick={() => setIaResult("")}>Limpar</button>
          </div>
        </div>
        <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.6, color: "#333" }}>{iaResult}</div>
      </Card>
    );
  };

  return (
    <>
      <Topbar title="Anúncios IA" salvando={salvando} onMenu={onMenu} />
      <div className="gap-content">
        <div className="gap-stack" style={{ maxWidth: 820 }}>

          <SubTabs tabs={TABS} active={tab} onChange={(t) => { setTab(t); setIaResult(""); }} />

          {/* Ficha do produto + fotos */}
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <button className="gap-btn-ghost" style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", fontSize: 13.5, fontWeight: 500 }} onClick={() => setFichaAberta(v => !v)}>
              <span>Ficha do produto {totalImgs > 0 && <span style={{ fontSize: 11, color: "#16A34A", marginLeft: 6 }}>· {totalImgs} foto(s)</span>}</span>
              <span className="gap-muted">{fichaAberta ? "▲ recolher" : "▼ preencher"}</span>
            </button>
            {fichaAberta && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid #EBEBEB" }}>
                <div className="gap-section-label" style={{ marginTop: 14 }}>Fotos (até 4 — a IA analisa todas)</div>
                <div className="gap-grid-4">
                  {IMG_SLOTS.map((s, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <div onClick={() => s.ref.current?.click()} style={{ aspectRatio: "1", borderRadius: 10, cursor: "pointer", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", border: s.get ? "2px solid #BFDBFE" : "2px dashed #E5E7EB", background: s.get ? "transparent" : "#FAFAF8" }}>
                        {s.get ? <img src={s.get.preview} alt={s.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ textAlign: "center", color: "#CBD5E1" }}><div style={{ fontSize: 22 }}>{i === 0 ? "📷" : "+"}</div><div style={{ fontSize: 10.5, marginTop: 2 }}>{s.label}</div></div>}
                      </div>
                      {s.get && <button onClick={() => s.clear()} style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "#EF4444", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, lineHeight: 1 }}>×</button>}
                      <input ref={s.ref} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { s.on(e.target.files?.[0]); e.target.value = ""; }} />
                    </div>
                  ))}
                </div>
                <div className="gap-grid-2" style={{ marginTop: 14 }}>
                  {FICHA_FIELDS.map(fd => (
                    <div key={fd.key}><label className="gap-label">{fd.label}</label><input className="gap-input" value={fichaProduto[fd.key] || ""} onChange={e => updateFicha(fd.key, e.target.value)} placeholder={fd.ph} /></div>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}><label className="gap-label">Diferenciais</label><input className="gap-input" value={fichaProduto.diferenciais || ""} onChange={e => updateFicha("diferenciais", e.target.value)} placeholder="Solado antiderrapante, palmilha anatômica..." /></div>
                <div style={{ marginTop: 12 }}><label className="gap-label">Informações extras</label><textarea className="gap-input" rows={2} style={{ resize: "vertical" }} value={fichaProduto.extra || ""} onChange={e => updateFicha("extra", e.target.value)} placeholder="Certificações, peso, uso ideal..." /></div>
              </div>
            )}
          </Card>

          {/* Seletor de MP para as sub-ferramentas */}
          {tab !== "gerador" && tab !== "sazonalidade" && (
            <div className="gap-row" style={{ flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <span className="gap-muted">Marketplace:</span>
              {mpsAtivos.map(mp => (
                <button key={mp.id} onClick={() => setMpAtivo(mp.id)} className={`gap-btn-${mpAtivo === mp.id ? "primary" : "secondary"}`} style={{ fontSize: 12, padding: "5px 12px" }}>{mp.name}</button>
              ))}
            </div>
          )}

          {/* GERADOR */}
          {tab === "gerador" && (
            <div className="gap-stack">
              <Card>
                <CardTitle>Gerador completo</CardTitle>
                <p className="gap-muted" style={{ marginBottom: 14 }}>3 títulos sem emoji + palavras-chave + descrição limpa, pronto pra colar.</p>
                <div className="gap-section-label">Gerar para</div>
                <div className="gap-row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                  {mpsAtivos.map(mp => (
                    <button key={mp.id} onClick={() => setMpsGerador(p => p.includes(mp.id) ? p.filter(x => x !== mp.id) : [...p, mp.id])}
                      style={{ fontSize: 12, padding: "7px 14px", borderRadius: 20, cursor: "pointer", fontWeight: 600, border: mpsGerador.includes(mp.id) ? "1.5px solid transparent" : "1.5px solid #E5E7EB", background: mpsGerador.includes(mp.id) ? mp.color : "#fff", color: mpsGerador.includes(mp.id) ? mp.tc : "#555" }}>{mp.name}</button>
                  ))}
                </div>
                <button className="gap-btn-primary" style={{ width: "100%", padding: "12px" }} disabled={iaLoading || mpsGerador.length === 0} onClick={gerarAnuncioCompleto}>
                  {iaLoading ? "Gerando..." : "⚡ Gerar anúncios"}
                </button>
              </Card>

              {Object.keys(resultados).length > 0 && (
                <Card style={{ padding: 0, overflow: "hidden" }}>
                  <div className="gap-row" style={{ borderBottom: "1px solid #EBEBEB", overflowX: "auto" }}>
                    {Object.keys(resultados).map(mpId => (
                      <button key={mpId} onClick={() => setMpViz(mpId)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 16px", fontSize: 13, fontWeight: 500, flexShrink: 0, cursor: "pointer", background: "none", border: "none", borderBottom: `2px solid ${mpViz === mpId ? "#0D0D0F" : "transparent"}`, color: mpViz === mpId ? "#0D0D0F" : "#888" }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: mps.find(m => m.id === mpId)?.color || "#999" }} />{mpNome(mpId)}
                      </button>
                    ))}
                  </div>
                  {mpViz && resultados[mpViz] && (() => {
                    const p = parseAnuncio(resultados[mpViz]);
                    if (p.titulos.length === 0 && !p.descricao) return <div style={{ padding: 18 }}><div className="gap-row-between" style={{ marginBottom: 10 }}><span /><CopyBtn text={p.raw} /></div><div style={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}>{p.raw}</div></div>;
                    return (
                      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
                        {p.titulos.length > 0 && (
                          <div>
                            <div className="gap-section-label">Títulos — sem emoji, prontos pra colar</div>
                            <div className="gap-stack" style={{ gap: 8 }}>
                              {p.titulos.map((t, i) => (
                                <div key={i} className="gap-row" style={{ alignItems: "flex-start", gap: 8, background: "#F0F4FF", borderRadius: 10, padding: "10px 12px", border: "1px solid #DBEAFE" }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#2563EB", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500, lineHeight: 1.4 }}>{t}</span>
                                  <CopyBtn text={t} label="Copiar" />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {p.palavrasChave && (<div><div className="gap-row-between" style={{ marginBottom: 6 }}><div className="gap-section-label" style={{ margin: 0 }}>Palavras-chave</div><CopyBtn text={p.palavrasChave} /></div><div style={{ background: "#F5F5F3", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#333" }}>{p.palavrasChave}</div></div>)}
                        {p.descricao && (<div><div className="gap-row-between" style={{ marginBottom: 6 }}><div className="gap-section-label" style={{ margin: 0 }}>Descrição — texto limpo</div><CopyBtn text={p.descricao} /></div><div style={{ background: "#F5F5F3", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#333", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{p.descricao}</div></div>)}
                        {p.score && <div style={{ background: "#F0FDF4", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 500, color: "#15803D" }}>Score SEO: {p.score}</div>}
                        <div className="gap-row" style={{ justifyContent: "flex-end", paddingTop: 6, borderTop: "1px solid #EBEBEB" }}>
                          <CopyBtn text={[...p.titulos, p.palavrasChave, p.descricao].filter(Boolean).join("\n\n")} label="Copiar tudo" />
                        </div>
                      </div>
                    );
                  })()}
                </Card>
              )}
            </div>
          )}

          {/* SCORE */}
          {tab === "score" && (
            <Card>
              <CardTitle>Score de ranqueamento</CardTitle>
              <p className="gap-muted" style={{ marginBottom: 12 }}>Descubra por que seu título não está na primeira página.</p>
              <label className="gap-label">Título</label>
              <input className="gap-input" style={{ marginBottom: 12 }} value={tituloScore} onChange={e => setTituloScore(e.target.value)} placeholder="Cole seu título aqui..." />
              <button className="gap-btn-primary" disabled={iaLoading || !tituloScore.trim()} onClick={() => runIA(`Analise o score de ranqueamento deste título para ${mpNome(mpAtivo)}:\n\n"${tituloScore}"${contextoFicha()}\n\n1. SCORE (0-100)\n2. SCORE POR CRITÉRIO\n3. TOP 3 PROBLEMAS\n4. TOP 3 AÇÕES\n5. TÍTULO REESCRITO (sem emojis)`)}>{iaLoading ? "Analisando..." : "Analisar score"}</button>
            </Card>
          )}

          {/* TÍTULO */}
          {tab === "titulo" && (
            <Card>
              <CardTitle>Análise de título</CardTitle>
              <label className="gap-label">Seu título</label>
              <textarea className="gap-input" rows={2} style={{ resize: "vertical", marginBottom: 10 }} value={tituloMeu} onChange={e => setTituloMeu(e.target.value)} placeholder="Cole seu título..." />
              <label className="gap-label">Concorrente (opcional)</label>
              <textarea className="gap-input" rows={2} style={{ resize: "vertical", marginBottom: 12 }} value={tituloConc} onChange={e => setTituloConc(e.target.value)} />
              <button className="gap-btn-primary" disabled={iaLoading || !tituloMeu.trim()} onClick={() => runIA(`Analise o título para ${mpNome(mpAtivo)}:\n\n"${tituloMeu}"${tituloConc ? `\n\nConcorrente: "${tituloConc}"` : ""}${contextoFicha()}\n\n1. SCORE\n2. PONTOS FORTES\n3. MELHORIAS\n4. TÍTULO OTIMIZADO (sem emojis)\n5. TOP 10 PALAVRAS-CHAVE`)}>{iaLoading ? "Analisando..." : "Analisar"}</button>
            </Card>
          )}

          {/* DESCRIÇÃO */}
          {tab === "descricao" && (
            <Card>
              <CardTitle>Descrição</CardTitle>
              <label className="gap-label">Descrição atual (vazio = gerar do zero)</label>
              <textarea className="gap-input" rows={4} style={{ resize: "vertical", marginBottom: 10 }} value={descAtual} onChange={e => setDescAtual(e.target.value)} />
              <label className="gap-label">Concorrente (opcional)</label>
              <textarea className="gap-input" rows={3} style={{ resize: "vertical", marginBottom: 12 }} value={descConc} onChange={e => setDescConc(e.target.value)} />
              <button className="gap-btn-primary" disabled={iaLoading} onClick={() => runIA(`Crie uma descrição para ${mpNome(mpAtivo)}. Texto simples, sem asteriscos nem markdown.${contextoFicha()}${descAtual ? "\n\nDescrição atual: " + descAtual : ""}${descConc ? "\n\nConcorrente: " + descConc : ""}\n\nMáximo 2000 caracteres. Inclua: abertura, materiais, benefícios, numeração e chamada para ação.`)}>{iaLoading ? "Gerando..." : descAtual ? "Otimizar" : "Gerar do zero"}</button>
            </Card>
          )}

          {/* PALAVRAS-CHAVE */}
          {tab === "palavras" && (
            <Card>
              <CardTitle>Palavras-chave</CardTitle>
              <label className="gap-label">Produto</label>
              <input className="gap-input" style={{ marginBottom: 12 }} value={produtoKw} onChange={e => setProdutoKw(e.target.value)} placeholder="Ex: Tênis masculino social couro" />
              <button className="gap-btn-primary" disabled={iaLoading || (!produtoKw.trim() && !fichaProduto.nome)} onClick={() => runIA(`Gere palavras-chave para "${produtoKw || fichaProduto.nome}" no ${mpNome(mpAtivo)}.${contextoFicha()}\n\n1. PRINCIPAIS\n2. CAUDA LONGA\n3. ESTILO/MARCA\n4. VARIAÇÕES\n5. SAZONAIS\n\nMínimo 40 termos.`)}>{iaLoading ? "Gerando..." : "Gerar palavras-chave"}</button>
            </Card>
          )}

          {/* A/B */}
          {tab === "ab" && (
            <Card>
              <CardTitle>Teste A/B de títulos</CardTitle>
              <div className="gap-stack">
                <div style={{ background: "#EFF6FF", border: "1px solid #DBEAFE", borderRadius: 10, padding: 12 }}>
                  <label className="gap-label">Título A</label>
                  <textarea className="gap-input" rows={2} style={{ resize: "vertical", marginBottom: 8 }} value={ab.a} onChange={e => setAb(p => ({ ...p, a: e.target.value }))} />
                  <div className="gap-grid-2">
                    <div><label className="gap-label">Visitas A</label><input type="number" className="gap-input" value={ab.va} onChange={e => setAb(p => ({ ...p, va: e.target.value }))} /></div>
                    <div><label className="gap-label">Vendas A</label><input type="number" className="gap-input" value={ab.sa} onChange={e => setAb(p => ({ ...p, sa: e.target.value }))} /></div>
                  </div>
                </div>
                <div style={{ background: "#F5F3FF", border: "1px solid #E9D5FF", borderRadius: 10, padding: 12 }}>
                  <label className="gap-label">Título B</label>
                  <textarea className="gap-input" rows={2} style={{ resize: "vertical", marginBottom: 8 }} value={ab.b} onChange={e => setAb(p => ({ ...p, b: e.target.value }))} />
                  <div className="gap-grid-2">
                    <div><label className="gap-label">Visitas B</label><input type="number" className="gap-input" value={ab.vb} onChange={e => setAb(p => ({ ...p, vb: e.target.value }))} /></div>
                    <div><label className="gap-label">Vendas B</label><input type="number" className="gap-input" value={ab.sb} onChange={e => setAb(p => ({ ...p, sb: e.target.value }))} /></div>
                  </div>
                </div>
                <button className="gap-btn-primary" disabled={iaLoading || !ab.a || !ab.b} onClick={() => runIA(`Teste A/B de títulos:\nA: "${ab.a}" — visitas ${ab.va || 0}, vendas ${ab.sa || 0}\nB: "${ab.b}" — visitas ${ab.vb || 0}, vendas ${ab.sb || 0}\n\n1. VENCEDOR\n2. ANÁLISE\n3. TÍTULO OTIMIZADO`)}>{iaLoading ? "Analisando..." : "Analisar A/B"}</button>
              </div>
            </Card>
          )}

          {/* IMAGENS */}
          {tab === "imagens" && (
            <Card>
              <div className="gap-row-between" style={{ marginBottom: 12 }}>
                <CardTitle>Checklist de imagens</CardTitle>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{scoreChecklist}/{CHECKLIST_IMAGENS.length}</span>
              </div>
              <div className="gap-progress-track" style={{ marginBottom: 14 }}><div className="gap-progress-fill" style={{ width: (scoreChecklist / CHECKLIST_IMAGENS.length * 100) + "%" }} /></div>
              <div className="gap-stack" style={{ gap: 6, marginBottom: 14 }}>
                {CHECKLIST_IMAGENS.map(item => (
                  <label key={item.id} className="gap-row" style={{ gap: 10, alignItems: "flex-start", padding: "9px 11px", borderRadius: 8, cursor: "pointer", background: checklist[item.id] ? "#F0FDF4" : "#FAFAF8", border: `1px solid ${checklist[item.id] ? "#BBF7D0" : "#EBEBEB"}` }}>
                    <input type="checkbox" checked={!!checklist[item.id]} onChange={e => setChecklist(p => ({ ...p, [item.id]: e.target.checked }))} style={{ accentColor: "#16A34A", marginTop: 2 }} />
                    <span style={{ fontSize: 13, color: "#333" }}>{item.label}</span>
                  </label>
                ))}
              </div>
              <button className="gap-btn-primary" disabled={iaLoading} onClick={() => runIA(`Análise de imagens para ${mpNome(mpAtivo)}.\nPresente: ${CHECKLIST_IMAGENS.filter(i => checklist[i.id]).map(i => i.label).join(", ") || "nada"}\nFaltando: ${CHECKLIST_IMAGENS.filter(i => !checklist[i.id]).map(i => i.label).join(", ") || "nada"}\nScore: ${scoreChecklist}/${CHECKLIST_IMAGENS.length}\n\n1. DIAGNÓSTICO\n2. PRIORIDADE\n3. DICAS PRÁTICAS\n4. IMPACTO NA CONVERSÃO`)}>{iaLoading ? "Analisando..." : "Analisar com IA"}</button>
            </Card>
          )}

          {/* SAZONALIDADE */}
          {tab === "sazonalidade" && (
            <div className="gap-stack">
              {SAZONALIDADE.map(s => {
                const atual = s.mes === String(new Date().getMonth() + 1).padStart(2, "0");
                return (
                  <Card key={s.mes} style={atual ? { border: "1.5px solid #F59E0B" } : {}}>
                    <div className="gap-row" style={{ gap: 10, marginBottom: 10, alignItems: "center" }}>
                      <div style={{ width: 38, height: 38, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, background: atual ? "#F59E0B" : "#F5F5F3", color: atual ? "#fff" : "#666" }}>{MESES[Number(s.mes) - 1]}</div>
                      {atual && <span style={{ fontSize: 11, fontWeight: 700, color: "#B45309", background: "#FEF3C7", padding: "3px 9px", borderRadius: 20 }}>MÊS ATUAL</span>}
                    </div>
                    {s.eventos.map((ev, i) => (
                      <div key={i} className="gap-row" style={{ gap: 8, marginBottom: 4, alignItems: "flex-start" }}>
                        <span style={{ flexShrink: 0 }}>🎯</span>
                        <div><div style={{ fontSize: 13, fontWeight: 500 }}>{ev.nome}</div><div className="gap-muted">{ev.dica}</div></div>
                      </div>
                    ))}
                  </Card>
                );
              })}
            </div>
          )}

          {["score", "titulo", "descricao", "palavras", "ab", "imagens"].includes(tab) && <IaResult />}

        </div>
      </div>
    </>
  );
}
