import { useMemo, useState } from "react";
import { CalendarRange, ArrowRightLeft } from "lucide-react";

const toISO = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return toISO(d); };
const today = () => toISO(new Date());

// One-tap ranges so the most common lookups never need manual date picking.
const RANGE_PRESETS: [string, () => [string, string]][] = [
  ["Last 7 days", () => [daysAgo(7), today()]],
  ["Last 30 days", () => [daysAgo(30), today()]],
  ["Last 90 days", () => [daysAgo(90), today()]],
  ["This year", () => [toISO(new Date(new Date().getFullYear(), 0, 1)), today()]],
  ["Last year", () => [
    toISO(new Date(new Date().getFullYear() - 1, 0, 1)),
    toISO(new Date(new Date().getFullYear() - 1, 11, 31)),
  ]],
];

export default function DateDifference() {
  const [from, setFrom] = useState("2020-01-01");
  const [to, setTo] = useState(today());

  // Identical calculation as before.
  const res = useMemo(() => {
    const a = new Date(from), b = new Date(to);
    if (isNaN(+a) || isNaN(+b)) return null;
    const ms = Math.abs(+b - +a);
    const days = Math.floor(ms / 86400000);
    return { days, weeks: Math.floor(days / 7), months: Math.floor(days / 30.4375), years: (days / 365.25).toFixed(2), hours: days * 24 };
  }, [from, to]);

  const swap = () => { setFrom(to); setTo(from); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <CalendarRange className="h-3.5 w-3.5" />
          Date Difference
        </span>
        {RANGE_PRESETS.map(([label, compute]) => (
          <button
            key={label}
            onClick={() => { const [f, t] = compute(); setFrom(f); setTo(t); }}
            className="rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-sm font-bold transition-transform hover:-translate-y-0.5"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Result surfaced first so it's the first thing visible and updates live as either date changes. */}
      {res && (
        <div className="grid gap-3 sm:grid-cols-5">
          {[["Days", res.days], ["Weeks", res.weeks], ["Months", res.months], ["Years", res.years], ["Hours", res.hours]].map(([l, v]) => (
            <div
              key={l as string}
              className="rounded-xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]"
            >
              <div className="inline-flex rounded-full border-2 border-foreground bg-secondary/40 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
                {l}
              </div>
              <div className="mt-2 text-xl font-bold">{typeof v === "number" ? v.toLocaleString("en-IN") : v}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid items-start gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <label className="block">
          <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            From
          </span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From date"
            className="mt-2 w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-sm font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
          />
        </label>

        <button
          onClick={swap}
          aria-label="Swap from and to dates"
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
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="To date"
              className="w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-sm font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
            />
            <button
              onClick={() => setTo(today())}
              className="whitespace-nowrap rounded-xl border-2 border-foreground bg-card px-3 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
            >
              Today
            </button>
          </div>
        </label>
      </div>
    </div>
  );
}