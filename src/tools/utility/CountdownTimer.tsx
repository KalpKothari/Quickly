import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

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

export default function CountdownTimer() {
  const [target, setTarget] = useState(() => new Date(Date.now() + 3600_000).toISOString().slice(0, 16));
  const [now, setNow] = useState(Date.now());
  const [muted, setMuted] = useState(false);
  const alarmRef = useRef<{ stop: () => void } | null>(null);
  const firedForRef = useRef<string | null>(null);

  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);

  const remaining = useMemo(() => {
    const t = new Date(target).getTime();
    let s = Math.max(0, Math.floor((t - now) / 1000));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    return { d, h, m, s, done: t <= now };
  }, [target, now]);

  // Trigger alarm once per completed countdown.
  useEffect(() => {
    if (remaining.done && firedForRef.current !== target) {
      firedForRef.current = target;
      if (!muted) {
        try { alarmRef.current = playAlarm(); } catch { /* audio blocked */ }
      }
    }
  }, [remaining.done, target, muted]);

  // Reset the "already fired" marker when the user picks a new future target.
  useEffect(() => {
    if (!remaining.done) {
      firedForRef.current = null;
      alarmRef.current?.stop();
      alarmRef.current = null;
    }
  }, [remaining.done]);

  useEffect(() => () => alarmRef.current?.stop(), []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block flex-1 min-w-[220px]"><span className="text-xs uppercase text-muted-foreground">Target date & time</span>
          <input type="datetime-local" value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5" />
        </label>
        <button
          onClick={() => {
            setMuted((m) => {
              if (!m) alarmRef.current?.stop();
              return !m;
            });
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-sm hover:bg-secondary"
          aria-label={muted ? "Unmute alarm" : "Mute alarm"}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          {muted ? "Muted" : "Alarm on"}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[["Days", remaining.d], ["Hours", remaining.h], ["Minutes", remaining.m], ["Seconds", remaining.s]].map(([l, v]) => (
          <div key={l as string} className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 p-6 text-center">
            <div className="font-display text-4xl font-bold tabular-nums sm:text-5xl">{String(v).padStart(2, "0")}</div>
            <div className="mt-1 text-xs uppercase text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>
      {remaining.done && <div className="rounded-xl bg-emerald-500/10 p-4 text-center text-emerald-600 dark:text-emerald-400">🎉 Time's up!</div>}
    </div>
  );
}
