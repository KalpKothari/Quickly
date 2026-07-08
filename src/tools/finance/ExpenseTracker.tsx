import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Wallet, Plus, Trash2, Download, TrendingUp, TrendingDown,
  PiggyBank, Sparkles, Filter, Ghost, Zap,
} from "lucide-react";
import { formatINR } from "@/lib/format";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

type Transaction = {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  syncWithPiggy: boolean;
  at: number;
};

const EXPENSE_STORAGE_KEY = "quickly-expense-tracker-v1";
const PIGGY_STORAGE_KEY = "quickly-savings-multi-goal-v2";

const CATEGORIES = {
  income: [
    "Salary",
    "Freelance & Consulting",
    "Investments & Dividends",
    "Side Hustle Cash",
    "Rental Income",
    "Gifts & Grants",
    "Tax Refunds",
  ],
  expense: [
    "Groceries & Food",
    "Dining Out & Cafes",
    "Rent & Mortgages",
    "Utility Bills & Insurance",
    "Subscribed Matrix Services",
    "Transport & Fuel",
    "Medical & Healthcare",
    "Entertainment & Leisure",
    "Shopping & Apparels",
    "Education & Courses",
    "Taxes & Government Fees",
  ],
};

const QUICK_AMOUNTS = [100, 500, 1000, 2000, 5000];

function timeAgo(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const isYesterday =
    new Date(today.setDate(today.getDate() - 1)).toDateString() === d.toDateString();

  if (isToday)
    return `Today, ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  if (isYesterday)
    return `Yesterday, ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function ExpenseTracker() {
  const { showSupportPrompt } = useSupportPrompt();

  const [loaded, setLoaded] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState(CATEGORIES.expense[0]);
  const [syncWithPiggy, setSyncWithPiggy] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXPENSE_STORAGE_KEY);
      if (raw) setTransactions(JSON.parse(raw));
    } catch {
      console.warn("Could not load expense data");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(EXPENSE_STORAGE_KEY, JSON.stringify(transactions));
  }, [transactions, loaded]);

  useEffect(() => {
    setCategory(CATEGORIES[type][0]);
  }, [type]);

  const totalIncome = useMemo(
    () => transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
    [transactions],
  );
  const totalExpense = useMemo(
    () => transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    [transactions],
  );
  const netBalance = totalIncome - totalExpense;

  const expenseStreak = useMemo(() => {
    const uniqueDaysWithExpenses = new Set(
      transactions.filter((t) => t.type === "expense").map((t) => new Date(t.at).toDateString()),
    );
    return uniqueDaysWithExpenses.size;
  }, [transactions]);

  const accountHealthLabel = useMemo(() => {
    if (transactions.length === 0) return "Fresh Slate Tracker";
    if (netBalance < 0) return "Deficit Variance Mode";
    if (netBalance === 0) return "Balanced Matrix State";
    if (netBalance > 0 && netBalance < totalIncome * 0.2) return "Stable Safety Margin";
    return "High Growth Velocity Profile";
  }, [transactions, netBalance, totalIncome]);

  const filteredTransactions = useMemo(() => {
    if (filterType === "all") return transactions;
    return transactions.filter((t) => t.type === filterType);
  }, [transactions, filterType]);

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!description.trim()) { toast.error("Give this transaction a name!"); return; }
    if (!val || val <= 0) { toast.error("Enter a valid amount above 0"); return; }

    const newTx: Transaction = {
      id: crypto.randomUUID(),
      description: description.trim(),
      amount: val,
      type,
      category,
      syncWithPiggy,
      at: Date.now(),
    };

    if (syncWithPiggy) {
      try {
        const rawPiggy = localStorage.getItem(PIGGY_STORAGE_KEY);
        if (rawPiggy) {
          const parsed = JSON.parse(rawPiggy);
          const activeId = parsed.activeGoalId;
          parsed.goals = parsed.goals.map((g: any) => {
            if (g.id === activeId || (!activeId && g)) {
              return {
                ...g,
                contributions: [
                  {
                    id: crypto.randomUUID(),
                    amount: type === "income" ? val : -val,
                    note: `Expense Tracker: ${description.trim()}`,
                    at: Date.now(),
                  },
                  ...g.contributions,
                ],
              };
            }
            return g;
          });
          localStorage.setItem(PIGGY_STORAGE_KEY, JSON.stringify(parsed));
          toast.success("Synced with your Piggy Bank!");
        }
      } catch (err) {
        console.warn("Piggy synchronization skipped or failed", err);
      }
    }

    setTransactions((prev) => [newTx, ...prev]);
    setDescription("");
    setAmount("");
    setSyncWithPiggy(false);
    toast.success(type === "income" ? "Income logged!" : "Expense logged!");
    
    // Trigger support prompt when transaction is successfully logged
    showSupportPrompt();
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    toast.error("Transaction deleted!");
  };

  const handlePrintPDF = () => {
    window.print();
    // Trigger support prompt when printable report is generated
    showSupportPrompt();
  };

  if (!loaded) return null;

  return (
    <div className="w-full min-w-0 space-y-6 print:p-8 print:bg-white print:text-black">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-section, .print-section * { visibility: visible; }
          .print-section { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* HEADER */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 no-print">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <Wallet className="h-3.5 w-3.5" />
          Expense Tracker
        </span>
        <button
          type="button"
          onClick={handlePrintPDF}
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-4 py-1.5 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
        >
          <Download className="h-3.5 w-3.5" /> Save as PDF
        </button>
      </div>

      <div className="print-section space-y-6">
        {/* STATS */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border-2 border-foreground bg-primary/5 p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <Zap className="h-4 w-4 text-primary animate-pulse" /> Net Balance
            </div>
            <div className={`mt-2 text-3xl font-black ${netBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
              {formatINR(netBalance)}
            </div>
          </div>
          <div className="rounded-2xl border-2 border-foreground bg-emerald-500/5 p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-emerald-500" /> Total Income
            </div>
            <div className="mt-2 text-2xl font-black text-foreground">{formatINR(totalIncome)}</div>
          </div>
          <div className="rounded-2xl border-2 border-foreground bg-red-500/5 p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <TrendingDown className="h-4 w-4 text-red-500" /> Total Expenses
            </div>
            <div className="mt-2 text-2xl font-black text-foreground">{formatINR(totalExpense)}</div>
          </div>
        </div>

        {/* STREAK BANNER */}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-foreground bg-gradient-to-r from-amber-400/10 to-red-500/10 p-4 shadow-[3px_3px_0_0_var(--color-foreground)] print:hidden no-print">
          <p className="text-sm font-bold">
            Logged expenses on <strong>{expenseStreak} unique days</strong> — every coin counted keeps your targets secure.
          </p>
          <span className="shrink-0 rounded-full border-2 border-foreground bg-background px-3 py-1 text-xs font-black shadow-[1px_1px_0_0_var(--color-foreground)] text-primary">
            {accountHealthLabel}
          </span>
        </div>

        <div className="grid min-w-0 gap-6 lg:grid-cols-2 lg:items-start">
          {/* LOG FORM */}
          <div className="min-w-0 space-y-4 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[5px_5px_0_0_var(--color-foreground)] no-print">
            <span className="inline-flex items-center gap-1 rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
              <Sparkles className="h-3 w-3" /> Log a transaction
            </span>

            <form onSubmit={handleAddTransaction} className="space-y-4">
              {/* type toggle */}
              <div className="grid grid-cols-2 gap-2 rounded-xl border-2 border-foreground bg-background p-1">
                <button
                  type="button"
                  onClick={() => setType("expense")}
                  className={`rounded-lg py-2 text-xs font-black uppercase transition-all ${
                    type === "expense"
                      ? "border-2 border-foreground bg-red-500 text-white shadow-[2px_2px_0_0_var(--color-foreground)]"
                      : "text-muted-foreground"
                  }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setType("income")}
                  className={`rounded-lg py-2 text-xs font-black uppercase transition-all ${
                    type === "income"
                      ? "border-2 border-foreground bg-emerald-500 text-white shadow-[2px_2px_0_0_var(--color-foreground)]"
                      : "text-muted-foreground"
                  }`}
                >
                  Income
                </button>
              </div>

              {/* description */}
              <label className="block min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Description</span>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="e.g. Rent, groceries, salary..."
                  className="mt-1.5 w-full min-w-0 rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-foreground)] outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)]"
                />
              </label>

              {/* amount + quick chips */}
              <label className="block min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Amount (₹)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Enter amount"
                  className="mt-1.5 w-full min-w-0 rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-foreground)] outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)]"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {QUICK_AMOUNTS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAmount(String(a))}
                      className={`rounded-full border-2 border-foreground px-2.5 py-1 text-[11px] font-bold transition-transform hover:-translate-y-0.5 ${
                        amount === String(a)
                          ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
                          : "bg-background"
                      }`}
                    >
                      ₹{a.toLocaleString("en-IN")}
                    </button>
                  ))}
                </div>
              </label>

              {/* category */}
              <label className="block min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1.5 w-full min-w-0 rounded-xl border-2 border-foreground bg-background px-3 py-2.5 text-sm font-bold shadow-[2px_2px_0_0_var(--color-foreground)] outline-none"
                >
                  {CATEGORIES[type].map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </label>

              {/* piggy sync */}
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border-2 border-foreground bg-secondary/30 p-3 shadow-[2px_2px_0_0_var(--color-foreground)] select-none">
                <input
                  type="checkbox"
                  checked={syncWithPiggy}
                  onChange={(e) => setSyncWithPiggy(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="flex items-center gap-1.5 text-xs font-black uppercase text-foreground">
                  <PiggyBank className="h-4 w-4 text-red-500 animate-pulse" />
                  Sync with Piggy Bank
                </span>
              </label>

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
              >
                <Plus className="h-4 w-4" /> Log Transaction
              </button>
            </form>
          </div>

          {/* TRANSACTION LIST */}
          <div className="min-w-0 space-y-4 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[5px_5px_0_0_var(--color-foreground)] print:w-full print:border-none print:shadow-none">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 no-print">
              <span className="inline-flex items-center gap-1 rounded-full border-2 border-foreground bg-secondary/40 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
                <Filter className="h-3 w-3" /> Filter
              </span>
              <div className="inline-flex rounded-full border-2 border-foreground bg-background p-0.5">
                {(["all", "income", "expense"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilterType(f)}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase transition-all ${
                      filterType === f
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="hidden print:block border-b-2 border-foreground pb-2 mb-4">
              <h2 className="text-xl font-black uppercase">Expense Report</h2>
              <p className="text-xs text-muted-foreground">Generated via Quickly.</p>
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-foreground/30 p-8 text-center text-muted-foreground">
                <Ghost className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm font-bold">No transactions yet — log one on the left!</p>
              </div>
            ) : (
              <ul className="max-h-[480px] space-y-3 overflow-y-auto pr-1 print:max-h-none print:overflow-visible">
                {filteredTransactions.map((t) => (
                  <li
                    key={t.id}
                    className={`flex min-w-0 items-center gap-3 rounded-xl border-2 border-foreground bg-background p-3 shadow-[2px_2px_0_0_var(--color-foreground)] ${
                      t.type === "income"
                        ? "border-l-[6px] border-l-emerald-500"
                        : "border-l-[6px] border-l-red-500"
                    }`}
                  >
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 truncate text-sm font-black text-foreground">
                          {t.description}
                        </span>
                        <span className="hidden shrink-0 rounded-full border border-foreground/30 bg-secondary/50 px-2 py-0.5 text-[9px] font-black uppercase text-foreground/70 sm:inline">
                          {t.category}
                        </span>
                      </div>
                      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                        <span className="truncate">{timeAgo(t.at)}</span>
                        {t.syncWithPiggy && (
                          <span className="flex shrink-0 items-center gap-0.5 font-bold text-red-500">
                            · <PiggyBank className="h-3 w-3" /> Piggy synced
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`text-sm font-black tabular-nums ${
                          t.type === "income"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-500"
                        }`}
                      >
                        {t.type === "income" ? "+" : "-"}{formatINR(t.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteTransaction(t.id)}
                        aria-label="Delete entry"
                        className="rounded-full border-2 border-foreground bg-card p-1.5 transition-transform hover:-translate-y-0.5 hover:bg-destructive hover:text-destructive-foreground no-print"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}