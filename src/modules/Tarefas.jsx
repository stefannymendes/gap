import { useState } from "react";
import { useGap } from "../lib/store";
import { Topbar, Card, ConfirmButtons, EmptyState } from "../lib/ui";
import { PRIORIDADES, CATEGORIAS_TAREFA } from "../lib/constants";

const prioInfo = id => PRIORIDADES.find(p => p.id === id) || PRIORIDADES[2];
const FORM_VAZIO = { titulo:"", descricao:"", prioridade:"media", categoria:"Anúncios", marketplace:"todas", prazo:"", recorrente:false };

export default function Tarefas({ onMenu }) {
  const { tarefas, setTarefas, mps, salvando } = useGap();
  const [form, setForm] = useState(FORM_VAZIO);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [fStatus, setFStatus] = useState("todas");
  const [fMP, setFMP] = useState("todas");
  const [fCat, setFCat] = useState("todas");
  const [confirmDel, setConfirmDel] = useState(null);

  const pendentes = tarefas.filter(t => !t.concluida).length;
  const urgentes = tarefas.filter(t => !t.concluida && t.prioridade === "urgente").length;
  const concluidas = tarefas.filter(t => t.concluida).length;

  const abrirNova = () => { setForm(FORM_VAZIO); setEditId(null); setShowForm(true); };
  const abrirEdicao = (t) => {
    setForm({ titulo:t.titulo, descricao:t.descricao||"", prioridade:t.prioridade, categoria:t.categoria, marketplace:t.marketplace, prazo:t.prazo||"", recorrente:!!t.recorrente });
    setEditId(t.id); setShowForm(true);
  };
  const salvar = () => {
    if (!form.titulo.trim()) return;
    if (editId) {
      setTarefas(p => p.map(t => t.id === editId ? { ...t, ...form } : t));
    } else {
      setTarefas(p => [...p, { ...form, id: Date.now(), concluida: false, criadaEm: Date.now() }]);
    }
    setForm(FORM_VAZIO); setEditId(null); setShowForm(false);
  };
  const toggle = id => setTarefas(p => p.map(t => t.id === id ? { ...t, concluida: !t.concluida } : t));
  const excluir = id => { setTarefas(p => p.filter(t => t.id !== id)); setConfirmDel(null); };

  const filtradas = tarefas.filter(t => {
    if (fStatus === "pendente" && t.concluida) return false;
    if (fStatus === "concluida" && !t.concluida) return false;
    if (fMP !== "todas" && t.marketplace !== "todas" && t.marketplace !== fMP) return false;
    if (fCat !== "todas" && t.categoria !== fCat) return false;
    return true;
  }).sort((a, b) => {
    if (a.concluida !== b.concluida) return a.concluida ? 1 : -1;
    const o = ["urgente","alta","media","baixa"];
    return o.indexOf(a.prioridade) - o.indexOf(b.prioridade);
  });

  const stats = [
    { l:"Pendentes", v:pendentes, c:"#2563EB" },
    { l:"Urgentes", v:urgentes, c:"#DC2626" },
    { l:"Concluídas", v:concluidas, c:"#16A34A" },
    { l:"Total", v:tarefas.length, c:"#0D0D0F" },
  ];

  return (
    <>
      <Topbar title="Tarefas" salvando={salvando} onMenu={onMenu}
        action={<button className="gap-btn-primary" style={{fontSize:12,padding:"7px 14px"}} onClick={abrirNova}>+ Nova tarefa</button>} />
      <div className="gap-content">
        <div className="gap-stack" style={{maxWidth:780}}>

          <div className="gap-grid-4">
            {stats.map(s => (
              <Card key={s.l} style={{padding:"14px 12px",textAlign:"center"}}>
                <div style={{fontSize:26,fontWeight:600,color:s.c}}>{s.v}</div>
                <div className="gap-muted" style={{marginTop:2}}>{s.l}</div>
              </Card>
            ))}
          </div>

          <Card style={{padding:"10px 12px"}}>
            <div className="gap-row" style={{flexWrap:"wrap",gap:8,alignItems:"center"}}>
              <div className="gap-row" style={{gap:4}}>
                {[["todas","Todas"],["pendente","Pendentes"],["concluida","Concluídas"]].map(([id,l]) => (
                  <button key={id} onClick={()=>setFStatus(id)} className={`gap-btn-${fStatus===id?"primary":"secondary"}`} style={{fontSize:12,padding:"5px 10px"}}>{l}</button>
                ))}
              </div>
              <select className="gap-select" value={fMP} onChange={e=>setFMP(e.target.value)}>
                <option value="todas">Todos MPs</option>
                {mps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select className="gap-select" value={fCat} onChange={e=>setFCat(e.target.value)}>
                <option value="todas">Todas categorias</option>
                {CATEGORIAS_TAREFA.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </Card>

          {showForm && (
            <Card style={{border:"1.5px solid #DBEAFE"}}>
              <div className="gap-row-between" style={{marginBottom:14}}>
                <span style={{fontSize:14,fontWeight:500}}>{editId ? "Editar tarefa" : "Nova tarefa"}</span>
                <button className="gap-btn-ghost" style={{fontSize:20}} onClick={()=>{setShowForm(false);setEditId(null);}}>×</button>
              </div>
              <div className="gap-stack">
                <input className="gap-input" placeholder="Título *" value={form.titulo} onChange={e=>setForm(p=>({...p,titulo:e.target.value}))} />
                <textarea className="gap-input" rows={2} placeholder="Descrição (opcional)" value={form.descricao} onChange={e=>setForm(p=>({...p,descricao:e.target.value}))} style={{resize:"vertical"}} />
                <div className="gap-grid-2">
                  <div><label className="gap-label">Prioridade</label>
                    <select className="gap-select" style={{width:"100%"}} value={form.prioridade} onChange={e=>setForm(p=>({...p,prioridade:e.target.value}))}>
                      {PRIORIDADES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>
                  <div><label className="gap-label">Categoria</label>
                    <select className="gap-select" style={{width:"100%"}} value={form.categoria} onChange={e=>setForm(p=>({...p,categoria:e.target.value}))}>
                      {CATEGORIAS_TAREFA.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label className="gap-label">Marketplace</label>
                    <select className="gap-select" style={{width:"100%"}} value={form.marketplace} onChange={e=>setForm(p=>({...p,marketplace:e.target.value}))}>
                      <option value="todas">Todos</option>
                      {mps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div><label className="gap-label">Prazo</label>
                    <input type="date" className="gap-input" value={form.prazo} onChange={e=>setForm(p=>({...p,prazo:e.target.value}))} />
                  </div>
                </div>
                <label className="gap-row" style={{gap:8,alignItems:"center",fontSize:13.5,color:"#555",cursor:"pointer"}}>
                  <input type="checkbox" checked={form.recorrente} onChange={e=>setForm(p=>({...p,recorrente:e.target.checked}))} style={{accentColor:"#2563EB"}} />
                  Tarefa recorrente
                </label>
                <div className="gap-row" style={{paddingTop:8,borderTop:"1px solid #EBEBEB"}}>
                  <button className="gap-btn-primary" onClick={salvar}>{editId ? "Salvar alterações" : "Adicionar"}</button>
                  <button className="gap-btn-secondary" onClick={()=>{setShowForm(false);setEditId(null);}}>Cancelar</button>
                </div>
              </div>
            </Card>
          )}

          {filtradas.length === 0 && !showForm ? (
            <EmptyState icon="✅" title="Nenhuma tarefa aqui" desc="Crie tarefas para organizar as demandas dos marketplaces." action={abrirNova} actionLabel="+ Criar primeira tarefa" />
          ) : (
            <div className="gap-stack" style={{gap:8}}>
              {filtradas.map(t => {
                const prio = prioInfo(t.prioridade);
                const mp = mps.find(m => m.id === t.marketplace);
                const vencida = t.prazo && !t.concluida && new Date(t.prazo) < new Date();
                return (
                  <Card key={t.id} style={{borderLeft:`3px solid ${t.concluida?"#D1D5DB":prio.color}`,opacity:t.concluida?0.65:1}}>
                    <div className="gap-row" style={{alignItems:"flex-start",gap:12}}>
                      <button onClick={()=>toggle(t.id)} style={{width:22,height:22,borderRadius:"50%",flexShrink:0,marginTop:1,cursor:"pointer",border:`2px solid ${t.concluida?"#16A34A":"#CBD5E1"}`,background:t.concluida?"#16A34A":"transparent",color:"#fff",fontSize:12,lineHeight:1}}>{t.concluida?"✓":""}</button>
                      <div style={{flex:1,minWidth:0}}>
                        <div className="gap-row-between" style={{gap:8,alignItems:"flex-start"}}>
                          <span style={{fontSize:14,fontWeight:500,textDecoration:t.concluida?"line-through":"none",color:t.concluida?"#9CA3AF":"#0D0D0F"}}>{t.titulo}</span>
                          <div className="gap-row" style={{gap:4,flexShrink:0,alignItems:"center"}}>
                            {!t.concluida && confirmDel !== t.id && (
                              <button className="gap-btn-ghost" style={{color:"#64748B",fontSize:12,padding:"2px 8px"}} onClick={()=>abrirEdicao(t)}>Editar</button>
                            )}
                            {confirmDel === t.id
                              ? <ConfirmButtons onConfirm={()=>excluir(t.id)} onCancel={()=>setConfirmDel(null)} confirmLabel="Excluir" />
                              : <button className="gap-btn-ghost" style={{color:"#CBD5E1",fontSize:18}} onClick={()=>setConfirmDel(t.id)}>×</button>}
                          </div>
                        </div>
                        {t.descricao && <div className="gap-muted" style={{marginTop:3}}>{t.descricao}</div>}
                        <div className="gap-row" style={{marginTop:8,flexWrap:"wrap",gap:6}}>
                          <span style={{fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:20,background:prio.bg,color:prio.color}}>{prio.label}</span>
                          <span style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:"#F5F5F3",color:"#555"}}>{t.categoria}</span>
                          {mp && <span style={{fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:20,background:mp.color,color:mp.tc}}>{mp.name}</span>}
                          {t.prazo && <span style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:vencida?"#FEF2F2":"#EFF6FF",color:vencida?"#DC2626":"#1D4ED8",fontWeight:vencida?600:400}}>{vencida?"Vencida: ":""}{new Date(t.prazo).toLocaleDateString("pt-BR")}</span>}
                          {t.recorrente && <span style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:"#F5F3FF",color:"#7C3AED"}}>Recorrente</span>}
                          {t.geradoPorIA && <span style={{fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:20,background:"#EEF2FF",color:"#4F46E5"}}>IA</span>}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
