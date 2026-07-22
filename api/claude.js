// Proxy de IA do Gap (função serverless da Vercel).
// A chave da API fica AQUI, no servidor — nunca vai para o navegador.
// Configure a variável de ambiente ANTHROPIC_API_KEY no painel da Vercel.

import { validarUsuario } from "./_supabaseAuth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }

  // Só usuários autenticados podem gastar a chave de API.
  const auth = await validarUsuario(req);
  if (!auth.ok) {
    res.status(auth.status).json({ error: { message: auth.message } });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(401).json({ error: { message: "ANTHROPIC_API_KEY não configurada no servidor." } });
    return;
  }

  try {
    const { messages, max_tokens = 1000, system } = req.body || {};

    const body = {
      model: "claude-sonnet-4-6",
      max_tokens,
      messages,
      ...(system ? { system } : {}),
    };

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: { message: e.message || "Erro no proxy de IA." } });
  }
}
