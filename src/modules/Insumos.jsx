import { useState } from "react";
import { useGap } from "../lib/store";
import { Topbar, Card, EmptyState, NumInput, ConfirmButtons } from "../lib/ui";
import { fmt, pn } from "../lib/utils";

const UNIDADES = ["un", "par", "m", "cm", "kg", "g", "L", "mL"];
const FORM_VAZIO = { nome: "", fornecedorId: "", custo: 0, unidade: "un", observacao: "" };

export default function Insumos({ onMenu }) {
  const { insumosCadastro, setInsumosCadastro, fornecedores, setFornecedores, salvando } = useGap();
  const [form, setForm] = useState(FORM_VAZIO);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  // Fornecedor rápido (dentro do form de insumo)
  const [showNovoForn, setShowNovoForn] = useState(false);
  const [novoForn, setNovoForn] = useState({ nome: "", categoria: "Matéria-prima", contato: "" });

  const abrirNovo = () => { setForm(FORM_VAZIO); setEditId(null); setShowForm(true); };
  const abrirEdicao = i => { setForm({ nome:i.nome, fornecedorId:i.fornecedorId||"", custo:i.custo, unidade:i.unidade||"un", observacao:i.observacao||"" }); setEditId(i.id); setShowForm(true); };

  const salvar = () => {
    if (!form.nome.trim()) { alert("Informe o nome do insumo."); return; }
    if (editId) {
      setInsumosCadastro(p => p.map(x => x.id === editId ? { ...x, ...form } : x));
    } else {
      setInsumosCadastro(p => [...p, { ...form, id: Date.now() }]);
    }
    setForm(FORM_VAZIO); setEditId(null); setShowForm(false);
  };

  const excluir = id => { setInsumosCadastro(p => p.filter(x => x.id !== id)); setConfirmDel(null); };

  const salvarNovoForn = () => {
    if (!novoForn.nome.trim()) { alert("Informe o nome do fornecedor."); return; }
    const novo = { ...novoForn, id: Date.now() };
    setFornecedores(p => [...p, novo]);
    setForm(p => ({ ...p, fornecedorId: novo.id }));
    setNovoForn({ nome: "", categoria: "Matéria-prima", contato: "" });
    setShowNovoForn(false);
  };

  const nomeFornecedor = id => fornecedores.find(f => f.id === id)?.nome || "—";

  // Ordena por nome
  const ordenados = [...insumosCadastro].sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <>
      <Topbar title="Insumos" salvando={salvando} onMenu={onMenu}
        action={<button className="gap-btn-primary" style={{fontSize:12,padding:"7px 14px"}} onClick={abrirNovo}>+ Novo insumo</button>} />
      <div className="gap-content">
        <div className="gap-stack" style={{ maxWidth: 720 }}>

          <div className="gap-alert gap-alert-info">
            <div className="gap-alert-dot dot-info"/>
            <div>
              <div className="gap-alert-title">Cadastre uma vez, use sempre</div>
              <div className="gap-alert-desc">
                Cadastre aqui todos os insumos que você usa (solado, palmilha, cadarço, embalagem, etc.) com o preço e o fornecedor.
                Quando for cadastrar um produto, você seleciona da lista e o custo puxa automaticamente — só define a quantidade.
              </div>
            </div>
          </div>

          {showForm && (
            <Card style={{ border: "1.5px solid #DBEAFE" }}>
              <div className="gap-row-between" style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{editId ? "Editar insumo" : "Novo insumo"}</span>
                <button className="gap-btn-ghost" style={{ fontSize: 20 }} onClick={() => { setShowForm(false); setEditId(null); }}>×</button>
              </div>
              <div className="gap-stack">
                <div>
                  <label className="gap-label">Nome do insumo *</label>
                  <input className="gap-input" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Solado EVA infantil" />
                </div>

                <div className="gap-grid-2">
                  <div>
                    <label className="gap-label">Custo (por unidade)</label>
                    <NumInput value={form.custo} onChange={v => setForm(p => ({ ...p, custo: v }))} />
                  </div>
                  <div>
                    <label className="gap-label">Unidade</label>
                    <select className="gap-select" style={{ width: "100%" }} value={form.unidade} onChange={e => setForm(p => ({ ...p, unidade: e.target.value }))}>
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="gap-row-between" style={{ marginBottom: 4 }}>
                    <label className="gap-label" style={{ margin: 0 }}>Fornecedor</label>
                    {!showNovoForn && <button className="gap-btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => setShowNovoForn(true)}>+ novo</button>}
                  </div>
                  {showNovoForn ? (
                    <div style={{ background: "#F0F4FF", borderRadius: 10, padding: 12, border: "1px solid #DBEAFE" }}>
                      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Novo fornecedor</div>
                      <div className="gap-stack" style={{ gap: 8 }}>
                        <input className="gap-input" value={novoForn.nome} onChange={e => setNovoForn(p => ({ ...p, nome: e.target.value }))} placeholder="Nome" />
                        <div className="gap-grid-2">
                          <input className="gap-input" value={novoForn.categoria} onChange={e => setNovoForn(p => ({ ...p, categoria: e.target.value }))} placeholder="Categoria" />
                          <input className="gap-input" value={novoForn.contato} onChange={e => setNovoForn(p => ({ ...p, contato: e.target.value }))} placeholder="Contato" />
                        </div>
                        <div className="gap-row">
                          <button className="gap-btn-primary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={salvarNovoForn}>Salvar fornecedor</button>
                          <button className="gap-btn-secondary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => setShowNovoForn(false)}>Cancelar</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <select className="gap-select" style={{ width: "100%" }} value={form.fornecedorId} onChange={e => setForm(p => ({ ...p, fornecedorId: e.target.value ? Number(e.target.value) : "" }))}>
                      <option value="">Sem fornecedor definido</option>
                      {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}{f.categoria ? ` — ${f.categoria}` : ""}</option>)}
                    </select>
                  )}
                </div>

                <div>
                  <label className="gap-label">Observação</label>
                  <input className="gap-input" value={form.observacao} onChange={e => setForm(p => ({ ...p, observacao: e.target.value }))} placeholder="Cor, especificação, referência..." />
                </div>

                <div className="gap-row" style={{ paddingTop: 8, borderTop: "1px solid #EBEBEB" }}>
                  <button className="gap-btn-primary" onClick={salvar}>{editId ? "Salvar alterações" : "Adicionar"}</button>
                  <button className="gap-btn-secondary" onClick={() => { setShowForm(false); setEditId(null); }}>Cancelar</button>
                </div>
              </div>
            </Card>
          )}

          {ordenados.length === 0 && !showForm ? (
            <EmptyState icon="🧵" title="Nenhum insumo cadastrado" desc="Cadastre seus insumos para reutilizar no cálculo de custo dos produtos." action={abrirNovo} actionLabel="+ Cadastrar primeiro insumo" />
          ) : (
            <div className="gap-stack" style={{ gap: 8 }}>
              {ordenados.map(i => (
                <Card key={i.id}>
                  <div className="gap-row-between" style={{ gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{i.nome}</div>
                      <div className="gap-row" style={{ marginTop: 5, flexWrap: "wrap", gap: 12 }}>
                        <div style={{ fontSize: 13 }}>
                          <span className="gap-muted">Custo: </span>
                          <span style={{ fontWeight: 600 }}>{fmt(pn(i.custo))}</span>
                          <span className="gap-muted"> / {i.unidade || "un"}</span>
                        </div>
                        <div style={{ fontSize: 13 }}>
                          <span className="gap-muted">Fornecedor: </span>
                          <span>{nomeFornecedor(i.fornecedorId)}</span>
                        </div>
                      </div>
                      {i.observacao && <div className="gap-muted" style={{ marginTop: 6, fontSize: 12 }}>{i.observacao}</div>}
                    </div>
                    <div className="gap-row" style={{ flexShrink: 0 }}>
                      <button className="gap-btn-secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => abrirEdicao(i)}>Editar</button>
                      {confirmDel === i.id
                        ? <ConfirmButtons onConfirm={() => excluir(i.id)} onCancel={() => setConfirmDel(null)} confirmLabel="Excluir" />
                        : <button className="gap-btn-danger" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setConfirmDel(i.id)}>🗑</button>}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
