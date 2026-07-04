import { useMemo, useState } from "react";
import { Cake } from "lucide-react";

function diff(a: Date, b: Date) {
  let years = b.getFullYear() - a.getFullYear();
  let months = b.getMonth() - a.getMonth();
  let days = b.getDate() - a.getDate();
  if (days < 0) { months--; const prev = new Date(b.getFullYear(), b.getMonth(), 0); days += prev.getDate(); }
  if (months < 0) { years--; months += 12; }
  return { years, months, days };
}

export default function AgeCalculator() {
  const [dob, setDob] = useState("2000-01-01");
  const today = new Date().toISOString().slice(0, 10);
  const [on, setOn] = useState(today);
  const [customDate, setCustomDate] = useState(false);

  const stats = useMemo(() => {
    const a = new Date(dob), b = new Date(on);
    if (isNaN(+a) || isNaN(+b) || a > b) return null;
    const d = diff(a, b);
    const totalDays = Math.floor((+b - +a) / 86400000);
    return { ...d, totalDays, totalMonths: d.years * 12 + d.months, totalWeeks: Math.floor(totalDays / 7), totalHours: totalDays * 24 };
  }, [dob, on]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <Cake className="h-3.5 w-3.5" />
          Age
        </span>
      </div>

      {/* Just a date of birth is enough to get today's age; the second date is opt-in. */}
      <label className="block">
        <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
          Date of birth
        </span>
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          aria-label="Date of birth"
          className="mt-2 w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-sm font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => { setCustomDate(false); setOn(today); }}
          aria-pressed={!customDate}
          className={
            "rounded-full border-2 border-foreground px-3 py-1.5 text-sm font-bold transition-transform hover:-translate-y-0.5 " +
            (!customDate
              ? "bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
              : "bg-card")
          }
        >
          Age today
        </button>
        <button
          onClick={() => setCustomDate(true)}
          aria-pressed={customDate}
          className={
            "rounded-full border-2 border-foreground px-3 py-1.5 text-sm font-bold transition-transform hover:-translate-y-0.5 " +
            (customDate
              ? "bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
              : "bg-card")
          }
        >
          Age on another date
        </button>
      </div>

      {customDate && (
        <label className="block">
          <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            Age on
          </span>
          <div className="mt-2 flex gap-2">
            <input
              type="date"
              value={on}
              onChange={(e) => setOn(e.target.value)}
              aria-label="Age calculated on date"
              className="w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-sm font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
            />
            <button
              onClick={() => setOn(today)}
              className="rounded-xl border-2 border-foreground bg-card px-3 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
            >
              Today
            </button>
          </div>
        </label>
      )}

      {stats ? (
        <>
          <div className="rounded-2xl border-2 border-foreground bg-gradient-to-br from-violet-500/15 to-indigo-500/15 p-6 shadow-[5px_5px_0_0_var(--color-foreground)]">
            <div className="inline-flex rounded-full border-2 border-foreground bg-card px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
              Your age
            </div>
            <div className="mt-3 text-4xl font-bold">
              {stats.years} <span className="text-lg font-medium text-muted-foreground">years</span>{" "}
              {stats.months} <span className="text-lg font-medium text-muted-foreground">months</span>{" "}
              {stats.days} <span className="text-lg font-medium text-muted-foreground">days</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            {[["Months", stats.totalMonths], ["Weeks", stats.totalWeeks], ["Days", stats.totalDays], ["Hours", stats.totalHours]].map(([l, v]) => (
              <div
                key={l as string}
                className="rounded-xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]"
              >
                <div className="inline-flex rounded-full border-2 border-foreground bg-secondary/40 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
                  {l}
                </div>
                <div className="mt-2 text-xl font-bold">{(v as number).toLocaleString("en-IN")}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          Please enter a valid date range.
        </div>
      )}
    </div>
  );
}