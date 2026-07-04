import { useMemo, useState } from "react";
export default function BmiCalculator() {
  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [ht, setHt] = useState(170);
  const [wt, setWt] = useState(65);
  const bmi = useMemo(() => {
    if (unit === "metric") return wt / Math.pow(ht / 100, 2);
    return (wt / (ht * ht)) * 703;
  }, [unit, ht, wt]);
  const cat = bmi < 18.5 ? { label: "Underweight", color: "text-sky-500" } :
              bmi < 25 ? { label: "Normal", color: "text-emerald-500" } :
              bmi < 30 ? { label: "Overweight", color: "text-amber-500" } :
              { label: "Obese", color: "text-destructive" };
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(["metric", "imperial"] as const).map((u) => (
          <button key={u} onClick={() => setUnit(u)} className={"rounded-lg px-3 py-1.5 text-sm font-medium " + (unit === u ? "bg-primary text-primary-foreground" : "border border-border bg-secondary/50")}>
            {u === "metric" ? "Metric (cm/kg)" : "Imperial (in/lb)"}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="text-xs uppercase text-muted-foreground">Height ({unit === "metric" ? "cm" : "in"})</span>
          <input type="number" value={ht} onChange={(e) => setHt(+e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-lg font-semibold" />
        </label>
        <label className="block"><span className="text-xs uppercase text-muted-foreground">Weight ({unit === "metric" ? "kg" : "lb"})</span>
          <input type="number" value={wt} onChange={(e) => setWt(+e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-lg font-semibold" />
        </label>
      </div>
      <div className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 p-6">
        <div className="text-xs uppercase text-muted-foreground">Your BMI</div>
        <div className="mt-1 flex items-baseline gap-4">
          <span className="font-display text-5xl font-bold">{isFinite(bmi) ? bmi.toFixed(1) : "—"}</span>
          <span className={"text-lg font-semibold " + cat.color}>{cat.label}</span>
        </div>
      </div>
    </div>
  );
}
