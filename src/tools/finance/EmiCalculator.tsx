import { useState } from "react";
import { formatINR } from "@/lib/format";
import { Landmark } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

// One-tap amounts so a common loan size never needs manual typing.
const AMOUNT_PRESETS: [string, number][] = [
  ["5L", 500000],
  ["10L", 1000000],
  ["25L", 2500000],
  ["50L", 5000000],
  ["1Cr", 10000000],
];

// One-tap rates covering the common range of home/personal loan offers.
const RATE_PRESETS = [7, 7.5, 8, 8.5, 9, 9.5, 10];

// One-tap tenures covering the common range of loan durations.
const TENURE_PRESETS = [5, 10, 15, 20, 25, 30];

const PIE_COLORS = ["var(--color-primary)", "var(--color-secondary)"];

export default function EmiCalculator() {
  const [amount, setAmount] = useState(2500000);
  const [rate, setRate] = useState(8.5);
  const [years, setYears] = useState(20);

  // Same reducing-balance EMI formula as before — unchanged.
  const r = rate / 12 / 100;
  const n = years * 12;
  const emi = r === 0 ? amount / n : (amount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const total = emi * n;
  const interest = total - amount;

  const pieData = [
    { name: "Principal", value: amount },
    { name: "Interest", value: interest },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <Landmark className="h-3.5 w-3.5" />
          EMI Calculator
        </span>
      </div>

      {/* Result surfaced first so the answer updates live right above the controls that change it. */}
      <div className="grid gap-4 rounded-2xl border-2 border-foreground bg-gradient-to-br from-violet-500/15 to-indigo-500/15 p-6 shadow-[5px_5px_0_0_var(--color-foreground)] sm:grid-cols-3">
        <div>
          <div className="inline-flex rounded-full border-2 border-foreground bg-card px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
            Monthly EMI
          </div>
          <div className="mt-2 text-2xl font-bold">{formatINR(emi)}</div>
        </div>
        <div>
          <div className="inline-flex rounded-full border-2 border-foreground bg-card px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
            Total interest
          </div>
          <div className="mt-2 text-2xl font-bold">{formatINR(interest)}</div>
        </div>
        <div>
          <div className="inline-flex rounded-full border-2 border-foreground bg-card px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
            Total payment
          </div>
          <div className="mt-2 text-2xl font-bold">{formatINR(total)}</div>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <label className="block">
          <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            Loan amount
          </span>
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(+e.target.value)}
            aria-label="Loan amount in rupees"
            className="mt-2 w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-lg font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
          />
          <div className="mt-1.5 text-xs font-semibold text-muted-foreground">{formatINR(amount)}</div>
          <input
            type="range"
            min={10000}
            max={20000000}
            step={10000}
            value={amount}
            onChange={(e) => setAmount(+e.target.value)}
            aria-label="Loan amount slider"
            className="mt-3 w-full accent-primary"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {AMOUNT_PRESETS.map(([label, v]) => (
              <button
                key={label}
                onClick={() => setAmount(v)}
                aria-pressed={amount === v}
                className={
                  "rounded-full border-2 border-foreground px-2.5 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 " +
                  (amount === v ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]" : "bg-card")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </label>

        <label className="block">
          <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            Interest rate (% p.a.)
          </span>
          <input
            type="number"
            min={0}
            max={30}
            step={0.1}
            value={rate}
            onChange={(e) => setRate(+e.target.value)}
            aria-label="Interest rate percent per annum"
            className="mt-2 w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-lg font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
          />
          <div className="mt-1.5 text-xs font-semibold text-muted-foreground">&nbsp;</div>
          <input
            type="range"
            min={1}
            max={20}
            step={0.05}
            value={rate}
            onChange={(e) => setRate(+e.target.value)}
            aria-label="Interest rate slider"
            className="mt-3 w-full accent-primary"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {RATE_PRESETS.map((v) => (
              <button
                key={v}
                onClick={() => setRate(v)}
                aria-pressed={rate === v}
                className={
                  "rounded-full border-2 border-foreground px-2.5 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 " +
                  (rate === v ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]" : "bg-card")
                }
              >
                {v}%
              </button>
            ))}
          </div>
        </label>

        <label className="block">
          <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            Tenure (years)
          </span>
          <input
            type="number"
            min={1}
            max={40}
            value={years}
            onChange={(e) => setYears(+e.target.value)}
            aria-label="Loan tenure in years"
            className="mt-2 w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-lg font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
          />
          <div className="mt-1.5 text-xs font-semibold text-muted-foreground">&nbsp;</div>
          <input
            type="range"
            min={1}
            max={30}
            value={years}
            onChange={(e) => setYears(+e.target.value)}
            aria-label="Loan tenure slider"
            className="mt-3 w-full accent-primary"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TENURE_PRESETS.map((v) => (
              <button
                key={v}
                onClick={() => setYears(v)}
                aria-pressed={years === v}
                className={
                  "rounded-full border-2 border-foreground px-2.5 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 " +
                  (years === v ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]" : "bg-card")
                }
              >
                {v}y
              </button>
            ))}
          </div>
        </label>
      </div>

      <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
        <div className="inline-flex rounded-full border-2 border-foreground bg-secondary/40 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
          Principal vs interest
        </div>
        <div className="mt-3 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="var(--color-foreground)" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatINR(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="rounded-lg border-2 border-dashed border-foreground/30 px-3 py-2 text-xs font-medium text-muted-foreground">
        Follows the standard Indian reducing-balance EMI formula. Need the month-wise schedule, outstanding balance, or prepayment options? Use the Loan Calculator for the full breakdown.
      </p>
    </div>
  );
}