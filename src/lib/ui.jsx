import { useState, useEffect } from "react";
import { copyText } from "./utils";

// ── Ícones da navegação ──
export function NavIcon({ name }) {
  const icons = {
    home:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>,
    hanger:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3a2 2 0 0 1 2 2c0 .74-.4 1.38-1 1.73V8l7 5H4l7-5V6.73A2 2 0 0 1 10 5a2 2 0 0 1 2-2z"/><path d="M4 13v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/></svg>,
    box:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4"/><path d="M12 11v10"/></svg>,
    building:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>,
    "chart-bar":<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="4" width="4" height="17"/></svg>,
    sparkles:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M5 3l.75 2.25L8 6l-2.25.75L5 9l-.75-2.25L2 6l2.25-.75z"/><path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75z"/></svg>,
    image:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>,
    microscope:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 3h6v10H9z"/><path d="M7 13h10"/><path d="M12 13v8"/><circle cx="12" cy="7" r="1"/></svg>,
    checklist:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
    target:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
    settings:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>,
  };
  return icons[name] || <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/></svg>;
}

// ── NumInput — estado local p/ não perder o foco ──
export function NumInput({ value, onChange, prefix="R$", step="0.01", min="0" }) {
  const [local, setLocal] = useState(String(value ?? ""));
  useEffect(() => {
    if (String(value) !== local && Math.abs(Number(local) - Number(value)) > 0.001) {
      setLocal(String(value ?? ""));
    }
  }, [value]); // eslint-disable-line
  return (
    <div className="gap-num-input">
      <span className="gap-num-prefix">{prefix}</span>
      <input
        type="number" min={min} step={step} value={local}
        onChange={e => { setLocal(e.target.value); onChange(e.target.value); }}
        className="gap-num-field"
      />
    </div>
  );
}

export function Badge({ children, variant="default" }) {
  return <span className={`gap-badge gap-badge-${variant}`}>{children}</span>;
}

export function CopyBtn({ text, label="Copiar" }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => { const r = await copyText(text); if (r) { setOk(true); setTimeout(() => setOk(false), 1600); } }}
      className={`copy-btn ${ok ? "copied" : ""}`}
    >{ok ? "✓ Copiado" : label}</button>
  );
}

export function ConfirmButtons({ onConfirm, onCancel, confirmLabel="Confirmar" }) {
  return (
    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
      <button className="gap-btn-danger" onClick={onConfirm}>{confirmLabel}</button>
      <button className="gap-btn-secondary" style={{ fontSize:12, padding:"6px 12px" }} onClick={onCancel}>Cancelar</button>
    </div>
  );
}

export function EmptyState({ icon, title, desc, action, actionLabel }) {
  return (
    <div className="gap-empty">
      <div className="gap-empty-icon">{icon}</div>
      <p className="gap-empty-title">{title}</p>
      {desc && <p className="gap-empty-desc">{desc}</p>}
      {action && <button className="gap-btn-primary" onClick={action}>{actionLabel}</button>}
    </div>
  );
}

export function Card({ children, className="", style }) {
  return <div className={`gap-card ${className}`} style={style}>{children}</div>;
}

export function CardTitle({ children, action }) {
  return <div className="gap-card-title"><span>{children}</span>{action && <div>{action}</div>}</div>;
}

export function SubTabs({ tabs, active, onChange }) {
  return (
    <div className="gap-subtabs">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} className={`gap-subtab ${active === t.id ? "active" : ""}`}>{t.label}</button>
      ))}
    </div>
  );
}

export function Topbar({ title, action, salvando, onMenu }) {
  return (
    <div className="gap-topbar">
      <div className="gap-topbar-left">
        <button className="gap-menu-btn" onClick={onMenu}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <span className="gap-topbar-title">{title}</span>
      </div>
      <div className="gap-topbar-right">
        {salvando === "saving" && <span className="gap-sync saving">salvando…</span>}
        {salvando === "ok" && <span className="gap-sync ok">✓ sincronizado</span>}
        {action}
      </div>
    </div>
  );
}
