import { useEffect, useMemo, useState } from "react";

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

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block"><span className="text-xs uppercase text-muted-foreground">Date & time</span>
          <input type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5" />
        </label>
        <label className="block"><span className="text-xs uppercase text-muted-foreground">From</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5">
            {zones.map((z) => <option key={z} value={z}>{z}{z === localTz ? " (your timezone)" : ""}</option>)}
          </select>
        </label>
        <label className="block"><span className="text-xs uppercase text-muted-foreground">To</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5">
            {zones.map((z) => <option key={z} value={z}>{z}{z === localTz ? " (your timezone)" : ""}</option>)}
          </select>
        </label>
      </div>
      <div className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 p-6">
        <div className="text-xs uppercase text-muted-foreground">In {to}</div>
        <div className="mt-1 font-display text-2xl font-bold">{output}</div>
      </div>
    </div>
  );
}
