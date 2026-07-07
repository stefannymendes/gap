import { MESES } from "./constants";

export const fmt    = v => Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export const fmtN   = v => Number(v||0).toLocaleString("pt-BR");
export const pct    = v => `${Number(v||0).toFixed(1)}%`;
export const pn     = v => Number(String(v??0).replace(/[^\d,.-]/g,"").replace(",","."))||0;

export const mesAtual    = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); };
export const mesNumeral  = () => String(new Date().getMonth()+1).padStart(2,"0");
export const labelMes    = m => { if(!m)return""; const p=String(m).split("-"); return MESES[Number(p[1])-1]+"/"+p[0]; };

export const extrairMes = dataStr => {
  if(!dataStr) return null;
  const match = String(dataStr).match(/(\d{4})-(\d{2})/);
  if(match) return match[1]+"-"+match[2];
  // dd/mm/yyyy
  const br = String(dataStr).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if(br) return br[3]+"-"+br[2];
  return null;
};

export const extrairPrefixoSKU = sku => {
  if(!sku) return null;
  const partes = String(sku).toUpperCase().split("-");
  let prefixo = partes[0];
  if(partes.length>1 && !/^\d/.test(partes[1])) prefixo += "-" + partes[1].replace(/\d.*$/,"").replace(/-$/,"");
  return prefixo.replace(/-$/,"");
};

export function downloadBlob(blob, filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function copyText(text){
  try{ if(navigator.clipboard){ await navigator.clipboard.writeText(text); return true; } }catch{}
  try{
    const ta=document.createElement("textarea");
    ta.value=text;
    ta.style.cssText="position:fixed;top:0;left:0;width:2px;height:2px;opacity:0.01;";
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok=document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }catch{ return false; }
}

export function comprimirImagem(file, max=400, quality=0.6){
  return new Promise(res=>{
    const reader=new FileReader();
    reader.onload=ev=>{
      const img=new Image();
      img.onload=()=>{
        let w=img.width,h=img.height;
        if(w>max||h>max){ if(w>h){h=Math.round(h*max/w);w=max;} else {w=Math.round(w*max/h);h=max;} }
        const canvas=document.createElement("canvas"); canvas.width=w; canvas.height=h;
        canvas.getContext("2d").drawImage(img,0,0,w,h);
        const data=canvas.toDataURL("image/jpeg",quality);
        res({preview:data, base64:data.split(",")[1]});
      };
      img.src=ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}
