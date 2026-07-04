import { useMemo, useState } from "react";
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
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  const stats = useMemo(() => {
    const a = new Date(dob), b = new Date(on);
    if (isNaN(+a) || isNaN(+b) || a > b) return null;
    const d = diff(a, b);
    const totalDays = Math.floor((+b - +a) / 86400000);
    return { ...d, totalDays, totalMonths: d.years * 12 + d.months, totalWeeks: Math.floor(totalDays / 7), totalHours: totalDays * 24 };
  }, [dob, on]);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="text-xs uppercase text-muted-foreground">Date of birth</span>
          <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5" />
        </label>
        <label className="block"><span className="text-xs uppercase text-muted-foreground">Age on</span>
          <input type="date" value={on} onChange={(e) => setOn(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5" />
        </label>
      </div>
      {stats ? (
        <>
          <div className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 p-6">
            <div className="text-xs uppercase text-muted-foreground">Your age</div>
            <div className="mt-1 font-display text-4xl font-bold">
              {stats.years} <span className="text-lg font-medium text-muted-foreground">years</span>{" "}
              {stats.months} <span className="text-lg font-medium text-muted-foreground">months</span>{" "}
              {stats.days} <span className="text-lg font-medium text-muted-foreground">days</span>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {[["Months", stats.totalMonths], ["Weeks", stats.totalWeeks], ["Days", stats.totalDays], ["Hours", stats.totalHours]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs uppercase text-muted-foreground">{l}</div>
                <div className="mt-1 font-display text-xl font-bold">{(v as number).toLocaleString("en-IN")}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Please enter a valid date range.</div>
      )}
    </div>
  );
}
