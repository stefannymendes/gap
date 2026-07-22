import { useAuth } from "./lib/auth.jsx";
import { GapProvider } from "./lib/store.jsx";
import App from "./App.jsx";
import Auth from "./modules/Auth.jsx";

// Portão de autenticação: sem sessão (ou em fluxo de reset de senha) mostra as
// telas de login/cadastro; logado, monta o app normal envolvido no GapProvider.
export default function Gate() {
  const { user, loading, recovery } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F5F3" }}>
        <div className="gap-ia-spinner" />
      </div>
    );
  }

  if (recovery || !user) return <Auth />;

  return (
    <GapProvider>
      <App />
    </GapProvider>
  );
}
