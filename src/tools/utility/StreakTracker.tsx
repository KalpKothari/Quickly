import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  // UI chrome
  AlertTriangle, ArrowLeft, CalendarCheck, Check, ChevronLeft, ChevronRight,
  Download, Ghost, Pencil, Percent, Plus, Trash2, Undo2, X,
  // icon picker + shared
  Apple, Bed, Bike, BookOpen, Brain, Briefcase, Calculator, Camera,
  ClipboardList, Cloud, Code, Coffee, Coins, Compass, Dumbbell, Feather,
  Film, Flame, Footprints, Gamepad2, GlassWater, GraduationCap, Guitar,
  Headphones, Heart, HeartPulse, Languages, Laptop, Leaf, Lightbulb,
  ListChecks, MessageCircle, Mic, Microscope, Moon, Mountain, Music,
  NotebookPen, Paintbrush, Palette, PersonStanding, PiggyBank, Pill,
  Presentation, Recycle, Rocket, Salad, ShoppingBag, Smartphone, Smile,
  Sparkles, Star, Sunrise, Target, Terminal, Timer, TrendingUp, Trophy,
  Tv, Users, Video, Wallet, WashingMachine, Waves, Wifi, Wrench, Zap,
} from "lucide-react";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

/* ------------------------------------------------------------------ */
/* types + constants                                                   */
/* ------------------------------------------------------------------ */

type Goal = {
  id: string;
  name: string;
  description: string;
  icon: string | null;          // key into ICONS, null = site logo
  color: string | null;         // hex, null = theme primary
  startDate: string;            // "YYYY-MM-DD" in IST
  completions: string[];        // sorted unique "YYYY-MM-DD"
  bestStreakRecord: number;     // monotonic all-time record
  createdAt: number;
};

type Stats = {
  current: number;
  best: number;
  total: number;
  missed: number;
  rate: number;
  trackedDays: number;
};

type DayState = "completed" | "missed" | "today" | "upcoming" | "prestart";

const STORAGE_KEY = "quickly-streak-tracker-v1";
const IST = "Asia/Kolkata";
const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];

const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#10b981",
  "#14b8a6", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
];

const ICON_GROUPS: { label: string; icons: Record<string, LucideIcon> }[] = [
  {
    label: "Fitness & Movement",
    icons: { dumbbell: Dumbbell, bike: Bike, footprints: Footprints, walk: PersonStanding,
             swim: Waves, hike: Mountain, cardio: HeartPulse, timer: Timer },
  },
  {
    label: "Mind & Learning",
    icons: { book: BookOpen, study: GraduationCap, brain: Brain, journal: NotebookPen,
             language: Languages, maths: Calculator, ideas: Lightbulb, research: Microscope },
  },
  {
    label: "Health & Body",
    icons: { apple: Apple, salad: Salad, water: GlassWater, medicine: Pill,
             sleep: Bed, night: Moon, sunrise: Sunrise, coffee: Coffee },
  },
  {
    label: "Work & Focus",
    icons: { work: Briefcase, laptop: Laptop, code: Code, terminal: Terminal,
             tasks: ClipboardList, checklist: ListChecks, present: Presentation, launch: Rocket },
  },
  {
    label: "Creative",
    icons: { music: Music, guitar: Guitar, mic: Mic, camera: Camera,
             palette: Palette, paint: Paintbrush, film: Film, write: Feather },
  },
  {
    label: "Money & Home",
    icons: { wallet: Wallet, piggy: PiggyBank, coins: Coins, invest: TrendingUp,
             shopping: ShoppingBag, laundry: WashingMachine, repair: Wrench, recycle: Recycle },
  },
  {
    label: "Life & Mindfulness",
    icons: { heart: Heart, smile: Smile, star: Star, flame: Flame,
             energy: Zap, compass: Compass, nature: Leaf, people: Users },
  },
  {
    label: "Digital & Detox",
    icons: { phone: Smartphone, games: Gamepad2, tv: Tv, audio: Headphones,
             wifi: Wifi, cloud: Cloud, chat: MessageCircle, video: Video },
  },
];

const ICONS: Record<string, LucideIcon> = Object.assign({}, ...ICON_GROUPS.map((g) => g.icons));

/** Default mark shown when a goal has no icon selected. */
function BrandMark({ className }: { className?: string }) {
  return <Flame className={className} />;
}

function GoalIcon({ goal, className }: { goal: Goal; className?: string }) {
  const Cmp = goal.icon ? ICONS[goal.icon] : null;
  return Cmp ? <Cmp className={className} /> : <BrandMark className={className} />;
}

/* ------------------------------------------------------------------ */
/* IST date helpers (no local-timezone drift)                          */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, "0");

function istNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const p: Record<string, string> = {};
  for (const part of parts) if (part.type !== "literal") p[part.type] = part.value;
  return {
    y: Number(p.year), m: Number(p.month), d: Number(p.day),
    h: Number(p.hour) % 24, min: Number(p.minute), s: Number(p.second),
  };
}

function istTodayKey() {
  const { y, m, d } = istNow();
  return `${y}-${pad(m)}-${pad(d)}`;
}

function msUntilIstMidnight() {
  const { h, min, s } = istNow();
  return ((23 - h) * 3600 + (59 - min) * 60 + (60 - s)) * 1000 + 750;
}

const keyToNum = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};

const numToKey = (n: number) => {
  const dt = new Date(n * DAY_MS);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

const prettyDate = (key: string) =>
  new Date(`${key}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric", timeZone: IST,
  });

const reportStamp = () =>
  `${new Date().toLocaleString("en-IN", { timeZone: IST, dateStyle: "medium", timeStyle: "short" })} IST`;

/* ------------------------------------------------------------------ */
/* streak engine — everything derived from history                     */
/* ------------------------------------------------------------------ */

function historyBest(completions: string[]): number {
  const nums = completions.map(keyToNum).sort((a, b) => a - b);
  let best = 0, run = 0, prev: number | null = null;
  for (const n of nums) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = n;
  }
  return best;
}

/** Keeps the all-time record monotonic: it can rise, never fall. */
function syncRecord(goal: Goal): Goal {
  return { ...goal, bestStreakRecord: Math.max(goal.bestStreakRecord, historyBest(goal.completions)) };
}

function windowStartNum(goal: Goal): number {
  const nums = [keyToNum(goal.startDate), ...goal.completions.map(keyToNum)];
  return Math.min(...nums);
}

function computeStats(goal: Goal, todayKey: string): Stats {
  const done = new Set(goal.completions);
  const todayNum = keyToNum(todayKey);
  const startNum = Math.min(windowStartNum(goal), todayNum);

  let current = 0;
  let cursor = done.has(todayKey) ? todayNum : todayNum - 1;
  while (done.has(numToKey(cursor))) { current++; cursor--; }

  let missed = 0;
  for (let n = startNum; n < todayNum; n++) if (!done.has(numToKey(n))) missed++;

  const total = done.size;
  const resolved = total + missed;

  return {
    current,
    best: Math.max(goal.bestStreakRecord, historyBest(goal.completions), current),
    total,
    missed,
    rate: resolved ? Math.round((total / resolved) * 100) : 0,
    trackedDays: todayNum - startNum + 1,
  };
}

function dayState(key: string, goal: Goal, todayKey: string, done: Set<string>): DayState {
  if (done.has(key)) return "completed";
  if (key === todayKey) return "today";
  if (key > todayKey) return "upcoming";
  return keyToNum(key) < windowStartNum(goal) ? "prestart" : "missed";
}

/* ------------------------------------------------------------------ */
/* shared UI atoms                                                    */
/* ------------------------------------------------------------------ */

const CARD = "rounded-2xl border-2 border-foreground bg-card shadow-[5px_5px_0_0_var(--color-foreground)]";
const INPUT =
  "mt-1.5 w-full min-w-0 rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold " +
  "shadow-[2px_2px_0_0_var(--color-foreground)] outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)]";
const LABEL = "text-[11px] font-bold uppercase tracking-wide text-muted-foreground";
const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-foreground bg-primary px-4 py-2.5 " +
  "text-sm font-black text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 active:translate-y-0";
const BTN_GHOST =
  "inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1.5 " +
  "text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 active:translate-y-0";

function Modal({
  title, icon, onClose, children, wide,
}: {
  title: string; icon?: React.ReactNode; onClose: () => void;
  children: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-3 backdrop-blur-sm no-print sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full overflow-y-auto ${wide ? "max-w-xl" : "max-w-md"} ${CARD} p-4 sm:p-6`}
      >
        <div className="mb-4 flex items-center justify-between gap-3 border-b-2 border-foreground/10 pb-3">
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-black uppercase tracking-wide sm:text-base">
            {icon}<span className="truncate">{title}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full border-2 border-foreground bg-background p-1.5 shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatTile({
  label, value, icon, accent, sub,
}: { label: string; value: string; icon: React.ReactNode; accent?: string; sub?: string }) {
  return (
    <div
      className="flex min-w-0 flex-col justify-between rounded-2xl border-2 border-foreground bg-card p-3 sm:p-4 shadow-[4px_4px_0_0_var(--color-foreground)]"
      style={accent ? { backgroundColor: `${accent}14` } : undefined}
    >
      <div className={`flex items-center gap-1.5 truncate ${LABEL}`}>
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 truncate text-xl font-black tabular-nums text-foreground sm:text-2xl md:text-3xl">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[10px] font-bold text-muted-foreground">{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* main tool                                                          */
/* ------------------------------------------------------------------ */

type ConfirmState = {
  title: string; message: string; confirmLabel: string;
  tone: "primary" | "danger"; onConfirm: () => void;
} | null;

export default function StreakTracker() {
  const { showSupportPrompt } = useSupportPrompt();

  const [loaded, setLoaded] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [todayKey, setTodayKey] = useState(istTodayKey);
  const [cursor, setCursor] = useState(() => { const { y, m } = istNow(); return { y, m }; });

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);

  /* ---- persistence ---- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.goals)) {
          setGoals(
            parsed.goals.map((g: Goal) => syncRecord({
              ...g,
              description: g.description ?? "",
              completions: Array.from(new Set(g.completions ?? [])).sort(),
              bestStreakRecord: g.bestStreakRecord ?? 0,
            })),
          );
        }
      }
    } catch {
      console.warn("Could not load streak data");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ goals, version: 1 }));
  }, [goals, loaded]);

  /* ---- IST midnight rollover: today becomes missed on its own ---- */
  useEffect(() => {
    let timer: number;
    const arm = () => {
      timer = window.setTimeout(() => { setTodayKey(istTodayKey()); arm(); }, msUntilIstMidnight());
    };
    arm();
    const onVisible = () => { if (document.visibilityState === "visible") setTodayKey(istTodayKey()); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  const activeGoal = useMemo(() => goals.find((g) => g.id === activeId) ?? null, [goals, activeId]);
  const statsById = useMemo(
    () => Object.fromEntries(goals.map((g) => [g.id, computeStats(g, todayKey)])) as Record<string, Stats>,
    [goals, todayKey],
  );

  /* ---- mutations ---- */
  const setDay = useCallback((goalId: string, key: string, done: boolean) => {
    setGoals((prev) => prev.map((g) => {
      if (g.id !== goalId) return g;
      const completions = done
        ? Array.from(new Set([...g.completions, key])).sort()
        : g.completions.filter((k) => k !== key);
      return syncRecord({ ...g, completions });
    }));
  }, []);

  const celebrate = (goal: Goal, key: string) => {
    const next = computeStats(
      { ...goal, completions: Array.from(new Set([...goal.completions, key])).sort() },
      todayKey,
    );
    if (MILESTONES.includes(next.current)) {
      toast.success(`${next.current}-day streak on ${goal.name}. Record holding strong.`);
    } else {
      toast.success(`${prettyDate(key)} marked complete.`);
    }
    showSupportPrompt();
  };

  const handleDayClick = (goal: Goal, key: string) => {
    const done = goal.completions.includes(key);

    if (done) {
      setDay(goal.id, key, false);
      toast(`Completion removed for ${prettyDate(key)}.`, { icon: <Undo2 className="h-4 w-4" /> });
      return;
    }
    if (key > todayKey) {
      toast.error("That day has not arrived yet in IST.");
      return;
    }
    if (key === todayKey) {
      setDay(goal.id, key, true);
      celebrate(goal, key);
      return;
    }

    const beforeStart = keyToNum(key) < windowStartNum(goal);
    setConfirm({
      title: beforeStart ? "Before you started" : "Missed day",
      message: beforeStart
        ? `${prettyDate(key)} is before you started this goal. Do you want to count it as completed anyway?`
        : `You missed this day. Do you want to mark it as successful anyway?`,
      confirmLabel: "Mark as completed",
      tone: "primary",
      onConfirm: () => { setDay(goal.id, key, true); celebrate(goal, key); },
    });
  };

  const openCreate = () => {
    setEditingId(null);
    setName(""); setDescription(""); setIcon(null); setColor(null);
    setFormOpen(true);
  };

  const openEdit = (goal: Goal) => {
    setEditingId(goal.id);
    setName(goal.name); setDescription(goal.description);
    setIcon(goal.icon); setColor(goal.color);
    setFormOpen(true);
  };

  const submitGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Give this goal a name."); return; }

    if (editingId) {
      setGoals((prev) => prev.map((g) => g.id === editingId
        ? { ...g, name: trimmed, description: description.trim(), icon, color }
        : g));
      toast.success("Goal updated.");
    } else {
      const goal: Goal = {
        id: crypto.randomUUID(),
        name: trimmed,
        description: description.trim(),
        icon,
        color,
        startDate: todayKey,
        completions: [],
        bestStreakRecord: 0,
        createdAt: Date.now(),
      };
      setGoals((prev) => [goal, ...prev]);
      setActiveId(goal.id);
      const { y, m } = istNow();
      setCursor({ y, m });
      toast.success("Goal created. Day one starts now.");
      showSupportPrompt();
    }
    setFormOpen(false);
  };

  const askDelete = (goal: Goal) => setConfirm({
    title: "Delete goal",
    message: `Delete "${goal.name}" and its entire completion history from this device? This cannot be undone.`,
    confirmLabel: "Delete goal",
    tone: "danger",
    onConfirm: () => {
      setGoals((prev) => prev.filter((g) => g.id !== goal.id));
      setActiveId((id) => (id === goal.id ? null : id));
      toast.error("Goal deleted.");
    },
  });

  const openGoal = (goal: Goal) => {
    setActiveId(goal.id);
    const { y, m } = istNow();
    setCursor({ y, m });
  };

  if (!loaded) return null;

  return (
    <div className="w-full max-w-full overflow-x-hidden space-y-6 print:bg-white print:p-8 print:text-black">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-section, .print-section * { visibility: visible; }
          .print-section { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
        .print-only { display: none; }
      `}</style>

      {activeGoal
        ? <GoalView
            goal={activeGoal}
            stats={statsById[activeGoal.id]}
            todayKey={todayKey}
            cursor={cursor}
            setCursor={setCursor}
            onBack={() => setActiveId(null)}
            onDayClick={handleDayClick}
            onEdit={() => openEdit(activeGoal)}
            onDelete={() => askDelete(activeGoal)}
            onExport={() => { window.print(); showSupportPrompt(); }}
          />
        : <Overview
            goals={goals}
            statsById={statsById}
            todayKey={todayKey}
            onOpen={openGoal}
            onCreate={openCreate}
            onMarkToday={(g) => {
              if (g.completions.includes(todayKey)) {
                setDay(g.id, todayKey, false);
                toast(`Today unmarked for ${g.name}.`, { icon: <Undo2 className="h-4 w-4" /> });
              } else {
                setDay(g.id, todayKey, true);
                celebrate(g, todayKey);
              }
            }}
          />}

      {formOpen && (
        <Modal
          wide
          title={editingId ? "Edit goal" : "New goal"}
          icon={<Target className="h-4 w-4 text-primary" />}
          onClose={() => setFormOpen(false)}
        >
          <form onSubmit={submitGoal} className="space-y-4">
            <label className="block w-full min-w-0">
              <span className={LABEL}>Goal name</span>
              <input
                type="text"
                value={name}
                maxLength={60}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="e.g. Read 20 pages, Gym, No sugar..."
                className={INPUT}
              />
            </label>

            <label className="block w-full min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className={LABEL}>
                  Description <span className="font-normal text-muted-foreground/70">(optional)</span>
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground">{description.length}/160</span>
              </div>
              <textarea
                value={description}
                maxLength={160}
                rows={3}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Why this streak matters to you"
                className={`${INPUT} resize-none break-words`}
              />
            </label>

            <div className="w-full min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={LABEL}>
                  Icon <span className="font-normal text-muted-foreground/70">(optional)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIcon(null)}
                  className="rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-[10px] font-bold uppercase transition-transform hover:-translate-y-0.5"
                >
                  Default
                </button>
              </div>
              <div className="mt-2 max-h-48 sm:max-h-56 space-y-3 overflow-y-auto rounded-xl border-2 border-foreground bg-background p-2.5 sm:p-3 shadow-[2px_2px_0_0_var(--color-foreground)]">
                {ICON_GROUPS.map((group) => (
                  <div key={group.label} className="min-w-0">
                    <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(group.icons).map(([key, Cmp]) => (
                        <button
                          key={key}
                          type="button"
                          aria-label={key}
                          aria-pressed={icon === key}
                          onClick={() => setIcon(key)}
                          className={`rounded-lg border-2 border-foreground p-2 transition-transform hover:-translate-y-0.5 active:translate-y-0 ${
                            icon === key
                              ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
                              : "bg-card"
                          }`}
                        >
                          <Cmp className="h-4 w-4" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={LABEL}>
                  Accent colour <span className="font-normal text-muted-foreground/70">(optional)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setColor(null)}
                  className="rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-[10px] font-bold uppercase transition-transform hover:-translate-y-0.5"
                >
                  Default
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`h-8 w-8 rounded-lg border-2 border-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0 ${
                      color === c ? "shadow-[2px_2px_0_0_var(--color-foreground)] ring-2 ring-foreground ring-offset-2 ring-offset-card" : ""
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
              <button type="button" onClick={() => setFormOpen(false)} className={`${BTN_GHOST} w-full sm:w-auto`}>
                Cancel
              </button>
              <button type="submit" className={`${BTN_PRIMARY} w-full sm:flex-1`}>
                <Check className="h-4 w-4" /> {editingId ? "Save changes" : "Create goal"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirm && (
        <Modal
          title={confirm.title}
          icon={<AlertTriangle className={`h-4 w-4 ${confirm.tone === "danger" ? "text-red-500" : "text-primary"}`} />}
          onClose={() => setConfirm(null)}
        >
          <p className="text-sm font-semibold text-foreground break-words">{confirm.message}</p>
          <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2">
            <button type="button" onClick={() => setConfirm(null)} className={`${BTN_GHOST} w-full sm:w-auto`}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { confirm.onConfirm(); setConfirm(null); }}
              className={
                confirm.tone === "danger"
                  ? `${BTN_PRIMARY} w-full sm:flex-1 bg-red-500 text-white`
                  : `${BTN_PRIMARY} w-full sm:flex-1`
              }
            >
              {confirm.confirmLabel}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* overview / empty state                                             */
/* ------------------------------------------------------------------ */

function Overview({
  goals, statsById, todayKey, onOpen, onCreate, onMarkToday,
}: {
  goals: Goal[]; statsById: Record<string, Stats>; todayKey: string;
  onOpen: (g: Goal) => void; onCreate: () => void; onMarkToday: (g: Goal) => void;
}) {
  const pendingToday = goals.filter((g) => !g.completions.includes(todayKey)).length;

  return (
    <div className="space-y-6 w-full min-w-0">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-xs sm:text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <Flame className="h-3.5 w-3.5" />
          Streak Tracker
        </span>
        {goals.length > 0 && (
          <button type="button" onClick={onCreate} className={BTN_GHOST}>
            <Plus className="h-3.5 w-3.5" /> Add Goal
          </button>
        )}
      </div>

      {goals.length === 0 ? (
        <div className={`${CARD} p-6 sm:p-10 text-center`}>
          <div className="mx-auto mb-4 inline-flex rounded-2xl border-2 border-foreground bg-primary/10 p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
            <Flame className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-base sm:text-lg font-black uppercase tracking-wide">No streaks yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-xs sm:text-sm font-semibold text-muted-foreground">
            Create your first goal and start a chain you will not want to break. Everything stays
            on this device, tracked on IST days.
          </p>
          <button type="button" onClick={onCreate} className={`${BTN_PRIMARY} mx-auto mt-5`}>
            <Plus className="h-4 w-4" /> Add Goal
          </button>
        </div>
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-foreground bg-gradient-to-r from-amber-400/10 to-red-500/10 p-3.5 sm:p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
            <p className="text-xs sm:text-sm font-bold truncate">
              {pendingToday === 0
                ? <>Every goal is marked for today. Chain intact.</>
                : <><strong>{pendingToday}</strong> {pendingToday === 1 ? "goal is" : "goals are"} still open for today.</>}
            </p>
            <span className="shrink-0 rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-xs font-black text-primary shadow-[1px_1px_0_0_var(--color-foreground)]">
              {goals.length} {goals.length === 1 ? "goal" : "goals"}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {goals.map((goal) => {
              const s = statsById[goal.id];
              const accent = goal.color ?? "var(--color-primary)";
              const doneToday = goal.completions.includes(todayKey);
              const done = new Set(goal.completions);
              const strip = Array.from({ length: 7 }, (_, i) => numToKey(keyToNum(todayKey) - 6 + i));

              return (
                <div
                  key={goal.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(goal)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(goal); } }}
                  className={`${CARD} flex flex-col justify-between overflow-hidden cursor-pointer p-4 transition-transform hover:-translate-y-0.5 active:translate-y-0`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className="shrink-0 rounded-xl border-2 border-foreground p-2.5 shadow-[2px_2px_0_0_var(--color-foreground)]"
                      style={{ backgroundColor: goal.color ? `${goal.color}26` : "var(--color-primary)" , color: goal.color ?? "var(--color-primary-foreground)" }}
                    >
                      <GoalIcon goal={goal} className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="truncate text-sm font-black text-foreground">{goal.name}</p>
                      <p className="line-clamp-2 break-words text-[11px] font-semibold text-muted-foreground">
                        {goal.description || `Since ${prettyDate(goal.startDate)}`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-1.5 sm:gap-2 text-center">
                    <div className="min-w-0 overflow-hidden rounded-xl border-2 border-foreground bg-background py-1.5 sm:py-2">
                      <p className="truncate text-base sm:text-lg font-black tabular-nums" style={{ color: accent }}>{s.current}</p>
                      <p className="truncate text-[9px] font-black uppercase text-muted-foreground">Current</p>
                    </div>
                    <div className="min-w-0 overflow-hidden rounded-xl border-2 border-foreground bg-background py-1.5 sm:py-2">
                      <p className="truncate text-base sm:text-lg font-black tabular-nums">{s.best}</p>
                      <p className="truncate text-[9px] font-black uppercase text-muted-foreground">Best</p>
                    </div>
                    <div className="min-w-0 overflow-hidden rounded-xl border-2 border-foreground bg-background py-1.5 sm:py-2">
                      <p className="truncate text-base sm:text-lg font-black tabular-nums">{s.rate}%</p>
                      <p className="truncate text-[9px] font-black uppercase text-muted-foreground">Rate</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-1">
                    {strip.map((k) => {
                      const st = dayState(k, goal, todayKey, done);
                      return (
                        <span
                          key={k}
                          title={`${prettyDate(k)} — ${st}`}
                          className={`h-2 flex-1 rounded-sm border border-foreground ${
                            st === "completed" ? "bg-emerald-500"
                            : st === "missed" ? "bg-red-500"
                            : st === "today" ? "bg-primary/40"
                            : "bg-background"
                          }`}
                        />
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onMarkToday(goal); }}
                    className={`mt-3 w-full rounded-xl border-2 border-foreground px-3 py-2 text-xs font-black uppercase shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 active:translate-y-0 ${
                      doneToday ? "bg-emerald-500 text-white" : "bg-background text-foreground"
                    }`}
                  >
                    {doneToday
                      ? <span className="inline-flex items-center justify-center gap-1.5"><Check className="h-3.5 w-3.5" /> Done today</span>
                      : "Mark today"}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* single goal view: calendar + stats + report                         */
/* ------------------------------------------------------------------ */

function GoalView({
  goal, stats, todayKey, cursor, setCursor, onBack, onDayClick, onEdit, onDelete, onExport,
}: {
  goal: Goal; stats: Stats; todayKey: string;
  cursor: { y: number; m: number };
  setCursor: (c: { y: number; m: number }) => void;
  onBack: () => void;
  onDayClick: (goal: Goal, key: string) => void;
  onEdit: () => void; onDelete: () => void; onExport: () => void;
}) {
  const accent = goal.color ?? "var(--color-primary)";
  const done = useMemo(() => new Set(goal.completions), [goal.completions]);

  const grid = useMemo(() => {
    const first = new Date(Date.UTC(cursor.y, cursor.m - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(cursor.y, cursor.m, 0)).getUTCDate();
    return {
      blanks: Array.from({ length: first }, (_, i) => i),
      days: Array.from({ length: days }, (_, i) => `${cursor.y}-${pad(cursor.m)}-${pad(i + 1)}`),
    };
  }, [cursor]);

  const monthly = useMemo(() => {
    const startNum = Math.min(windowStartNum(goal), keyToNum(todayKey));
    const todayNum = keyToNum(todayKey);
    const map = new Map<string, { completed: number; missed: number }>();
    for (let n = startNum; n <= todayNum; n++) {
      const key = numToKey(n);
      const bucket = key.slice(0, 7);
      const row = map.get(bucket) ?? { completed: 0, missed: 0 };
      if (done.has(key)) row.completed++;
      else if (n < todayNum) row.missed++;
      map.set(bucket, row);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 12);
  }, [goal, todayKey, done]);

  const shift = (delta: number) => {
    const total = cursor.y * 12 + (cursor.m - 1) + delta;
    setCursor({ y: Math.floor(total / 12), m: (total % 12) + 1 });
  };

  const jumpToday = () => { const { y, m } = istNow(); setCursor({ y, m }); };

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* action toolbar */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2.5 no-print">
        <button type="button" onClick={onBack} className={BTN_GHOST}>
          <ArrowLeft className="h-3.5 w-3.5" /> All goals
        </button>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button type="button" onClick={onEdit} className={BTN_GHOST}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className={`${BTN_GHOST} hover:bg-red-500 hover:text-white`}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
          <button type="button" onClick={onExport} className={BTN_GHOST}>
            <Download className="h-3.5 w-3.5" /> Export PDF
          </button>
        </div>
      </div>

      <div className="print-section space-y-6 w-full min-w-0">
        <div className="print-only mb-4 border-b-2 border-foreground pb-2">
          <h2 className="text-xl font-black uppercase">Streak Report</h2>
          <p className="text-xs text-muted-foreground">Generated {reportStamp()} via Quickly.</p>
        </div>

        {/* goal header */}
        <div className={`${CARD} p-4 sm:p-6 overflow-hidden`}>
          <div className="flex min-w-0 flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex min-w-0 items-start sm:items-center gap-3.5">
              <div
                className="shrink-0 rounded-2xl border-2 border-foreground p-3 shadow-[3px_3px_0_0_var(--color-foreground)]"
                style={{ backgroundColor: goal.color ? `${goal.color}26` : "var(--color-primary)", color: goal.color ?? "var(--color-primary-foreground)" }}
              >
                <GoalIcon goal={goal} className="h-6 w-6 sm:h-7 sm:s-7" />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <h1 className="truncate text-lg sm:text-2xl font-black uppercase tracking-wide text-foreground">
                  {goal.name}
                </h1>
                {goal.description && (
                  <p className="mt-0.5 text-xs sm:text-sm font-semibold text-muted-foreground break-words overflow-hidden">
                    {goal.description}
                  </p>
                )}
                <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground/80">
                  Tracking since {prettyDate(goal.startDate)} (IST)
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onDayClick(goal, todayKey)}
              className={`${BTN_PRIMARY} no-print w-full sm:w-auto shrink-0 ${done.has(todayKey) ? "bg-emerald-500 text-white" : ""}`}
            >
              {done.has(todayKey)
                ? <><Undo2 className="h-4 w-4" /> Undo today</>
                : <><Check className="h-4 w-4" /> Mark today complete</>}
            </button>
          </div>

          <div className="mt-4 pt-3 border-t-2 border-foreground/10">
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wide text-muted-foreground">
              <span>Completion rate</span>
              <span className="tabular-nums text-foreground">{stats.rate}%</span>
            </div>
            <div className="mt-1.5 h-3 overflow-hidden rounded-full border-2 border-foreground bg-background">
              <div className="h-full transition-all" style={{ width: `${stats.rate}%`, backgroundColor: accent }} />
            </div>
          </div>
        </div>

        {/* stats */}
        <div className="grid gap-2.5 sm:gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile
            label="Current Streak" value={`${stats.current}`} sub={stats.current === 1 ? "day" : "days"}
            icon={<Flame className="h-4 w-4" style={{ color: accent }} />} accent={goal.color ?? undefined}
          />
          <StatTile
            label="Best Streak" value={`${stats.best}`} sub="all-time record"
            icon={<Trophy className="h-4 w-4 text-amber-500" />}
          />
          <StatTile
            label="Completed" value={`${stats.total}`} sub={`of ${stats.trackedDays} days`}
            icon={<CalendarCheck className="h-4 w-4 text-emerald-500" />}
          />
          <StatTile
            label="Missed" value={`${stats.missed}`} sub="days passed unmarked"
            icon={<X className="h-4 w-4 text-red-500" />}
          />
          <StatTile
            label="Rate" value={`${stats.rate}%`} sub="completed vs resolved"
            icon={<Percent className="h-4 w-4 text-primary" />}
          />
        </div>

        {/* calendar */}
        <div className={`${CARD} p-3.5 sm:p-5 overflow-hidden`}>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm sm:text-base font-black uppercase tracking-wide truncate">
              {MONTHS[cursor.m - 1]} {cursor.y}
            </h3>
            <div className="flex items-center gap-1.5 sm:gap-2 no-print">
              <button type="button" onClick={jumpToday} className={BTN_GHOST}>Today</button>
              <button
                type="button" aria-label="Previous month" onClick={() => shift(-1)}
                className="rounded-full border-2 border-foreground bg-background p-1.5 shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button" aria-label="Next month" onClick={() => shift(1)}
                className="rounded-full border-2 border-foreground bg-background p-1.5 shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="pb-1 text-center text-[9px] sm:text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                {d}
              </div>
            ))}
            {grid.blanks.map((b) => <div key={`b${b}`} />)}
            {grid.days.map((key) => {
              const state = dayState(key, goal, todayKey, done);
              const dayNum = Number(key.slice(-2));
              const styles: Record<DayState, string> = {
                completed: "border-foreground bg-emerald-500 text-white shadow-[2px_2px_0_0_var(--color-foreground)]",
                missed: "border-foreground bg-red-500 text-white shadow-[2px_2px_0_0_var(--color-foreground)]",
                today: "border-foreground bg-primary/25 text-foreground shadow-[2px_2px_0_0_var(--color-foreground)] ring-2 ring-inset ring-primary",
                upcoming: "border-foreground/25 bg-background text-muted-foreground",
                prestart: "border-dashed border-foreground/25 bg-secondary/20 text-muted-foreground/60",
              };
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onDayClick(goal, key)}
                  title={`${prettyDate(key)} — ${state === "today" ? "active today" : state}`}
                  aria-label={`${prettyDate(key)}, ${state}`}
                  className={`relative flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-lg border-2 text-[11px] sm:text-sm font-black tabular-nums transition-transform hover:-translate-y-0.5 active:translate-y-0 ${styles[state]}`}
                >
                  <span>{dayNum}</span>
                  {state === "completed" && <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3" />}
                  {state === "missed" && <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />}
                  {state === "today" && (
                    <span className="text-[7px] sm:text-[8px] font-black uppercase leading-none">Today</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-2 border-t-2 border-foreground/15 pt-3 text-[9px] sm:text-[10px] font-black uppercase tracking-wide text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-sm border-2 border-foreground bg-emerald-500" /> Completed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-sm border-2 border-foreground bg-red-500" /> Missed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-sm border-2 border-foreground bg-primary/25" /> Today / active
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-sm border-2 border-foreground/25 bg-background" /> Upcoming
            </span>
          </div>

          <p className="mt-3 text-[10px] font-semibold text-muted-foreground no-print leading-relaxed">
            Tap any day to mark or undo it. Today stays active until 12:00 AM IST, then rolls over to
            missed on its own. Data is saved only in this browser.
          </p>
        </div>

        {/* monthly progress overview */}
        <div className={`${CARD} p-4 sm:p-5 overflow-hidden`}>
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wide">Monthly progress</h3>
          {monthly.length === 0 ? (
            <div className="mt-3 rounded-xl border-2 border-dashed border-foreground/30 p-6 text-center text-muted-foreground">
              <Ghost className="mx-auto mb-2 h-7 w-7 opacity-50" />
              <p className="text-xs sm:text-sm font-bold">Nothing tracked yet.</p>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {monthly.map(([bucket, row]) => {
                const [y, m] = bucket.split("-").map(Number);
                const resolved = row.completed + row.missed;
                const pct = resolved ? Math.round((row.completed / resolved) * 100) : 0;
                return (
                  <li key={bucket} className="rounded-xl border-2 border-foreground bg-background p-2.5 sm:p-3 shadow-[2px_2px_0_0_var(--color-foreground)]">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-black uppercase">{MONTHS[m - 1].slice(0, 3)} {y}</span>
                      <span className="flex items-center gap-2 text-[10px] font-black uppercase">
                        <span className="text-emerald-600 dark:text-emerald-400">{row.completed} done</span>
                        <span className="text-red-500">{row.missed} missed</span>
                        <span className="tabular-nums text-muted-foreground">{pct}%</span>
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full border border-foreground bg-card">
                      <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="print-only text-[10px] text-muted-foreground">
          Report date: {reportStamp()} · Goal started {prettyDate(goal.startDate)} · Current streak{" "}
          {stats.current} · Best streak {stats.best} · Completed {stats.total} · Missed {stats.missed} ·
          Completion rate {stats.rate}%
        </p>
      </div>
    </div>
  );
}