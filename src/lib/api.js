// Cliente de IA do Gap.
// IMPORTANTE: aqui NÃO existe a chave da API. Este cliente chama o proxy
// em /api/claude, que roda no servidor (Vercel) e guarda a chave em segredo.
// Em desenvolvimento local, use `vercel dev` para o proxy funcionar.

const ENDPOINT = "/api/claude";

// Chamada simples (texto). messages = array no formato Anthropic.
export async function apiFetch(messages, maxTokens = 1000, system = "") {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, max_tokens: maxTokens, ...(system ? { system } : {}) }),
  });

  // O artefato exigia res.text()+JSON.parse(); aqui o proxy retorna JSON limpo,
  // mas mantemos o tratamento robusto.
  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error("Resposta inválida do servidor de IA."); }

  if (!res.ok || data.error) {
    const msg = data?.error?.message || data?.error || `Erro ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new Error("Chave de API ausente ou inválida. Configure ANTHROPIC_API_KEY.");
    if (res.status === 429) throw new Error("Limite de uso atingido. Tente novamente em instantes.");
    throw new Error(msg);
  }

  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
}

// Geração de imagem via Gemini (Nano Banana).
// Retorna { base64, mimeType } ou lança erro.
export async function generateImage(prompt, images = []) {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, images }),
  });
  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error("Resposta inválida do servidor de imagem."); }

  if (!res.ok || data.error) {
    const msg = data?.error?.message || data?.error || `Erro ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new Error("Chave do Google ausente ou inválida. Configure GOOGLE_API_KEY na Vercel.");
    if (res.status === 429) throw new Error("Limite de uso atingido no Gemini. Tente novamente em instantes.");
    throw new Error(msg);
  }

  if (!data.image?.base64) throw new Error("Nenhuma imagem retornada.");
  return data.image;
}
