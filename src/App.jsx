import { useState } from "react";
import { NAV, NAV_SECTIONS } from "./lib/constants";
import { NavIcon } from "./lib/ui";
import { useGap } from "./lib/store";

import Home from "./modules/Home.jsx";
import Produtos from "./modules/Produtos.jsx";
import Insumos from "./modules/Insumos.jsx";
import Financeiro from "./modules/Financeiro.jsx";
import CustosFixos from "./modules/CustosFixos.jsx";
import Config from "./modules/Config.jsx";
import Anuncios from "./modules/Anuncios.jsx";
import Imagens from "./modules/Imagens.jsx";
import Analytics from "./modules/Analytics.jsx";
import Tarefas from "./modules/Tarefas.jsx";
import Metas from "./modules/Metas.jsx";

// Placeholder para futuras seções não migradas.
const EM_BREVE = {};

function EmBreve({ id, onMenu }) {
  const info = EM_BREVE[id] || { titulo: "Em breve", desc: "Esta seção entra em uma próxima etapa." };
  return (
    <>
      <div className="gap-topbar">
        <div className="gap-topbar-left">
          <button className="gap-menu-btn" onClick={onMenu}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <span className="gap-topbar-title">{info.titulo}</span>
        </div>
      </div>
      <div className="gap-content">
        <div className="gap-empty">
          <div className="gap-empty-icon">🚧</div>
          <p className="gap-empty-title">{info.titulo} — em construção</p>
          <p className="gap-empty-desc">{info.desc}</p>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [section, setSection] = useState("home");
  const [mobileMenu, setMobileMenu] = useState(false);
  const { produtos } = useGap();

  const navigate = (s) => { setSection(s); setMobileMenu(false); };
  const onMenu = () => setMobileMenu(true);

  const render = () => {
    switch (section) {
      case "home":       return <Home onMenu={onMenu} navigate={navigate} />;
      case "produtos":   return <Produtos onMenu={onMenu} />;
      case "insumos":    return <Insumos onMenu={onMenu} />;
      case "financeiro": return <Financeiro onMenu={onMenu} />;
      case "empresa":    return <CustosFixos onMenu={onMenu} />;
      case "anuncios":   return <Anuncios onMenu={onMenu} />;
      case "imagens":    return <Imagens onMenu={onMenu} />;
      case "analytics":  return <Analytics onMenu={onMenu} />;
      case "tarefas":    return <Tarefas onMenu={onMenu} />;
      case "metas":      return <Metas onMenu={onMenu} />;
      case "config":     return <Config onMenu={onMenu} />;
      default:           return <EmBreve id={section} onMenu={onMenu} />;
    }
  };

  return (
    <div className="gap-root">
      <div className={`gap-sidebar-overlay ${mobileMenu ? "open" : ""}`} onClick={() => setMobileMenu(false)} />

      <aside className={`gap-sidebar ${mobileMenu ? "open" : ""}`}>
        <div className="gap-logo">
          <div className="gap-logo-row">
            <div className="gap-logo-mark"><span>G</span></div>
            <div>
              <div className="gap-logo-name">Gap</div>
              <div className="gap-logo-sub">Gestão de vendas</div>
            </div>
          </div>
        </div>

        <nav className="gap-nav">
          {NAV_SECTIONS.map((sec) => {
            const items = NAV.filter((n) => n.section === sec.id);
            if (items.length === 0) return null;
            return (
              <div key={sec.id}>
                {sec.label && <div className="gap-nav-section">{sec.label}</div>}
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    className={`gap-nav-item ${section === item.id ? "active" : ""}`}
                  >
                    <span className="gap-nav-icon"><NavIcon name={item.icon} /></span>
                    <span className="gap-nav-label">{item.label}</span>
                    {item.id === "produtos" && produtos.length > 0 && (
                      <span className="gap-nav-badge warn">{produtos.length}</span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="gap-sb-footer">
          <div className="gap-store-pill">
            <div className="gap-store-dot" />
            <span className="gap-store-label">Shopee · ativa</span>
          </div>
        </div>
      </aside>

      <div className="gap-main">
        {render()}
      </div>
    </div>
  );
}
