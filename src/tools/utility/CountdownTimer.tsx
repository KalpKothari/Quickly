import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX, Timer, Square, Play, RotateCcw } from "lucide-react";

/** Play a 5-second alarm beep using WebAudio (no asset required). */
function playAlarm(): { stop: () => void } {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.25;
  master.connect(ctx.destination);
  const stops: Array<() => void> = [];
  // Beep every 0.5s for 5 seconds.
  for (let i = 0; i < 10; i++) {
    const start = ctx.currentTime + i * 0.5;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = 880;
    osc.type = "sine";
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(1, start + 0.02);
    g.gain.linearRampToValueAtTime(0, start + 0.35);
    osc.connect(g).connect(master);
    osc.start(start);
    osc.stop(start + 0.4);
    stops.push(() => { try { osc.stop(); } catch { /* noop */ } });
  }
  const timer = setTimeout(() => ctx.close().catch(() => {}), 5200);
  return {
    stop: () => {
      clearTimeout(timer);
      stops.forEach((s) => s());
      ctx.close().catch(() => {});
    },
  };
}

// One-tap durations
const DURATION_PRESETS: [string, number][] = [
  ["1 min", 60],
  ["5 min", 300],
  ["10 min", 600],
  ["30 min", 1800],
  ["1 hr", 3600],
  ["1 day", 86400],
];

export default function CountdownTimer() {
  // Store exact target timestamp in milliseconds
  const [targetTime, setTargetTime] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [muted, setMuted] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  // Whether the user has actually picked/set a duration yet — without this,
  // the timer would immediately show as "done" and fire the alarm on load,
  // since target/startedAt both default to "now".
  const [started, setStarted] = useState(false);
  
  // Custom input states
  const [customHours, setCustomHours] = useState("");
  const [customMinutes, setCustomMinutes] = useState("");
  const [customSeconds, setCustomSeconds] = useState("");

  const alarmRef = useRef<{ stop: () => void } | null>(null);
  const firedForRef = useRef<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const remaining = useMemo(() => {
    const diff = Math.max(0, targetTime - now);
    let totalSeconds = Math.floor(diff / 1000);

    const d = Math.floor(totalSeconds / 86400);
    totalSeconds %= 86400;

    const h = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;

    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;

    return {
      d,
      h,
      m,
      s,
      done: diff <= 0,
    };
  }, [targetTime, now]);

  // Trigger alarm once per completed countdown.
  useEffect(() => {
    if (started && remaining.done && firedForRef.current !== targetTime) {
      firedForRef.current = targetTime;
      if (!muted) {
        try { alarmRef.current = playAlarm(); } catch { /* audio blocked */ }
      }
    }
  }, [remaining.done, targetTime, muted, started]);

  // Reset the "already fired" marker when a new future target is set.
  useEffect(() => {
    if (!remaining.done) {
      firedForRef.current = null;
      alarmRef.current?.stop();
      alarmRef.current = null;
    }
  }, [remaining.done]);

  useEffect(() => () => alarmRef.current?.stop(), []);

  const totalMs = Math.max(1, targetTime - startedAt);
  const progressPct = started ? Math.min(100, Math.max(0, (1 - Math.max(0, targetTime - now) / totalMs) * 100)) : 0;

  const setDuration = (seconds: number) => {
    if (seconds <= 0) return;
    const start = Date.now();
    setStartedAt(start);
    setNow(start);
    setTargetTime(start + seconds * 1000);
    setStarted(true);

    firedForRef.current = null;
    alarmRef.current?.stop();
    alarmRef.current = null;
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hrs = parseInt(customHours || "0", 10);
    const mins = parseInt(customMinutes || "0", 10);
    const secs = parseInt(customSeconds || "0", 10);
    
    const totalSeconds = (hrs * 3600) + (mins * 60) + secs;
    if (totalSeconds > 0) {
      setDuration(totalSeconds);
    }
  };

  const handleReset = () => {
    const start = Date.now();
    setStartedAt(start);
    setNow(start);
    setTargetTime(start); // Setting target to now stops the countdown immediately
    setStarted(false);
    
    // Clear inputs
    setCustomHours("");
    setCustomMinutes("");
    setCustomSeconds("");

    // Stop active alarms
    firedForRef.current = null;
    alarmRef.current?.stop();
    alarmRef.current = null;
  };

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <Timer className="h-3.5 w-3.5" />
          Countdown
        </span>
      </div>

      {/* Duration presets */}
      <div className="flex flex-wrap gap-1.5">
        {DURATION_PRESETS.map(([label, secs]) => (
          <button
            key={label}
            onClick={() => setDuration(secs)}
            className="rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-sm font-bold transition-transform hover:-translate-y-0.5"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Custom Inputs and Control Actions Form */}
      <form onSubmit={handleCustomSubmit} className="flex min-w-0 flex-wrap items-end gap-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
        <div className="flex min-w-0 flex-1 gap-2 sm:min-w-[200px]">
          <label className="min-w-0 flex-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-foreground/70 block mb-1">Hours</span>
            <input
              type="number"
              min="0"
              placeholder="0"
              value={customHours}
              onChange={(e) => setCustomHours(e.target.value)}
              className="w-full min-w-0 rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
            />
          </label>
          <label className="min-w-0 flex-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-foreground/70 block mb-1">Mins</span>
            <input
              type="number"
              min="0"
              max="59"
              placeholder="0"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              className="w-full min-w-0 rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
            />
          </label>
          <label className="min-w-0 flex-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-foreground/70 block mb-1">Secs</span>
            <input
              type="number"
              min="0"
              max="59"
              placeholder="0"
              value={customSeconds}
              onChange={(e) => setCustomSeconds(e.target.value)}
              className="w-full min-w-0 rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
            />
          </label>
        </div>
        
        <div className="flex w-full gap-2 sm:w-auto">
          <button
            type="submit"
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-foreground bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Set Timer
          </button>
          
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-foreground bg-destructive text-destructive-foreground px-4 py-2 text-sm font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </form>

      {/* Countdown Display — 2 columns on phones (so each cell has room for its
          label like "Minutes"/"Seconds" without forcing horizontal overflow),
          4 columns from the sm breakpoint up. */}
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Days", remaining.d], ["Hours", remaining.h], ["Minutes", remaining.m], ["Seconds", remaining.s]].map(([l, v]) => (
          <div
            key={l as string}
            className="min-w-0 rounded-2xl border-2 border-foreground bg-gradient-to-br from-violet-500/15 to-indigo-500/15 p-4 text-center shadow-[5px_5px_0_0_var(--color-foreground)] sm:p-6"
          >
            <div className="text-3xl font-bold tabular-nums sm:text-5xl">{String(v).padStart(2, "0")}</div>
            <div className="mt-2 inline-flex rounded-full border-2 border-foreground bg-card px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
              {l}
            </div>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="h-3 w-full min-w-0 overflow-hidden rounded-full border-2 border-foreground bg-card">
        <div className="h-full bg-primary transition-[width]" style={{ width: `${progressPct}%` }} />
      </div>

      {started && remaining.done && totalMs > 1 && (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-foreground bg-emerald-500/15 p-4 text-center text-lg font-bold text-emerald-600 shadow-[3px_3px_0_0_var(--color-foreground)] dark:text-emerald-400">
          <span> Time's up!</span>
          {!muted && (
            <button
              onClick={() => { alarmRef.current?.stop(); alarmRef.current = null; }}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-sm font-bold text-foreground shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
            >
              <Square className="h-3.5 w-3.5" />
              Stop alarm
            </button>
          )}
        </div>
      )}

      {/* Mute/Unmute Alarm Button */}
      <button
        onClick={() => {
          setMuted((m) => {
            if (!m) alarmRef.current?.stop();
            return !m;
          });
        }}
        aria-label={muted ? "Unmute alarm" : "Mute alarm"}
        aria-pressed={muted}
        className={
          "inline-flex items-center gap-2 rounded-full border-2 border-foreground px-3 py-2.5 text-sm font-bold transition-transform hover:-translate-y-0.5 " +
          (muted ? "bg-card" : "bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]")
        }
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        {muted ? "Muted" : "Alarm on"}
      </button>
    </div>
  );
}