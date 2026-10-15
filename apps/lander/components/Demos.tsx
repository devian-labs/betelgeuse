import { Check, ImageIcon, Plug, ShieldCheck, Wallet, type LucideIcon } from "lucide-react";

/** Illustrations of the app, in plain HTML and CSS (styles in globals.css). */

function Chrome({ title }: { title: string }) {
  return (
    <div className="demo-bar">
      <span className="lights">
        <i />
        <i />
        <i />
      </span>
      <span className="demo-title">{title}</span>
    </div>
  );
}

/* ---------- Plugins: the store in Settings ---------- */

const storePlugins: { Icon: LucideIcon; name: string; what: string; where: string; installed: boolean }[] = [
  { Icon: Wallet, name: "Finance", what: "Budgets, investments and net worth", where: "Desktop · Phone", installed: true },
  { Icon: ImageIcon, name: "Media Library", what: "Your project files, searchable", where: "Desktop", installed: false },
];

export function PluginStoreDemo() {
  return (
    <div className="demo store-demo" aria-hidden>
      <Chrome title="Settings · Plugins" />
      <div className="ps-body">
        <div className="ps-tabs">
          <span>Installed</span>
          <span className="on">Browse</span>
        </div>
        {storePlugins.map(({ Icon, name, what, where, installed }) => (
          <div key={name} className="ps-row">
            <span className="ps-icon">
              <Icon size={18} />
            </span>
            <span className="ps-text">
              <strong>{name}</strong>
              <small>{what}</small>
              <span className="ps-tags">
                <span className="ps-tag signed">
                  <ShieldCheck size={12} /> Signed
                </span>
                <span className="ps-tag">{where}</span>
              </span>
            </span>
            {installed ? (
              <span className="ps-button done">
                <Check size={13} /> Installed
              </span>
            ) : (
              <span className="ps-button">Install</span>
            )}
          </div>
        ))}
        <div className="ps-row ps-yours">
          <span className="ps-icon">
            <Plug size={18} />
          </span>
          <span className="ps-text">
            <strong>Your plugin</strong>
            <small>TypeScript and React, a few files</small>
          </span>
        </div>
      </div>
    </div>
  );
}
