import { useMemo, useState, useEffect } from "react";
import { Plus, Minus, CalendarCheck, CalendarX } from "lucide-react";

export default function Attendance() {
  // Initialize state hooks straight from localStorage with fallback defaults
  const [attended, setAttended] = useState<number>(() => {
    const saved = localStorage.getItem("attendance_attended");
    return saved !== null ? Number(saved) : 45;
  });

  const [total, setTotal] = useState<number>(() => {
    const saved = localStorage.getItem("attendance_total");
    return saved !== null ? Number(saved) : 60;
  });

  const [required, setRequired] = useState<number>(() => {
    const saved = localStorage.getItem("attendance_required");
    return saved !== null ? Number(saved) : 75;
  });

  // Automatically sync values to localStorage whenever they are modified
  useEffect(() => {
    localStorage.setItem("attendance_attended", String(attended));
  }, [attended]);

  useEffect(() => {
    localStorage.setItem("attendance_total", String(total));
  }, [total]);

  useEffect(() => {
    localStorage.setItem("attendance_required", String(required));
  }, [required]);

  const res = useMemo(() => {
    const pct = total ? (attended / total) * 100 : 0;
    const threshold = required / 100;
    let bunk = 0, needed = 0;
    if (pct >= required) {
      // can bunk N classes: attended/(total+N) >= threshold  → N <= attended/threshold - total
      bunk = Math.max(0, Math.floor(attended / threshold - total));
    } else {
      // need to attend M more: (attended+M)/(total+M) >= threshold → M >= (threshold*total - attended)/(1-threshold)
      needed = Math.ceil((threshold * total - attended) / (1 - threshold));
    }
    return { pct, bunk, needed };
  }, [attended, total, required]);
  const safe = res.pct >= required;

  const markAttended = () => {
    setAttended((a) => a + 1);
    setTotal((t) => t + 1);
  };
  const markMissed = () => {
    setTotal((t) => t + 1);
  };

  const fields: [string, number, (n: number) => void, number][] = [
    ["Classes attended", attended, setAttended, 1],
    ["Total classes", total, setTotal, 1],
    ["Required %", required, setRequired, 1],
  ];

  return (
    <div className="space-y-6">
      {/* STEP 1 — quick log for today, or edit numbers directly */}
      <div>
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">1</span>
          Log today, or enter your numbers directly
        </p>
        <div className="mb-4 flex flex-wrap gap-3">
          <button
            onClick={markAttended}
            className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-700 shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)]"
          >
            <CalendarCheck className="h-4 w-4" /> I attended a class
          </button>
          <button
            onClick={markMissed}
            className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-orange-500/15 px-4 py-2 text-sm font-bold text-orange-700 shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)]"
          >
            <CalendarX className="h-4 w-4" /> I missed a class
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {fields.map(([l, v, set, step]) => (
            <label key={l} className="block">
              <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                {l}
              </span>
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => set(Math.max(0, v - step))}
                  aria-label={`Decrease ${l}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-card transition-transform hover:-translate-y-0.5"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  min={0}
                  value={v}
                  onChange={(e) => set(+e.target.value)}
                  className="w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-center text-lg font-bold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
                />
                <button
                  type="button"
                  onClick={() => set(v + step)}
                  aria-label={`Increase ${l}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-card transition-transform hover:-translate-y-0.5"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* STEP 2 — where you stand */}
      <div>
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">2</span>
          Where you stand
        </p>
        <div
          className={
            "overflow-hidden rounded-2xl border-2 border-foreground p-6 shadow-[6px_6px_0_0_var(--color-foreground)] " +
            (safe ? "bg-gradient-to-br from-emerald-500/15 to-teal-500/15" : "bg-gradient-to-br from-rose-500/15 to-orange-500/15")
          }
        >
          <div className="inline-flex rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Current attendance
          </div>
          <div className="mt-3 font-display text-5xl font-extrabold">{res.pct.toFixed(2)}%</div>

          {/* visual threshold meter */}
          <div className="mt-4">
            <div className="relative h-3 w-full overflow-hidden rounded-full border-2 border-foreground bg-background/60">
              <div
                className={`absolute inset-y-0 left-0 ${safe ? "bg-gradient-to-r from-emerald-500 to-teal-500" : "bg-gradient-to-r from-rose-500 to-orange-500"}`}
                style={{ width: `${Math.min(100, Math.max(0, res.pct))}%` }}
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-foreground/60"
                style={{ left: `${Math.min(100, Math.max(0, required))}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <span>0%</span>
              <span>{required}% required</span>
              <span>100%</span>
            </div>
          </div>

          <div className="mt-4 text-sm font-medium">
            {safe ? (
              <>You're safe. You can miss <b>{res.bunk}</b> more class{res.bunk === 1 ? "" : "es"} and stay above {required}%.</>
            ) : (
              <>You need to attend <b>{res.needed}</b> more consecutive class{res.needed === 1 ? "" : "es"} to reach {required}%.</>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}