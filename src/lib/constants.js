// ─────────────────────────────────────────────────────────────
// Constantes compartilhadas do Gap
// Dados de exemplo REMOVIDOS — sistema entregue limpo.
// ─────────────────────────────────────────────────────────────

export const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// Marketplaces — taxas de referência (valores públicos das plataformas).
// Ajuste a sua taxa real em Configurações. Só a Shopee vem ativa por padrão.
export const MPS_DEFAULT = [
  { id:"shopee",     name:"Shopee",        color:"#EE4D2D", tc:"#fff",  comissao:14, afiliado:0, taxaFixa:4,    ativo:true  },
  { id:"tiktok",     name:"TikTok Shop",   color:"#010101", tc:"#fff",  comissao:6,  afiliado:5, taxaFixa:2,    ativo:false },
  { id:"ml",         name:"Mercado Livre", color:"#FFE600", tc:"#333",  comissao:14, afiliado:0, taxaFixa:6.75, ativo:false },
  { id:"amazon",     name:"Amazon",        color:"#FF9900", tc:"#fff",  comissao:12, afiliado:0, taxaFixa:2,    ativo:false },
  { id:"magalu",     name:"Magalu",        color:"#0086FF", tc:"#fff",  comissao:16, afiliado:0, taxaFixa:0,    ativo:false },
  { id:"shein",      name:"Shein",         color:"#222",    tc:"#fff",  comissao:16, afiliado:0, taxaFixa:5,    ativo:false },
  { id:"kwai",       name:"Kwai Shop",     color:"#FF4B26", tc:"#fff",  comissao:8,  afiliado:5, taxaFixa:4,    ativo:false },
];

// Listas em branco — nada pré-preenchido.
export const CUSTOS_FIXOS_DEFAULT = [];
export const INSUMOS_DEFAULT = [];
export const CUSTOS_PROD_DEFAULT = [];

export const MARGENS = [15, 20, 25, 30, 40];

export const PRIORIDADES = [
  { id:"urgente", label:"Urgente", color:"#EF4444", bg:"#FEF2F2" },
  { id:"alta",    label:"Alta",    color:"#F97316", bg:"#FFF7ED" },
  { id:"media",   label:"Média",   color:"#EAB308", bg:"#FEFCE8" },
  { id:"baixa",   label:"Baixa",   color:"#22C55E", bg:"#F0FDF4" },
];

export const CATEGORIAS_TAREFA = ["Anúncios","Estoque","Preços","Atendimento","Logística","Financeiro","Marketing","Outros"];

export const CATEGORIAS_SAIDA_DEFAULT = ["Materia-prima","Embalagem","Frete","Marketing","Manutencao","Equipamentos","Outros"];

export const SAZONALIDADE = [
  {mes:"01",eventos:[{nome:"Ano Novo",dica:"Promoções de liquidação"},{nome:"Volta às Aulas",dica:"Tênis escolar, calçados infantis"}]},
  {mes:"02",eventos:[{nome:"Carnaval",dica:"Sandálias, rasteiras, coloridos"},{nome:"Verão pleno",dica:"Chinelos, sandálias — estoque alto"}]},
  {mes:"03",eventos:[{nome:"Dia da Mulher (8/3)",dica:"Sapatos femininos, salto"},{nome:"Início do outono",dica:"Botas e fechados"}]},
  {mes:"04",eventos:[{nome:"Páscoa",dica:"Tráfego alto no MP"},{nome:"Outono",dica:"Botas, mocassins"}]},
  {mes:"05",eventos:[{nome:"Dia das Mães",dica:"MAIOR data para calçados femininos"},{nome:"Inverno chegando",dica:"Botas, impermeáveis"}]},
  {mes:"06",eventos:[{nome:"Dia dos Namorados (12/6)",dica:"Kits, calçados premium"},{nome:"Inverno pleno",dica:"Botas em destaque"}]},
  {mes:"07",eventos:[{nome:"Férias escolares",dica:"Tênis infantil, sandálias"},{nome:"Liquidação de inverno",dica:"Girar estoque"}]},
  {mes:"08",eventos:[{nome:"Dia dos Pais",dica:"Calçados masculinos, sociais"},{nome:"Aquecimento primavera",dica:"Modelos primavera/verão"}]},
  {mes:"09",eventos:[{nome:"Primavera (22/9)",dica:"Sandálias coloridas, coleção nova"},{nome:"Semana Brasil",dica:"Evento de desconto dos MPs"}]},
  {mes:"10",eventos:[{nome:"Dia das Crianças (12/10)",dica:"Calçados infantis"},{nome:"Outubro Rosa",dica:"Modelos rosa, colaborações"}]},
  {mes:"11",eventos:[{nome:"Black Friday",dica:"MAIOR evento — descontos reais, estoque máximo"},{nome:"Cyber Monday",dica:"Manter promoções e frete grátis"}]},
  {mes:"12",eventos:[{nome:"Natal",dica:"Segunda maior data — kits, embalagens especiais"},{nome:"Réveillon",dica:"Sandálias e calçados festivos"}]},
];

export const CHECKLIST_IMAGENS = [
  { id:"fundo",     label:"Fundo branco puro na foto principal (exigência Shopee)" },
  { id:"resolucao", label:"Resolução mínima 500×500px (recomendado 1000×1000px)" },
  { id:"produto",   label:"Produto ocupa 80%+ do espaço da imagem" },
  { id:"sombra",    label:"Sem sombras duras ou fundo colorido na foto principal" },
  { id:"angulos",   label:"Pelo menos 3 ângulos diferentes do produto" },
  { id:"sola",      label:"Foto da sola incluída" },
  { id:"detalhe",   label:"Foto de detalhe (textura, material, acabamento)" },
  { id:"etiqueta",  label:"Foto com etiqueta/numeração visível" },
  { id:"uso",       label:"Foto de lifestyle (produto sendo usado)" },
  { id:"medidas",   label:"Tabela de medidas/numeração incluída nas fotos" },
];

// Seções da barra lateral — Produtos agora é SEÇÃO PRÓPRIA, fora de Financeiro.
export const NAV = [
  { id:"home",      label:"Início",        icon:"home",       section:"geral" },
  { id:"produtos",  label:"Produtos",      icon:"hanger",     section:"geral" },
  { id:"insumos",   label:"Insumos",       icon:"box",        section:"geral" },
  { id:"financeiro",label:"Financeiro",    icon:"chart-bar",  section:"financeiro" },
  { id:"empresa",   label:"Custos fixos",  icon:"building",   section:"financeiro" },
  { id:"anuncios",  label:"Anúncios IA",   icon:"sparkles",   section:"anuncios" },
  { id:"imagens",   label:"Imagens IA",    icon:"image",      section:"anuncios" },
  { id:"analytics", label:"Analista IA",   icon:"microscope", section:"anuncios" },
  { id:"tarefas",   label:"Tarefas",       icon:"checklist",  section:"operacao" },
  { id:"metas",     label:"Metas",         icon:"target",     section:"operacao" },
  { id:"config",    label:"Configurações", icon:"settings",   section:"operacao" },
];

export const NAV_SECTIONS = [
  { id:"geral",      label:null },
  { id:"financeiro", label:"Financeiro" },
  { id:"anuncios",   label:"Anúncios" },
  { id:"operacao",   label:"Operação" },
];
