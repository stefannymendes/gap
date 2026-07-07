import { useState } from "react";
import { useGap } from "../lib/store";
import { fmt, pn } from "../lib/utils";
import { Topbar, Card, CardTitle, NumInput } from "../lib/ui";

export default function CustosFixos({ onMenu }) {
  const { custosFixos, setCustosFixos, salvando } = useGap();
  const [novo, setNovo] = useState({ nome: "", valor: 0 });

  const total = custosFixos.reduce((s, c) => s + pn(c.valor), 0);

  const adicionar = () => {
    if (!novo.nome.trim()) return;
    setCustosFixos((p) => [...p, { id: Date.now(), nome: novo.nome.trim(), valor: pn(novo.valor) }]);
    setNovo({ nome: "", valor: 0 });
  };

  return (
    <>
      <Topbar title="Custos fixos" salvando={salvando} onMenu={onMenu} />
      <div className="gap-content">
        <div className="gap-stack" style={{ maxWidth: 600 }}>
          <Card>
            <CardTitle>Custos fixos mensais</CardTitle>
            {custosFixos.length === 0 && (
              <div className="gap-muted" style={{ marginBottom: 12 }}>
                Nenhum custo fixo cadastrado. Adicione abaixo (aluguel, pró-labore, contabilidade, energia, etc.).
              </div>
            )}
            {custosFixos.map((c) => (
              <div key={c.id} className="gap-row" style={{ marginBottom: 8 }}>
                <input className="gap-input" style={{ flex: 1 }} value={c.nome}
                  onChange={(e) => setCustosFixos((p) => p.map((x) => x.id === c.id ? { ...x, nome: e.target.value } : x))} />
                <NumInput value={c.valor} onChange={(v) => setCustosFixos((p) => p.map((x) => x.id === c.id ? { ...x, valor: v } : x))} />
                <button className="gap-btn-ghost" style={{ color: "#EF4444", fontSize: 18 }}
                  onClick={() => setCustosFixos((p) => p.filter((x) => x.id !== c.id))}>×</button>
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
