import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Ruler,
  Scale,
  Droplet,
  Square,
  Clock,
  Gauge,
  Thermometer,
} from "lucide-react";

// Values are the multiplier from the unit to the category's base unit.
const UNITS = {
  Length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254 },
  Weight: { g: 1, kg: 1000, mg: 0.001, ton: 1_000_000, lb: 453.592, oz: 28.3495 },
  Volume: { L: 1, mL: 0.001, gal: 3.78541, cup: 0.24, floz: 0.0295735, "m³": 1000 },
  Area: { "m²": 1, "km²": 1_000_000, "cm²": 0.0001, "ft²": 0.092903, acre: 4046.86, hectare: 10000 },
  Time: { s: 1, min: 60, h: 3600, day: 86400, wk: 604800 },
  Speed: { "m/s": 1, "km/h": 0.277778, mph: 0.44704, knot: 0.514444 },
};

const CATS = [...Object.keys(UNITS), "Temperature"];
const TEMP_UNITS = ["C", "F", "K"];

const CAT_ICON = {
  Length: Ruler,
  Weight: Scale,
  Volume: Droplet,
  Area: Square,
  Time: Clock,
  Speed: Gauge,
  Temperature: Thermometer,
};

// A handful of quick-entry values per category so a common conversion is one tap away.
const PRESETS = {
  Length: [1, 5, 100],
  Weight: [1, 5, 100],
  Volume: [1, 2, 10],
  Area: [1, 100, 1000],
  Time: [1, 30, 60],
  Speed: [10, 60, 100],
  Temperature: [0, 37, 100],
};

export default function UnitConverter() {
  const [cat, setCat] = useState("Length");
  const units = cat === "Temperature" ? TEMP_UNITS : Object.keys(UNITS[cat]);

  const [from, setFrom] = useState(units[0]);
  const [to, setTo] = useState(units[1] ?? units[0]);
  const [val, setVal] = useState("1");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  // When category changes, reset selects to valid units in this category.
  useEffect(() => {
    const nextUnits = cat === "Temperature" ? TEMP_UNITS : Object.keys(UNITS[cat]);
    setFrom(nextUnits[0]);
    setTo(nextUnits[1] ?? nextUnits[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  // Same conversion algorithm as before — now runs automatically, no button needed.
  useEffect(() => {
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
    let out;
    if (cat === "Temperature") {
      let c = v;
      if (from === "F") c = (v - 32) * (5 / 9);
      else if (from === "K") c = v - 273.15;
      if (to === "C") out = c;
      else if (to === "F") out = c * (9 / 5) + 32;
      else out = c + 273.15;
    } else {
      const table = UNITS[cat];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [val, from, to, cat]);

  const presets = useMemo(() => PRESETS[cat] ?? [1, 10, 100], [cat]);

  return (
    <div className="space-y-6">
      {/* Category picker — icons let you scan by shape, not just read text */}
      <div className="flex flex-wrap gap-2">
        {CATS.map((c) => {
          const Icon = CAT_ICON[c];
          const active = cat === c;
          return (
            <button
              key={c}
              onClick={() => setCat(c)}
              aria-pressed={active}
              className={
                "inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1.5 text-sm font-bold transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
                (active
                  ? "bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
                  : "bg-card")
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {c}
            </button>
          );
        })}
      </div>

      {/* Live converter — typing or picking a unit updates the result immediately */}
      <div className="grid items-start gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <label className="block">
          <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            From
          </span>
          <div className="mt-2 flex gap-2">
            <input
              value={val}
              onChange={(e) => setVal(e.target.value)}
              inputMode="decimal"
              aria-label={`Value in ${from}`}
              className="w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-lg font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
            />
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Convert from unit"
              className="rounded-xl border-2 border-foreground bg-card px-3 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)]"
            >
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          {/* One-tap presets so a common value never needs manual typing */}
          <div className="mt-2 flex gap-1.5">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => setVal(String(p))}
                className="rounded-full border border-foreground/30 bg-transparent px-2 py-0.5 text-xs font-semibold text-foreground/70 transition-colors hover:border-primary hover:text-primary"
              >
                {p}
              </button>
            ))}
          </div>
        </label>

        <button
          onClick={swap}
          aria-label="Swap units"
          className="mt-1 self-center rounded-full border-2 border-foreground bg-card p-3 shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:rotate-180 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:mt-8"
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
              aria-label={`Result in ${to}`}
              className="w-full rounded-xl border-2 border-foreground bg-secondary/40 px-3 py-2.5 text-lg font-bold shadow-[3px_3px_0_0_var(--color-foreground)]"
            />
            <select
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Convert to unit"
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