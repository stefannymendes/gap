// Validação de token do Supabase para os proxies de IA.
// Os proxies (claude.js, gemini.js) chamam esta função ANTES de gastar a chave
// de API. O frontend envia o access token da sessão no header Authorization.
//
// A validação usa o endpoint público /auth/v1/user do Supabase: só precisa da
// chave publicável/anon (não é segredo) + o Bearer token do usuário. Se o token
// for válido, o Supabase devolve o usuário; senão, 401.
//
// Variáveis de ambiente necessárias no servidor (painel da Vercel):
//   SUPABASE_URL       — mesma URL do projeto
//   SUPABASE_ANON_KEY  — a chave publicável (sb_publishable_...)
//
// Arquivos com prefixo "_" não viram endpoints na Vercel — é só um módulo util.

export async function validarUsuario(req) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false, status: 500, message: "SUPABASE_URL / SUPABASE_ANON_KEY não configuradas no servidor." };
  }

  const auth = req.headers?.authorization || req.headers?.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    return { ok: false, status: 401, message: "Não autenticado." };
  }

  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      return { ok: false, status: 401, message: "Sessão inválida ou expirada." };
    }
    const user = await r.json();
    if (!user?.id) {
      return { ok: false, status: 401, message: "Sessão inválida." };
    }
    return { ok: true, user };
  } catch {
    return { ok: false, status: 401, message: "Falha ao validar a sessão." };
  }
}
