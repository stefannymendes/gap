// Cliente Supabase único do Gap.
// As credenciais aqui são PÚBLICAS (URL + chave publicável) — a segurança real
// vem do RLS (Row Level Security) no banco: cada usuário só enxerga as próprias
// linhas. Nunca coloque chaves secretas/service_role aqui.
//
// As variáveis vêm do ambiente Vite (.env.local em dev, painel da Vercel em prod).

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // Não derruba o app — apenas avisa no console. Sem config, o login não funciona.
  console.warn(
    "[Gap] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY não configuradas. " +
    "Defina-as no .env.local (dev) e no painel da Vercel (produção)."
  );
}

export const supabase = createClient(url || "", key || "", {
  auth: {
    persistSession: true,      // sessão sobrevive a refresh e fechar/abrir o navegador
    autoRefreshToken: true,
    detectSessionInUrl: true,  // necessário para o fluxo de reset de senha por link
  },
});

export default supabase;
