import { useMemo, useState } from "react";
import { Percent, ArrowRightLeft } from "lucide-react";

// One-tap percentages so the most common lookups never need typing.
const PERCENT_PRESETS = [5, 10, 15, 18, 20, 25, 50];

export default function PercentageCalculator() {
  const [mode, setMode] = useState<"of" | "isWhat" | "change">("of");
  const [a, setA] = useState("20");
  const [b, setB] = useState("150");

  // Identical formulas and output formatting as before — only the trigger changed from a button click to live input.
  const r = useMemo(() => {
    const x = parseFloat(a) || 0, y = parseFloat(b) || 0;
    if (mode === "of") return ((x / 100) * y).toString();
    else if (mode === "isWhat") return ((x / y) * 100).toFixed(2) + "%";
    else return (((y - x) / x) * 100).toFixed(2) + "%";
  }, [mode, a, b]);

  const swap = () => { setA(b); setB(a); };

  const inputClass =
    "mx-1 inline-block w-24 rounded-lg border-2 border-foreground bg-card px-2 py-1 text-center text-lg font-bold shadow-[2px_2px_0_0_var(--color-foreground)] outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)]";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <Percent className="h-3.5 w-3.5" />
          Percentage
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {[["of", "X% of Y"], ["isWhat", "X is what % of Y"], ["change", "% change from X to Y"]].map(([id, l]) => (
          <button
            key={id}
            onClick={() => setMode(id as any)}
            aria-pressed={mode === id}
            className={
              "rounded-full border-2 border-foreground px-3 py-1.5 text-sm font-bold transition-transform hover:-translate-y-0.5 " +
              (mode === id
                ? "bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
                : "bg-card")
            }
          >
            {l}
          </button>
        ))}
      </div>

      {/* One plain-language sentence with editable numbers in place, so there's nothing to map between labels and fields. */}
      <div className="rounded-2xl border-2 border-foreground bg-card p-6 shadow-[3px_3px_0_0_var(--color-foreground)]">
        <div className="flex flex-wrap items-center gap-1 text-lg font-medium leading-loose">
          {mode === "of" && (
            <>
              <span>What is</span>
              <input value={a} onChange={(e) => setA(e.target.value)} aria-label="Percent value" className={inputClass} />
              <span>% of</span>
              <input value={b} onChange={(e) => setB(e.target.value)} aria-label="Base value" className={inputClass} />
              <span>?</span>
            </>
          )}
          {mode === "isWhat" && (
            <>
              <input value={a} onChange={(e) => setA(e.target.value)} aria-label="X value" className={inputClass} />
              <span>is what percent of</span>
              <input value={b} onChange={(e) => setB(e.target.value)} aria-label="Y value" className={inputClass} />
              <span>?</span>
            </>
          )}
          {mode === "change" && (
            <>
              <span>Percent change from</span>
              <input value={a} onChange={(e) => setA(e.target.value)} aria-label="X value" className={inputClass} />
              <span>to</span>
              <input value={b} onChange={(e) => setB(e.target.value)} aria-label="Y value" className={inputClass} />
              <span>?</span>
            </>
          )}
          <button
            onClick={swap}
            aria-label="Swap the two values"
            className="ml-1 rounded-full border-2 border-foreground bg-card p-1.5 shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:rotate-180"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
          </button>
        </div>

        {mode === "of" && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {PERCENT_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setA(String(p))}
                aria-pressed={a === String(p)}
                className={
                  "rounded-full border-2 border-foreground px-2.5 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 " +
                  (a === String(p) ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]" : "bg-card")
                }
              >
                {p}%
              </button>
            ))}
          </div>
        )}

        {/* Result updates live as soon as either number changes — no separate calculate step. */}
        <div className="mt-5 rounded-2xl border-2 border-foreground bg-gradient-to-br from-violet-500/15 to-indigo-500/15 p-6 shadow-[5px_5px_0_0_var(--color-foreground)]">
          <div className="inline-flex rounded-full border-2 border-foreground bg-card px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
            Result
          </div>
          <div className="mt-3 text-3xl font-bold">{r}</div>
        </div>
      </div>
    </div>
  );
}