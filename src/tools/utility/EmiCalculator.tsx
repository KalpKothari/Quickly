import { useMemo, useState } from "react";
import { formatINR, formatNumberIN } from "@/lib/format";
export default function EmiCalculator() {
  const [amount, setAmount] = useState(2500000);
  const [rate, setRate] = useState(8.5);
  const [years, setYears] = useState(20);
  const r = rate / 12 / 100;
  const n = years * 12;
  const emi = r === 0 ? amount / n : (amount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const total = emi * n;
  const interest = total - amount;
  const schedule = useMemo(() => {
    let balance = amount;
    const rows: { month: number; principal: number; interest: number; balance: number }[] = [];
    for (let i = 1; i <= n; i++) {
      const int = balance * r;
      const prin = emi - int;
      balance -= prin;
      if (i <= 12 || i % 12 === 0 || i === n) rows.push({ month: i, principal: prin, interest: int, balance: Math.max(0, balance) });
    }
    return rows;
  }, [amount, r, n, emi]);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block"><span className="text-xs uppercase text-muted-foreground">Loan amount (₹)</span>
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(+e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-lg font-semibold" />
          <input type="range" min={10000} max={20000000} step={10000} value={amount} onChange={(e) => setAmount(+e.target.value)} className="mt-2 w-full" />
        </label>
        <label className="block"><span className="text-xs uppercase text-muted-foreground">Interest rate (% p.a.)</span>
          <input type="number" min={0} max={30} step={0.1} value={rate} onChange={(e) => setRate(+e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-lg font-semibold" />
          <input type="range" min={1} max={20} step={0.05} value={rate} onChange={(e) => setRate(+e.target.value)} className="mt-2 w-full" />
        </label>
        <label className="block"><span className="text-xs uppercase text-muted-foreground">Tenure (years)</span>
          <input type="number" min={1} max={40} value={years} onChange={(e) => setYears(+e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-lg font-semibold" />
          <input type="range" min={1} max={30} value={years} onChange={(e) => setYears(+e.target.value)} className="mt-2 w-full" />
        </label>
      </div>
      <div className="grid gap-3 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 p-6 sm:grid-cols-3">
        <div><div className="text-xs uppercase text-muted-foreground">Monthly EMI</div><div className="mt-1 font-display text-2xl font-bold">{formatINR(emi)}</div></div>
        <div><div className="text-xs uppercase text-muted-foreground">Total interest</div><div className="mt-1 font-display text-2xl font-bold">{formatINR(interest)}</div></div>
        <div><div className="text-xs uppercase text-muted-foreground">Total payment</div><div className="mt-1 font-display text-2xl font-bold">{formatINR(total)}</div></div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Month</th><th className="px-3 py-2 text-right">Principal</th><th className="px-3 py-2 text-right">Interest</th><th className="px-3 py-2 text-right">Balance</th></tr>
          </thead>
          <tbody>
            {schedule.map((row) => (
              <tr key={row.month} className="border-t border-border">
                <td className="px-3 py-2">{row.month}</td>
                <td className="px-3 py-2 text-right">{formatINR(row.principal)}</td>
                <td className="px-3 py-2 text-right">{formatINR(row.interest)}</td>
                <td className="px-3 py-2 text-right">{formatINR(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Follows the standard Indian reducing-balance EMI formula. Values shown in Indian numbering (Lakhs / Crores). {formatNumberIN(amount)}</p>
    </div>
  );
}
