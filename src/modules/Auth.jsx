// Telas de autenticação do Gap: Login, Cadastro, Esqueci minha senha e
// Definir nova senha (fluxo de reset por e-mail). Mesma linguagem visual do
// resto do app (classes gap-*). Textos em português.

import { useState } from "react";
import { useAuth } from "../lib/auth";

const wrap = {
  minHeight: "100vh", width: "100%", display: "flex", alignItems: "center",
  justifyContent: "center", background: "#F5F5F3", padding: 24,
  fontFamily: "'DM Sans',sans-serif",
};
const card = {
  width: "100%", maxWidth: 380, background: "#fff", border: "1px solid #EBEBEB",
  borderRadius: 16, padding: "28px 26px", boxShadow: "0 4px 24px rgba(0,0,0,.05)",
};

function Marca() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
      <div style={{ width: 34, height: 34, background: "#2563EB", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#fff", fontSize: 15, fontWeight: 600, letterSpacing: "-0.5px", fontFamily: "'DM Mono',monospace" }}>G</span>
      </div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 600, color: "#0D0D0F", letterSpacing: "-0.4px" }}>Gap</div>
        <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>Gestão de vendas</div>
      </div>
    </div>
  );
}

export default function Auth() {
  const { entrar, cadastrar, recuperarSenha, definirNovaSenha, recovery } = useAuth();
  // modos: "login" | "cadastro" | "esqueci" | "nova-senha"
  const [modo, setModo] = useState(recovery ? "nova-senha" : "login");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  // Se o provider entrar em modo recovery depois de montado, força a tela certa.
  if (recovery && modo !== "nova-senha") setModo("nova-senha");

  const traduzErro = (msg = "") => {
    const m = msg.toLowerCase();
    if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
    if (m.includes("already registered") || m.includes("already been registered")) return "Este e-mail já está cadastrado. Faça login.";
    if (m.includes("password should be at least")) return "A senha precisa ter pelo menos 6 caracteres.";
    if (m.includes("unable to validate email") || m.includes("invalid format")) return "E-mail inválido.";
    if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
    if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Aguarde um instante.";
    return msg || "Algo deu errado. Tente novamente.";
  };

  const reset = () => { setErro(""); setOk(""); };

  const submitLogin = async (e) => {
    e.preventDefault(); reset(); setLoading(true);
    const { error } = await entrar(email.trim(), senha);
    setLoading(false);
    if (error) setErro(traduzErro(error.message));
    // sucesso: o AuthProvider troca a sessão e o app sai desta tela sozinho.
  };

  const submitCadastro = async (e) => {
    e.preventDefault(); reset();
    if (senha.length < 6) { setErro("A senha precisa ter pelo menos 6 caracteres."); return; }
    if (senha !== senha2) { setErro("As senhas não coincidem."); return; }
    setLoading(true);
    const { data, error } = await cadastrar(email.trim(), senha);
    setLoading(false);
    if (error) { setErro(traduzErro(error.message)); return; }
    // Se a confirmação de e-mail estiver DESATIVADA, já vem sessão e o app entra.
    // Se estiver ATIVADA, não há sessão ainda — avisa para confirmar o e-mail.
    if (!data.session) {
      setOk("Conta criada! Enviamos um e-mail de confirmação — confirme para entrar.");
      setModo("login");
    }
  };

  const submitEsqueci = async (e) => {
    e.preventDefault(); reset(); setLoading(true);
    const { error } = await recuperarSenha(email.trim());
    setLoading(false);
    if (error) { setErro(traduzErro(error.message)); return; }
    setOk("Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha.");
  };

  const submitNovaSenha = async (e) => {
    e.preventDefault(); reset();
    if (senha.length < 6) { setErro("A senha precisa ter pelo menos 6 caracteres."); return; }
    if (senha !== senha2) { setErro("As senhas não coincidem."); return; }
    setLoading(true);
    const { error } = await definirNovaSenha(senha);
    setLoading(false);
    if (error) { setErro(traduzErro(error.message)); return; }
    // definirNovaSenha zera o modo recovery; o app entra logado.
  };

  const inputStyle = { marginBottom: 12 };
  const titulo = { fontSize: 19, fontWeight: 600, color: "#0D0D0F", letterSpacing: "-0.3px", marginBottom: 4 };
  const sub = { fontSize: 13, color: "#888", marginBottom: 20, lineHeight: 1.5 };
  const linkBtn = { background: "none", border: "none", color: "#2563EB", cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "'DM Sans',sans-serif", padding: 0 };
  const alertErro = { background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", fontSize: 12.5, borderRadius: 8, padding: "9px 12px", marginBottom: 14, lineHeight: 1.5 };
  const alertOk = { background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", fontSize: 12.5, borderRadius: 8, padding: "9px 12px", marginBottom: 14, lineHeight: 1.5 };

  return (
    <div style={wrap}>
      <div style={card}>
        <Marca />

        {erro && <div style={alertErro}>{erro}</div>}
        {ok && <div style={alertOk}>{ok}</div>}

        {modo === "login" && (
          <form onSubmit={submitLogin}>
            <div style={titulo}>Entrar</div>
            <div style={sub}>Acesse sua conta do Gap.</div>
            <input className="gap-input" style={inputStyle} type="email" placeholder="E-mail" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="gap-input" style={inputStyle} type="password" placeholder="Senha" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
            <button className="gap-btn-primary" style={{ width: "100%", marginTop: 4, marginBottom: 16 }} disabled={loading} type="submit">
              {loading ? "Entrando…" : "Entrar"}
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <button type="button" style={linkBtn} onClick={() => { reset(); setModo("esqueci"); }}>Esqueci minha senha</button>
              <span style={{ fontSize: 13, color: "#888" }}>
                Novo aqui?{" "}
                <button type="button" style={linkBtn} onClick={() => { reset(); setModo("cadastro"); }}>Criar conta</button>
              </span>
            </div>
          </form>
        )}

        {modo === "cadastro" && (
          <form onSubmit={submitCadastro}>
            <div style={titulo}>Criar conta</div>
            <div style={sub}>Comece a gerir suas vendas no Gap.</div>
            <input className="gap-input" style={inputStyle} type="email" placeholder="E-mail" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="gap-input" style={inputStyle} type="password" placeholder="Senha (mín. 6 caracteres)" autoComplete="new-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
            <input className="gap-input" style={inputStyle} type="password" placeholder="Confirmar senha" autoComplete="new-password" required value={senha2} onChange={(e) => setSenha2(e.target.value)} />
            <button className="gap-btn-primary" style={{ width: "100%", marginTop: 4, marginBottom: 16 }} disabled={loading} type="submit">
              {loading ? "Criando…" : "Criar conta"}
            </button>
            <div style={{ textAlign: "center", fontSize: 13, color: "#888" }}>
              Já tem conta?{" "}
              <button type="button" style={linkBtn} onClick={() => { reset(); setModo("login"); }}>Entrar</button>
            </div>
          </form>
        )}

        {modo === "esqueci" && (
          <form onSubmit={submitEsqueci}>
            <div style={titulo}>Recuperar senha</div>
            <div style={sub}>Enviaremos um link para você redefinir sua senha.</div>
            <input className="gap-input" style={inputStyle} type="email" placeholder="E-mail" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="gap-btn-primary" style={{ width: "100%", marginTop: 4, marginBottom: 16 }} disabled={loading} type="submit">
              {loading ? "Enviando…" : "Enviar link"}
            </button>
            <div style={{ textAlign: "center" }}>
              <button type="button" style={linkBtn} onClick={() => { reset(); setModo("login"); }}>Voltar para o login</button>
            </div>
          </form>
        )}

        {modo === "nova-senha" && (
          <form onSubmit={submitNovaSenha}>
            <div style={titulo}>Definir nova senha</div>
            <div style={sub}>Escolha uma nova senha para sua conta.</div>
            <input className="gap-input" style={inputStyle} type="password" placeholder="Nova senha (mín. 6 caracteres)" autoComplete="new-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
            <input className="gap-input" style={inputStyle} type="password" placeholder="Confirmar nova senha" autoComplete="new-password" required value={senha2} onChange={(e) => setSenha2(e.target.value)} />
            <button className="gap-btn-primary" style={{ width: "100%", marginTop: 4 }} disabled={loading} type="submit">
              {loading ? "Salvando…" : "Salvar nova senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
