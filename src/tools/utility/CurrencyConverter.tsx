import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRightLeft, Coins } from "lucide-react";

const CURRENCIES = ["INR","USD","EUR","GBP","JPY","AUD","CAD","CHF","CNY","SGD","AED","HKD","NZD","SEK","ZAR","KRW","BRL","RUB"];

// One-tap amounts so a common conversion never needs manual typing.
const AMOUNT_PRESETS = [1, 10, 100, 1000];

// One-tap currency pairs so a common conversion never needs two dropdown picks.
const POPULAR_PAIRS: [string, string][] = [
  ["USD", "INR"],
  ["EUR", "USD"],
  ["GBP", "USD"],
  ["USD", "JPY"],
];

export default function CurrencyConverter() {
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("INR");
  const [amount, setAmount] = useState("100");
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
        const j = await res.json();
        if (!cancelled) {
          const r = j?.rates?.[to];
          if (r) setRate(r);
          else throw new Error();
        }
      } catch { if (!cancelled) toast.error("Couldn't fetch exchange rate"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [from, to]);

  const converted = rate ? (parseFloat(amount) || 0) * rate : 0;
  const swap = () => { setFrom(to); setTo(from); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <Coins className="h-3.5 w-3.5" />
          Currency
        </span>
        {POPULAR_PAIRS.map(([p, q]) => (
          <button
            key={`${p}-${q}`}
            onClick={() => { setFrom(p); setTo(q); }}
            aria-label={`Set ${p} to ${q}`}
            className={
              "rounded-full border-2 border-foreground px-3 py-1.5 text-sm font-bold transition-transform hover:-translate-y-0.5 " +
              (from === p && to === q
                ? "bg-secondary shadow-[3px_3px_0_0_var(--color-foreground)]"
                : "bg-card")
            }
          >
            {p} → {q}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <label className="block">
          <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            From
          </span>
          <div className="mt-2 flex gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              aria-label={`Amount in ${from}`}
              className="w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-lg font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
            />
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Convert from currency"
              className="rounded-xl border-2 border-foreground bg-card px-3 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)]"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex gap-1.5">
            {AMOUNT_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setAmount(String(p))}
                className="rounded-full border border-foreground/30 bg-transparent px-2 py-0.5 text-xs font-semibold text-foreground/70 transition-colors hover:border-primary hover:text-primary"
              >
                {p}
              </button>
            ))}
          </div>
        </label>

        <button
          onClick={swap}
          aria-label="Swap currencies"
          className="mt-1 self-center rounded-full border-2 border-foreground bg-card p-3 shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:rotate-180 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:mt-8"
        >
          <ArrowRightLeft className="h-4 w-4" />
        </button>

        <label className="block">
          <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            To
          </span>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={loading ? "..." : converted.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              aria-label={`Converted amount in ${to}`}
              className="w-full rounded-xl border-2 border-foreground bg-secondary/40 px-3 py-2.5 text-lg font-bold shadow-[3px_3px_0_0_var(--color-foreground)]"
            />
            <select
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Convert to currency"
              className="rounded-xl border-2 border-foreground bg-card px-3 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)]"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </label>
      </div>

      <div className="rounded-2xl border-2 border-foreground bg-gradient-to-br from-violet-500/15 to-indigo-500/15 p-4 text-sm font-medium shadow-[5px_5px_0_0_var(--color-foreground)]">
        {rate ? <>1 {from} = <b>{rate.toFixed(4)}</b> {to}</> : "Loading rate..."}
      </div>

      <p className="rounded-lg border-2 border-dashed border-foreground/30 px-3 py-2 text-xs font-medium text-muted-foreground">
        Exchange rates are automatically refreshed every hour using trusted global financial data, providing fast, accurate, and reliable currency conversions.
      </p>
    </div>
  );
}