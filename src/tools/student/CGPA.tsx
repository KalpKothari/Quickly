import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

interface Semester {
  sem: number;
  sgpa: string;
  credits: string;
}

const DEFAULTS: Semester[] = [
  { sem: 1, sgpa: "8.5", credits: "24" },
  { sem: 2, sgpa: "9.0", credits: "24" },
];

const SWATCHES = ["var(--color-primary)", "#d946ef", "#f97316"];

export default function CGPA() {
  const [rows, setRows] = useState<Semester[]>(DEFAULTS);

  const parsed = rows.map((r) => ({
    sem: r.sem,
    sgpa: parseFloat(r.sgpa),
    credits: parseFloat(r.credits),
    validSgpa: r.sgpa !== "" && !isNaN(parseFloat(r.sgpa)) && parseFloat(r.sgpa) >= 0 && parseFloat(r.sgpa) <= 10,
    validCredits: r.credits !== "" && !isNaN(parseFloat(r.credits)) && parseFloat(r.credits) > 0,
  }));

  const anyInvalid = parsed.some((r) => !r.validSgpa || !r.validCredits);

  const totals = useMemo(() => {
    const valid = parsed.filter((r) => r.validSgpa && r.validCredits);
    const totalCredits = valid.reduce((s, r) => s + r.credits, 0);
    const totalPoints = valid.reduce((s, r) => s + r.sgpa * r.credits, 0);
    const cgpa = totalCredits > 0 ? totalPoints / totalCredits : 0;
    return { totalCredits, totalPoints, cgpa };
  }, [parsed]);

  const upd = (i: number, patch: Partial<Semester>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const addSem = () =>
    setRows((rs) => {
      // carry over the previous semester's credit load — most students take the same
      // credit count each term, so this saves re-typing it every time.
      const last = rs[rs.length - 1];
      const prefillCredits = last && last.credits !== "" && !isNaN(parseFloat(last.credits)) ? last.credits : "";
      return [...rs, { sem: rs.length + 1, sgpa: "", credits: prefillCredits }];
    });

  const removeSem = (i: number) =>
    setRows((rs) => rs.filter((_, j) => j !== i).map((r, k) => ({ ...r, sem: k + 1 })));

  return (
    <div className="space-y-6">
      {/* STEP 1 — enter semesters */}
      <div>
        <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">1</span>
          Enter each semester's SGPA and credits
        </p>

        <div className="space-y-3">
          <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground sm:grid">
            <div className="col-span-3">Semester</div>
            <div className="col-span-3">SGPA (0 – 10)</div>
            <div className="col-span-3">Credits</div>
            <div className="col-span-2">Contributes</div>
            <div className="col-span-1" />
          </div>
          {rows.map((r, i) => {
            const p = parsed[i];
            const contribution = p.validSgpa && p.validCredits ? p.sgpa * p.credits : null;
            return (
              <div
                key={i}
                className="grid grid-cols-12 items-center gap-2 rounded-xl border-2 border-foreground bg-card p-2 shadow-[3px_3px_0_0_var(--color-foreground)]"
              >
                <div
                  className="col-span-3 rounded-lg border-2 border-foreground px-3 py-2 text-sm font-bold"
                  style={{ backgroundColor: `color-mix(in oklab, ${SWATCHES[i % SWATCHES.length]} 20%, transparent)`, color: SWATCHES[i % SWATCHES.length] }}
                >
                  Sem {r.sem}
                </div>
                <input
                  type="number" min={0} max={10} step={0.01} inputMode="decimal"
                  value={r.sgpa}
                  onChange={(e) => upd(i, { sgpa: e.target.value })}
                  placeholder="e.g. 8.5"
                  className={
                    "col-span-3 rounded-lg border-2 bg-background px-3 py-2 text-sm font-medium outline-none " +
                    (r.sgpa !== "" && !p.validSgpa ? "border-destructive" : "border-foreground focus:shadow-[3px_3px_0_0_var(--color-primary)]")
                  }
                />
                <input
                  type="number" min={0} step={0.5} inputMode="decimal"
                  value={r.credits}
                  onChange={(e) => upd(i, { credits: e.target.value })}
                  placeholder="e.g. 24"
                  className={
                    "col-span-3 rounded-lg border-2 bg-background px-3 py-2 text-sm font-medium outline-none " +
                    (r.credits !== "" && !p.validCredits ? "border-destructive" : "border-foreground focus:shadow-[3px_3px_0_0_var(--color-primary)]")
                  }
                />
                <div className="col-span-2 text-xs font-bold text-muted-foreground">
                  {contribution !== null ? `${contribution.toFixed(2)} pts` : "—"}
                </div>
                <button
                  onClick={() => removeSem(i)}
                  disabled={rows.length <= 1}
                  className="col-span-1 flex items-center justify-center rounded-full border-2 border-foreground bg-background p-1.5 text-muted-foreground transition-transform hover:-translate-y-0.5 hover:bg-destructive/15 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Remove semester"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={addSem}
          className="mt-3 inline-flex items-center gap-2 rounded-full border-2 border-dashed border-foreground/50 bg-card px-4 py-2 text-sm font-bold transition-all hover:-translate-y-0.5 hover:border-foreground hover:shadow-[3px_3px_0_0_var(--color-foreground)]"
        >
          <Plus className="h-4 w-4" /> Add semester
        </button>

        {anyInvalid && (
          <p className="mt-3 rounded-lg border-2 border-dashed border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
            Enter a valid SGPA (0–10) and credits (&gt; 0) for every semester to get an accurate CGPA.
          </p>
        )}
      </div>

      {/* STEP 2 — result */}
      <div>
        <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">2</span>
          Your CGPA
        </p>

        {/* credit-weight visualization */}
        {totals.totalCredits > 0 && (
          <div className="mb-4">
            <div className="flex h-4 w-full overflow-hidden rounded-full border-2 border-foreground">
              {parsed.map((p, i) =>
                p.validSgpa && p.validCredits ? (
                  <div
                    key={i}
                    style={{
                      width: `${(p.credits / totals.totalCredits) * 100}%`,
                      backgroundColor: SWATCHES[i % SWATCHES.length],
                    }}
                    title={`Sem ${p.sem}: ${p.credits} credits`}
                  />
                ) : null,
              )}
            </div>
            <p className="mt-1 text-[11px] font-medium text-muted-foreground">
              How much each semester weighs toward your CGPA, by credits
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 rounded-2xl border-2 border-foreground bg-gradient-to-br from-emerald-500/15 to-teal-500/15 p-6 shadow-[6px_6px_0_0_var(--color-foreground)] sm:grid-cols-3">
          <div>
            <div className="inline-flex rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Total credits
            </div>
            <div className="mt-2 font-display text-3xl font-extrabold">{totals.totalCredits}</div>
          </div>
          <div>
            <div className="inline-flex rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Total credit points
            </div>
            <div className="mt-2 font-display text-3xl font-extrabold">{totals.totalPoints.toFixed(2)}</div>
          </div>
          <div>
            <div className="inline-flex rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              CGPA
            </div>
            <div className="mt-2 font-display text-3xl font-extrabold">{totals.cgpa.toFixed(2)}</div>
          </div>
        </div>

        <p className="mt-4 rounded-lg border-2 border-dashed border-foreground/30 bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          CGPA is calculated using the standard Indian university formula:{" "}
          <code className="rounded border-2 border-foreground bg-card px-1 py-0.5">Σ (SGPA × Credits) / Σ Credits</code>. Approximate percentage ≈ CGPA × 9.5 (VTU/AICTE convention):{" "}
          <b>{(totals.cgpa * 9.5).toFixed(2)}%</b>.
        </p>
      </div>
    </div>
  );
}