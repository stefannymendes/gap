// Provider de autenticação do Gap (Supabase Auth, e-mail/senha).
// Expõe o usuário/sessão atuais e os métodos de auth. Envolve o app ANTES do
// GapProvider — se não há sessão, o App mostra a tela de login e nenhum módulo
// carrega. A sessão é persistente (padrão do supabase-js): sobrevive a refresh
// e a fechar/abrir o navegador.

import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "./supabase";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Ativo quando o usuário chega pelo link de reset de senha do e-mail.
  // Nesse estado existe sessão, mas queremos forçar a tela de "definir nova senha"
  // em vez de já liberar o app.
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    // Sessão inicial (do storage local do supabase-js).
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    // Mudanças: login, logout, refresh de token, recuperação de senha.
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(sess);
      setUser(sess?.user ?? null);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // ── Métodos ──
  const entrar = (email, senha) =>
    supabase.auth.signInWithPassword({ email, password: senha });

  const cadastrar = (email, senha) =>
    supabase.auth.signUp({ email, password: senha });

  const sair = () => supabase.auth.signOut();

  const recuperarSenha = (email) =>
    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}`,
    });

  const definirNovaSenha = async (novaSenha) => {
    const r = await supabase.auth.updateUser({ password: novaSenha });
    if (!r.error) setRecovery(false);
    return r;
  };

  const value = {
    session, user, loading, recovery,
    entrar, cadastrar, sair, recuperarSenha, definirNovaSenha,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
