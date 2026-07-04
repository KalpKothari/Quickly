import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, Check } from "lucide-react";
function gen(len: number, upper: boolean, lower: boolean, nums: boolean, syms: boolean) {
  let pool = "";
  if (upper) pool += "ABCDEFGHJKLMNPQRSTUVWXYZ";
  if (lower) pool += "abcdefghijkmnpqrstuvwxyz";
  if (nums) pool += "23456789";
  if (syms) pool += "!@#$%^&*()-_=+[]{}<>?";
  if (!pool) return "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (x) => pool[x % pool.length]).join("");
}
function strength(p: string) {
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (p.length >= 16) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  return score;
}

const LENGTH_PRESETS = [8, 12, 16, 24, 32];

export default function PasswordGenerator() {
  const [len, setLen] = useState(16);
  const [upper, setUpper] = useState(true);
  const [lower, setLower] = useState(true);
  const [nums, setNums] = useState(true);
  const [syms, setSyms] = useState(true);
  const [pw, setPw] = useState("");
  const [copied, setCopied] = useState(false);
  const regen = useCallback(() => setPw(gen(len, upper, lower, nums, syms)), [len, upper, lower, nums, syms]);
  useEffect(() => { regen(); }, [regen]);
  const s = strength(pw);
  const label = ["Very weak", "Weak", "Fair", "Good", "Strong", "Excellent", "Fortress"][s];
  const barColor = ["bg-destructive", "bg-destructive", "bg-orange-500", "bg-yellow-500", "bg-green-500", "bg-emerald-500", "bg-emerald-600"][s];

  const applyPreset = (u: boolean, l: boolean, n: boolean, sy: boolean) => {
    setUpper(u);
    setLower(l);
    setNums(n);
    setSyms(sy);
  };

  const TYPES: [string, string, boolean, (b: boolean) => void][] = [
    ["Uppercase", "AZ", upper, setUpper],
    ["Lowercase", "az", lower, setLower],
    ["Numbers", "19", nums, setNums],
    ["Symbols", "#$%", syms, setSyms],
  ];

  return (
    <div className="space-y-6">
      {/* result — front and center */}
      <div className="flex items-center gap-2 rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
        <code className="flex-1 truncate font-mono text-lg font-medium">{pw || "Choose at least one option"}</code>
        <button
          onClick={regen}
          className="rounded-full border-2 border-foreground bg-background p-2 transition-transform hover:-translate-y-0.5"
          aria-label="Regenerate"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <button
          onClick={() => { if (!pw) return; navigator.clipboard.writeText(pw); setCopied(true); toast.success("Password copied"); setTimeout(() => setCopied(false), 1500); }}
          className="rounded-full border-2 border-foreground bg-primary p-2 text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
          aria-label="Copy"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-foreground bg-secondary">
          <div className={"h-full rounded-full transition-all " + barColor} style={{ width: `${(s / 6) * 100}%` }} />
        </div>
        <span className="rounded-full border-2 border-foreground bg-card px-3 py-1 text-sm font-bold">{label}</span>
      </div>

      {/* quick presets */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => applyPreset(true, true, true, true)}
          className="rounded-full border-2 border-foreground bg-primary/15 px-3 py-1.5 text-xs font-bold text-primary transition-transform hover:-translate-y-0.5"
        >
          Strong (all types)
        </button>
        <button
          onClick={() => applyPreset(true, true, true, false)}
          className="rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold transition-transform hover:-translate-y-0.5"
        >
          Easy to type (no symbols)
        </button>
        <button
          onClick={() => applyPreset(false, false, true, false)}
          className="rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold transition-transform hover:-translate-y-0.5"
        >
          PIN (numbers only)
        </button>
      </div>

      <div className="space-y-5 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
        {/* length */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold">
              Length: <span className="text-primary">{len}</span>
            </span>
          </div>
          <input type="range" min={6} max={64} value={len} onChange={(e) => setLen(+e.target.value)} className="w-full accent-primary" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {LENGTH_PRESETS.map((n) => (
              <button
                key={n}
                onClick={() => setLen(n)}
                className={`rounded-full border-2 border-foreground px-2.5 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 ${
                  len === n ? "bg-primary text-primary-foreground" : "bg-background"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* character types as tappable chips */}
        <div>
          <span className="text-sm font-bold">Include</span>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TYPES.map(([name, sample, val, set]) => (
              <button
                key={name}
                onClick={() => set(!val)}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 border-foreground p-3 text-center transition-all ${
                  val
                    ? "bg-primary/15 shadow-[3px_3px_0_0_var(--color-foreground)]"
                    : "bg-background opacity-60 hover:opacity-100"
                }`}
              >
                <span className="font-mono text-base font-bold">{sample}</span>
                <span className="text-[11px] font-bold">{name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}