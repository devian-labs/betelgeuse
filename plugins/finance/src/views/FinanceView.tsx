import { Button } from "@betelgeuse/plugin-api/ui";
import { ExternalLink, LoaderCircle, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { AccountDialog, CategoryDialog, HoldingDialog, ImportDialog, ItemDialog, TransactionDialog } from "../dialogs";
import { monthOf, today, type Account, type Category, type Holding, type Item, type Transaction } from "../model";
import { host, onFormRequest, openPage, reload, useFinance, type TxInput } from "../store";
import { Accounts } from "./Accounts";
import { Budget } from "./Budget";
import { Investments } from "./Investments";
import { NetWorthView } from "./NetWorth";
import { Overview, type Go } from "./Overview";
import { Setup } from "./Setup";
import { Transactions } from "./Transactions";

type Tab = "overview" | "transactions" | "budget" | "accounts" | "investments" | "networth";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "transactions", label: "Transactions" },
  { id: "budget", label: "Budget" },
  { id: "accounts", label: "Accounts" },
  { id: "investments", label: "Investments" },
  { id: "networth", label: "Net worth" },
];

type Open =
  | { kind: "tx"; tx?: Transaction; preset?: Partial<TxInput> }
  | { kind: "account"; account?: Account }
  | { kind: "holding"; holding?: Holding }
  | { kind: "item"; item?: Item; as?: "Asset" | "Liability" }
  | { kind: "category"; category?: Category }
  | { kind: "import" };

const TAB_KEY = "finance-tab";

/** Finance's tab view: the dashboard and its screens. */
export function FinanceView() {
  const state = useFinance();
  const phone = host().app.platform === "mobile";
  const [tab, setTabState] = useState<Tab>(() => {
    try {
      return (localStorage.getItem(TAB_KEY) as Tab) || "overview";
    } catch {
      return "overview";
    }
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* a convenience only */
    }
  };
  const [month, setMonth] = useState(monthOf(today()));
  const [open, setOpen] = useState<Open | null>(null);
  const close = () => setOpen(null);

  // ⌘K "Add a transaction" and "Import a statement", also when they opened this view.
  useEffect(() => onFormRequest((form) => setOpen(form === "import" ? { kind: "import" } : { kind: "tx" })), []);

  const go: Go = (t, m) => {
    if (m) setMonth(m);
    setTab(t);
  };

  if (state.status === "loading") {
    return (
      <div className="fin grid h-full min-w-0 flex-1 place-items-center bg-surface px-6 text-center text-muted">
        {state.error ? (
          <div className="max-w-sm">
            <p className="mb-3 text-sm text-[var(--fin-critical)]">Couldn't read the Finance databases: {state.error}</p>
            <Button onClick={() => void reload()}>Try again</Button>
          </div>
        ) : (
          <LoaderCircle size={20} className="animate-spin" />
        )}
      </div>
    );
  }
  if (state.status === "setup") {
    return (
      <div className="fin h-full min-w-0 flex-1 overflow-y-auto bg-surface px-4 sm:px-8">
        <Setup />
      </div>
    );
  }

  return (
    // flex-1: the app hosts views in a row, where a box is only as wide as its content unless it grows.
    <div className="fin flex h-full min-w-0 flex-1 flex-col bg-surface">
      <header className="shrink-0 border-b border-line px-4 pt-3 sm:px-8 sm:pt-5">
        <div className="flex items-center gap-3">
          {/* On the phone, the app's top bar already says where you are. */}
          {phone ? (
            <span className="flex-1" />
          ) : (
            <>
              <span className="text-2xl">💰</span>
              <h1 className="flex-1 text-xl font-semibold text-ink">Finance</h1>
            </>
          )}
          {state.config.root && (
            <Button variant="ghost" icon={<ExternalLink size={14} />} onClick={() => openPage(state.config.root!)}>
              Databases
            </Button>
          )}
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => setOpen({ kind: "tx" })}>
            Add transaction
          </Button>
        </div>
        <nav className="mt-3 flex gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative shrink-0 px-3 py-2 text-sm ${tab === t.id ? "font-medium text-ink" : "text-muted hover:text-ink"}`}
            >
              {t.label}
              {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink" />}
            </button>
          ))}
        </nav>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6">
        <div>
          {state.error && <p className="mb-4 text-sm text-[var(--fin-critical)]">Couldn't read the Finance databases: {state.error}</p>}
          {tab === "overview" && (
            <Overview go={go} onEdit={(tx) => setOpen({ kind: "tx", tx })} onAdd={() => setOpen({ kind: "tx" })} onAddAccount={() => setOpen({ kind: "account" })} />
          )}
          {tab === "transactions" && (
            <Transactions month={month} setMonth={setMonth} onEdit={(tx) => setOpen({ kind: "tx", tx })} onAdd={() => setOpen({ kind: "tx" })} onImport={() => setOpen({ kind: "import" })} />
          )}
          {tab === "budget" && (
            <Budget month={month} setMonth={setMonth} onEditCategory={(category) => setOpen({ kind: "category", category })} onAddCategory={() => setOpen({ kind: "category" })} />
          )}
          {tab === "accounts" && <Accounts onAdd={() => setOpen({ kind: "account" })} onEdit={(account) => setOpen({ kind: "account", account })} onPay={(preset) => setOpen({ kind: "tx", preset })} />}
          {tab === "investments" && (
            <Investments
              onAdd={() => setOpen({ kind: "holding" })}
              onEdit={(holding) => setOpen({ kind: "holding", holding })}
              onInvest={(holding) => setOpen({ kind: "tx", preset: { type: "Invest", holding: holding ?? null } })}
            />
          )}
          {tab === "networth" && <NetWorthView onAddItem={(as) => setOpen({ kind: "item", as })} onEditItem={(item) => setOpen({ kind: "item", item })} />}
        </div>
      </main>

      {open?.kind === "tx" && <TransactionDialog key={open.tx?.path ?? "new"} tx={open.tx} preset={open.preset} onClose={close} />}
      {open?.kind === "account" && <AccountDialog account={open.account} onClose={close} />}
      {open?.kind === "holding" && <HoldingDialog holding={open.holding} onClose={close} />}
      {open?.kind === "item" && <ItemDialog item={open.item} kind={open.as} onClose={close} />}
      {open?.kind === "category" && <CategoryDialog category={open.category} onClose={close} />}
      {open?.kind === "import" && <ImportDialog onClose={close} />}
    </div>
  );
}
