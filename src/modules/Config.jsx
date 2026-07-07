import { useState } from "react";
import { useGap } from "../lib/store";
import { Topbar, Card, CardTitle, NumInput } from "../lib/ui";
import { fmt, pn } from "../lib/utils";
import storage from "../lib/storage";

const IMPOSTOS = [[0, "Isento"], [4, "MEI 4%"], [6, "Simples 6%"], [8, "Simples 8%"], [11.5, "L. Presumido"]];

export default function Config({ onMenu }) {
  const { imposto, setImposto, mps, setMps, salvando } = useGap();
  const [confirmReset, setConfirmReset] = useState(false);

  const updateMp = (id, f, v) => setMps((p) => p.map((m) => (m.id === id ? { ...m, [f]: v } : m)));
  const toggleMp = (id) => setMps((p) => p.map((m) => (m.id === id ? { ...m, ativo: !m.ativo } : m)));

  const apagarTudo = async () => {
    try {
      const { keys } = await storage.list();
      for (const k of keys) await storage.remove(k);
    } catch {}
    window.location.reload();
  };

  return (
    <>
      <Topbar title="Configurações" salvando={salvando} onMenu={onMenu} />
      <div className="gap-content">
        <div className="gap-stack" style={{ maxWidth: 620 }}>
          <Card>
            <CardTitle>Imposto sobre vendas</CardTitle>
            <div className="gap-row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <NumInput prefix="%" value={imposto} onChange={(v) => setImposto(Number(v))} step="0.1" />
              {IMPOSTOS.map(([v, l]) => (
                <button key={v} onClick={() => setImposto(v)}
                  className={`gap-btn-${Number(imposto) === v ? "primary" : "secondary"}`}
                  style={{ padding: "7px 14px", fontSize: 12.5 }}>{l}</button>
              ))}
            </div>
            <p className="gap-muted">Incide sobre o Valor Total (nota fiscal) de cada pedido, em todos os cálculos do fechamento.</p>
          </Card>

          <Card>
            <CardTitle>Taxas dos marketplaces</CardTitle>
            <p className="gap-muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>
              Comissão, taxa fixa e afiliado de cada plataforma. Usadas no cálculo de preço e margem por marketplace em Produtos.
              Confira a taxa real da Shopee no seu painel — os valores aqui são de referência.
            </p>
            <div className="gap-stack" style={{ gap: 10 }}>
              {mps.map((mp) => (
                <div key={mp.id} style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #EBEBEB", opacity: mp.ativo ? 1 : 0.6 }}>
                  <div style={{ background: mp.color, color: mp.tc, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{mp.name}</span>
                    <button onClick={() => toggleMp(mp.id)}
                      style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, padding: "3px 12px", borderRadius: 20, cursor: "pointer",
                               border: `1px solid ${mp.tc === "#fff" ? "rgba(255,255,255,.7)" : "rgba(0,0,0,.3)"}`,
                               background: mp.ativo ? (mp.tc === "#fff" ? "#fff" : "rgba(0,0,0,.12)") : "transparent",
                               color: mp.ativo ? (mp.tc === "#fff" ? "#333" : mp.tc) : mp.tc }}>
                      {mp.ativo ? "✓ Ativo" : "+ Ativar"}
                    </button>
                  </div>
                  {mp.ativo && (
                    <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, background: "#FAFAF8" }}>
                      <div>
                        <label className="gap-label">Comissão %</label>
                        <NumInput prefix="%" value={mp.comissao} onChange={(v) => updateMp(mp.id, "comissao", v)} step="0.1" />
                      </div>
                      <div>
                        <label className="gap-label">Taxa fixa</label>
                        <NumInput prefix="R$" value={mp.taxaFixa} onChange={(v) => updateMp(mp.id, "taxaFixa", v)} step="0.01" />
                      </div>
                      <div>
                        <label className="gap-label">Afiliado %</label>
                        <NumInput prefix="%" value={mp.afiliado} onChange={(v) => updateMp(mp.id, "afiliado", v)} step="0.1" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Dados do sistema</CardTitle>
            <p className="gap-muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>
              Seus dados (produtos, custos fixos, configurações, fornecedores) ficam salvos neste navegador.
              Pedidos e extrato não são salvos — reimporte a cada sessão. Apagar tudo zera o sistema.
            </p>
            {confirmReset ? (
              <div className="gap-row">
                <button className="gap-btn-danger" onClick={apagarTudo}>Confirmar — apagar tudo</button>
                <button className="gap-btn-secondary" onClick={() => setConfirmReset(false)}>Cancelar</button>
              </div>
            ) : (
              <button className="gap-btn-danger" onClick={() => setConfirmReset(true)}>Apagar todos os dados salvos</button>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
