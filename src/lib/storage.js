// Atalho de armazenamento local com a MESMA interface do window.storage
// usado nos módulos originais (get/set/remove assíncronos retornando {value}).
// Substitui o storage do artefato por localStorage do navegador.

const storage = {
  async get(key){
    try{
      const v = localStorage.getItem("gap:"+key);
      return v === null ? null : { value: v };
    }catch{ return null; }
  },
  async set(key, value){
    try{
      localStorage.setItem("gap:"+key, value);
      return { value };
    }catch(e){
      // localStorage cheio — sinaliza pra UI tratar (igual ao 409 do artefato)
      throw e;
    }
  },
  async remove(key){
    try{ localStorage.removeItem("gap:"+key); }catch{}
    return { ok:true };
  },
  async list(){
    const keys=[];
    try{
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(k && k.startsWith("gap:")) keys.push(k.slice(4));
      }
    }catch{}
    return { keys };
  }
};

// Disponibiliza como window.storage para o código portado funcionar sem alteração.
if (typeof window !== "undefined") {
  window.storage = storage;
}

export default storage;
