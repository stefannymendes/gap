import { useState } from "react";
import { useGap } from "../lib/store";
import { fmt, pn } from "../lib/utils";
import { Topbar, Card, CardTitle, NumInput } from "../lib/ui";

export default function CustosFixos({ onMenu }) {
  const { custosFixos, addCustoFixo, updateCustoFixo, removeCustoFixo, salvando,
          dbLoading, dbErro, custosFixosMigraveis, importarCustosFixosLocal } = useGap();
  const [novo, setNovo] = useState({ nome: "", valor: 0 });

  const total = custosFixos.reduce((s, c) => s + pn(c.valor), 0);

  const adicionar = () => {
    if (!novo.nome.trim()) return;
    addCustoFixo({ nome: novo.nome.trim(), valor: pn(novo.valor) });
    setNovo({ nome: "", valor: 0 });
  };

  return (
    <>
      <Topbar title="Custos fixos" salvando={salvando} onMenu={onMenu} />
      <div className="gap-content">
        <div className="gap-stack" style={{ maxWidth: 600 }}>
          {dbErro && (
            <div className="gap-alert gap-alert-danger" style={{ marginBottom: 12 }}>
              <div className="gap-alert-dot dot-danger" />
              <div className="gap-alert-desc">{dbErro}</div>
            </div>
          )}

          {custosFixosMigraveis.length > 0 && (
            <div className="gap-alert gap-alert-warn" style={{ marginBottom: 12 }}>
              <div className="gap-alert-dot dot-warn" />
              <div style={{ flex: 1 }}>
                <div className="gap-alert-title">Encontrei {custosFixosMigraveis.length} custo(s) fixo(s) salvos neste navegador</div>
                <div className="gap-alert-desc" style={{ marginBottom: 10 }}>Importe para a sua conta. Seus dados locais continuam intactos como backup.</div>
                <button className="gap-btn-primary" style={{ fontSize: 12, padding: "7px 14px" }} onClick={importarCustosFixosLocal}>Importar {custosFixosMigraveis.length} custo(s)</button>
              </div>
            </div>
          )}

          <Card>
            <CardTitle>Custos fixos mensais</CardTitle>
            {dbLoading && (
              <div className="gap-ia-box loading" style={{ marginBottom: 12 }}><div className="gap-ia-spinner" /><span className="gap-muted">Carregando…</span></div>
            )}
            {!dbLoading && custosFixos.length === 0 && (
              <div className="gap-muted" style={{ marginBottom: 12 }}>
                Nenhum custo fixo cadastrado. Adicione abaixo (aluguel, pró-labore, contabilidade, energia, etc.).
              </div>
            )}
            {custosFixos.map((c) => (
              <div key={c.id} className="gap-row" style={{ marginBottom: 8 }}>
                <input className="gap-input" style={{ flex: 1 }} value={c.nome}
                  onChange={(e) => updateCustoFixo(c.id, { nome: e.target.value })} />
                <NumInput value={c.valor} onChange={(v) => updateCustoFixo(c.id, { valor: v })} />
                <button className="gap-btn-ghost" style={{ color: "#EF4444", fontSize: 18 }}
                  onClick={() => removeCustoFixo(c.id)}>×</button>
              </div>
            ))}

            <div className="gap-divider" />
            <div className="gap-row" style={{ marginBottom: 12 }}>
              <input className="gap-input" style={{ flex: 1 }} placeholder="Novo custo fixo"
                value={novo.nome} onChange={(e) => setNovo((p) => ({ ...p, nome: e.target.value }))} />
              <NumInput value={novo.valor} onChange={(v) => setNovo((p) => ({ ...p, valor: v }))} />
              <button className="gap-btn-primary" onClick={adicionar}>+</button>
            </div>

            <div className="gap-row-between">
              <span style={{ fontSize: 13, color: "#555" }}>Total mensal</span>
              <span style={{ fontSize: 22, fontWeight: 600 }}>{fmt(total)}</span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
