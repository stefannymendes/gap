import { useGap } from "../lib/store";
import { fmt, fmtN, labelMes, mesAtual, mesNumeral } from "../lib/utils";
import { SAZONALIDADE } from "../lib/constants";
import { Topbar, Card } from "../lib/ui";
import { calcCustoUnitario } from "./Produtos.jsx";

export default function Home({ onMenu, navigate }) {
  const { produtos, custosFixos, pedidos, salvando } = useGap();

  const totalFixos = custosFixos.reduce((s, c) => s + Number(c.valor || 0), 0);
  const eventos = SAZONALIDADE.find((s) => s.mes === mesNumeral())?.eventos || [];
  const temPedidos = pedidos.some((p) => !p.cancelado);

  const passos = [
    { ok: produtos.length > 0, label: "Cadastrar seus produtos (nome + prefixo do SKU + custo)", sec: "produtos" },
    { ok: custosFixos.length > 0, label: "Preencher os custos fixos mensais", sec: "empresa" },
    { ok: temPedidos, label: "Importar a planilha de pedidos da Shopee no Financeiro", sec: "financeiro" },
  ];

  return (
    <>
      <Topbar title="Início" salvando={salvando} onMenu={onMenu} />
      <div className="gap-content">
        <div className="gap-hero">
          <div>
            <div className="gap-hero-eyebrow">Bem-vinda ao Gap</div>
            <div className="gap-hero-value">{labelMes(mesAtual())}</div>
            <div className="gap-hero-sub">Sistema limpo — pronto para você preencher com seus dados reais.</div>
          </div>
          <div className="gap-hero-right">
            <span className="gap-hero-chip chip-neutral">{fmtN(produtos.length)} produto(s)</span>
            <span className="gap-hero-chip chip-neutral">{fmt(totalFixos)} fixos/mês</span>
          </div>
        </div>

        <div className="gap-section-label">Primeiros passos</div>
        <div className="gap-stack gap-spacer">
          {passos.map((p, i) => (
            <div key={i} className="gap-card gap-row-between" style={{ padding: "12px 16px" }}>
              <div className="gap-row">
                <span style={{ fontSize: 16 }}>{p.ok ? "✅" : "⬜"}</span>
                <span style={{ fontSize: 13.5, color: p.ok ? "#888" : "#0D0D0F", textDecoration: p.ok ? "line-through" : "none" }}>{p.label}</span>
              </div>
              {!p.ok && (
                <button className="gap-btn-secondary" style={{ fontSize: 12, padding: "6px 12px", flexShrink: 0 }} onClick={() => navigate(p.sec)}>Abrir →</button>
              )}
            </div>
          ))}
        </div>

        {eventos.length > 0 && (
          <>
            <div className="gap-section-label">Sazonalidade deste mês</div>
            <div className="gap-alerts">
              {eventos.map((ev, i) => (
                <div key={i} className="gap-alert gap-alert-warn">
                  <div className="gap-alert-dot dot-warn" />
                  <div>
                    <div className="gap-alert-title">{ev.nome}</div>
                    <div className="gap-alert-desc">{ev.dica}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <Card style={{ marginTop: 16 }}>
          <div className="gap-muted" style={{ lineHeight: 1.7 }}>
            Esta é a primeira etapa do Gap fora do chat: o módulo financeiro completo, com Produtos como seção própria.
            Os módulos de IA (Anúncios, Analista) entram nas próximas etapas. Seus dados ficam salvos neste navegador.
          </div>
        </Card>
      </div>
    </>
  );
}
