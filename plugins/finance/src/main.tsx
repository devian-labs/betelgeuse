/**
 * Finance: personal finance in Betelgeuse. Accounts and cards, transactions, monthly budgets,
 * investments, assets and liabilities, and net worth, with charts.
 *
 * The data lives in ordinary databases under a "Finance" page (see schema.ts), so it syncs, works
 * on the phone and with AI agents, and stays if the plugin goes. The plugin adds the Finance view
 * (dashboard and screens), its sidebar item, a settings section, commands and ⌘K results.
 */
import { definePlugin, type PluginContext } from "@betelgeuse/plugin-api";
import { Button, SettingRow } from "@betelgeuse/plugin-api/ui";
import { Wallet } from "lucide-react";
import { useState } from "react";
import { money } from "./format";
import { applyCurrency, CURRENCIES, type Config } from "./schema";
import { current, host, openPage, reload, requestForm, setContext, start, useFinance } from "./store";
import { Select } from "./ui";
import { FinanceView } from "./views/FinanceView";
import "./styles.css";

export const { activate, deactivate } = definePlugin({
  activate(ctx: PluginContext) {
    setContext(ctx);
    const stop = start();
    ctx.subscriptions.push({ dispose: stop });

    ctx.views.register("finance", { title: "Finance", icon: <Wallet size={16} />, component: FinanceView });
    ctx.sidebar.register({ id: "finance", title: "Finance", icon: <Wallet size={16} />, view: "finance" });

    ctx.settings.register({ title: "Finance", icon: <Wallet size={16} />, component: FinanceSettings });

    ctx.commands.register({
      id: "add-transaction",
      title: "Finance: Add a transaction",
      run: () => {
        ctx.views.open("finance");
        requestForm("transaction");
      },
    });
    ctx.commands.register({ id: "open", title: "Finance: Open the dashboard", run: () => ctx.views.open("finance") });
    ctx.commands.register({
      id: "import",
      title: "Finance: Import a bank statement",
      run: () => {
        ctx.views.open("finance");
        requestForm("import");
      },
    });

    // ⌘K: transactions and accounts by name, notes or tag.
    ctx.search.register({
      id: "finance",
      title: "Finance",
      search: async (query) => {
        const q = query.trim().toLowerCase();
        const { data, currency, status } = current();
        if (status !== "ready" || q.length < 2) return [];
        const accounts = data.accounts
          .filter((a) => a.name.toLowerCase().includes(q))
          .slice(0, 2)
          .map((a) => ({ id: a.path, title: a.name, detail: a.type, run: () => openPage(a.path) }));
        const txs = data.transactions
          .filter((t) => t.name.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q) || t.tags.some((g) => g.toLowerCase() === q))
          .slice(0, 5)
          .map((t) => ({ id: t.path, title: t.name, detail: `${t.date} · ${t.type === "Income" ? "+" : t.type === "Expense" ? "−" : `${t.type} `}${money(t.amount, currency)}`, run: () => openPage(t.path) }));
        return [...accounts, ...txs];
      },
    });
  },
  deactivate() {
    setContext(null);
  },
});

function FinanceSettings() {
  const { config, dbs, currency, status } = useFinance();
  const [busy, setBusy] = useState(false);
  const change = async (next: string) => {
    setBusy(true);
    try {
      await host().storage.workspace.update<Config>((c) => ({ ...c, currency: next }));
      if (dbs) await applyCurrency(host(), dbs, next);
      await reload();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fin">
      <SettingRow label="Currency" hint="Amounts are shown in it; the databases' money columns switch too. Amounts aren't converted.">
        <Select value={currency} disabled={busy} onChange={(e) => change(e.target.value)} className="!w-28">
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </SettingRow>
      <SettingRow label="Where your data lives" hint={status === "ready" && config.root ? `The “${config.root.replace(/\.md$/, "")}” page and its databases.` : "Set up Finance from its view in the sidebar."}>
        {status === "ready" && config.root ? <Button onClick={() => openPage(config.root!)}>Open</Button> : <Button onClick={() => host().views.open("finance")}>Open Finance</Button>}
      </SettingRow>
    </div>
  );
}
