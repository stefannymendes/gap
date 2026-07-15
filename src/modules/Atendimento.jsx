import { useState } from "react";
import { useGap } from "../lib/store";
import { Topbar, Card, CardTitle, CopyBtn, EmptyState } from "../lib/ui";
import { apiFetch } from "../lib/api";

// Tons de voz disponíveis para a resposta.
const TONS = [
  { id: "cordial",  label: "Cordial",  desc: "simpático e acolhedor" },
  { id: "objetivo", label: "Objetivo", desc: "direto e enxuto" },
  { id: "empatico", label: "Empático", desc: "atencioso, para clientes chateados" },
  { id: "formal",   label: "Formal",   desc: "profissional e sóbrio" },
];

// Situações comuns — atalhos que orientam a IA. Não são obrigatórios.
const SITUACOES = [
  { id: "duvida",     label: "Dúvida sobre produto" },
  { id: "prazo",      label: "Prazo de entrega" },
  { id: "rastreio",   label: "Rastreamento / onde está" },
  { id: "atraso",     label: "Pedido atrasado" },
  { id: "troca",      label: "Troca / devolução" },
  { id: "defeito",    label: "Produto com defeito" },
  { id: "numeracao",  label: "Numeração / tamanho" },
  { id: "desconto",   label: "Pedindo desconto" },
  { id: "avaliacao",  label: "Pós-venda / avaliação" },
  { id: "reclamacao", label: "Reclamação" },
];

// Ajustes rápidos aplicados sobre a última resposta gerada.
const AJUSTES = [
  { id: "curta",     label: "Mais curta",     instru: "Encurte bastante a resposta, mantendo o essencial." },
  { id: "calorosa",  label: "Mais calorosa",  instru: "Deixe a resposta mais calorosa e simpática, com um toque humano." },
  { id: "formal",    label: "Mais formal",    instru: "Deixe a resposta mais formal e profissional." },
  { id: "emoji",     label: "Com emoji",      instru: "Adicione 1 ou 2 emojis discretos e adequados." },
  { id: "sememoji",  label: "Sem emoji",      instru: "Remova todos os emojis." },
  { id: "desculpa",  label: "Pedir desculpa", instru: "Comece reconhecendo o problema e pedindo desculpas de forma sincera." },
];

const CFG_FIELDS = [
  { key: "loja",         label: "Nome da loja",          ph: "Ex: Xereta Calçados",        type: "input" },
  { key: "prazoEnvio",   label: "Prazo de envio/entrega", ph: "Ex: envio em 1-2 dias úteis, entrega em 5-10 dias", type: "input" },
  { key: "politicaTroca", label: "Política de troca/devolução", ph: "Ex: troca em até 7 dias, produto sem uso", type: "textarea" },
  { key: "assinatura",   label: "Assinatura (opcional)",  ph: "Ex: Equipe Xereta 💙",        type: "input" },
  { key: "observacoes",  label: "Observações para a IA",  ph: "Ex: sempre oferecer cupom de 5% em reclamações", type: "textarea" },
];

export default function Atendimento({ onMenu }) {
  const { atendimentoConfig, setAtendimentoConfig, salvando } = useGap();
  const cfg = atendimentoConfig;

  const [cfgAberta, setCfgAberta] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [situacao, setSituacao] = useState("");
  const [tom, setTom] = useState(cfg.tom || "cordial");
  const [loading, setLoading] = useState(false);
  const [resposta, setResposta] = useState("");
  const [erro, setErro] = useState("");

  const updateCfg = (k, v) => setAtendimentoConfig(prev => ({ ...prev, [k]: v }));

  const contextoLoja = () => {
    const p = [];
    if (cfg.loja) p.push("Loja: " + cfg.loja);
    if (cfg.prazoEnvio) p.push("Prazo de envio/entrega: " + cfg.prazoEnvio);
    if (cfg.politicaTroca) p.push("Política de troca/devolução: " + cfg.politicaTroca);
    if (cfg.observacoes) p.push("Observações internas: " + cfg.observacoes);
    return p.length ? "\n\nCONTEXTO DA LOJA:\n" + p.join("\n") : "";
  };

  const systemPrompt = `Você é um atendente experiente de uma loja de calçados em marketplaces brasileiros (Shopee, Mercado Livre, etc.). Sua tarefa é escrever a MENSAGEM DE RESPOSTA pronta para o vendedor copiar e colar direto para o cliente.

Regras OBRIGATÓRIAS:
- Escreva em português do Brasil, no tom ${TONS.find(t => t.id === tom)?.desc || "cordial"}.
- Fale DIRETAMENTE com o cliente (como se já fosse a mensagem enviada). NÃO explique o que você fez, NÃO use rótulos, NÃO use aspas, NÃO use markdown, asteriscos ou títulos.
- Seja claro, resolva ou encaminhe a questão, e passe segurança.
- Nunca invente dados que você não tem (código de rastreio, datas exatas, valores). Se faltar informação, peça de forma educada ou oriente o próximo passo.
- Tamanho adequado ao WhatsApp/chat do marketplace: curto e escaneável.
${cfg.assinatura ? `- Finalize com a assinatura: "${cfg.assinatura}".` : "- Não invente assinatura da loja."}
- Responda APENAS com o texto da mensagem, nada além disso.`;

  const gerar = async (extraInstru = "", base = "") => {
    if (!mensagem.trim() && !base) { setErro("Cole a mensagem do cliente primeiro."); return; }
    setLoading(true); setErro("");
    const sit = SITUACOES.find(s => s.id === situacao);
    const userMsg = base
      ? `Aqui está uma resposta que você já escreveu:\n\n"${base}"\n\n${extraInstru}\n\nReescreva a mensagem inteira aplicando o ajuste. Responda apenas com o novo texto da mensagem.`
      : `Mensagem recebida do cliente:\n\n"${mensagem.trim()}"${sit ? `\n\nAssunto: ${sit.label}.` : ""}${contextoLoja()}\n\nEscreva a resposta pronta para enviar ao cliente.`;
    try {
      const out = await apiFetch([{ role: "user", content: userMsg }], 700, systemPrompt);
      setResposta(out.trim());
    } catch (e) { setErro(e.message); }
    setLoading(false);
  };

  const limpar = () => { setMensagem(""); setResposta(""); setSituacao(""); setErro(""); };

  return (
    <>
      <Topbar title="Atendimento IA" salvando={salvando} onMenu={onMenu} />
      <div className="gap-content">
        <div className="gap-stack" style={{ maxWidth: 760 }}>

          {/* Contexto da loja (persistido) */}
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <button className="gap-btn-ghost" style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", fontSize: 13.5, fontWeight: 500 }} onClick={() => setCfgAberta(v => !v)}>
              <span>Contexto da loja {cfg.loja && <span style={{ fontSize: 11, color: "#16A34A", marginLeft: 6 }}>· {cfg.loja}</span>}</span>
              <span className="gap-muted">{cfgAberta ? "▲ recolher" : "▼ configurar"}</span>
            </button>
            {cfgAberta && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid #EBEBEB" }}>
                <p className="gap-muted" style={{ margin: "12px 0 14px" }}>Preencha uma vez — a IA usa esses dados para respostas mais precisas (prazo, troca, assinatura). Fica salvo.</p>
                {CFG_FIELDS.map(fd => (
                  <div key={fd.key} style={{ marginBottom: 12 }}>
                    <label className="gap-label">{fd.label}</label>
                    {fd.type === "textarea"
                      ? <textarea className="gap-input" rows={2} style={{ resize: "vertical" }} value={cfg[fd.key] || ""} onChange={e => updateCfg(fd.key, e.target.value)} placeholder={fd.ph} />
                      : <input className="gap-input" value={cfg[fd.key] || ""} onChange={e => updateCfg(fd.key, e.target.value)} placeholder={fd.ph} />}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Mensagem do cliente */}
          <Card>
            <CardTitle>Mensagem do cliente</CardTitle>
            <textarea
              className="gap-input"
              rows={4}
              style={{ resize: "vertical", marginBottom: 12 }}
              value={mensagem}
              onChange={e => setMensagem(e.target.value)}
              placeholder="Cole aqui a mensagem que o cliente enviou..."
            />

            <div className="gap-section-label">Assunto (opcional)</div>
            <div className="gap-row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {SITUACOES.map(s => (
                <button key={s.id} onClick={() => setSituacao(cur => cur === s.id ? "" : s.id)}
                  style={{ fontSize: 12, padding: "6px 12px", borderRadius: 20, cursor: "pointer", fontWeight: 500, border: situacao === s.id ? "1.5px solid #2563EB" : "1.5px solid #E5E7EB", background: situacao === s.id ? "#EFF6FF" : "#fff", color: situacao === s.id ? "#1D4ED8" : "#555" }}>{s.label}</button>
              ))}
            </div>

            <div className="gap-section-label">Tom da resposta</div>
            <div className="gap-row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {TONS.map(t => (
                <button key={t.id} onClick={() => setTom(t.id)}
                  style={{ fontSize: 12, padding: "6px 12px", borderRadius: 20, cursor: "pointer", fontWeight: 600, border: tom === t.id ? "1.5px solid transparent" : "1.5px solid #E5E7EB", background: tom === t.id ? "#0D0D0F" : "#fff", color: tom === t.id ? "#fff" : "#555" }}>{t.label}</button>
              ))}
            </div>

            <div className="gap-row" style={{ gap: 8 }}>
              <button className="gap-btn-primary" style={{ flex: 1, padding: "12px" }} disabled={loading || !mensagem.trim()} onClick={() => gerar()}>
                {loading ? "Gerando..." : "⚡ Gerar resposta"}
              </button>
              {(mensagem || resposta) && <button className="gap-btn-secondary" style={{ padding: "12px 16px" }} onClick={limpar}>Limpar</button>}
            </div>
            {erro && <p style={{ color: "#DC2626", fontSize: 12.5, marginTop: 10 }}>❌ {erro}</p>}
          </Card>

          {/* Resposta pronta */}
          {loading && !resposta && (
            <Card style={{ textAlign: "center", padding: "32px 20px" }}><div className="gap-muted">IA escrevendo a resposta…</div></Card>
          )}

          {resposta && (
            <Card>
              <div className="gap-row-between" style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Resposta pronta</span>
                <CopyBtn text={resposta} label="Copiar mensagem" />
              </div>
              <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: "14px 16px", fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.6, color: "#1F2937" }}>{resposta}</div>

              <div className="gap-section-label" style={{ marginTop: 16 }}>Ajustar</div>
              <div className="gap-row" style={{ flexWrap: "wrap", gap: 6 }}>
                {AJUSTES.map(a => (
                  <button key={a.id} disabled={loading} onClick={() => gerar(a.instru, resposta)}
                    style={{ fontSize: 12, padding: "6px 12px", borderRadius: 20, cursor: loading ? "default" : "pointer", fontWeight: 500, border: "1.5px solid #E5E7EB", background: "#fff", color: "#555", opacity: loading ? 0.5 : 1 }}>{a.label}</button>
                ))}
              </div>
            </Card>
          )}

          {!mensagem && !resposta && !loading && (
            <EmptyState icon="💬" title="Responda clientes em segundos" desc="Cole a mensagem do cliente, escolha o tom e receba uma resposta pronta para copiar e colar no chat do marketplace." />
          )}

        </div>
      </div>
    </>
  );
}
