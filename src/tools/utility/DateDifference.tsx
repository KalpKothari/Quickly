import { useMemo, useState } from "react";
export default function DateDifference() {
  const [from, setFrom] = useState("2020-01-01");
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const res = useMemo(() => {
    const a = new Date(from), b = new Date(to);
    if (isNaN(+a) || isNaN(+b)) return null;
    const ms = Math.abs(+b - +a);
    const days = Math.floor(ms / 86400000);
    return { days, weeks: Math.floor(days / 7), months: Math.floor(days / 30.4375), years: (days / 365.25).toFixed(2), hours: days * 24 };
  }, [from, to]);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="text-xs uppercase text-muted-foreground">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5" />
        </label>
        <label className="block"><span className="text-xs uppercase text-muted-foreground">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5" />
        </label>
      </div>
      {res && (
        <div className="grid gap-3 sm:grid-cols-5">
          {[["Days", res.days], ["Weeks", res.weeks], ["Months", res.months], ["Years", res.years], ["Hours", res.hours]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs uppercase text-muted-foreground">{l}</div>
              <div className="mt-1 font-display text-xl font-bold">{typeof v === "number" ? v.toLocaleString("en-IN") : v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
