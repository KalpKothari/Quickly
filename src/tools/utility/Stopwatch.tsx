import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Flag } from "lucide-react";
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
      <div className="rounded-3xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 p-10 text-center">
        <div className="font-display text-6xl font-bold tabular-nums sm:text-7xl">{fmt(elapsed)}</div>
      </div>
      <div className="flex justify-center gap-3">
        <button onClick={() => setRunning((r) => !r)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
          {running ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Start</>}
        </button>
        <button onClick={() => setLaps((l) => [elapsed, ...l])} disabled={!running} className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-semibold hover:bg-secondary disabled:opacity-40">
          <Flag className="h-4 w-4" /> Lap
        </button>
        <button onClick={() => { setRunning(false); setElapsed(0); setLaps([]); }} className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-semibold hover:bg-secondary">
          <RotateCcw className="h-4 w-4" /> Reset
        </button>
      </div>
      {laps.length > 0 && (
        <ul className="space-y-1 rounded-2xl border border-border bg-card p-4">
          {laps.map((l, i) => (
            <li key={i} className="flex justify-between border-b border-border/60 py-2 last:border-0 font-mono text-sm">
              <span className="text-muted-foreground">Lap {laps.length - i}</span>
              <span>{fmt(l)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
