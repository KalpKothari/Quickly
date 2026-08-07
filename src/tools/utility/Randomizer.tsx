import { useEffect, useMemo, useRef, useState } from "react";
import {
  Shuffle,
  ListOrdered,
  Users,
  X,
  Copy,
  Check,
  FileDown,
  RotateCcw,
  Sparkles,
  Plus,
  Trash2,
  AlertCircle,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

type Mode = "order" | "groups";
type GroupDistMode = "count" | "perGroup";
type GroupPhase = "idle" | "shuffling" | "revealing" | "done";

type Preset = { label: string; mode: Mode; names: string[] };

// ============================================================================
// Constants
// ============================================================================

const ROW_HEIGHT = 48;

const ORDER_STEP_DELAYS = [
  70, 70, 80, 90, 100, 120, 140, 170, 210, 260, 320, 400, 500, 620, 760,
];

const PRESETS: Preset[] = [
  {
    label: "Game Players",
    mode: "order",
    names: ["Player 1", "Player 2", "Player 3", "Player 4", "Player 5", "Player 6"],
  },
  {
    label: "Presentation Order",
    mode: "order",
    names: ["Alex", "Sarah", "John", "Mike", "David"],
  },
  {
    label: "Classroom Groups",
    mode: "groups",
    names: ["Emma", "Liam", "Olivia", "Noah", "Ava", "Ethan", "Sophia", "Mason", "Isabella", "Lucas"],
  },
  {
    label: "Team Assignment",
    mode: "groups",
    names: ["Alex", "Sarah", "John", "Mike", "David", "Chris", "Emma", "Tom"],
  },
];

const ACCENT_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#FFD93D",
  "#6C5CE7",
  "#FF9F43",
  "#1DD1A1",
  "#54A0FF",
  "#FF6B9D",
];

// ============================================================================
// Helpers
// ============================================================================

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getDisplayNames(names: string[]): string[] {
  const totals = new Map<string, number>();
  names.forEach((n) => totals.set(n, (totals.get(n) ?? 0) + 1));
  const seen = new Map<string, number>();
  return names.map((n) => {
    const total = totals.get(n) ?? 1;
    if (total <= 1) return n;
    const occurrence = (seen.get(n) ?? 0) + 1;
    seen.set(n, occurrence);
    return `${n} ${occurrence}`;
  });
}

function distributeByCount(list: string[], groupCount: number): string[][] {
  const shuffled = shuffleArray(list);
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  shuffled.forEach((name, i) => groups[i % groupCount].push(name));
  return groups;
}

function distributeByPerGroup(list: string[], perGroup: number): string[][] {
  const shuffled = shuffleArray(list);
  const groups: string[][] = [];
  for (let i = 0; i < shuffled.length; i += perGroup) {
    groups.push(shuffled.slice(i, i + perGroup));
  }
  return groups;
}

// ============================================================================
// Component
// ============================================================================

export default function Randomizer() {
  const [mode, setMode] = useState<Mode>("order");
  const [names, setNames] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  const [orderResult, setOrderResult] = useState<string[] | null>(null);
  const [displayOrder, setDisplayOrder] = useState<string[]>([]);
  const [isShufflingOrder, setIsShufflingOrder] = useState(false);

  const [groupLabel, setGroupLabel] = useState("Team");
  const [distMode, setDistMode] = useState<GroupDistMode>("count");
  const [groupCount, setGroupCount] = useState(2);
  const [perGroup, setPerGroup] = useState(4);
  const [groupResult, setGroupResult] = useState<string[][] | null>(null);
  const [shufflingGroups, setShufflingGroups] = useState<string[][]>([]);
  const [groupPhase, setGroupPhase] = useState<GroupPhase>("idle");

  const [copied, setCopied] = useState(false);
  const [todayLabel, setTodayLabel] = useState("");

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setTodayLabel(
      new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    );
    return () => {
      timeouts.current.forEach(clearTimeout);
      if (interval.current) clearInterval(interval.current);
    };
  }, []);

  const displayNames = useMemo(() => getDisplayNames(names), [names]);
  const totalPeople = displayNames.length;

  // Real-time recalculation of total groups based on mode
  const calculatedGroupCount = useMemo(() => {
    if (distMode === "count") return groupCount;
    return Math.ceil(totalPeople / Math.max(1, perGroup));
  }, [distMode, groupCount, perGroup, totalPeople]);

  // Validation checking logic
  const validationError = useMemo(() => {
    if (totalPeople < 2) return "Add at least 2 people to form groups.";

    if (distMode === "count") {
      if (groupCount < 2) return "Must have at least 2 groups.";
      if (groupCount > totalPeople)
        return `Cannot split ${totalPeople} people into ${groupCount} groups.`;
    } else {
      if (perGroup < 1) return "Must have at least 1 person per group.";
      if (perGroup > totalPeople)
        return `Cannot fit ${perGroup} people per group with only ${totalPeople} total people.`;
    }

    return null;
  }, [totalPeople, distMode, groupCount, perGroup]);

  // Valid preset choices
  const validGroupCountPresets = useMemo(() => {
    if (totalPeople < 2) return [2, 3, 4];
    return [2, 3, 4, 5, 6].filter((v) => v <= totalPeople);
  }, [totalPeople]);

  const validPerGroupPresets = useMemo(() => {
    if (totalPeople < 2) return [2, 3, 4];
    return [2, 3, 4, 5].filter((v) => v <= totalPeople);
  }, [totalPeople]);

  function addFromDraft() {
    const parsed = draft
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parsed.length === 0) return;
    setNames((prev) => [...prev, ...parsed]);
    setDraft("");
    setOrderResult(null);
    setGroupResult(null);
    setGroupPhase("idle");
  }

  function removeName(index: number) {
    setNames((prev) => prev.filter((_, i) => i !== index));
    setOrderResult(null);
    setGroupResult(null);
    setGroupPhase("idle");
  }

  function clearAll() {
    timeouts.current.forEach(clearTimeout);
    if (interval.current) clearInterval(interval.current);
    setNames([]);
    setDraft("");
    setOrderResult(null);
    setGroupResult(null);
    setGroupPhase("idle");
    setIsShufflingOrder(false);
  }

  function applyPreset(preset: Preset) {
    setMode(preset.mode);
    setNames(preset.names);
    setDraft("");
    setOrderResult(null);
    setGroupResult(null);
    setGroupPhase("idle");
    setGroupCount(Math.min(2, preset.names.length));
    setPerGroup(Math.min(2, preset.names.length));
  }

  function generateOrder() {
    if (displayNames.length < 2 || isShufflingOrder) return;
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];

    const final = shuffleArray(displayNames);
    setIsShufflingOrder(true);
    setOrderResult(null);

    let elapsed = 0;
    ORDER_STEP_DELAYS.forEach((delay, i) => {
      elapsed += delay;
      const isLast = i === ORDER_STEP_DELAYS.length - 1;
      const t = setTimeout(() => {
        if (isLast) {
          setDisplayOrder(final);
          setOrderResult(final);
          setIsShufflingOrder(false);
        } else {
          setDisplayOrder(shuffleArray(displayNames));
        }
      }, elapsed);
      timeouts.current.push(t);
    });
  }

  function generateGroups() {
    if (validationError || groupPhase === "shuffling") return;

    if (interval.current) clearInterval(interval.current);
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];

    setGroupPhase("shuffling");
    setGroupResult(null);

    const targetGroups =
      distMode === "count"
        ? distributeByCount(displayNames, groupCount)
        : distributeByPerGroup(displayNames, perGroup);

    setShufflingGroups(
      targetGroups.map((g) => g.map(() => displayNames[Math.floor(Math.random() * displayNames.length)]))
    );

    let ticks = 0;
    const maxTicks = 18;
    interval.current = setInterval(() => {
      ticks += 1;

      setShufflingGroups(
        targetGroups.map((g) =>
          g.map(() => displayNames[Math.floor(Math.random() * displayNames.length)])
        )
      );

      if (ticks >= maxTicks) {
        if (interval.current) clearInterval(interval.current);
        setGroupResult(targetGroups);
        setGroupPhase("revealing");
        const t = setTimeout(() => setGroupPhase("done"), 500);
        timeouts.current.push(t);
      }
    }, 70);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      const t = setTimeout(() => setCopied(false), 1500);
      timeouts.current.push(t);
    });
  }

  function copyOrder() {
    if (!orderResult) return;
    copyToClipboard(orderResult.map((n, i) => `${i + 1}. ${n}`).join("\n"));
  }

  function copyGroups() {
    if (!groupResult) return;
    const text = groupResult
      .map(
        (g, i) =>
          `${groupLabel || "Team"} ${i + 1}\n` + g.map((n, j) => `${j + 1}. ${n}`).join("\n")
      )
      .join("\n\n");
    copyToClipboard(text);
  }

  function downloadTeamsPdf() {
    window.print();
  }

  return (
    <>
      <div className="space-y-6 print:hidden">
        <style>{`
          @keyframes qk-card-in {
            from { opacity: 0; transform: translateY(12px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          .qk-card-in { animation: qk-card-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both; }

          @keyframes qk-pop {
            0% { transform: scale(1); }
            40% { transform: scale(1.03); }
            100% { transform: scale(1); }
          }
          .qk-pop { animation: qk-pop 260ms ease; }

          @keyframes qk-shuffle-glow {
            0%, 100% { box-shadow: 5px 5px 0 0 var(--color-foreground); }
            50% { box-shadow: 5px 5px 0 0 var(--color-primary); }
          }
          .qk-shuffle-glow { animation: qk-shuffle-glow 0.5s ease-in-out infinite; }

          @keyframes qk-slot-flip {
            0% { transform: translateY(-3px); opacity: 0.6; }
            50% { transform: translateY(3px); opacity: 1; }
            100% { transform: translateY(0); opacity: 0.8; }
          }
          .qk-slot-flip { animation: qk-slot-flip 75ms linear infinite; }

          @media print {
            body * { visibility: hidden; }
            .qk-print-area, .qk-print-area * { visibility: visible; }
            .qk-print-area { position: absolute; inset: 0; }
          }
        `}</style>

        {/* Header Badge */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
            <Shuffle className="h-3.5 w-3.5" />
            Randomizer
          </span>
          {names.length > 0 && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
            >
              <Trash2 className="h-3 w-3" />
              Clear List
            </button>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Randomize Anything</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Create fair random orders and groups instantly
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode("order")}
            aria-pressed={mode === "order"}
            className={
              "flex items-center justify-center gap-2 rounded-2xl border-2 border-foreground px-4 py-3 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 " +
              (mode === "order" ? "bg-primary text-primary-foreground" : "bg-card")
            }
          >
            <ListOrdered className="h-4 w-4" />
            Random Order
          </button>
          <button
            onClick={() => setMode("groups")}
            aria-pressed={mode === "groups"}
            className={
              "flex items-center justify-center gap-2 rounded-2xl border-2 border-foreground px-4 py-3 text-sm font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 " +
              (mode === "groups" ? "bg-primary text-primary-foreground" : "bg-card")
            }
          >
            <Users className="h-4 w-4" />
            Random Groups
          </button>
        </div>

        {/* Quick Presets */}
        <div>
          <span className="inline-flex rounded-full border-2 border-foreground bg-secondary/40 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
            Quick presets
          </span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className="rounded-full border-2 border-foreground bg-card px-2.5 py-1 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Name Input Box */}
        <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
          <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            Add names
          </span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={"Type or paste names, one per line\nAlex\nSarah\nJohn"}
            rows={3}
            aria-label="Add names, one per line"
            className="mt-2 w-full resize-none rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-sm font-medium shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              onClick={addFromDraft}
              disabled={!draft.trim()}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Names
            </button>
            <span className="text-xs font-semibold text-muted-foreground">
              {names.length} {names.length === 1 ? "person" : "people"} added
            </span>
          </div>

          {/* Added Name Chips */}
          {names.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t-2 border-foreground/10 pt-3">
              {displayNames.map((n, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full border-2 border-foreground bg-secondary/30 px-2.5 py-1 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)]"
                >
                  {n}
                  <button
                    onClick={() => removeName(i)}
                    aria-label={`Remove ${n}`}
                    className="rounded-full transition-transform hover:scale-125"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Empty State */}
        {names.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-foreground/30 px-6 py-12 text-center">
            <Sparkles className="h-8 w-8 text-foreground/30" />
            <p className="text-sm font-bold text-foreground/60">Add names to start randomizing</p>
            <p className="text-xs font-medium text-muted-foreground">
              Type names above or tap a preset to try it out
            </p>
          </div>
        )}

        {/* ================= ORDER MODE ================= */}
        {mode === "order" && names.length > 0 && (
          <div className="space-y-4">
            <button
              onClick={generateOrder}
              disabled={displayNames.length < 2 || isShufflingOrder}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-foreground bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 sm:w-auto"
            >
              <Shuffle className={"h-4 w-4" + (isShufflingOrder ? " animate-spin" : "")} />
              {isShufflingOrder ? "Shuffling..." : "Generate Order"}
            </button>

            {displayNames.length < 2 && (
              <p className="text-xs font-semibold text-muted-foreground">Add at least 2 names to generate an order.</p>
            )}

            {(isShufflingOrder || orderResult) && (
              <div
                className={
                  "rounded-2xl border-2 border-foreground bg-card p-4 shadow-[5px_5px_0_0_var(--color-foreground)] " +
                  (isShufflingOrder ? "qk-shuffle-glow" : "")
                }
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-bold">
                    {isShufflingOrder ? "Shuffling..." : "Your Random Order"}
                  </span>
                </div>
                <div
                  className="relative"
                  style={{ height: displayOrder.length * ROW_HEIGHT }}
                >
                  {displayOrder.map((name, idx) => (
                    <div
                      key={name}
                      className={
                        "absolute left-0 right-0 flex items-center gap-3 rounded-xl border-2 border-foreground bg-card px-3 shadow-[2px_2px_0_0_var(--color-foreground)] " +
                        (!isShufflingOrder ? "qk-pop" : "")
                      }
                      style={{
                        height: ROW_HEIGHT - 8,
                        top: idx * ROW_HEIGHT,
                        transition: "top 180ms ease",
                      }}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-xs font-bold">
                        {idx + 1}
                      </span>
                      <span className="truncate text-sm font-semibold">{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {orderResult && !isShufflingOrder && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={generateOrder}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  Shuffle Again
                </button>
                <button
                  onClick={copyOrder}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy Order"}
                </button>
                <button
                  onClick={clearAll}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Clear All
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================= GROUPS MODE ================= */}
        {mode === "groups" && names.length > 0 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                  Group name (optional)
                </span>
                <input
                  type="text"
                  value={groupLabel}
                  onChange={(e) => setGroupLabel(e.target.value)}
                  placeholder="Team"
                  aria-label="Custom group name prefix"
                  className="mt-2 w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-sm font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
                />
              </label>

              <div className="block">
                <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                  Split by
                </span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setDistMode("count");
                      if (groupCount > totalPeople) setGroupCount(Math.max(2, totalPeople));
                    }}
                    aria-pressed={distMode === "count"}
                    className={
                      "rounded-xl border-2 border-foreground px-3 py-2.5 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 " +
                      (distMode === "count" ? "bg-primary text-primary-foreground" : "bg-card")
                    }
                  >
                    Number of groups
                  </button>
                  <button
                    onClick={() => {
                      setDistMode("perGroup");
                      if (perGroup > totalPeople) setPerGroup(Math.max(1, totalPeople));
                    }}
                    aria-pressed={distMode === "perGroup"}
                    className={
                      "rounded-xl border-2 border-foreground px-3 py-2.5 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 " +
                      (distMode === "perGroup" ? "bg-primary text-primary-foreground" : "bg-card")
                    }
                  >
                    People per group
                  </button>
                </div>
              </div>
            </div>

            {/* Dynamic Controls */}
            {distMode === "count" ? (
              <div>
                <input
                  type="number"
                  min={2}
                  max={Math.max(2, totalPeople)}
                  value={groupCount}
                  onChange={(e) => setGroupCount(Math.max(1, +e.target.value))}
                  aria-label="Number of groups"
                  className="w-32 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {validGroupCountPresets.map((v) => (
                    <button
                      key={v}
                      onClick={() => setGroupCount(v)}
                      aria-pressed={groupCount === v}
                      className={
                        "rounded-full border-2 border-foreground px-2.5 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 " +
                        (groupCount === v ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]" : "bg-card")
                      }
                    >
                      {v} groups
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, totalPeople)}
                  value={perGroup}
                  onChange={(e) => setPerGroup(Math.max(1, +e.target.value))}
                  aria-label="People per group"
                  className="w-32 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {validPerGroupPresets.map((v) => (
                    <button
                      key={v}
                      onClick={() => setPerGroup(v)}
                      aria-pressed={perGroup === v}
                      className={
                        "rounded-full border-2 border-foreground px-2.5 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 " +
                        (perGroup === v ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]" : "bg-card")
                      }
                    >
                      {v} per group
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Information Notice for Output Groups */}
            {!validationError && distMode === "perGroup" && totalPeople > 0 && (
              <p className="text-xs font-semibold text-muted-foreground">
                Splitting {totalPeople} people into groups of {perGroup} will create {calculatedGroupCount} {calculatedGroupCount === 1 ? "group" : "groups"}.
              </p>
            )}

            {/* Validation Alert */}
            {validationError && (
              <div className="flex items-center gap-2 rounded-xl border-2 border-foreground bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-600 shadow-[2px_2px_0_0_var(--color-foreground)]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {validationError}
              </div>
            )}

            <button
              onClick={generateGroups}
              disabled={Boolean(validationError) || groupPhase === "shuffling"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-foreground bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 sm:w-auto"
            >
              <Users className={"h-4 w-4" + (groupPhase === "shuffling" ? " animate-spin" : "")} />
              {groupPhase === "shuffling" ? "Assigning..." : "Generate Groups"}
            </button>

            {/* Shuffling Slots Animation */}
            {groupPhase === "shuffling" && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {shufflingGroups.map((group, gi) => (
                  <div
                    key={gi}
                    className="qk-shuffle-glow rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)] overflow-hidden"
                  >
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
                      <Sparkles className="h-3 w-3 animate-spin" />
                      {groupLabel || "Team"} {gi + 1}
                    </div>
                    <ul className="space-y-2">
                      {group.map((tempName, ni) => (
                        <li
                          key={ni}
                          className="flex items-center gap-2.5 rounded-xl border-2 border-dashed border-foreground/30 bg-secondary/10 px-3 py-2 text-sm font-bold"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-card text-[10px] font-extrabold">
                            {ni + 1}
                          </span>
                          <span className="qk-slot-flip truncate text-primary">{tempName}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {/* Generated Teams */}
            {groupResult && (groupPhase === "revealing" || groupPhase === "done") && (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {groupResult.map((group, gi) => {
                    const color = ACCENT_COLORS[gi % ACCENT_COLORS.length];
                    return (
                      <div
                        key={gi}
                        className="qk-card-in rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]"
                        style={{ animationDelay: `${gi * 90}ms` }}
                      >
                        <div
                          className="mb-3 inline-flex items-center gap-2 rounded-full border-2 border-foreground px-3 py-1 text-xs font-bold uppercase tracking-wide shadow-[2px_2px_0_0_var(--color-foreground)]"
                          style={{ backgroundColor: color, color: "#111" }}
                        >
                          {groupLabel || "Team"} {gi + 1}
                        </div>
                        <ul className="space-y-1.5">
                          {group.map((name, ni) => (
                            <li
                              key={name}
                              className="qk-card-in flex items-center gap-2 rounded-xl border-2 border-foreground/20 bg-secondary/20 px-3 py-2 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-foreground)]"
                              style={{ animationDelay: `${gi * 90 + ni * 60 + 120}ms` }}
                            >
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-card text-[10px] font-bold">
                                {ni + 1}
                              </span>
                              <span className="truncate">{name}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={generateGroups}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
                  >
                    <Shuffle className="h-3.5 w-3.5" />
                    Generate Again
                  </button>
                  <button
                    onClick={copyGroups}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy Result"}
                  </button>
                  <button
                    onClick={downloadTeamsPdf}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    Download Teams PDF
                  </button>
                  <button
                    onClick={clearAll}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Start Over
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Print View Sheet */}
      {groupResult && (
        <div className="qk-print-area hidden print:block">
          <h1 className="text-2xl font-bold">Random Teams</h1>
          <p className="mt-1 text-sm text-muted-foreground">{todayLabel}</p>
          <div className="mt-6 grid grid-cols-2 gap-4">
            {groupResult.map((group, gi) => (
              <div key={gi} className="break-inside-avoid rounded-xl border-2 border-foreground p-4">
                <div className="mb-2 text-sm font-bold uppercase tracking-wide">
                  {groupLabel || "Team"} {gi + 1}
                </div>
                <ol className="space-y-1 text-sm">
                  {group.map((name, ni) => (
                    <li key={name}>
                      {ni + 1}. {name}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}