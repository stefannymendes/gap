import { useState, useRef, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useGap } from "../lib/store";
import { Topbar, Card, CardTitle, SubTabs, EmptyState, Badge, ConfirmButtons } from "../lib/ui";
import { apiFetch } from "../lib/api";
import { parseShopeeReport, TIPO_LABEL } from "../lib/shopeeParser";
import { fmt, fmtN } from "../lib/utils";

const RETENCAO_DIAS = 60;

// Limita histórico de anúncios/loja aos últimos N dias
function limparHistorico(analytics) {
  const limite = new Date();
  limite.setDate(limite.getDate() - RETENCAO_DIAS);
  const limiteStr = limite.toISOString().slice(0, 10);
  const novoLoja = {};
  Object.entries(analytics.lojaHistorico || {}).forEach(([d, v]) => { if (d >= limiteStr) novoLoja[d] = v; });
  const novoAnun = {};
  Object.entries(analytics.anuncios || {}).forEach(([id, a]) => {
    const impFiltradas = (a.importacoes || []).filter(i => i.data >= limiteStr);
    if (impFiltradas.length) novoAnun[id] = { ...a, importacoes: impFiltradas };
  });
  return { ...analytics, lojaHistorico: novoLoja, anuncios: novoAnun };
}

// Melhores horários (top 3 de vendas médias)
function melhoresHorarios(horas) {
  const mapa = {};
  horas.forEach(h => {
    if (!mapa[h.hora]) mapa[h.hora] = { hora: h.hora, vendas: 0, pedidos: 0, count: 0 };
    mapa[h.hora].vendas += h.vendas || 0;
    mapa[h.hora].pedidos += h.pedidos || 0;
    mapa[h.hora].count++;
  });
  const arr = Object.values(mapa).map(x => ({ hora: x.hora, vendas: x.vendas / x.count, pedidos: x.pedidos / x.count }));
  arr.sort((a, b) => b.vendas - a.vendas);
  return arr;
}

const rotuloHora = h => String(h).padStart(2, "0") + "h";

export default function Analytics({ onMenu }) {
  const { analyticsShopee, setAnalyticsShopee, logAlt, setLogAlt, mps, produtos, salvando } = useGap();
  const [tab, setTab] = useState("dia");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [importando, setImportando] = useState(false);
  const fileRef = useRef(null);

  // Ferramentas
  const [adSelecionado, setAdSelecionado] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [novoLog, setNovoLog] = useState({ data: "", tipo: "preco", descricao: "", adNome: "" });
  const [confirmDelLog, setConfirmDelLog] = useState(null);
  const [iaLoading, setIaLoading] = useState(false);
  const [iaResult, setIaResult] = useState("");

  const A = analyticsShopee || { lojaHistorico: {}, anuncios: {}, diagnostico: null, composicao: null };

  // ── Importação ────────────────────────────────────
  const handleImport = async (files) => {
    if (!files || !files.length) return;
    setImportando(true); setErro(""); setAviso("");
    let msgOk = [], msgErr = [];
    let novo = { ...A, lojaHistorico: { ...(A.lojaHistorico || {}) }, anuncios: { ...(A.anuncios || {}) } };

    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        const r = parseShopeeReport(buf);
        if (r.tipo === "erro" || r.tipo === "desconhecido") {
          msgErr.push(`${file.name}: ${r.erro || "não reconhecido"}`);
          continue;
        }
        if (r.tipo === "sales_overview" || r.tipo === "shop_stats" || r.tipo === "product_overview") {
          novo.lojaHistorico[r.data] = { ...(novo.lojaHistorico[r.data] || {}), [r.tipo]: r };
          msgOk.push(`${TIPO_LABEL[r.tipo]} — ${r.data}`);
        } else if (r.tipo === "product_performance") {
          const key = r.itemId;
          if (!novo.anuncios[key]) novo.anuncios[key] = { itemId: r.itemId, nome: r.nome, importacoes: [] };
          novo.anuncios[key].nome = r.nome || novo.anuncios[key].nome;
          // Substitui importação do mesmo dia se existir
          novo.anuncios[key].importacoes = novo.anuncios[key].importacoes.filter(i => i.data !== r.data);
          novo.anuncios[key].importacoes.push({
            data: r.data,
            dataImportacao: new Date().toISOString(),
            horas: r.horas,
            resumo: r.resumo,
            fontesTrafego: r.fontesTrafego,
          });
          novo.anuncios[key].importacoes.sort((a, b) => a.data.localeCompare(b.data));
          msgOk.push(`Performance — ${r.nome?.substring(0, 40)} — ${r.data}`);
        } else if (r.tipo === "product_traffic") {
          novo.trafficRanking = { data: new Date().toISOString().slice(0, 10), produtos: r.produtos };
          msgOk.push(`Tráfego do Produto — ${r.produtos.length} produtos`);
        } else if (r.tipo === "product_diagnostics") {
          novo.diagnostico = { dataImportacao: new Date().toISOString(), ...r };
          msgOk.push(`Diagnóstico do Produto`);
        } else if (r.tipo === "sales_composition") {
          novo.composicao = { dataImportacao: new Date().toISOString(), ...r };
          msgOk.push(`Composição de Vendas — ${r.data}`);
        } else {
          msgErr.push(`${file.name}: ${r.info || "não processado"}`);
        }
      } catch (e) {
        msgErr.push(`${file.name}: ${e.message}`);
      }
    }
    novo = limparHistorico(novo);
    setAnalyticsShopee(novo);
    setImportando(false);
    if (msgOk.length) setAviso(`Importado: ${msgOk.join(" · ")}`);
    if (msgErr.length) setErro(msgErr.join(" | "));
  };

  const diasLoja = Object.keys(A.lojaHistorico || {}).sort().reverse();
  const anunciosLista = Object.values(A.anuncios || {}).sort((a, b) => (b.importacoes.slice(-1)[0]?.resumo?.vendas || 0) - (a.importacoes.slice(-1)[0]?.resumo?.vendas || 0));
  const temAlgo = diasLoja.length > 0 || anunciosLista.length > 0 || A.diagnostico || A.composicao;

  return (
    <>
      <Topbar title="Analista IA" salvando={salvando} onMenu={onMenu}
        action={
          <label className="gap-btn-primary" style={{ fontSize: 12, padding: "7px 14px", cursor: "pointer" }}>
            {importando ? "Importando..." : "+ Importar relatório"}
            <input ref={fileRef} type="file" accept=".xlsx" multiple style={{ display: "none" }}
              disabled={importando}
              onChange={e => { handleImport(Array.from(e.target.files || [])); e.target.value = ""; }} />
          </label>
        } />

      <div className="gap-content">
        <div className="gap-stack" style={{ maxWidth: 900 }}>

          <SubTabs tabs={[
            { id: "dia", label: "Dia (Loja)" },
            { id: "anuncios", label: `Anúncios${anunciosLista.length ? ` (${anunciosLista.length})` : ""}` },
            { id: "diagnostico", label: "Diagnóstico" },
            { id: "ia", label: "Análise IA" },
          ]} active={tab} onChange={setTab} />

          {aviso && (
            <div className="gap-alert" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
              <div className="gap-alert-dot dot-success" />
              <div><div className="gap-alert-desc" style={{ color: "#15803D" }}>{aviso}</div></div>
            </div>
          )}
          {erro && (
            <div className="gap-alert gap-alert-warn">
              <div className="gap-alert-dot dot-danger" />
              <div><div className="gap-alert-desc" style={{ color: "#B91C1C" }}>{erro}</div></div>
            </div>
          )}

          {!temAlgo && !importando && (
            <Card>
              <div className="gap-empty" style={{ padding: "40px 20px" }}>
                <div className="gap-empty-icon">📊</div>
                <p className="gap-empty-title">Sem relatórios importados ainda</p>
                <p className="gap-empty-desc" style={{ maxWidth: 500, margin: "0 auto" }}>
                  Exporte os relatórios da Shopee (Sales Overview, Performance do Produto, Diagnóstico, etc.) e clique em
                  &quot;+ Importar relatório&quot; acima. Você pode selecionar vários arquivos de uma vez — o sistema identifica cada um automaticamente.
                </p>
              </div>
            </Card>
          )}

          {tab === "dia" && diasLoja.length > 0 && <AbaDia dias={diasLoja} historico={A.lojaHistorico} composicao={A.composicao} trafficRanking={A.trafficRanking} />}
          {tab === "anuncios" && <AbaAnuncios anuncios={anunciosLista} logAlt={logAlt} adSel={adSelecionado} setAdSel={setAdSelecionado} showLog={showLog} setShowLog={setShowLog} novoLog={novoLog} setNovoLog={setNovoLog} setLogAlt={setLogAlt} confirmDel={confirmDelLog} setConfirmDel={setConfirmDelLog} />}
          {tab === "diagnostico" && <AbaDiagnostico diag={A.diagnostico} />}
          {tab === "ia" && <AbaIA A={A} logAlt={logAlt} iaLoading={iaLoading} setIaLoading={setIaLoading} iaResult={iaResult} setIaResult={setIaResult} />}

        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────
// Aba Dia
// ─────────────────────────────────────────────────────
function AbaDia({ dias, historico, composicao, trafficRanking }) {
  const [diaAtivo, setDiaAtivo] = useState(dias[0]);
  const dados = historico[diaAtivo] || {};
  const salesOv = dados.sales_overview;
  const shopStats = dados.shop_stats;
  const prodOv = dados.product_overview;

  const fonte = salesOv || shopStats || prodOv;
  const horas = fonte?.horas || [];
  const resumo = salesOv?.resumo || null;

  // Se não tem resumo (shop_stats), calcula
  const totais = useMemo(() => {
    if (!horas.length) return null;
    const vendas = horas.reduce((s, h) => s + (h.vendas || h.vendasPagos || 0), 0);
    const pedidos = horas.reduce((s, h) => s + (h.pedidos || h.pedidosPagos || 0), 0);
    const visitantes = horas.reduce((s, h) => s + (h.visitantes || 0), 0);
    const ticket = pedidos > 0 ? vendas / pedidos : 0;
    const conversao = visitantes > 0 ? (pedidos / visitantes * 100) : 0;
    return { vendas, pedidos, visitantes, ticket, conversao };
  }, [horas]);

  const mHorarios = useMemo(() => melhoresHorarios(horas.map(h => ({ hora: h.hora, vendas: h.vendas || h.vendasPagos || 0, pedidos: h.pedidos || h.pedidosPagos || 0 }))), [horas]);
  const dadosGrafico = horas.map(h => ({ hora: rotuloHora(h.hora), vendas: h.vendas || h.vendasPagos || 0, pedidos: h.pedidos || h.pedidosPagos || 0, visitantes: h.visitantes || 0 }));

  if (!fonte) return <Card><div style={{ textAlign: "center", padding: 20 }} className="gap-muted">Sem dados de loja para {diaAtivo}. Importe um Sales Overview, Shop Stats ou Product Overview.</div></Card>;

  return (
    <div className="gap-stack">
      {dias.length > 1 && (
        <div className="gap-row" style={{ flexWrap: "wrap", gap: 6 }}>
          <span className="gap-muted" style={{ marginRight: 4 }}>Dia:</span>
          {dias.slice(0, 10).map(d => (
            <button key={d} onClick={() => setDiaAtivo(d)}
              className={`gap-btn-${diaAtivo === d ? "primary" : "secondary"}`}
              style={{ fontSize: 12, padding: "5px 10px" }}>{d.split("-").reverse().join("/")}</button>
          ))}
        </div>
      )}

      {totais && (
        <div className="gap-grid-4">
          <Card style={{ textAlign: "center", padding: "14px 10px" }}>
            <div className="gap-muted">Vendas</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#0D0D0F", marginTop: 2 }}>{fmt(totais.vendas)}</div>
          </Card>
          <Card style={{ textAlign: "center", padding: "14px 10px" }}>
            <div className="gap-muted">Pedidos</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#2563EB", marginTop: 2 }}>{fmtN(totais.pedidos)}</div>
          </Card>
          <Card style={{ textAlign: "center", padding: "14px 10px" }}>
            <div className="gap-muted">Visitantes</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#7C3AED", marginTop: 2 }}>{fmtN(totais.visitantes)}</div>
          </Card>
          <Card style={{ textAlign: "center", padding: "14px 10px" }}>
            <div className="gap-muted">Ticket médio</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#16A34A", marginTop: 2 }}>{fmt(totais.ticket)}</div>
          </Card>
        </div>
      )}

      {dadosGrafico.length > 0 && (
        <Card>
          <CardTitle>Vendas por hora — {diaAtivo}</CardTitle>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dadosGrafico} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hora" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(0) + "k" : v} />
              <Tooltip formatter={v => fmt(v)} />
              <Bar dataKey="vendas" fill="#2563EB" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {mHorarios.length >= 3 && (
        <Card>
          <CardTitle>Insights de horário</CardTitle>
          <div className="gap-stack" style={{ gap: 8 }}>
            <div className="gap-row" style={{ alignItems: "center" }}>
              <span style={{ fontSize: 20 }}>🔥</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Horários de ouro</div>
                <div className="gap-muted">{mHorarios.slice(0, 3).map(h => rotuloHora(h.hora)).join(", ")} — concentre anúncios pagos, promoções relâmpago e postagens aqui.</div>
              </div>
            </div>
            <div className="gap-row" style={{ alignItems: "center" }}>
              <span style={{ fontSize: 20 }}>😴</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Horários fracos</div>
                <div className="gap-muted">{mHorarios.slice(-3).reverse().map(h => rotuloHora(h.hora)).join(", ")} — evite disparar promoções nestes períodos.</div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {composicao && (
        <Card>
          <CardTitle>Composição de vendas — {composicao.data}</CardTitle>
          <div className="gap-grid-2" style={{ gap: 20 }}>
            {composicao.categorias?.length > 0 && (
              <div>
                <div className="gap-section-label">Por categoria</div>
                {composicao.categorias.map((c, i) => (
                  <div key={i} className="gap-row-between" style={{ padding: "6px 0", borderBottom: "1px solid #F5F5F3", fontSize: 13 }}>
                    <span>{c.categoria}</span>
                    <span style={{ fontWeight: 500 }}>{fmt(c.vendas)} <span className="gap-muted">({c.pct})</span></span>
                  </div>
                ))}
              </div>
            )}
            {composicao.tipoCompradores?.length > 0 && (
              <div>
                <div className="gap-section-label">Tipo de comprador</div>
                {composicao.tipoCompradores.map((t, i) => (
                  <div key={i} className="gap-row-between" style={{ padding: "6px 0", borderBottom: "1px solid #F5F5F3", fontSize: 13 }}>
                    <span>{t.tipo}</span>
                    <span style={{ fontWeight: 500 }}>{fmtN(t.compradores)} <span className="gap-muted">({t.pctCompradores})</span></span>
                  </div>
                ))}
                {composicao.tipoCompradores.length > 0 && (
                  <div className="gap-muted" style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>
                    💡 A proporção de novos vs recorrentes mostra quanto sua loja depende de tráfego novo.
                  </div>
                )}
              </div>
            )}
          </div>
          {composicao.faixas?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="gap-section-label">Faixa de preço mais vendida</div>
              <div className="gap-row" style={{ gap: 8, flexWrap: "wrap" }}>
                {composicao.faixas.map((f, i) => (
                  <div key={i} style={{ background: "#F5F5F3", borderRadius: 8, padding: "8px 12px", fontSize: 12.5 }}>
                    <div style={{ fontWeight: 500 }}>{f.faixa}</div>
                    <div className="gap-muted">{fmtN(f.compradores)} compradores · {fmt(f.vendas)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {trafficRanking?.produtos?.length > 0 && (
        <Card>
          <CardTitle>Ranking de produtos (mais recentes)</CardTitle>
          <div className="gap-muted" style={{ marginBottom: 10 }}>Do relatório Tráfego do Produto</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>{["Produto", "Vendas", "Pedidos", "CTR", "Conversão"].map(h => (
                  <th key={h} style={{ textAlign: h === "Produto" ? "left" : "right", padding: "6px 10px", borderBottom: "1px solid #EBEBEB", color: "#888", fontWeight: 500, fontSize: 11.5 }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {trafficRanking.produtos.slice(0, 15).map((p, i) => (
                  <tr key={p.itemId} style={{ borderBottom: "1px solid #F5F5F3" }}>
                    <td style={{ padding: "8px 10px", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 500 }}>{fmt(p.vendas)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtN(p.pedidos)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{p.ctr.toFixed(1)}%</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{p.conversao.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Aba Anúncios
// ─────────────────────────────────────────────────────
function AbaAnuncios({ anuncios, logAlt, adSel, setAdSel, showLog, setShowLog, novoLog, setNovoLog, setLogAlt, confirmDel, setConfirmDel }) {
  if (!anuncios.length) return <Card><div className="gap-muted" style={{ padding: 12, textAlign: "center" }}>Importe o relatório <b>Performance do Produto</b> (um por anúncio) para começar o acompanhamento.</div></Card>;

  const ad = adSel ? anuncios.find(a => a.itemId === adSel) : null;

  if (!ad) {
    return (
      <div className="gap-stack" style={{ gap: 8 }}>
        <div className="gap-muted">{anuncios.length} anúncio(s) acompanhado(s). Clique em um para ver o histórico.</div>
        {anuncios.map(a => {
          const ult = a.importacoes[a.importacoes.length - 1];
          const primeiro = a.importacoes[0];
          return (
            <Card key={a.itemId} style={{ cursor: "pointer" }} onClick={() => setAdSel(a.itemId)}>
              <div className="gap-row-between" style={{ gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.nome}</div>
                  <div className="gap-muted" style={{ marginTop: 3 }}>{a.importacoes.length} importação(ões) · de {primeiro.data} a {ult.data}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{fmt(ult.resumo.vendas)}</div>
                  <div className="gap-muted">última importação</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    );
  }

  // Detalhe do anúncio selecionado
  const ult = ad.importacoes[ad.importacoes.length - 1];
  const anterior = ad.importacoes.length > 1 ? ad.importacoes[ad.importacoes.length - 2] : null;

  const dadosDia = ult.horas.map(h => ({ hora: rotuloHora(h.hora), impressoes: h.impressoes, cliques: h.cliques, vendas: h.vendasPagos }));
  const dadosSerie = ad.importacoes.map(i => ({ data: i.data.split("-").slice(1).reverse().join("/"), vendas: i.resumo.vendas, pedidos: i.resumo.pedidos, impressoes: i.resumo.impressoes, ctr: i.resumo.ctr }));

  const fontesPagos = ult.fontesTrafego?.pagos || [];
  const logsDoAd = logAlt.filter(l => !l.adNome || l.adNome === ad.nome || l.adNome === "Todos");

  const delta = anterior ? {
    vendas: ult.resumo.vendas - anterior.resumo.vendas,
    impressoes: ult.resumo.impressoes - anterior.resumo.impressoes,
    ctr: ult.resumo.ctr - anterior.resumo.ctr,
  } : null;

  return (
    <div className="gap-stack">
      <div className="gap-row-between" style={{ flexWrap: "wrap", gap: 8 }}>
        <button className="gap-btn-ghost" style={{ fontSize: 12 }} onClick={() => setAdSel(null)}>← todos os anúncios</button>
        <button className="gap-btn-secondary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => { setShowLog(true); setNovoLog({ data: new Date().toISOString().slice(0, 10), tipo: "preco", descricao: "", adNome: ad.nome }); }}>+ Registrar alteração</button>
      </div>

      <Card>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{ad.nome}</div>
        <div className="gap-muted" style={{ marginTop: 3, fontSize: 11.5 }}>ID: {ad.itemId} · Última importação: {ult.data}</div>
      </Card>

      <div className="gap-grid-4">
        {[
          { l: "Vendas", v: fmt(ult.resumo.vendas), d: delta?.vendas, prefix: "R$" },
          { l: "Pedidos", v: fmtN(ult.resumo.pedidos), d: null },
          { l: "Impressões", v: fmtN(ult.resumo.impressoes), d: delta?.impressoes },
          { l: "CTR", v: ult.resumo.ctr.toFixed(2) + "%", d: delta?.ctr, isPct: true },
        ].map(x => (
          <Card key={x.l} style={{ padding: "12px 10px" }}>
            <div className="gap-muted">{x.l}</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{x.v}</div>
            {x.d !== null && x.d !== undefined && (
              <div style={{ fontSize: 11, marginTop: 2, color: x.d >= 0 ? "#16A34A" : "#DC2626" }}>
                {x.d >= 0 ? "+" : ""}{x.isPct ? x.d.toFixed(2) + "pp" : (x.prefix === "R$" ? fmt(x.d) : fmtN(x.d))} vs anterior
              </div>
            )}
          </Card>
        ))}
      </div>

      {showLog && (
        <Card style={{ border: "1.5px solid #DBEAFE" }}>
          <div className="gap-row-between" style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Registrar alteração</span>
            <button className="gap-btn-ghost" style={{ fontSize: 18 }} onClick={() => setShowLog(false)}>×</button>
          </div>
          <div className="gap-stack" style={{ gap: 8 }}>
            <div className="gap-grid-2">
              <div>
                <label className="gap-label">Data</label>
                <input type="date" className="gap-input" value={novoLog.data} onChange={e => setNovoLog(p => ({ ...p, data: e.target.value }))} />
              </div>
              <div>
                <label className="gap-label">Tipo</label>
                <select className="gap-select" style={{ width: "100%" }} value={novoLog.tipo} onChange={e => setNovoLog(p => ({ ...p, tipo: e.target.value }))}>
                  <option value="preco">Preço</option>
                  <option value="titulo">Título</option>
                  <option value="descricao">Descrição</option>
                  <option value="fotos">Fotos</option>
                  <option value="promocao">Promoção</option>
                  <option value="ads">Anúncio pago</option>
                  <option value="variacao">Variação</option>
                  <option value="outros">Outros</option>
                </select>
              </div>
            </div>
            <div>
              <label className="gap-label">Descrição</label>
              <input className="gap-input" value={novoLog.descricao} onChange={e => setNovoLog(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Reduzi preço de R$29 para R$25" />
            </div>
            <div className="gap-row">
              <button className="gap-btn-primary" onClick={() => {
                if (!novoLog.data || !novoLog.descricao) { alert("Preencha data e descrição."); return; }
                setLogAlt(p => [{ ...novoLog, id: Date.now() }, ...p]);
                setShowLog(false);
              }}>Salvar</button>
              <button className="gap-btn-secondary" onClick={() => setShowLog(false)}>Cancelar</button>
            </div>
          </div>
        </Card>
      )}

      {dadosSerie.length > 1 && (
        <Card>
          <CardTitle>Evolução (últimas {dadosSerie.length} importações)</CardTitle>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dadosSerie} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="data" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Line type="monotone" dataKey="vendas" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} name="Vendas" />
              <Line type="monotone" dataKey="pedidos" stroke="#16A34A" strokeWidth={2} dot={{ r: 3 }} name="Pedidos" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card>
        <CardTitle>Métricas por hora — {ult.data}</CardTitle>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dadosDia} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="hora" tick={{ fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip />
            <Bar dataKey="vendas" fill="#2563EB" radius={[4, 4, 0, 0]} name="Vendas" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {fontesPagos.length > 0 && (
        <Card>
          <CardTitle>Fontes de tráfego (pedidos pagos)</CardTitle>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>{["Fonte", "Categoria", "Vendas", "Pedidos", "Impressões"].map(h => (
                  <th key={h} style={{ textAlign: h === "Fonte" || h === "Categoria" ? "left" : "right", padding: "6px 10px", borderBottom: "1px solid #EBEBEB", color: "#888", fontWeight: 500, fontSize: 11.5 }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {fontesPagos.map((f, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F5F5F3" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 500 }}>{f.fonte}</td>
                    <td style={{ padding: "8px 10px", fontSize: 11.5, color: "#666" }}>{f.categoria || "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 500 }}>{fmt(f.vendas)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtN(f.pedidos)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtN(f.impressoes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {logsDoAd.length > 0 && (
        <Card>
          <CardTitle>Alterações registradas</CardTitle>
          <div className="gap-stack" style={{ gap: 6 }}>
            {logsDoAd.map(l => (
              <div key={l.id} className="gap-row-between" style={{ padding: "8px 10px", background: "#FAFAF8", borderRadius: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, marginRight: 6 }}>{l.data}</span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#FEF3C7", color: "#B45309", fontWeight: 500 }}>{l.tipo}</span>
                  </div>
                  <div style={{ fontSize: 13 }}>{l.descricao}</div>
                </div>
                {confirmDel === l.id
                  ? <ConfirmButtons onConfirm={() => { setLogAlt(p => p.filter(x => x.id !== l.id)); setConfirmDel(null); }} onCancel={() => setConfirmDel(null)} confirmLabel="Excluir" />
                  : <button className="gap-btn-ghost" style={{ color: "#CBD5E1", fontSize: 18 }} onClick={() => setConfirmDel(l.id)}>×</button>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Aba Diagnóstico
// ─────────────────────────────────────────────────────
function AbaDiagnostico({ diag }) {
  if (!diag) return <Card><div className="gap-muted" style={{ padding: 12, textAlign: "center" }}>Importe o relatório <b>Diagnóstico do Produto</b> para ver alertas prontos da Shopee.</div></Card>;

  const secoes = [
    { titulo: "Queda de vendas", icon: "📉", cor: "#DC2626", bg: "#FEF2F2", itens: diag.quedas, campos: ["nome", "antes", "depois", "variacao"] },
    { titulo: "Avaliações ruins", icon: "⚠️", cor: "#B45309", bg: "#FEF3C7", itens: diag.avaliacoes, campos: ["nome", "total", "ruins"] },
    { titulo: "Alta devolução", icon: "↩️", cor: "#DC2626", bg: "#FEF2F2", itens: diag.devolucoes, campos: ["nome", "qtd", "taxa"] },
    { titulo: "Envio atrasado", icon: "🚚", cor: "#B45309", bg: "#FEF3C7", itens: diag.envios, campos: ["nome", "qtd", "taxa"] },
    { titulo: "Baixa conversão", icon: "🎯", cor: "#B45309", bg: "#FEF3C7", itens: diag.conversao, campos: ["nome", "visitantes", "conversao"] },
    { titulo: "Queda de visualizações", icon: "👁️", cor: "#B45309", bg: "#FEF3C7", itens: diag.visualizacoes, campos: ["nome", "antes", "depois", "variacao"] },
  ];

  return (
    <div className="gap-stack">
      {secoes.filter(s => s.itens && s.itens.length > 0).map((s, si) => (
        <Card key={si}>
          <div className="gap-row" style={{ marginBottom: 10, alignItems: "center" }}>
            <span style={{ fontSize: 18 }}>{s.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: s.cor }}>{s.titulo}</span>
            <Badge>{s.itens.length}</Badge>
          </div>
          <div className="gap-stack" style={{ gap: 6 }}>
            {s.itens.slice(0, 10).map((it, i) => (
              <div key={i} style={{ padding: "8px 10px", background: s.bg, borderRadius: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 2 }}>{it.nome}</div>
                <div className="gap-muted" style={{ fontSize: 11.5 }}>
                  {s.campos.slice(1).map(c => {
                    const v = it[c];
                    const label = c === "antes" ? "antes" : c === "depois" ? "depois" : c === "variacao" ? "" : c;
                    return `${label}: ${typeof v === "number" ? (c === "antes" || c === "depois" ? fmt(v) : fmtN(v)) : v}`;
                  }).join(" · ")}
                </div>
              </div>
            ))}
            {s.itens.length > 10 && <div className="gap-muted" style={{ textAlign: "center", fontSize: 11 }}>+ {s.itens.length - 10} outros</div>}
          </div>
        </Card>
      ))}
      {secoes.every(s => !s.itens || s.itens.length === 0) && (
        <Card><div className="gap-muted" style={{ padding: 12, textAlign: "center" }}>Nenhum alerta no diagnóstico. 🎉</div></Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Aba IA
// ─────────────────────────────────────────────────────
function AbaIA({ A, logAlt, iaLoading, setIaLoading, iaResult, setIaResult }) {
  const dias = Object.keys(A.lojaHistorico || {}).sort().reverse();
  const anuncios = Object.values(A.anuncios || {});
  const hasData = dias.length > 0 || anuncios.length > 0 || A.diagnostico || A.composicao;

  const analisar = async () => {
    setIaLoading(true); setIaResult("");
    try {
      // Monta contexto compacto
      let ctx = "";
      if (dias[0] && A.lojaHistorico[dias[0]]) {
        const dia = A.lojaHistorico[dias[0]];
        const fonte = dia.sales_overview || dia.shop_stats || dia.product_overview;
        const horas = fonte?.horas || [];
        const vendas = horas.reduce((s, h) => s + (h.vendas || h.vendasPagos || 0), 0);
        const pedidos = horas.reduce((s, h) => s + (h.pedidos || h.pedidosPagos || 0), 0);
        const vis = horas.reduce((s, h) => s + (h.visitantes || 0), 0);
        const conv = vis > 0 ? (pedidos / vis * 100).toFixed(2) : 0;
        ctx += `\nDIA ${dias[0]}: vendas R$${vendas.toFixed(0)}, ${pedidos} pedidos, ${vis} visitantes, conversão ${conv}%.`;
        const mh = melhoresHorarios(horas.map(h => ({ hora: h.hora, vendas: h.vendas || h.vendasPagos || 0, pedidos: h.pedidos || h.pedidosPagos || 0 })));
        ctx += ` Melhores horas: ${mh.slice(0, 3).map(h => rotuloHora(h.hora)).join(", ")}. Piores: ${mh.slice(-3).map(h => rotuloHora(h.hora)).join(", ")}.`;
      }
      if (anuncios.length) {
        ctx += `\n\nANÚNCIOS (${anuncios.length}):`;
        anuncios.slice(0, 10).forEach(a => {
          const u = a.importacoes[a.importacoes.length - 1];
          ctx += `\n- "${a.nome.substring(0, 60)}": vendas R$${u.resumo.vendas.toFixed(0)}, CTR ${u.resumo.ctr.toFixed(1)}%, conv ${u.resumo.conversao.toFixed(1)}%.`;
        });
      }
      if (A.diagnostico) {
        const d = A.diagnostico;
        if (d.quedas?.length) ctx += `\n\nQUEDAS DE VENDA: ${d.quedas.slice(0, 5).map(x => `${x.nome.substring(0, 40)} (${x.variacao})`).join("; ")}`;
        if (d.avaliacoes?.length) ctx += `\nAVAL RUINS: ${d.avaliacoes.slice(0, 5).map(x => `${x.nome.substring(0, 40)} (${x.ruins}/${x.total})`).join("; ")}`;
        if (d.conversao?.length) ctx += `\nBAIXA CONVERSÃO: ${d.conversao.slice(0, 5).map(x => `${x.nome.substring(0, 40)} (${x.conversao})`).join("; ")}`;
      }
      if (A.composicao) {
        const c = A.composicao;
        if (c.tipoCompradores?.length) ctx += `\n\nCOMPRADORES: ${c.tipoCompradores.map(t => `${t.tipo} ${t.pctCompradores}`).join(", ")}`;
      }
      if (logAlt.length) {
        ctx += `\n\nALTERAÇÕES RECENTES: ${logAlt.slice(0, 5).map(l => `[${l.data}] ${l.tipo}: ${l.descricao}`).join("; ")}`;
      }

      const prompt = `Você é analista de marketplace especializado em Shopee, para uma vendedora de calçados brasileira. Analise os dados abaixo e responda em português.
${ctx}

Estruture a resposta em:
1. O QUE ESTÁ FUNCIONANDO (2-3 pontos)
2. O QUE PRECISA DE ATENÇÃO (2-3 pontos)
3. AÇÕES CONCRETAS PARA A SEMANA (3-5 ações específicas)
4. UM INSIGHT ESTRATÉGICO (algo que ela pode não estar vendo)

Seja direto, use números dos dados, evite jargão. Máximo 400 palavras.`;

      const r = await apiFetch([{ role: "user", content: prompt }], 1200);
      setIaResult(r);
    } catch (e) {
      setIaResult("Erro: " + e.message);
    }
    setIaLoading(false);
  };

  if (!hasData) return <Card><div className="gap-muted" style={{ padding: 12, textAlign: "center" }}>Importe pelo menos um relatório para poder analisar com IA.</div></Card>;

  return (
    <div className="gap-stack">
      <Card>
        <CardTitle>Análise completa com IA</CardTitle>
        <p className="gap-muted" style={{ marginBottom: 12, lineHeight: 1.5 }}>
          A IA vai olhar tudo que você importou (dias, anúncios, diagnóstico, composição) junto com as alterações que você registrou, e devolver diagnóstico + ações concretas.
        </p>
        <div className="gap-alert gap-alert-info" style={{ marginBottom: 12 }}>
          <div className="gap-alert-dot dot-info" />
          <div className="gap-alert-desc">
            {dias.length > 0 ? "✓" : "○"} {dias.length} dia(s) de loja<br />
            {anuncios.length > 0 ? "✓" : "○"} {anuncios.length} anúncio(s) rastreado(s)<br />
            {A.diagnostico ? "✓" : "○"} Diagnóstico da Shopee<br />
            {A.composicao ? "✓" : "○"} Composição de vendas<br />
            {logAlt.length > 0 ? "✓" : "○"} {logAlt.length} alteração(ões) registrada(s)
          </div>
        </div>
        <button className="gap-btn-primary" disabled={iaLoading} onClick={analisar}>
          {iaLoading ? "Analisando..." : "Analisar tudo"}
        </button>
      </Card>

      {iaResult && (
        <Card>
          <div className="gap-row-between" style={{ marginBottom: 10 }}>
            <CardTitle>Resultado</CardTitle>
            <button className="gap-btn-ghost" style={{ fontSize: 12 }} onClick={() => setIaResult("")}>Limpar</button>
          </div>
          <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.6, color: "#333" }}>{iaResult}</div>
        </Card>
      )}
    </div>
  );
}
