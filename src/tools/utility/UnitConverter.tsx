import { useEffect, useState } from "react";
import { ArrowRightLeft } from "lucide-react";

// Values are the multiplier from the unit to the category's base unit.
const UNITS = {
  Length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254 },
  Weight: { g: 1, kg: 1000, mg: 0.001, ton: 1_000_000, lb: 453.592, oz: 28.3495 },
  Volume: { L: 1, mL: 0.001, gal: 3.78541, cup: 0.24, floz: 0.0295735, "m³": 1000 },
  Area: { "m²": 1, "km²": 1_000_000, "cm²": 0.0001, "ft²": 0.092903, acre: 4046.86, hectare: 10000 },
  Time: { s: 1, min: 60, h: 3600, day: 86400, wk: 604800 },
  Speed: { "m/s": 1, "km/h": 0.277778, mph: 0.44704, knot: 0.514444 },
} as const;

type Cat = keyof typeof UNITS | "Temperature";
const CATS: Cat[] = [...(Object.keys(UNITS) as (keyof typeof UNITS)[]), "Temperature"];
const TEMP_UNITS = ["C", "F", "K"] as const;

export default function UnitConverter() {
  const [cat, setCat] = useState<Cat>("Length");
  const units: string[] =
    cat === "Temperature" ? [...TEMP_UNITS] : Object.keys(UNITS[cat]);

  const [from, setFrom] = useState(units[0]);
  const [to, setTo] = useState(units[1] ?? units[0]);
  const [val, setVal] = useState("1");
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");

  // When category changes, reset selects to valid units in this category.
  useEffect(() => {
    setFrom(units[0]);
    setTo(units[1] ?? units[0]);
    setResult("");
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  const swap = () => {
    setFrom(to);
    setTo(from);
    setResult("");
  };

  const convert = () => {
    setError("");
    if (val.trim() === "") {
      setError("Enter a value to convert.");
      setResult("");
      return;
    }
    const v = Number(val);
    if (!isFinite(v)) {
      setError("Enter a valid number.");
      setResult("");
      return;
    }
    if (from === to) {
      setResult(v.toString());
      return;
    }
    let out: number;
    if (cat === "Temperature") {
      let c = v;
      if (from === "F") c = (v - 32) * (5 / 9);
      else if (from === "K") c = v - 273.15;
      if (to === "C") out = c;
      else if (to === "F") out = c * (9 / 5) + 32;
      else out = c + 273.15;
    } else {
      const table = UNITS[cat] as Record<string, number>;
      const f = table[from];
      const t = table[to];
      if (!f || !t) {
        setError("Invalid unit selection.");
        setResult("");
        return;
      }
      out = (v * f) / t;
    }
    setResult(
      Number(out.toPrecision(10)).toLocaleString("en-IN", { maximumFractionDigits: 6 }),
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={
              "rounded-full border-2 border-foreground px-3 py-1.5 text-sm font-bold transition-transform hover:-translate-y-0.5 " +
              (cat === c
                ? "bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
                : "bg-card")
            }
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <label className="block">
          <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            From
          </span>
          <div className="mt-2 flex gap-2">
            <input
              value={val}
              onChange={(e) => setVal(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-lg font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
            />
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-xl border-2 border-foreground bg-card px-3 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)]"
            >
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </label>
        <button
          onClick={swap}
          className="mb-1 rounded-full border-2 border-foreground bg-card p-3 shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:rotate-180"
          aria-label="Swap units"
        >
          <ArrowRightLeft className="h-4 w-4" />
        </button>
        <label className="block">
          <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            To
          </span>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={result}
              placeholder="Result"
              className="w-full rounded-xl border-2 border-foreground bg-secondary/40 px-3 py-2.5 text-lg font-bold shadow-[3px_3px_0_0_var(--color-foreground)]"
            />
            <select
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-xl border-2 border-foreground bg-card px-3 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)]"
            >
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>

      <button
        onClick={convert}
        className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)]"
      >
        Convert
      </button>

      {error && (
        <p className="rounded-lg border-2 border-dashed border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      {result && !error && (
        <div className="rounded-2xl border-2 border-foreground bg-gradient-to-br from-violet-500/15 to-indigo-500/15 p-4 text-sm font-medium shadow-[5px_5px_0_0_var(--color-foreground)]">
          <b>{val}</b> {from} = <b>{result}</b> {to}
        </div>
      )}
    </div>
  );
}