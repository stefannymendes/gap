import { useState } from "react";
import { useGap } from "../lib/store";
import { Topbar, Card, CardTitle, NumInput } from "../lib/ui";
import { apiFetch } from "../lib/api";
import { SAZONALIDADE, MESES } from "../lib/constants";
import { mesNumeral } from "../lib/utils";

export default function Metas({ onMenu }) {
  const { metaDiaria, setMetaDiaria, metaPrazo, setMetaPrazo, metaContexto, setMetaContexto,
          ultimaAnalise, setUltimaAnalise, pedidos, tarefas, setTarefas, salvando } = useGap();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // ── Média diária a partir dos pedidos importados (sessão) ──
  const meses = [...new Set(pedidos.map(p => p.mesCriacao).filter(Boolean))].sort().reverse();
  const mesBase = meses[0] || null;
  const pedidosBase = mesBase ? pedidos.filter(p => p.mesCriacao === mesBase && !p.cancelado) : [];
  const ordersDistintas = new Set(pedidosBase.map(p => p.id)).size;
  const diasDistintos = new Set(pedidosBase.map(p => (p.dataCriacao || "").slice(0, 10)).filter(Boolean)).size;
  const mediaDiaria = diasDistintos > 0 ? ordersDistintas / diasDistintos : 0;

  const gap = metaDiaria - mediaDiaria;
  const pct = mediaDiaria > 0 ? Math.min(100, (mediaDiaria / metaDiaria) * 100) : 0;
  const diasRestantes = metaPrazo ? Math.ceil((new Date(metaPrazo) - new Date()) / 86400000) : null;
  const labelBase = mesBase ? `${MESES[Number(mesBase.split("-")[1]) - 1]}/${mesBase.split("-")[0]}` : "";

  const gerarTarefasIA = async () => {
    if (pedidos.length === 0) { setMsg("Importe os pedidos no Financeiro primeiro."); return; }
    setLoading(true); setMsg("");
    try {
      const skuMap = {};
      pedidosBase.forEach(p => { const k = p.prefixoSKU || p.sku; if (!k) return; skuMap[k] = (skuMap[k] || 0) + p.quantidade; });
      const topSKUs = Object.entries(skuMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([s, q]) => `${s}:${q}`).join(", ");
      const sazAtual = (SAZONALIDADE.find(s => s.mes === mesNumeral())?.eventos || []).map(e => e.nome).join(", ");
      const proxMes = String((Number(mesNumeral()) % 12) + 1).padStart(2, "0");
      const sazProx = (SAZONALIDADE.find(s => s.mes === proxMes)?.eventos || []).map(e => e.nome).join(", ");
      const abertas = tarefas.filter(t => !t.concluida).map(t => t.titulo).slice(0, 10).join("; ");
      const prompt = `Você é consultor de crescimento em marketplaces de calçados (Shopee Brasil).

META: ${metaDiaria} pedidos/dia
ATUAL: ${mediaDiaria.toFixed(1)} pedidos/dia (base ${labelBase || "sem dados"})
GAP: faltam ${gap > 0 ? gap.toFixed(1) : 0}/dia${diasRestantes != null ? ` | prazo em ${diasRestantes} dias` : ""}
${metaContexto ? `CONTEXTO: ${metaContexto}` : ""}
TOP SKUs do período: ${topSKUs || "sem dados"}
SAZONALIDADE deste mês: ${sazAtual || "-"}
PRÓXIMO MÊS: ${sazProx || "-"}
TAREFAS JÁ ABERTAS: ${abertas || "nenhuma"}

Gere de 5 a 8 tarefas ESPECÍFICAS e ACIONÁVEIS para fechar o gap, sem repetir as já abertas.
Responda SOMENTE com um array JSON válido, sem texto fora dele:
[{"titulo":"...","descricao":"...","prioridade":"urgente|alta|media|baixa","categoria":"Anúncios|Estoque|Preços|Atendimento|Logística|Financeiro|Marketing|Outros","marketplace":"todas"}]`;
      const raw = await apiFetch([{ role: "user", content: prompt }], 1100);
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("A IA não devolveu no formato esperado. Tente de novo.");
      const geradas = JSON.parse(match[0]);
      const novas = geradas.map(t => ({
        titulo: t.titulo || "Tarefa", descricao: t.descricao || "",
        prioridade: ["urgente", "alta", "media", "baixa"].includes(t.prioridade) ? t.prioridade : "media",
        categoria: t.categoria || "Outros", marketplace: "todas",
        prazo: "", recorrente: false, id: Date.now() + Math.random(), concluida: false, criadaEm: Date.now(), geradoPorIA: true,
      }));
      setTarefas(p => [...novas, ...p]);
      setUltimaAnalise(new Date().toLocaleString("pt-BR"));
      setMsg(`${novas.length} tarefas criadas! Veja na aba Tarefas.`);
    } catch (e) {
      setMsg("Erro: " + e.message);
    }
    setLoading(false);
  };

  return (
    <>
      <Topbar title="Metas" salvando={salvando} onMenu={onMenu} />
      <div className="gap-content">
        <div className="gap-stack" style={{ maxWidth: 640 }}>

          <div style={{ background: "linear-gradient(135deg,#16A34A,#059669)", borderRadius: 16, padding: "22px 24px", color: "#fff" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", opacity: .8 }}>Meta diária de pedidos</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 4 }}>
              <span style={{ fontSize: 44, fontWeight: 700, lineHeight: 1 }}>{metaDiaria}</span>
              <span style={{ fontSize: 16, opacity: .8, marginBottom: 4 }}>pedidos/dia</span>
            </div>
            {mediaDiaria > 0 ? (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ opacity: .9 }}>Atual: <b>{mediaDiaria.toFixed(1)}/dia</b> ({labelBase})</span>
                  <span style={{ fontWeight: 600 }}>{pct.toFixed(0)}% da meta</span>
                </div>
                <div style={{ background: "rgba(255,255,255,.25)", borderRadius: 20, height: 10 }}>
                  <div style={{ width: pct + "%", height: 10, borderRadius: 20, background: "#fff", transition: "width .3s" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: .8, marginTop: 6 }}>
                  <span>Faltam <b>{gap > 0 ? gap.toFixed(1) : 0}/dia</b></span>
                  {diasRestantes != null && <span>{diasRestantes} dias restantes</span>}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 14, fontSize: 13, opacity: .85 }}>Importe os pedidos no Financeiro para acompanhar o progresso.</div>
            )}
          </div>

          <Card>
            <CardTitle>Configurar meta</CardTitle>
            <div className="gap-grid-2" style={{ marginBottom: 12 }}>
              <div><label className="gap-label">Pedidos/dia</label><NumInput prefix="#" value={metaDiaria} onChange={v => setMetaDiaria(Number(v) || 0)} step="1" /></div>
              <div><label className="gap-label">Prazo (opcional)</label><input type="date" className="gap-input" value={metaPrazo} onChange={e => setMetaPrazo(e.target.value)} /></div>
            </div>
            <label className="gap-label">Contexto para a IA (opcional)</label>
            <textarea className="gap-input" rows={2} style={{ resize: "vertical" }} value={metaContexto} onChange={e => setMetaContexto(e.target.value)} placeholder="Ex: acabei de ativar frete grátis, quero focar em sandálias..." />
          </Card>

          <Card>
            <CardTitle>Gerador de tarefas por IA</CardTitle>
            <p className="gap-muted" style={{ marginBottom: 12, lineHeight: 1.6 }}>
              A IA analisa seus pedidos do período, a sazonalidade do mês e suas tarefas abertas, e cria um plano de ação pra fechar o gap.
            </p>
            <div className="gap-alert gap-alert-info" style={{ marginBottom: 12 }}>
              <div className="gap-alert-dot dot-info" />
              <div className="gap-alert-desc">
                {pedidos.length > 0 ? "✓" : "○"} Pedidos importados ({pedidos.length})<br />
                ✓ Sazonalidade do mês<br />
                {metaContexto ? "✓ Contexto preenchido" : "○ Contexto (opcional)"}
              </div>
            </div>
            <button className="gap-btn-primary" disabled={loading || pedidos.length === 0} onClick={gerarTarefasIA}>
              {loading ? "Analisando..." : "Analisar e gerar tarefas"}
            </button>
            {pedidos.length === 0 && <p className="gap-muted" style={{ marginTop: 8 }}>Importe os pedidos no Financeiro primeiro.</p>}
            {msg && <p style={{ marginTop: 10, fontSize: 13, color: msg.startsWith("Erro") ? "#DC2626" : "#16A34A", fontWeight: 500 }}>{msg}</p>}
            {ultimaAnalise && <p className="gap-muted" style={{ marginTop: 8 }}>Última análise: {ultimaAnalise}</p>}
            <p className="gap-muted" style={{ marginTop: 10, fontSize: 11.5 }}>Obs: este botão usa IA — só funciona depois de publicar na Vercel com sua chave.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
