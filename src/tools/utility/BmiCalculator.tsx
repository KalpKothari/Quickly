import { useMemo, useState } from "react";
import { HeartPulse } from "lucide-react";

// Same category thresholds as before, reused to build the visual scale.
const SCALE_MIN = 12;
const SCALE_MAX = 40;
const BANDS = [
  { upTo: 18.5, color: "bg-sky-500", label: "Underweight" },
  { upTo: 25, color: "bg-emerald-500", label: "Normal" },
  { upTo: 30, color: "bg-amber-500", label: "Overweight" },
  { upTo: SCALE_MAX, color: "bg-destructive", label: "Obese" },
];

export default function BmiCalculator() {
  // Independent unit selections
  const [heightUnit, setHeightUnit] = useState<"cm" | "ft-in">("cm");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lbs">("kg");

  // State maintained underneath in baseline metrics (cm and kg) for calculation precision
  const [heightCm, setHeightCm] = useState(170);
  const [weightKg, setWeightKg] = useState(65);

  // Derived structural foot/inch state values
  const ftInValues = useMemo(() => {
    const totalInches = heightCm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return { feet, inches };
  }, [heightCm]);

  // Handle unit conversions on the fly to keep input values synchronized
  const handleHeightUnitChange = (targetUnit: "cm" | "ft-in") => {
    setHeightUnit(targetUnit);
  };

  const handleWeightUnitChange = (targetUnit: "kg" | "lbs") => {
    setWeightUnit(targetUnit);
  };

  // Safe range parameters for sliders
  const heightSliderVal = Math.min(220, Math.max(90, heightCm));
  const weightSliderVal = Math.min(200, Math.max(20, weightKg));

  // Identical base formula calculation updated dynamically
  const bmi = useMemo(() => {
    if (heightCm <= 0) return 0;
    return weightKg / Math.pow(heightCm / 100, 2);
  }, [heightCm, weightKg]);

  // Identical category thresholds as before.
  const cat = bmi < 18.5 ? { label: "Underweight", color: "text-sky-500" } :
              bmi < 25 ? { label: "Normal", color: "text-emerald-500" } :
              bmi < 30 ? { label: "Overweight", color: "text-amber-500" } :
              { label: "Obese", color: "text-destructive" };

  const markerPct = isFinite(bmi)
    ? Math.min(100, Math.max(0, ((bmi - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100))
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <HeartPulse className="h-3.5 w-3.5" />
          BMI Calculator
        </span>
      </div>

      {/* Result Card Component */}
      <div className="rounded-2xl border-2 border-foreground bg-gradient-to-br from-violet-500/15 to-indigo-500/15 p-6 shadow-[5px_5px_0_0_var(--color-foreground)]">
        <div className="inline-flex rounded-full border-2 border-foreground bg-card px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
          Your BMI
        </div>
        <div className="mt-3 flex items-baseline gap-4">
          <span className="text-5xl font-bold">{isFinite(bmi) && bmi > 0 ? bmi.toFixed(1) : "—"}</span>
          <span className={"text-lg font-bold " + cat.color}>{cat.label}</span>
        </div>

        <div className="mt-5">
          <div className="relative h-3 w-full overflow-hidden rounded-full border-2 border-foreground">
            <div className="flex h-full w-full">
              {BANDS.map((band, i) => {
                const prevUpTo = i === 0 ? SCALE_MIN : BANDS[i - 1].upTo;
                const widthPct = ((band.upTo - prevUpTo) / (SCALE_MAX - SCALE_MIN)) * 100;
                return <div key={band.label} className={band.color} style={{ width: `${widthPct}%` }} />;
              })}
            </div>
            {isFinite(bmi) && bmi > 0 && (
              <div
                className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-card shadow-[1px_1px_0_0_var(--color-foreground)]"
                style={{ left: `${markerPct}%` }}
                aria-hidden="true"
              />
            )}
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-1 text-[11px] font-bold uppercase tracking-wide text-foreground/60">
            {BANDS.map((band) => (
              <span key={band.label}>{band.label}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive Controls Grid */}
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Height Input Control Block */}
        <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)] space-y-3">
          <div className="flex justify-between items-center">
            <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
              Height Setup
            </span>
            <div className="flex border-2 border-foreground rounded-full overflow-hidden bg-background text-xs font-bold">
              <button
                type="button"
                onClick={() => handleHeightUnitChange("cm")}
                className={`px-2.5 py-1 transition-colors ${heightUnit === "cm" ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
              >
                cm
              </button>
              <button
                type="button"
                onClick={() => handleHeightUnitChange("ft-in")}
                className={`px-2.5 py-1 border-l-2 border-foreground transition-colors ${heightUnit === "ft-in" ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
              >
                ft/in
              </button>
            </div>
          </div>

          {heightUnit === "cm" ? (
            <input
              type="number"
              value={Math.round(heightCm)}
              onChange={(e) => setHeightCm(Number(e.target.value))}
              className="w-full rounded-xl border-2 border-foreground bg-background px-3 py-2 text-lg font-semibold outline-none focus:border-primary"
            />
          ) : (
            <div className="flex gap-2">
              <div className="flex-1">
                <span className="text-[10px] font-bold uppercase text-foreground/50 block mb-0.5">Ft</span>
                <input
                  type="number"
                  value={ftInValues.feet}
                  onChange={(e) => {
                    const f = Number(e.target.value);
                    const newCm = (f * 12 + ftInValues.inches) * 2.54;
                    setHeightCm(newCm);
                  }}
                  className="w-full rounded-xl border-2 border-foreground bg-background px-3 py-2 text-lg font-semibold outline-none focus:border-primary"
                />
              </div>
              <div className="flex-1">
                <span className="text-[10px] font-bold uppercase text-foreground/50 block mb-0.5">In</span>
                <input
                  type="number"
                  value={ftInValues.inches}
                  onChange={(e) => {
                    const inc = Number(e.target.value);
                    const newCm = (ftInValues.feet * 12 + inc) * 2.54;
                    setHeightCm(newCm);
                  }}
                  className="w-full rounded-xl border-2 border-foreground bg-background px-3 py-2 text-lg font-semibold outline-none focus:border-primary"
                />
              </div>
            </div>
          )}

          <input
            type="range"
            min="90"
            max="220"
            value={Math.round(heightSliderVal)}
            onChange={(e) => setHeightCm(Number(e.target.value))}
            className="w-full accent-primary mt-2"
          />
        </div>

        {/* Weight Input Control Block */}
        <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)] space-y-3">
          <div className="flex justify-between items-center">
            <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
              Weight Setup
            </span>
            <div className="flex border-2 border-foreground rounded-full overflow-hidden bg-background text-xs font-bold">
              <button
                type="button"
                onClick={() => handleWeightUnitChange("kg")}
                className={`px-2.5 py-1 transition-colors ${weightUnit === "kg" ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
              >
                kg
              </button>
              <button
                type="button"
                onClick={() => handleWeightUnitChange("lbs")}
                className={`px-2.5 py-1 border-l-2 border-foreground transition-colors ${weightUnit === "lbs" ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
              >
                lbs
              </button>
            </div>
          </div>

          <input
            type="number"
            value={weightUnit === "kg" ? Math.round(weightKg) : Math.round(weightKg * 2.20462)}
            onChange={(e) => {
              const val = Number(e.target.value);
              setWeightKg(weightUnit === "kg" ? val : val / 2.20462);
            }}
            className="w-full rounded-xl border-2 border-foreground bg-background px-3 py-2 text-lg font-semibold outline-none focus:border-primary"
          />

          <input
            type="range"
            min="20"
            max="200"
            value={Math.round(weightSliderVal)}
            onChange={(e) => setWeightKg(Number(e.target.value))}
            className="w-full accent-primary mt-2"
          />
        </div>
      </div>
    </div>
  );
}