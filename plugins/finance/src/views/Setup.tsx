import { Button } from "@betelgeuse/plugin-api/ui";
import { ChartLine, CreditCard, Landmark, PiggyBank, Scale, Wallet } from "lucide-react";
import { useState } from "react";
import { CURRENCIES, defaultCurrency, setUp } from "../schema";
import { host, reload } from "../store";
import { Field, Select } from "../ui";

const FEATURES = [
  { icon: <Wallet size={16} />, title: "Accounts & cards", text: "Bank accounts, credit cards, cash, wallets and loans, each with its balance or bill." },
  { icon: <PiggyBank size={16} />, title: "Monthly budgets", text: "A budget per category, what's left, and what you can spend a day." },
  { icon: <ChartLine size={16} />, title: "Investments", text: "Stocks, funds, deposits, gold, crypto: invested, worth now, returns and allocation." },
  { icon: <Scale size={16} />, title: "Net worth", text: "Everything you own less everything you owe, tracked month by month." },
  { icon: <CreditCard size={16} />, title: "Statements", text: "Import a CSV from your bank; categories are learned from your history." },
  { icon: <Landmark size={16} />, title: "Plain databases", text: "It all lives in pages you own: edit them anywhere, on your phone too." },
];

export function Setup() {
  const [currency, setCurrency] = useState(defaultCurrency());
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setError(null);
    try {
      await setUp(host(), currency, setStep);
      await reload();
    } catch (e) {
      setError(String(e));
      setStep(null);
    }
  };
  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="text-4xl">💰</div>
      <h1 className="mt-3 text-2xl font-semibold text-ink">Your money, in your workspace</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        Finance tracks what you spend and earn, your budgets, investments and net worth, with charts that keep up as you go. Everything is kept in a <b className="text-ink">Finance</b> page of
        ordinary databases, synced like the rest of your notes.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex gap-3 rounded-lg border border-line bg-raised p-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-[var(--accent)]">{f.icon}</span>
            <span>
              <span className="block text-sm font-medium text-ink">{f.title}</span>
              <span className="block text-xs leading-relaxed text-muted">{f.text}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-8 flex items-end gap-3">
        <Field label="Currency" className="w-40">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Button variant="primary" disabled={!!step} onClick={run}>
          {step ? `${step}…` : "Set up Finance"}
        </Button>
      </div>
      {error && <p className="mt-3 text-sm text-[var(--fin-critical)]">Couldn't set up: {error}</p>}
    </div>
  );
}
