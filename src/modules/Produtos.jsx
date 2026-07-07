import { useState } from "react";
import { useGap } from "../lib/store";
import { fmt, fmtN, pn, labelMes, mesAtual } from "../lib/utils";
import { INSUMOS_DEFAULT, CUSTOS_PROD_DEFAULT, MARGENS } from "../lib/constants";
import { Topbar, Card, EmptyState, NumInput, Badge, ConfirmButtons } from "../lib/ui";

export const calcCustoUnitario = prod => {
  const ins = (prod.insumos||[]).reduce((s,i)=>s+pn(i.qtd)*pn(i.custo),0);
  const cp  = (prod.custosProd||[]).reduce((s,c)=>s+pn(c.valor),0);
  return ins + cp;
};

export default function Produtos({ onMenu }) {
  const { produtos, setProdutos, pedidos, salvando, mps, imposto, insumosCadastro } = useGap();
  const [showEditor, setShowEditor] = useState(false);
  const [editId, setEditId] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [form, setForm] = useState({ nome:"", prefixo:"", insumos:INSUMOS_DEFAULT, custosProd:CUSTOS_PROD_DEFAULT });
  const [margem, setMargem] = useState(30);
  const [margemCustom, setMargemCustom] = useState("");

  const mpsAtivos = (mps||[]).filter(m => m.ativo);
  const margemAtiva = (margemCustom !== "" && Number(margemCustom) > 0 && Number(margemCustom) < 100) ? Number(margemCustom) : margem;

  const produtosComCusto = produtos.map(p => ({ ...p, custoUnitario: calcCustoUnitario(p) }));
  const custoAtual = calcCustoUnitario(form);
  const mes = mesAtual();

  const abrirNovo = () => { setForm({ nome:"", prefixo:"", insumos:[{id:Date.now(),insumoId:null,nome:"",qtd:1,custo:0}], custosProd:[{id:Date.now()+1,nome:"Mão de obra",valor:0}] }); setEditId(null); setShowEditor(true); };
  const abrirEditar = p => { setForm({ nome:p.nome, prefixo:p.prefixo, insumos:p.insumos||[], custosProd:p.custosProd||[] }); setEditId(p.id); setShowEditor(true); };
  const salvar = () => {
    if (!form.nome.trim() || !form.prefixo.trim()) { alert("Preencha nome e prefixo."); return; }
    const dados = { ...form, prefixo: form.prefixo.toUpperCase().trim(), id: editId || Date.now() };
    if (editId) setProdutos(p => p.map(x => x.id===editId ? dados : x));
    else setProdutos(p => [...p, dados]);
    setShowEditor(false); setEditId(null);
  };

  return (
    <>
      <Topbar title="Produtos" salvando={salvando} onMenu={onMenu}
        action={<button className="gap-btn-primary" style={{fontSize:12,padding:"7px 14px"}} onClick={abrirNovo}>+ Novo produto</button>} />
      <div className="gap-content">
        <div className="gap-stack" style={{maxWidth:720}}>

          <div className="gap-alert gap-alert-info">
            <div className="gap-alert-dot dot-info"/>
            <div>
              <div className="gap-alert-title">Como funciona o prefixo</div>
              <div className="gap-alert-desc">
                Cadastre o prefixo do SKU (tudo antes da cor/numeração). O prefixo <span className="gap-mono">SANDXR</span> reconhece
                automaticamente <span className="gap-mono">SANDXR-RG25</span>, <span className="gap-mono">SANDXR-P29</span> etc. e aplica o custo correto no fechamento.
              </div>
            </div>
          </div>

          {showEditor && (
            <Card style={{border:"1.5px solid #DBEAFE"}}>
              <div className="gap-row-between" style={{marginBottom:16}}>
                <span style={{fontSize:14,fontWeight:500}}>{editId?"Editar produto":"Novo produto"}</span>
                <button className="gap-btn-ghost" style={{fontSize:20}} onClick={()=>setShowEditor(false)}>×</button>
              </div>
              <div className="gap-stack">
                <div className="gap-grid-2">
                  <div>
                    <label className="gap-label">Nome do produto *</label>
                    <input className="gap-input" value={form.nome} onChange={e=>setForm(p=>({...p,nome:e.target.value}))} placeholder="Ex: Sandália Xereta Infantil"/>
                  </div>
                  <div>
                    <label className="gap-label">Prefixo do SKU *</label>
                    <input className="gap-input gap-mono" value={form.prefixo} onChange={e=>setForm(p=>({...p,prefixo:e.target.value.toUpperCase()}))} placeholder="SANDXR"/>
                    <div className="gap-muted" style={{marginTop:4}}>Tudo antes da cor/numeração</div>
                  </div>
                </div>

                <div style={{background:"#0D0D0F",borderRadius:10,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:11,color:"rgba(255,255,255,.35)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:3}}>Custo unitário</div>
                    <div style={{fontSize:24,fontWeight:600,color:"#fff",letterSpacing:-0.5}}>{fmt(custoAtual)}</div>
                  </div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,.4)",textAlign:"right",lineHeight:1.7}}>
                    <div>Insumos: {fmt((form.insumos||[]).reduce((s,i)=>s+pn(i.qtd)*pn(i.custo),0))}</div>
                    <div>Produção: {fmt((form.custosProd||[]).reduce((s,c)=>s+pn(c.valor),0))}</div>
                  </div>
                </div>

                <div>
                  <div className="gap-section-label">Insumos</div>
                  {insumosCadastro.length === 0 && (
                    <div className="gap-alert gap-alert-warn" style={{marginBottom:10}}>
                      <div className="gap-alert-dot dot-warn"/>
                      <div>
                        <div className="gap-alert-desc">Você ainda não cadastrou nenhum insumo. Cadastre em <b>Insumos</b> na barra lateral para reutilizá-los aqui — ou preencha manualmente abaixo.</div>
                      </div>
                    </div>
                  )}
                  {(form.insumos||[]).map(ins=>(
                    <div key={ins.id} className="gap-row" style={{marginBottom:8,flexWrap:"wrap"}}>
                      {insumosCadastro.length > 0 ? (
                        <select
                          className="gap-select"
                          style={{flex:2,minWidth:180}}
                          value={ins.insumoId || "__manual"}
                          onChange={e=>{
                            const val = e.target.value;
                            if (val === "__manual") {
                              setForm(p=>({...p,insumos:p.insumos.map(i=>i.id===ins.id?{...i,insumoId:null,nome:i.nome||"",custo:i.custo||0}:i)}));
                            } else {
                              const insu = insumosCadastro.find(x=>String(x.id)===val);
                              if (insu) setForm(p=>({...p,insumos:p.insumos.map(i=>i.id===ins.id?{...i,insumoId:insu.id,nome:insu.nome,custo:insu.custo}:i)}));
                            }
                          }}
                        >
                          <option value="__manual">— digitar manualmente —</option>
                          {insumosCadastro.map(x=>(
                            <option key={x.id} value={x.id}>{x.nome} · {fmt(pn(x.custo))}/{x.unidade||"un"}</option>
                          ))}
                        </select>
                      ) : (
                        <input className="gap-input" style={{flex:2,minWidth:140}} value={ins.nome} onChange={e=>setForm(p=>({...p,insumos:p.insumos.map(i=>i.id===ins.id?{...i,nome:e.target.value}:i)}))} placeholder="Nome"/>
                      )}
                      {!ins.insumoId && insumosCadastro.length > 0 && (
                        <input className="gap-input" style={{flex:1,minWidth:110}} value={ins.nome} onChange={e=>setForm(p=>({...p,insumos:p.insumos.map(i=>i.id===ins.id?{...i,nome:e.target.value}:i)}))} placeholder="Nome"/>
                      )}
                      <input type="number" className="gap-input" style={{width:64}} value={ins.qtd} onChange={e=>setForm(p=>({...p,insumos:p.insumos.map(i=>i.id===ins.id?{...i,qtd:e.target.value}:i)}))} placeholder="Qtd"/>
                      {ins.insumoId ? (
                        <div style={{minWidth:110,padding:"8px 10px",background:"#F5F5F3",borderRadius:8,fontSize:13,color:"#555"}}>{fmt(pn(ins.custo))}</div>
                      ) : (
                        <NumInput value={ins.custo} onChange={v=>setForm(p=>({...p,insumos:p.insumos.map(i=>i.id===ins.id?{...i,custo:v}:i)}))}/>
                      )}
                      <button className="gap-btn-ghost" style={{color:"#EF4444",fontSize:18}} onClick={()=>setForm(p=>({...p,insumos:p.insumos.filter(i=>i.id!==ins.id)}))}>×</button>
                    </div>
                  ))}
                  <button className="gap-btn-secondary" style={{fontSize:12,padding:"6px 12px"}} onClick={()=>setForm(p=>({...p,insumos:[...p.insumos,{id:Date.now(),insumoId:null,nome:"",qtd:1,custo:0}]}))}>+ Insumo</button>
                </div>

                <div>
                  <div className="gap-section-label">Custos de produção</div>
                  {(form.custosProd||[]).map(c=>(
                    <div key={c.id} className="gap-row" style={{marginBottom:8}}>
                      <input className="gap-input" style={{flex:1}} value={c.nome} onChange={e=>setForm(p=>({...p,custosProd:p.custosProd.map(x=>x.id===c.id?{...x,nome:e.target.value}:x)}))} placeholder="Ex: Mão de obra"/>
                      <NumInput value={c.valor} onChange={v=>setForm(p=>({...p,custosProd:p.custosProd.map(x=>x.id===c.id?{...x,valor:v}:x)}))}/>
                      <button className="gap-btn-ghost" style={{color:"#EF4444",fontSize:18}} onClick={()=>setForm(p=>({...p,custosProd:p.custosProd.filter(x=>x.id!==c.id)}))}>×</button>
                    </div>
                  ))}
                  <button className="gap-btn-secondary" style={{fontSize:12,padding:"6px 12px"}} onClick={()=>setForm(p=>({...p,custosProd:[...p.custosProd,{id:Date.now(),nome:"",valor:0}]}))}>+ Custo</button>
                </div>

                <div>
                  <div className="gap-section-label">Preços sugeridos por plataforma</div>
                  {mpsAtivos.length === 0 ? (
                    <div className="gap-alert gap-alert-warn">
                      <div className="gap-alert-dot dot-warn"/>
                      <div>
                        <div className="gap-alert-title">Nenhum marketplace ativo</div>
                        <div className="gap-alert-desc">Ative ao menos um marketplace e ajuste as taxas em Configurações para ver preço e margem aqui.</div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="gap-row" style={{flexWrap:"wrap",gap:8,marginBottom:12,alignItems:"center"}}>
                        <span className="gap-muted">Margem desejada:</span>
                        {MARGENS.map(m=>(
                          <button key={m} onClick={()=>{setMargem(m);setMargemCustom("");}}
                            className={`gap-btn-${margem===m && margemCustom==="" ? "primary":"secondary"}`}
                            style={{padding:"6px 12px",fontSize:12.5}}>{m}%</button>
                        ))}
                        <div style={{width:96}}>
                          <NumInput prefix="%" value={margemCustom} onChange={v=>setMargemCustom(v)} step="1"/>
                        </div>
                      </div>
                      <div className="gap-grid-2">
                        {mpsAtivos.map(mp=>{
                          const tx = (pn(mp.comissao)+pn(mp.afiliado)+pn(imposto))/100;
                          const den = 1 - tx - margemAtiva/100;
                          const preco = den>0 ? (custoAtual+pn(mp.taxaFixa))/den : null;
                          const lucro = preco!==null ? preco*margemAtiva/100 : null;
                          const denMin = 1 - tx;
                          const precoMin = denMin>0 ? (custoAtual+pn(mp.taxaFixa))/denMin : null;
                          const semTaxa = pn(mp.comissao)===0 && pn(mp.taxaFixa)===0;
                          return (
                            <div key={mp.id} className="gap-card" style={{padding:0,overflow:"hidden"}}>
                              <div style={{background:mp.color,color:mp.tc,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                <span style={{fontSize:13,fontWeight:600}}>{mp.name}</span>
                                <span style={{fontSize:11,opacity:.85}}>{(pn(mp.comissao)+pn(mp.afiliado)).toFixed(1)}% + {fmt(pn(mp.taxaFixa))}</span>
                              </div>
                              <div style={{padding:"12px 14px",textAlign:"center"}}>
                                {preco===null ? (
                                  <div style={{padding:"4px 0"}}>
                                    <div style={{fontSize:13,fontWeight:600,color:"#EF4444"}}>Margem inviável</div>
                                    <div className="gap-muted" style={{marginTop:2}}>Taxas + margem ≥ 100%</div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="gap-muted">Preço sugerido ({margemAtiva.toFixed(1)}%)</div>
                                    <div style={{fontSize:23,fontWeight:600,letterSpacing:-0.5,marginTop:1}}>{fmt(preco)}</div>
                                    <div style={{fontSize:13,color:"#16A34A",fontWeight:500,marginTop:2}}>Lucro: {fmt(lucro)}</div>
                                    <div style={{fontSize:11.5,color:"#EF4444",marginTop:4}}>Preço mínimo (sem lucro): {precoMin!==null?fmt(precoMin):"—"}</div>
                                  </>
                                )}
                                {semTaxa && <div className="gap-muted" style={{marginTop:6,fontSize:11}}>⚠ Taxas zeradas — ajuste em Configurações</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                <div className="gap-row" style={{paddingTop:8,borderTop:"1px solid #EBEBEB"}}>
                  <button className="gap-btn-primary" onClick={salvar}>Salvar produto</button>
                  <button className="gap-btn-secondary" onClick={()=>setShowEditor(false)}>Cancelar</button>
                </div>
              </div>
            </Card>
          )}

          {produtos.length===0 && !showEditor && (
            <EmptyState icon="👟" title="Nenhum produto cadastrado" desc="Cadastre seus produtos para calcular o custo real de cada venda no fechamento." action={abrirNovo} actionLabel="+ Cadastrar primeiro produto"/>
          )}

          {produtosComCusto.map(p=>{
            const vendasMes = pedidos.filter(x=>!x.cancelado && x.mesCriacao===mes && x.sku && x.sku.toUpperCase().startsWith(p.prefixo)).length;
            return (
              <Card key={p.id}>
                <div className="gap-row-between" style={{flexWrap:"wrap",gap:12}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:500,fontSize:14}}>{p.nome}</div>
                    <div className="gap-row" style={{marginTop:5,flexWrap:"wrap"}}>
                      <Badge variant="blue">prefixo: {p.prefixo}</Badge>
                      <Badge>custo: {fmt(p.custoUnitario)}/par</Badge>
                      {vendasMes>0 && <Badge variant="green">{fmtN(vendasMes)} vendas em {labelMes(mes)}</Badge>}
                    </div>
                  </div>
                  <div className="gap-row" style={{flexShrink:0}}>
                    <button className="gap-btn-secondary" style={{padding:"6px 12px",fontSize:12}} onClick={()=>abrirEditar(p)}>Editar</button>
                    {confirmDel===p.id
                      ? <ConfirmButtons onConfirm={()=>{setProdutos(x=>x.filter(y=>y.id!==p.id));setConfirmDel(null);}} onCancel={()=>setConfirmDel(null)} confirmLabel="Excluir"/>
                      : <button className="gap-btn-danger" style={{padding:"6px 10px",fontSize:12}} onClick={()=>setConfirmDel(p.id)}>🗑</button>}
                  </div>
                </div>
                <div style={{borderTop:"1px solid #EBEBEB",marginTop:12,paddingTop:12,display:"flex",gap:20,flexWrap:"wrap"}}>
                  <div><div className="gap-muted" style={{marginBottom:3}}>Insumos</div>{(p.insumos||[]).map(i=><div key={i.id} style={{fontSize:12.5,color:"#333"}}>{i.nome}: {fmt(pn(i.qtd)*pn(i.custo))}</div>)}</div>
                  <div><div className="gap-muted" style={{marginBottom:3}}>Produção</div>{(p.custosProd||[]).map(c=><div key={c.id} style={{fontSize:12.5,color:"#333"}}>{c.nome}: {fmt(pn(c.valor))}</div>)}</div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
