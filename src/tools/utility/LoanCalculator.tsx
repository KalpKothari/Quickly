import { useMemo, useState } from "react";
import { formatINR, formatNumberIN } from "@/lib/format";
import { Landmark, Download, FileDown } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, AreaChart, Area, CartesianGrid, XAxis, YAxis } from "recharts";

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

// One-tap monthly prepayment amounts so testing "what if I pay extra" needs no typing.
const PREPAYMENT_PRESETS = [0, 2000, 5000, 10000, 25000];

const PIE_COLORS = ["var(--color-primary)", "var(--color-secondary)"];

type Row = { month: number; principal: number; interest: number; extra: number; balance: number };

export default function LoanCalculator() {
  const [amount, setAmount] = useState(2500000);
  const [rate, setRate] = useState(8.5);
  const [years, setYears] = useState(20);
  const [extraPayment, setExtraPayment] = useState(0);

  // Same reducing-balance EMI formula as the EMI Calculator — unchanged.
  const r = rate / 12 / 100;
  const n = years * 12;
  const emi = r === 0 ? amount / n : (amount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const total = emi * n;
  const interest = total - amount;

  // Full month-wise schedule, optionally shortened by a recurring prepayment on top of the fixed EMI.
  const fullSchedule = useMemo(() => {
    const rows: Row[] = [];
    let balance = amount;
    let month = 0;
    const safetyCap = n * 2 + 12;
    while (balance > 0.5 && month < safetyCap) {
      month++;
      const interestPortion = balance * r;
      let principalPortion = emi - interestPortion;
      let extra = extraPayment;
      if (principalPortion + extra >= balance) {
        extra = Math.max(0, balance - principalPortion);
        if (principalPortion > balance) principalPortion = balance;
      }
      balance -= principalPortion + extra;
      rows.push({ month, principal: principalPortion, interest: interestPortion, extra, balance: Math.max(0, balance) });
    }
    return rows;
  }, [amount, r, n, emi, extraPayment]);

  const actualMonths = fullSchedule.length;
  const actualInterestPaid = fullSchedule.reduce((s, row) => s + row.interest, 0);
  const monthsSaved = n - actualMonths;
  const interestSaved = interest - actualInterestPaid;

  const pieData = [
    { name: "Principal", value: amount },
    { name: "Interest", value: actualInterestPaid },
  ];

  // Cumulative principal vs interest paid, for the "over time" chart.
  const cumulativeData = useMemo(() => {
    let cumPrincipal = 0;
    let cumInterest = 0;
    return fullSchedule
      .filter((row) => row.month % 6 === 0 || row.month === 1 || row.month === fullSchedule.length)
      .map((row) => {
        // Recompute cumulative totals up to this row's month for accurate sampling.
        const upTo = fullSchedule.slice(0, row.month);
        cumPrincipal = upTo.reduce((s, x) => s + x.principal + x.extra, 0);
        cumInterest = upTo.reduce((s, x) => s + x.interest, 0);
        return { month: row.month, Principal: Math.round(cumPrincipal), Interest: Math.round(cumInterest) };
      });
  }, [fullSchedule]);

  const exportCsv = () => {
    const header = "Month,Principal,Interest,Prepayment,Balance\n";
    const body = fullSchedule
      .map((row) => `${row.month},${row.principal.toFixed(2)},${row.interest.toFixed(2)},${row.extra.toFixed(2)},${row.balance.toFixed(2)}`)
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "amortization-schedule.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    // Uses the browser's native print-to-PDF so no extra dependency is required.
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <Landmark className="h-3.5 w-3.5" />
          Loan Calculator
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

      {/* Optional prepayment — purely additive, doesn't touch the base EMI figures above. */}
      <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
        <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
          Extra monthly prepayment (optional)
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            value={extraPayment}
            onChange={(e) => setExtraPayment(Math.max(0, +e.target.value))}
            aria-label="Extra monthly prepayment in rupees"
            className="w-40 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
          />
          <div className="flex flex-wrap gap-1.5">
            {PREPAYMENT_PRESETS.map((v) => (
              <button
                key={v}
                onClick={() => setExtraPayment(v)}
                aria-pressed={extraPayment === v}
                className={
                  "rounded-full border-2 border-foreground px-2.5 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 " +
                  (extraPayment === v ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]" : "bg-card")
                }
              >
                {v === 0 ? "None" : `+${formatINR(v)}`}
              </button>
            ))}
          </div>
        </div>
        {extraPayment > 0 && (
          <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
            <span>Payoff in <b>{actualMonths}</b> months (was {n})</span>
            <span className="text-primary">Saves {monthsSaved} months</span>
            <span className="text-primary">Saves {formatINR(interestSaved)} in interest</span>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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

        <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
          <div className="inline-flex rounded-full border-2 border-foreground bg-secondary/40 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
            Principal vs interest paid over time
          </div>
          <div className="mt-3 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-foreground)" strokeOpacity={0.15} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} label={{ value: "Month", position: "insideBottom", offset: -3, fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumberIN(v)} width={70} />
                <Tooltip formatter={(v: number) => formatINR(v)} labelFormatter={(m) => `Month ${m}`} />
                <Legend />
                <Area type="monotone" dataKey="Principal" stackId="1" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.4} />
                <Area type="monotone" dataKey="Interest" stackId="1" stroke="var(--color-secondary)" fill="var(--color-secondary)" fillOpacity={0.4} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Full month-wise amortization table with running balance — the core differentiator of this tool. */}
      <div className="rounded-2xl border-2 border-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-2xl bg-card px-4 py-3">
          <span className="text-sm font-bold">Month-wise amortization schedule</span>
          <div className="flex gap-2">
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
            <button
              onClick={exportPdf}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
            >
              <FileDown className="h-3.5 w-3.5" />
              PDF
            </button>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto border-t-2 border-foreground">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-secondary/40 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
              <tr>
                <th className="px-3 py-2 text-left">Month</th>
                <th className="px-3 py-2 text-right">Principal</th>
                <th className="px-3 py-2 text-right">Interest</th>
                {extraPayment > 0 && <th className="px-3 py-2 text-right">Prepayment</th>}
                <th className="px-3 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {fullSchedule.map((row) => (
                <tr key={row.month} className="border-t-2 border-foreground/20 bg-card">
                  <td className="px-3 py-2 font-semibold">{row.month}</td>
                  <td className="px-3 py-2 text-right">{formatINR(row.principal)}</td>
                  <td className="px-3 py-2 text-right">{formatINR(row.interest)}</td>
                  {extraPayment > 0 && <td className="px-3 py-2 text-right">{formatINR(row.extra)}</td>}
                  <td className="px-3 py-2 text-right">{formatINR(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="rounded-lg border-2 border-dashed border-foreground/30 px-3 py-2 text-xs font-medium text-muted-foreground">
        Follows the standard Indian reducing-balance EMI formula. Values shown in Indian numbering (Lakhs / Crores). {formatNumberIN(amount)}
      </p>
    </div>
  );
}