import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";
const CURRENCIES = ["INR","USD","EUR","GBP","JPY","AUD","CAD","CHF","CNY","SGD","AED","HKD","NZD","SEK","ZAR","KRW","BRL","RUB"];
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
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] items-end">
        <label className="block"><span className="text-xs uppercase text-muted-foreground">From</span>
          <div className="mt-1 flex gap-2">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-lg" />
            <select value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-border bg-background px-3">
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </label>
        <button onClick={swap} className="mb-1 rounded-xl border border-border p-3 hover:bg-secondary"><ArrowRightLeft className="h-4 w-4" /></button>
        <label className="block"><span className="text-xs uppercase text-muted-foreground">To</span>
          <div className="mt-1 flex gap-2">
            <input readOnly value={loading ? "..." : converted.toLocaleString("en-IN", { maximumFractionDigits: 2 })} className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-lg font-semibold" />
            <select value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-border bg-background px-3">
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </label>
      </div>
      <div className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 p-4 text-sm">
        {rate ? <>1 {from} = <b>{rate.toFixed(4)}</b> {to}</> : "Loading rate..."}
      </div>
      <p className="text-xs text-muted-foreground">Exchange rates are automatically refreshed every hour using trusted global financial data, providing fast, accurate, and reliable currency conversions.</p>
    </div>
  );
}
