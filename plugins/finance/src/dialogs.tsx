/** The forms that add and change Finance's records. */
import { Button } from "@betelgeuse/plugin-api/ui";
import { ExternalLink, FileUp, Plus, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { DateField } from "./calendar";
import { money } from "./format";
import {
  ACCOUNT_TYPES,
  ASSET_TYPES,
  INVESTMENT_TYPES,
  LIABILITY_TYPES,
  OWED,
  balances,
  holdingEdit,
  parseAmount,
  parseCsv,
  parseDate,
  parseNumber,
  rowKey,
  statementHeader,
  today,
  type Account,
  type Category,
  type Holding,
  type Item,
  type Transaction,
  type TxType,
} from "./model";
import { addRow, addTransaction, canDelete, deletePage, host, openPage, updateRow, updateTransaction, useFinance, type TxInput } from "./store";
import { Dialog, Field, inputClass, Segmented, Select } from "./ui";

const parseNum = parseNumber;
const link = (key: string | null) => (key ? [`[[${key}]]`] : null);
const fail = (e: unknown) => host().ui.toast(`Couldn't save: ${String(e)}`);

/** Delete (to the Trash), with a confirmation. */
function DeleteButton({ path, what, onDone }: { path: string; what: string; onDone: () => void }) {
  if (!canDelete()) return null;
  return (
    <Button
      variant="ghost"
      icon={<Trash2 size={14} />}
      onClick={async () => {
        if (!(await host().ui.confirm(`Move ${what} to the Trash?`, { confirmLabel: "Move to Trash", danger: true }))) return;
        await deletePage(path);
        onDone();
      }}
    >
      Delete
    </Button>
  );
}

// ---------- transactions ----------

/** One investment an Invest (or Redeem) puts money into (or takes it from): an existing one, or a new one. */
type Line = { holding: string; amount: string; newName: string; newType: string };
const NEW = "__new__";
const emptyLine = (holding = ""): Line => ({ holding, amount: "", newName: "", newType: "Stocks" });
const moves = (t: TxType) => t === "Invest" || t === "Redeem";

/**
 * Adds or edits a transaction. An Invest (or Redeem) can be split across several investments,
 * say ₹3,600 from Zerodha into two stocks: each part is saved as its own transaction, and what
 * isn't allocated stays in the account. `preset` pre-fills a new one (paying a card bill, say).
 */
export function TransactionDialog({ tx, preset, onClose }: { tx?: Transaction; preset?: Partial<TxInput>; onClose: () => void }) {
  const { data, currency } = useFinance();
  const accounts = data.accounts.filter((a) => !a.archived || a.key === tx?.account || a.key === tx?.to);
  const lastAccount = data.transactions.find((t) => t.account && accounts.some((a) => a.key === t.account))?.account ?? accounts[0]?.key ?? null;
  const [type, setType] = useState<TxType>(tx?.type ?? preset?.type ?? "Expense");
  const [amount, setAmount] = useState(tx ? String(tx.amount) : preset?.amount ? String(preset.amount) : "");
  const [name, setName] = useState(tx?.name ?? preset?.name ?? "");
  const [date, setDate] = useState(tx?.date || today());
  const [account, setAccount] = useState<string | null>(tx ? tx.account : preset?.account ?? lastAccount);
  const [to, setTo] = useState<string | null>(tx?.to ?? preset?.to ?? null);
  const [category, setCategory] = useState<string | null>(tx?.category ?? null);
  const [lines, setLines] = useState<Line[]>(() => [{ ...emptyLine(tx?.holding ?? preset?.holding ?? ""), amount: tx && moves(tx.type) ? String(tx.amount) : "" }]);
  const [tags, setTags] = useState(tx?.tags.join(", ") ?? "");
  const [notes, setNotes] = useState(tx?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const categories = data.categories.filter((c) => c.kind === (type === "Income" ? "Income" : "Expense") && (!c.archived || c.key === category));
  const holdings = data.holdings.filter((h) => !h.closed || lines.some((l) => l.holding === h.key));
  const balance = account ? balances(data).get(account) ?? 0 : 0;
  // Descriptions used before, most recent first, for suggestions.
  const known = useMemo(() => {
    const seen = new Map<string, Transaction>();
    for (const t of data.transactions) if (!seen.has(t.name.toLowerCase())) seen.set(t.name.toLowerCase(), t);
    return seen;
  }, [data.transactions]);

  /** A description used before brings its category, account and investment along (unless already chosen). */
  const pickName = (v: string) => {
    setName(v);
    const prev = !tx && known.get(v.trim().toLowerCase());
    if (!prev) return;
    if (prev.type !== type && !amount) setType(prev.type);
    if (prev.category && !category) setCategory(prev.category);
    if (prev.account) setAccount(prev.account);
    if (prev.to && prev.type === "Transfer") setTo(prev.to);
    if (prev.holding && lines.length === 1 && !lines[0].holding) setLines([{ ...lines[0], holding: prev.holding }]);
  };

  const value = parseNum(amount);
  const parts = lines.map((l) => ({ ...l, value: parseNum(l.amount) }));
  const total = parts.reduce((s, l) => s + (l.value ?? 0), 0);
  const linesValid = parts.every((l) => l.value !== null && l.value > 0 && (l.holding === NEW ? !!l.newName.trim() : !!l.holding));
  const valid = !!date && (moves(type) ? linesValid && total > 0 : value !== null && value > 0 && (type !== "Transfer" || (!!account && !!to && account !== to)));
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const save = async (again: boolean) => {
    if (!valid || busy) return;
    setBusy(true);
    const base = { type, date, account, to: null, category: null, holding: null, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), notes };
    try {
      if (moves(type)) {
        for (const l of parts) {
          // A new investment is started here; its worth comes from what's put in until a value is entered.
          const holding = l.holding === NEW ? rowKey(await addRow("holdings", l.newName, { Type: l.newType, Invested: 0, "Current value": 0, Account: account ? [`[[${account}]]`] : null })) : l.holding;
          const holdingName = l.holding === NEW ? l.newName.trim() : data.holdings.find((h) => h.key === l.holding)?.name ?? "";
          const input: TxInput = { ...base, name: name.trim() || `${type === "Invest" ? "Bought" : "Sold"} ${holdingName}`, amount: l.value!, holding };
          if (tx) await updateTransaction(tx.path, tx.name, input);
          else await addTransaction(input);
        }
      } else {
        const input: TxInput = { ...base, name, amount: value!, to: type === "Transfer" ? to : null, category: type === "Transfer" ? null : category };
        if (tx) await updateTransaction(tx.path, tx.name, input);
        else await addTransaction(input);
      }
      if (again) {
        setAmount("");
        setName("");
        setNotes("");
        setLines([emptyLine()]);
        amountRef.current?.focus();
        host().ui.toast("Saved");
      } else onClose();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const accountName = data.accounts.find((a) => a.key === account)?.name ?? "the account";
  const left = type === "Invest" && account ? balance - total : null;

  return (
    <Dialog
      title={tx ? "Edit transaction" : "Add transaction"}
      width={moves(type) ? 520 : 460}
      onClose={onClose}
      footer={
        <>
          {tx && <DeleteButton path={tx.path} what={`“${tx.name}”`} onDone={onClose} />}
          {tx && (
            <Button variant="ghost" icon={<ExternalLink size={14} />} onClick={() => (openPage(tx.path), onClose())}>
              Open page
            </Button>
          )}
          <span className="flex-1" />
          {!tx && (
            <Button disabled={!valid || busy} onClick={() => save(true)}>
              Save & add another
            </Button>
          )}
          <Button variant="primary" disabled={!valid || busy} onClick={() => save(false)}>
            {tx ? "Save" : moves(type) && lines.length > 1 ? `Add ${lines.length}` : "Add"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
        className="space-y-3"
      >
        <Segmented<TxType>
          value={type}
          onChange={(t) => (setType(t), t !== type && t !== "Transfer" && setCategory(null))}
          options={[
            { id: "Expense", label: "Expense" },
            { id: "Income", label: "Income" },
            { id: "Transfer", label: "Transfer" },
            { id: "Invest", label: "Invest" },
            { id: "Redeem", label: "Redeem" },
          ]}
        />
        {!moves(type) && (
          <Field label="Amount">
            <input
              ref={amountRef}
              autoFocus
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder={money(0, currency)}
              className="h-12 w-full rounded-lg border border-line bg-surface px-3 text-2xl font-semibold text-ink tabular-nums outline-none placeholder:text-faint focus:border-[var(--accent)]"
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <DateField value={date} onChange={setDate} />
          </Field>
          <Field label={type === "Transfer" || type === "Invest" ? "From" : type === "Income" || type === "Redeem" ? "Into" : "Paid from"}>
            <Select value={account ?? ""} onChange={(e) => setAccount(e.target.value || null)}>
              <option value="">No account</option>
              {accounts.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {moves(type) ? (
          <div>
            <div className="mb-1 flex items-baseline text-xs font-medium text-muted">
              <span className="flex-1">{type === "Invest" ? "Into" : "From"}</span>
              <span>Amount</span>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-line p-2">
                  <div className="flex gap-2">
                    <Select value={l.holding} onChange={(e) => setLine(i, { holding: e.target.value })} className="flex-1">
                      <option value="">Choose an investment</option>
                      {holdings.map((h) => (
                        <option key={h.key} value={h.key}>
                          {h.name}
                        </option>
                      ))}
                      {type === "Invest" && <option value={NEW}>+ New investment…</option>}
                    </Select>
                    <input
                      autoFocus={i === lines.length - 1}
                      inputMode="decimal"
                      value={l.amount}
                      onChange={(e) => setLine(i, { amount: e.target.value.replace(/[^\d.,]/g, "") })}
                      placeholder={money(0, currency)}
                      className={`${inputClass} !w-32 text-right tabular-nums`}
                    />
                    {lines.length > 1 && (
                      <button type="button" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} aria-label="Remove" className="grid size-8 shrink-0 place-items-center rounded-md text-faint hover:bg-hover hover:text-muted">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {l.holding === NEW && (
                    <div className="flex gap-2">
                      <input value={l.newName} onChange={(e) => setLine(i, { newName: e.target.value })} placeholder="Name: Infosys, Nifty 50 index fund…" className={`${inputClass} flex-1`} />
                      <Select value={l.newType} onChange={(e) => setLine(i, { newType: e.target.value })} className="!w-40">
                        {INVESTMENT_TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </Select>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              {!tx && (
                <button type="button" onClick={() => setLines((ls) => [...ls, emptyLine()])} className="flex items-center gap-1 font-medium text-[var(--accent)] hover:underline">
                  <Plus size={12} /> Split across another investment
                </button>
              )}
              <span className="flex-1" />
              <span className="text-muted">
                Total <span className="font-semibold text-ink tabular-nums">{money(total, currency)}</span>
              </span>
            </div>
            {left !== null && total > 0 && (
              <p className="mt-1 text-right text-xs text-muted">
                {left >= 0 ? (
                  <>
                    {money(left, currency)} stays in {accountName}
                  </>
                ) : (
                  <>
                    That's {money(-left, currency)} more than {accountName} holds
                  </>
                )}
              </p>
            )}
          </div>
        ) : type === "Transfer" ? (
          <Field label="To" hint="A card payment, a loan EMI, moving money to savings or to your broker (then Invest from there).">
            <Select value={to ?? ""} onChange={(e) => setTo(e.target.value || null)}>
              <option value="">Choose an account</option>
              {accounts
                .filter((a) => a.key !== account)
                .map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : (
          <Field label="Category">
            <Select value={category ?? ""} onChange={(e) => setCategory(e.target.value || null)}>
              <option value="">Uncategorised</option>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Description">
          <input
            list="fin-known-names"
            value={name}
            onChange={(e) => pickName(e.target.value)}
            placeholder={type === "Transfer" ? "Card bill, to Zerodha…" : moves(type) ? "Optional: e.g. Monthly SIP (else “Bought Infosys”)" : "Groceries, salary…"}
            className={inputClass}
          />
          <datalist id="fin-known-names">
            {[...known.values()].slice(0, 200).map((t) => (
              <option key={t.path} value={t.name} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tags">
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="trip, work" className={inputClass} />
          </Field>
          <Field label="Notes">
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

// ---------- accounts ----------

export function AccountDialog({ account, onClose }: { account?: Account; onClose: () => void }) {
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<string>(account?.type ?? "Bank account");
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [opening, setOpening] = useState(account ? String(account.opening) : "");
  const [limit, setLimit] = useState(account?.limit != null ? String(account.limit) : "");
  const [archived, setArchived] = useState(account?.archived ?? false);
  const owed = OWED.has(type);
  const save = async () => {
    const values = {
      Type: type,
      Institution: institution.trim() || null,
      // What's owed is entered as a positive amount; a bank balance may be negative (overdrawn).
      "Opening balance": owed ? Math.abs(parseNum(opening) ?? 0) : (parseNum(opening) ?? 0),
      "Credit limit": type === "Credit card" ? parseNum(limit) : null,
      Archived: archived || null,
    };
    try {
      if (account) await updateRow(account.path, account.name, name, values);
      else await addRow("accounts", name, values);
      onClose();
    } catch (e) {
      fail(e);
    }
  };
  return (
    <Dialog
      title={account ? "Edit account" : "Add account"}
      onClose={onClose}
      footer={
        <>
          {account && <DeleteButton path={account.path} what={`the account “${account.name}”`} onDone={onClose} />}
          <span className="flex-1" />
          <Button variant="primary" disabled={!name.trim()} onClick={save}>
            {account ? "Save" : "Add account"}
          </Button>
        </>
      }
    >
      <Field label="Name">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="HDFC savings, Amex Gold…" className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Bank or provider">
          <input value={institution} onChange={(e) => setInstitution(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={owed ? "Owed when you started" : "Balance when you started"} hint={owed ? "What you owed before the transactions you'll add." : "Before the transactions you'll add."}>
          <input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" className={inputClass} />
        </Field>
        {type === "Credit card" && (
          <Field label="Credit limit">
            <input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} className={inputClass} />
          </Field>
        )}
      </div>
      {account && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Closed account (hidden from forms; its history stays)
        </label>
      )}
    </Dialog>
  );
}

// ---------- investments ----------

export function HoldingDialog({ holding, onClose }: { holding?: Holding; onClose: () => void }) {
  const { data } = useFinance();
  const [name, setName] = useState(holding?.name ?? "");
  const [type, setType] = useState(holding?.type ?? "Mutual funds");
  const [invested, setInvested] = useState(holding ? String(holding.invested) : "");
  const [value, setValue] = useState(holding ? String(holding.value) : "");
  const [units, setUnits] = useState(holding?.units != null ? String(holding.units) : "");
  const [account, setAccount] = useState(holding?.account ?? "");
  const [closed, setClosed] = useState(holding?.closed ?? false);
  const save = async () => {
    const saved = holdingEdit(data, holding, { invested: parseNum(invested), value: parseNum(value) });
    const values = {
      Type: type,
      Invested: saved.invested,
      "Current value": saved.value,
      Units: parseNum(units),
      Account: link(account || null),
      Updated: saved.updated,
      Closed: closed || null,
    };
    try {
      if (holding) await updateRow(holding.path, holding.name, name, values);
      else await addRow("holdings", name, values);
      onClose();
    } catch (e) {
      fail(e);
    }
  };
  return (
    <Dialog
      title={holding ? "Edit investment" : "Add investment"}
      onClose={onClose}
      footer={
        <>
          {holding && <DeleteButton path={holding.path} what={`“${holding.name}”`} onDone={onClose} />}
          <span className="flex-1" />
          <Button variant="primary" disabled={!name.trim()} onClick={save}>
            {holding ? "Save" : "Add investment"}
          </Button>
        </>
      }
    >
      <Field label="Name">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nifty 50 index fund, Apple, SBI FD…" className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {INVESTMENT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Held at (optional)">
          <Select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">—</option>
            {data.accounts
              .filter((a) => !a.archived || a.key === account)
              .map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name}
                </option>
              ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Invested" hint="Before what you log as Invest">
          <input inputMode="decimal" value={invested} onChange={(e) => setInvested(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Current value" hint="Worth today, all in">
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={invested} className={inputClass} />
        </Field>
        <Field label="Units">
          <input inputMode="decimal" value={units} onChange={(e) => setUnits(e.target.value)} className={inputClass} />
        </Field>
      </div>
      {holding && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} /> Sold or closed (kept for the record, not counted)
        </label>
      )}
    </Dialog>
  );
}

// ---------- other assets and liabilities ----------

export function ItemDialog({ item, kind, onClose }: { item?: Item; kind?: "Asset" | "Liability"; onClose: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [k, setK] = useState<"Asset" | "Liability">(item?.kind ?? kind ?? "Asset");
  const types = k === "Asset" ? ASSET_TYPES : LIABILITY_TYPES;
  const [type, setType] = useState<string>(item?.type ?? types[0]);
  const [value, setValue] = useState(item ? String(item.value) : "");
  const save = async () => {
    const values = { Kind: k, Type: (types as readonly string[]).includes(type) ? type : types[0], Value: Math.abs(parseNum(value) ?? 0), Updated: today() };
    try {
      if (item) await updateRow(item.path, item.name, name, values);
      else await addRow("items", name, values);
      onClose();
    } catch (e) {
      fail(e);
    }
  };
  return (
    <Dialog
      title={item ? `Edit ${item.kind.toLowerCase()}` : `Add ${k.toLowerCase()}`}
      onClose={onClose}
      footer={
        <>
          {item && <DeleteButton path={item.path} what={`“${item.name}”`} onDone={onClose} />}
          <span className="flex-1" />
          <Button variant="primary" disabled={!name.trim()} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      {!item && (
        <Segmented<"Asset" | "Liability">
          value={k}
          onChange={(v) => (setK(v), setType((v === "Asset" ? ASSET_TYPES : LIABILITY_TYPES)[0]))}
          options={[
            { id: "Asset", label: "Asset" },
            { id: "Liability", label: "Liability" },
          ]}
        />
      )}
      <Field label="Name">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={k === "Asset" ? "Apartment, car, gold…" : "Home loan, borrowed from a friend…"} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label={k === "Asset" ? "Worth today" : "Owed today"}>
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <p className="text-xs text-faint">Loans you repay from an account are better added as a Loan account, so payments bring them down by themselves.</p>
    </Dialog>
  );
}

// ---------- categories ----------

export function CategoryDialog({ category, onClose }: { category?: Category; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<"Expense" | "Income">(category?.kind ?? "Expense");
  const [group, setGroup] = useState(category?.group || "Needs");
  const [budget, setBudget] = useState(category?.budget ? String(category.budget) : "");
  const [archived, setArchived] = useState(category?.archived ?? false);
  const save = async () => {
    const values = { Kind: kind, Group: kind === "Income" ? "Income" : group, "Monthly budget": kind === "Expense" ? parseNum(budget) : null, Archived: archived || null };
    try {
      if (category) await updateRow(category.path, category.name, name, values);
      else await addRow("categories", name, values);
      onClose();
    } catch (e) {
      fail(e);
    }
  };
  return (
    <Dialog
      title={category ? "Edit category" : "Add category"}
      onClose={onClose}
      footer={
        <>
          {category && <DeleteButton path={category.path} what={`the category “${category.name}”`} onDone={onClose} />}
          <span className="flex-1" />
          <Button variant="primary" disabled={!name.trim()} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <Segmented<"Expense" | "Income">
        value={kind}
        onChange={setKind}
        options={[
          { id: "Expense", label: "Spending" },
          { id: "Income", label: "Income" },
        ]}
      />
      <Field label="Name">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>
      {kind === "Expense" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Group">
            <Select value={group} onChange={(e) => setGroup(e.target.value)}>
              {["Needs", "Wants", "Savings"].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </Select>
          </Field>
          <Field label="Monthly budget" hint="Leave empty for no budget.">
            <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputClass} />
          </Field>
        </div>
      )}
      {category && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Archived (hidden from forms)
        </label>
      )}
    </Dialog>
  );
}

// ---------- importing a statement ----------

type Mapping = { date: number; name: number; amount: number; debit: number; credit: number };

/** Imports a bank or card statement (CSV): each line becomes an expense or income on one account. */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { data, currency } = useFinance();
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [map, setMap] = useState<Mapping>({ date: -1, name: -1, amount: -1, debit: -1, credit: -1 });
  const [monthFirst, setMonthFirst] = useState(false);
  const [flip, setFlip] = useState(false);
  const [account, setAccount] = useState(data.accounts.find((a) => !a.archived)?.key ?? "");
  const [progress, setProgress] = useState<number | null>(null);

  const header = rows?.[0] ?? [];
  const load = async (file: File) => {
    const parsed = parseCsv(await file.text());
    // Statements often start with a few lines about the account.
    const start = statementHeader(parsed);
    const table = parsed.slice(start);
    setRows(table);
    setFileName(file.name);
    const find = (re: RegExp) => table[0].findIndex((c) => re.test(c.trim()));
    const debit = find(/debit|withdrawal|dr\b|paid out|money out/i);
    const credit = find(/credit|deposit|cr\b|paid in|money in/i);
    setMap({
      date: find(/date/i),
      name: find(/narration|description|details|particulars|remarks|merchant|payee|memo|name/i),
      // Separate money-out and money-in columns, or else one signed amount.
      amount: debit >= 0 || credit >= 0 ? -1 : find(/^amount|amount$|amt/i),
      debit,
      credit,
    });
  };

  // Past descriptions teach categories: "SWIGGY" was Food & dining before, so it is again.
  const learned = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of [...data.transactions].reverse()) if (t.category) m.set(t.name.toLowerCase().replace(/\d+/g, "").trim(), t.category);
    return m;
  }, [data.transactions]);

  const parsed = useMemo(() => {
    if (!rows) return [];
    const out: { date: string; name: string; amount: number; type: "Expense" | "Income"; category: string | null; duplicate: boolean }[] = [];
    for (const r of rows.slice(1)) {
      const date = map.date >= 0 ? parseDate(r[map.date] ?? "", monthFirst) : null;
      let amount: number | null = null;
      if (map.debit >= 0 || map.credit >= 0) {
        const debit = map.debit >= 0 ? parseAmount(r[map.debit] ?? "") : null;
        const credit = map.credit >= 0 ? parseAmount(r[map.credit] ?? "") : null;
        amount = debit ? -Math.abs(debit) : credit ? Math.abs(credit) : null;
      } else if (map.amount >= 0) amount = parseAmount(r[map.amount] ?? "");
      if (!date || !amount) continue;
      if (flip) amount = -amount;
      const name = (map.name >= 0 ? (r[map.name] ?? "") : "").trim().replace(/\s+/g, " ").slice(0, 120) || (amount < 0 ? "Expense" : "Income");
      const type = amount < 0 ? "Expense" : "Income";
      const duplicate = data.transactions.some((t) => t.date === date && Math.abs(t.amount - Math.abs(amount!)) < 0.005 && t.account === account && t.type === type);
      out.push({ date, name, amount: Math.abs(amount), type, category: learned.get(name.toLowerCase().replace(/\d+/g, "").trim()) ?? null, duplicate });
    }
    return out;
  }, [rows, map, monthFirst, flip, account, data.transactions, learned]);

  const fresh = parsed.filter((p) => !p.duplicate);
  const run = async () => {
    setProgress(0);
    try {
      for (let i = 0; i < fresh.length; i++) {
        const p = fresh[i];
        await addTransaction({ name: p.name, type: p.type, amount: p.amount, date: p.date, account: account || null, to: null, category: p.category, holding: null, tags: ["imported"], notes: "" });
        setProgress(i + 1);
      }
      host().ui.toast(`Imported ${fresh.length} transaction${fresh.length === 1 ? "" : "s"}`);
      onClose();
    } catch (e) {
      fail(e);
      setProgress(null);
    }
  };

  const column = (key: keyof Mapping, label: string) => (
    <Field label={label}>
      <Select value={map[key]} onChange={(e) => setMap({ ...map, [key]: Number(e.target.value) })}>
        <option value={-1}>—</option>
        {header.map((h, i) => (
          <option key={i} value={i}>
            {h || `Column ${i + 1}`}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <Dialog
      title="Import a statement"
      width={640}
      onClose={onClose}
      footer={
        <>
          <span className="flex-1 text-xs text-muted">
            {rows ? `${fresh.length} to import${parsed.length > fresh.length ? ` · ${parsed.length - fresh.length} already there, skipped` : ""}` : "A CSV export from your bank or card"}
          </span>
          <Button variant="primary" disabled={!fresh.length || progress !== null} onClick={run}>
            {progress !== null ? `Importing ${progress}/${fresh.length}…` : "Import"}
          </Button>
        </>
      }
    >
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line px-4 py-3 text-sm text-muted hover:bg-hover">
        <FileUp size={18} className="text-faint" />
        <span className="flex-1 truncate">{fileName || "Choose a CSV file…"}</span>
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
      </label>
      {rows && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {column("date", "Date column")}
            {column("name", "Description column")}
            <Field label="Into account">
              <Select value={account} onChange={(e) => setAccount(e.target.value)}>
                <option value="">No account</option>
                {data.accounts
                  .filter((a) => !a.archived)
                  .map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.name}
                    </option>
                  ))}
              </Select>
            </Field>
            {column("amount", "Amount (one column)")}
            {column("debit", "…or money out")}
            {column("credit", "…and money in")}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={monthFirst} onChange={(e) => setMonthFirst(e.target.checked)} /> Dates are month first (10/05 is Oct 5)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} /> Spending shows as positive amounts
            </label>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-line">
            <table className="w-full text-xs">
              <tbody>
                {parsed.slice(0, 50).map((p, i) => (
                  <tr key={i} className={`border-b border-line last:border-0 ${p.duplicate ? "text-faint line-through" : "text-ink"}`}>
                    <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{p.date}</td>
                    <td className="max-w-64 truncate px-2 py-1.5">{p.name}</td>
                    <td className="px-2 py-1.5 text-muted">{p.category ? data.categories.find((c) => c.key === p.category)?.name : ""}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">{(p.type === "Expense" ? "−" : "+") + money(p.amount, currency)}</td>
                  </tr>
                ))}
                {!parsed.length && (
                  <tr>
                    <td className="px-3 py-4 text-center text-muted">No rows with a date and an amount yet: check the columns above.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Dialog>
  );
}
