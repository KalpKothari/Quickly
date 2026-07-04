import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

const SWATCHES = ["var(--color-primary)", "#d946ef", "#f97316"];

function gradeFor(pct: number) {
  return pct >= 90 ? "O" : pct >= 80 ? "A+" : pct >= 70 ? "A" : pct >= 60 ? "B+" : pct >= 50 ? "B" : pct >= 40 ? "C" : "F";
}

export default function MarksPercentage() {
  const [rows, setRows] = useState([
    { name: "Subject 1", scored: 85, out: 100 },
    { name: "Subject 2", scored: 76, out: 100 },
    { name: "Subject 3", scored: 92, out: 100 },
  ]);
  const totals = useMemo(() => {
    const scored = rows.reduce((s, r) => s + (r.scored || 0), 0);
    const out = rows.reduce((s, r) => s + (r.out || 0), 0);
    return { scored, out, pct: out ? (scored / out) * 100 : 0 };
  }, [rows]);
  const grade = gradeFor(totals.pct);

  const addRow = () =>
    setRows((rs) => {
      // most mark sheets use the same "out of" for every subject — carry it forward
      // so you're not re-typing "100" every time.
      const last = rs[rs.length - 1];
      return [...rs, { name: `Subject ${rs.length + 1}`, scored: 0, out: last ? last.out : 100 }];
    });

  return (
    <div className="space-y-6">
      {/* STEP 1 — enter subjects */}
      <div>
        <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">1</span>
          Enter each subject's marks
        </p>

        <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground sm:grid">
          <div className="col-span-5">Subject</div>
          <div className="col-span-2">Scored</div>
          <div className="col-span-2">Out of</div>
          <div className="col-span-2">Grade</div>
          <div className="col-span-1" />
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => {
            const rowPct = r.out ? (r.scored / r.out) * 100 : 0;
            const rowGrade = gradeFor(rowPct);
            return (
              <div
                key={i}
                className="grid grid-cols-12 items-center gap-2 rounded-xl border-2 border-foreground bg-card p-2 shadow-[3px_3px_0_0_var(--color-foreground)]"
              >
                <input
                  value={r.name}
                  onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  className="col-span-5 rounded-lg border-2 border-foreground bg-background px-3 py-2 text-sm font-medium outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)]"
                />
                <input
                  type="number"
                  value={r.scored}
                  onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, scored: +e.target.value } : x))}
                  className="col-span-2 rounded-lg border-2 border-foreground bg-background px-3 py-2 text-sm font-medium outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)]"
                  placeholder="Scored"
                />
                <input
                  type="number"
                  value={r.out}
                  onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, out: +e.target.value } : x))}
                  className="col-span-2 rounded-lg border-2 border-foreground bg-background px-3 py-2 text-sm font-medium outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)]"
                  placeholder="Out of"
                />
                <div
                  className="col-span-2 rounded-lg border-2 border-foreground px-2 py-2 text-center text-xs font-bold"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${SWATCHES[i % SWATCHES.length]} 18%, transparent)`,
                    color: SWATCHES[i % SWATCHES.length],
                  }}
                >
                  {rowGrade} · {rowPct.toFixed(0)}%
                </div>
                <button
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  className="col-span-1 flex items-center justify-center rounded-full border-2 border-foreground bg-background p-1.5 text-muted-foreground transition-transform hover:-translate-y-0.5 hover:bg-destructive/15 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
        <button
          onClick={addRow}
          className="mt-3 inline-flex items-center gap-2 rounded-full border-2 border-dashed border-foreground/50 bg-card px-4 py-2 text-sm font-bold transition-all hover:-translate-y-0.5 hover:border-foreground hover:shadow-[3px_3px_0_0_var(--color-foreground)]"
        >
          <Plus className="h-4 w-4" /> Add subject
        </button>
      </div>

      {/* STEP 2 — overall result */}
      <div>
        <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">2</span>
          Your overall result
        </p>

        {/* marks-weight visualization */}
        {totals.out > 0 && (
          <div className="mb-4">
            <div className="flex h-4 w-full overflow-hidden rounded-full border-2 border-foreground">
              {rows.map((r, i) =>
                r.out > 0 ? (
                  <div
                    key={i}
                    style={{ width: `${(r.out / totals.out) * 100}%`, backgroundColor: SWATCHES[i % SWATCHES.length] }}
                    title={`${r.name}: out of ${r.out}`}
                  />
                ) : null,
              )}
            </div>
            <p className="mt-1 text-[11px] font-medium text-muted-foreground">
              How much each subject weighs toward your total, by marks
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 rounded-2xl border-2 border-foreground bg-gradient-to-br from-emerald-500/15 to-teal-500/15 p-6 shadow-[6px_6px_0_0_var(--color-foreground)] sm:grid-cols-4">
          <div>
            <div className="inline-flex rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Scored
            </div>
            <div className="mt-2 font-display text-2xl font-extrabold">{totals.scored}</div>
          </div>
          <div>
            <div className="inline-flex rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Total
            </div>
            <div className="mt-2 font-display text-2xl font-extrabold">{totals.out}</div>
          </div>
          <div>
            <div className="inline-flex rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Percentage
            </div>
            <div className="mt-2 font-display text-2xl font-extrabold">{totals.pct.toFixed(2)}%</div>
          </div>
          <div>
            <div className="inline-flex rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Grade
            </div>
            <div className="mt-2 font-display text-2xl font-extrabold">{grade}</div>
          </div>
        </div>
      </div>
    </div>
  );
}