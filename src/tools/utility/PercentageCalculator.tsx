import { useState } from "react";
export default function PercentageCalculator() {
  const [mode, setMode] = useState<"of" | "isWhat" | "change">("of");
  const [a, setA] = useState("20");
  const [b, setB] = useState("150");
  const [r, setR] = useState("");
  const compute = () => {
    const x = parseFloat(a) || 0, y = parseFloat(b) || 0;
    if (mode === "of") setR(((x / 100) * y).toString());
    else if (mode === "isWhat") setR(((x / y) * 100).toFixed(2) + "%");
    else setR((((y - x) / x) * 100).toFixed(2) + "%");
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {[["of", "X% of Y"], ["isWhat", "X is what % of Y"], ["change", "% change from X to Y"]].map(([id, l]) => (
          <button key={id} onClick={() => { setMode(id as any); setR(""); }}
            className={"rounded-lg px-3 py-1.5 text-sm font-medium " + (mode === id ? "bg-primary text-primary-foreground" : "border border-border bg-secondary/50 hover:bg-secondary")}>
            {l}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="text-xs uppercase text-muted-foreground">{mode === "of" ? "Percent" : "X"}</span>
          <input value={a} onChange={(e) => setA(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-lg" />
        </label>
        <label className="block"><span className="text-xs uppercase text-muted-foreground">{mode === "of" ? "Of value" : "Y"}</span>
          <input value={b} onChange={(e) => setB(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-lg" />
        </label>
      </div>
      <button onClick={compute} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">Calculate</button>
      {r && (
        <div className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 p-6">
          <div className="text-xs uppercase text-muted-foreground">Result</div>
          <div className="mt-1 font-display text-3xl font-bold">{r}</div>
        </div>
      )}
    </div>
  );
}
