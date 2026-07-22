// Proxy do Gemini para geração de imagens (Nano Banana / Gemini 2.5 Flash Image).
// A chave fica AQUI, no servidor — nunca vai para o navegador.
// Configure a variável GOOGLE_API_KEY no painel da Vercel.

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

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    res.status(401).json({ error: { message: "GOOGLE_API_KEY não configurada no servidor." } });
    return;
  }

  try {
    const { prompt, images, aspectRatio } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: { message: "prompt (string) obrigatório." } });
      return;
    }

    // Monta o conteúdo: pode ter só texto ou texto + imagens base para edição/variação
    const parts = [{ text: prompt }];
    if (Array.isArray(images)) {
      for (const img of images) {
        if (img?.base64 && img?.mimeType) {
          parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
        }
      }
    }

    // Modelo Nano Banana — 2.5 Flash Image
    const modelo = "gemini-2.5-flash-image";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          // CORREÇÃO: o modelo exige TEXT junto com IMAGE.
          // Pedir só "Image" faz a chamada falhar (modalidade não suportada).
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { aspectRatio: aspectRatio || "1:1" },
        },
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      res.status(r.status).json({
        error: { message: data?.error?.message || "Erro do Gemini.", details: data?.error },
      });
      return;
    }

    // Encontra a imagem retornada
    const candidatoParts = data?.candidates?.[0]?.content?.parts || [];
    const img = candidatoParts.find((p) => p.inlineData?.data);

    if (!img) {
      // Retorna o motivo, se houver
      const bloqueio = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
      res.status(200).json({
        error: { message: bloqueio ? `Sem imagem gerada (${bloqueio}). Ajuste o prompt e tente novamente.` : "Sem imagem gerada." },
      });
      return;
    }

    res.status(200).json({
      image: {
        base64: img.inlineData.data,
        mimeType: img.inlineData.mimeType || "image/png",
      },
    });
  } catch (e) {
    res.status(500).json({ error: { message: e.message || "Erro no proxy do Gemini." } });
  }
}
