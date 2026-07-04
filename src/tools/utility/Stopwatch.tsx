import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Flag, Timer } from "lucide-react";

function fmt(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export default function Stopwatch() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const start = useRef(0);

  useEffect(() => {
    if (!running) return;
    start.current = Date.now() - elapsed;
    const i = setInterval(() => setElapsed(Date.now() - start.current), 33);
    return () => clearInterval(i);
  }, [running]);

  return (
    <div className="space-y-6">
      {/* Neo-brutalist Header Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
            <Timer className="h-3.5 w-3.5" />
            Stopwatch
          </span>
        </div>
      </div>

      {/* Main Display Area */}
      <div className="rounded-2xl border-2 border-foreground bg-gradient-to-br from-violet-500/15 to-indigo-500/15 p-8 text-center shadow-[5px_5px_0_0_var(--color-foreground)]">
        <div className="text-5xl font-bold tabular-nums sm:text-6xl tracking-tight text-foreground">
          {fmt(elapsed)}
        </div>
      </div>

      {/* Action Controls Section */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={() => setRunning((r) => !r)}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-5 py-3.5 text-base font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
        >
          {running ? (
            <>
              <Pause className="h-5 w-5" /> Pause Session
            </>
          ) : (
            <>
              <Play className="h-5 w-5 fill-current" /> Start Session
            </>
          )}
        </button>

        <div className="flex gap-3 flex-1">
          <button
            onClick={() => setLaps((l) => [elapsed, ...l])}
            disabled={!running}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-card px-5 py-3.5 text-sm font-bold text-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 disabled:shadow-[3px_3px_0_0_var(--color-foreground)]"
          >
            <Flag className="h-4 w-4" /> Lap Split
          </button>

          <button
            onClick={() => {
              setRunning(false);
              setElapsed(0);
              setLaps([]);
            }}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-destructive text-destructive-foreground px-5 py-3.5 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
          >
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
        </div>
      </div>

      {/* Laps List Block */}
      {laps.length > 0 && (
        <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
          <div className="text-[11px] font-bold uppercase tracking-wide text-foreground/70 mb-3 px-1">
            Recorded Splits ({laps.length})
          </div>
          <ul className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {laps.map((l, i) => (
              <li
                key={i}
                className="flex justify-between items-center border-b-2 border-foreground/10 py-2.5 last:border-0 font-mono text-sm px-1"
              >
                <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-primary">
                  Lap {laps.length - i}
                </span>
                <span className="font-bold tabular-nums text-foreground">{fmt(l)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}