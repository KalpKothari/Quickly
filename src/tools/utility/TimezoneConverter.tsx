import { useEffect, useMemo, useState } from "react";
import { Globe2, ArrowRightLeft, Clock3 } from "lucide-react";

const BASE_ZONES = [
  "UTC",
  "Asia/Kolkata",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Hong_Kong",
  "Australia/Sydney",
];

/**
 * Compute the offset (in minutes) of `timeZone` at a specific UTC instant,
 * relative to UTC. Positive means east of UTC. Handles DST correctly because
 * it queries the zone at that exact instant.
 */
function tzOffsetMinutes(timeZone: string, utcInstantMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcInstantMs));
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const asUtc = Date.UTC(
    +map.year, +map.month - 1, +map.day,
    +map.hour, +map.minute, +map.second,
  );
  return Math.round((asUtc - utcInstantMs) / 60000);
}

/** Convert a wall-clock date+time in `fromZone` into a UTC instant (ms). */
function wallClockToUtc(dtLocal: string, fromZone: string): number {
  // dtLocal shape: "YYYY-MM-DDTHH:mm"
  const [d, t] = dtLocal.split("T");
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  // First guess: treat the wall clock as UTC to get an approximate instant.
  const guess = Date.UTC(y, mo - 1, da, h, mi);
  // Find offset at that instant, subtract to get true UTC.
  const offset = tzOffsetMinutes(fromZone, guess);
  return guess - offset * 60000;
}

function nowLocalInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TimezoneConverter() {
  const localTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );
  const zones = useMemo(() => {
    const s = new Set<string>([localTz, ...BASE_ZONES]);
    return Array.from(s);
  }, [localTz]);

  // One-tap zone pairs so a common conversion never needs two dropdown picks.
  const popularPairs = useMemo<[string, string][]>(() => [
    [localTz, "UTC"],
    [localTz, "America/New_York"],
    ["Europe/London", "Asia/Tokyo"],
    ["America/Los_Angeles", "Asia/Kolkata"],
  ], [localTz]);

  const [dt, setDt] = useState<string>(nowLocalInputValue());
  const [from, setFrom] = useState<string>(localTz);
  const [to, setTo] = useState<string>("UTC");

  // Keep default time fresh until user edits it.
  useEffect(() => {
    const id = setInterval(() => {
      // no-op; only used for reruns; user's manual edits are preserved because
      // we only set on mount.
    }, 60000);
    return () => clearInterval(id);
  }, []);

  const output = useMemo(() => {
    try {
      const utc = wallClockToUtc(dt, from);
      if (!isFinite(utc)) return "—";
      return new Intl.DateTimeFormat("en-US", {
        timeZone: to,
        dateStyle: "full",
        timeStyle: "long",
      }).format(new Date(utc));
    } catch {
      return "—";
    }
  }, [dt, from, to]);

  const swap = () => { setFrom(to); setTo(from); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <Globe2 className="h-3.5 w-3.5" />
          Timezone
        </span>
        {popularPairs.map(([p, q]) => (
          <button
            key={`${p}-${q}`}
            onClick={() => { setFrom(p); setTo(q); }}
            aria-label={`Set ${p} to ${q}`}
            className={
              "rounded-full border-2 border-foreground px-3 py-1.5 text-sm font-bold transition-transform hover:-translate-y-0.5 " +
              (from === p && to === q
                ? "bg-secondary shadow-[3px_3px_0_0_var(--color-foreground)]"
                : "bg-card")
            }
          >
            {p.split("/").pop()} → {q.split("/").pop()}
          </button>
        ))}
      </div>

      {/* Result surfaced first so it's the first thing you see, and it updates live as anything below changes. */}
      <div className="rounded-2xl border-2 border-foreground bg-gradient-to-br from-violet-500/15 to-indigo-500/15 p-6 shadow-[5px_5px_0_0_var(--color-foreground)]">
        <div className="inline-flex rounded-full border-2 border-foreground bg-card px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
          In {to}
        </div>
        <div className="mt-3 text-2xl font-bold">{output}</div>
      </div>

      <label className="block">
        <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
          Date &amp; time
        </span>
        <div className="mt-2 flex gap-2">
          <input
            type="datetime-local"
            value={dt}
            onChange={(e) => setDt(e.target.value)}
            aria-label="Date and time"
            className="w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-sm font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
          />
          <button
            onClick={() => setDt(nowLocalInputValue())}
            aria-label="Set to current date and time"
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border-2 border-foreground bg-card px-3 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
          >
            <Clock3 className="h-4 w-4" />
            Now
          </button>
        </div>
      </label>

      <div className="grid items-start gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <label className="block">
          <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            From
          </span>
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="Convert from timezone"
            className="mt-2 w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
          >
            {zones.map((z) => <option key={z} value={z}>{z}{z === localTz ? " (your timezone)" : ""}</option>)}
          </select>
        </label>

        <button
          onClick={swap}
          aria-label="Swap timezones"
          className="mt-1 self-center rounded-full border-2 border-foreground bg-card p-3 shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:rotate-180 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:mt-8"
        >
          <ArrowRightLeft className="h-4 w-4" />
        </button>

        <label className="block">
          <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            To
          </span>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Convert to timezone"
            className="mt-2 w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
          >
            {zones.map((z) => <option key={z} value={z}>{z}{z === localTz ? " (your timezone)" : ""}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}