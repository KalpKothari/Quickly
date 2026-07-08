import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PiggyBank, Plus, Trash2, Sparkles, Target, Wallet, PartyPopper, Layers, CheckCircle2 } from "lucide-react";
import { formatINR } from "@/lib/format";

type Contribution = { id: string; amount: number; note: string; at: number };
type GoalItem = { id: string; name: string; target: number; contributions: Contribution[]; completed?: boolean };
type SavedStateV2 = { activeGoalId: string; goals: GoalItem[] };

const STORAGE_KEY_V2 = "quickly-savings-multi-goal-v2";

const DEFAULT_GOALS: GoalItem[] = [
  { id: "goal-1", name: "Dream Vacation", target: 50000, contributions: [], completed: false },
  { id: "goal-2", name: "New Laptop", target: 80000, contributions: [], completed: false },
];

const GOAL_PRESETS = [10000, 25000, 50000, 100000, 500000];
const AMOUNT_PRESETS = [50, 100, 500, 1000, 5000];

function triggerSpeechCelebration() {
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel(); 
      const utterance = new SpeechSynthesisUtterance("Goal achieved! Excellent job!");
       utterance.rate = 1.0;
      utterance.pitch = 1.2; 
      window.speechSynthesis.speak(utterance);
    }
  } catch (e) {
    console.warn("Speech engine failed on this device:", e);
  }
}

function milestoneMessage(pct: number): string {
  if (pct >= 100) return "Goal smashed! Time to celebrate";
  if (pct >= 75) return "So close, keep going! ";
  if (pct >= 50) return "Halfway there, oink oink! ";
  if (pct >= 25) return "Nice progress, the piggy's filling up!";
  if (pct > 0) return "Great start — every coin counts!";
  return "Add your first coin to get rolling!";
}

function loadState(): SavedStateV2 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (!raw) return { activeGoalId: "goal-1", goals: DEFAULT_GOALS };
    const parsed = JSON.parse(raw);
    if (!parsed?.activeGoalId || !Array.isArray(parsed?.goals)) {
      return { activeGoalId: "goal-1", goals: DEFAULT_GOALS };
    }
    return parsed as SavedStateV2;
  } catch {
    return { activeGoalId: "goal-1", goals: DEFAULT_GOALS };
  }
}

function timeAgo(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return `Today, ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  if (isYesterday) return `Yesterday, ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function SavingsGoalCalculator() {
  const [loaded, setLoaded] = useState(false);
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [activeGoalId, setActiveGoalId] = useState("");
  
  const [amount, setAmount] = useState("100");
  const [note, setNote] = useState("");
  const [coinBurst, setCoinBurst] = useState(false);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const s = loadState();
    setGoals(s.goals);
    setActiveGoalId(s.activeGoalId);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ activeGoalId, goals }));
    } catch {
      /* storage unavailable */
    }
  }, [loaded, activeGoalId, goals]);

  useEffect(() => () => { if (burstTimer.current) clearTimeout(burstTimer.current); }, []);

  const activeGoals = useMemo(() => goals.filter((g) => !g.completed), [goals]);
  const completedGoals = useMemo(() => goals.filter((g) => g.completed), [goals]);

  const activeGoal = useMemo(() => {
    return goals.find((g) => g.id === activeGoalId) || activeGoals[0] || goals[0] || DEFAULT_GOALS[0];
  }, [goals, activeGoalId, activeGoals]);

  const saved = useMemo(() => {
    return activeGoal.contributions.reduce((s, c) => s + c.amount, 0);
  }, [activeGoal]);

  const pct = activeGoal.target > 0 ? Math.min(100, (saved / activeGoal.target) * 100) : 0;
  const remaining = Math.max(0, activeGoal.target - saved);
  const goalReached = activeGoal.target > 0 && saved >= activeGoal.target;

  const handleAddNewGoal = () => {
    const newId = `goal-${Date.now()}`;
    const newGoal: GoalItem = {
      id: newId,
      name: "New Savings Fund",
      target: 25000,
      contributions: [],
      completed: false,
    };
    setGoals((prev) => [...prev, newGoal]);
    setActiveGoalId(newId);
    toast.success("Created a brand new piggy bank!");
  };

  const handleDeleteGoal = (idToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = goals.filter((g) => g.id !== idToDelete);
    setGoals(filtered);
    if (activeGoalId === idToDelete && filtered.length > 0) {
      setActiveGoalId(filtered[0].id);
    }
    toast.error("Piggy Bank broken and removed permanently.");
  };

  const handleMarkAsComplete = () => {
    setGoals((prev) =>
      prev.map((g) => (g.id === activeGoal.id ? { ...g, completed: true } : g))
    );
    triggerSpeechCelebration(); 
    toast.success("🎉 Incredible! You made it happen! Moved to Completed Triumphs!");
  };

  const handleUpdateActiveGoalName = (val: string) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === activeGoal.id ? { ...g, name: val } : g))
    );
  };

  const handleUpdateActiveGoalTarget = (val: number) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === activeGoal.id ? { ...g, target: Math.max(0, val) } : g))
    );
  };

  const addMoney = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { toast.error("Enter an amount greater than 0"); return; }
    
    const entry: Contribution = { id: crypto.randomUUID(), amount: val, note: note.trim(), at: Date.now() };
    
    setGoals((prev) =>
      prev.map((g) => (g.id === activeGoal.id ? { ...g, contributions: [entry, ...g.contributions] } : g))
    );
    
    setNote("");
    setCoinBurst(true);
    if (burstTimer.current) clearTimeout(burstTimer.current);
    burstTimer.current = setTimeout(() => setCoinBurst(false), 700);
    
    toast.success(`🪙 Added ${formatINR(val)} to your piggy bank`);

    const projectedSavings = saved + val;
    if (projectedSavings >= activeGoal.target && saved < activeGoal.target) {
      setTimeout(() => triggerSpeechCelebration(), 100);
    }
  };

  const removeEntry = (id: string) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === activeGoal.id ? { ...g, contributions: g.contributions.filter((c) => c.id !== id) } : g))
    );
  };

  const resetAll = () => {
    setGoals((prev) =>
      prev.map((g) => (g.id === activeGoal.id ? { ...g, contributions: [] } : g))
    );
    toast.success("Piggy bank emptied — fresh start!");
  };

  const fillLevelPercentage = activeGoal.completed ? 100 : pct;
  const fillY = 150 - (fillLevelPercentage / 100) * 116;

  return (
    <div className="w-full max-w-full space-y-6 overflow-x-hidden px-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex self-start items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <PiggyBank className="h-3.5 w-3.5" />
          Multi-Goal Savings Portal
        </span>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {activeGoals.map((g) => (
            <div
              key={g.id}
              onClick={() => setActiveGoalId(g.id)}
              className={
                "group flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1 text-xs font-black shrink-0 cursor-pointer transition-transform hover:-translate-y-0.5 " +
                (activeGoal.id === g.id ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]" : "bg-card text-foreground")
              }
            >
              <span> {g.name || "Unnamed Fund"}</span>
              <button
                type="button"
                onClick={(e) => handleDeleteGoal(g.id, e)}
                className="rounded-full p-0.5 hover:bg-destructive hover:text-destructive-foreground opacity-60 group-hover:opacity-100 transition-opacity"
                aria-label="Delete goal"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={handleAddNewGoal}
            className="rounded-full border-2 border-dashed border-foreground/60 px-3 py-1 text-xs font-bold shrink-0 bg-background hover:bg-card flex items-center gap-1 text-muted-foreground hover:text-foreground shadow-[1px_1px_0_0_var(--color-foreground)]"
          >
            <Plus className="h-3 w-3" /> New Goal
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start max-w-full">
        {/* LEFT CARD — Visual animated gold fluid level */}
        <div className="space-y-4 rounded-2xl border-2 border-foreground bg-gradient-to-br from-pink-500/10 to-amber-400/10 p-4 sm:p-5 shadow-[5px_5px_0_0_var(--color-foreground)] min-w-0">
          <div className="relative mx-auto w-full max-w-[280px]">
            {coinBurst && (
              <div className="pointer-events-none absolute inset-x-0 -top-4 flex justify-center gap-3 text-2xl z-20">
                <span className="animate-bounce [animation-delay:0ms]">🪙</span>
                <span className="animate-bounce [animation-delay:100ms]">🪙</span>
                <span className="animate-bounce [animation-delay:200ms]">🪙</span>
              </div>
            )}

            <svg viewBox="0 0 200 170" className="w-full drop-shadow-[3px_3px_0_0_var(--color-foreground)]">
              <defs>
                <clipPath id="pigBelly">
                  <circle cx="95" cy="92" r="58" />
                </clipPath>
                <linearGradient id="coinFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>

              <rect x="52" y="132" width="16" height="24" rx="8" fill="#f9a8d4" stroke="#26262e" strokeWidth="3" />
              <rect x="82" y="136" width="16" height="24" rx="8" fill="#f9a8d4" stroke="#26262e" strokeWidth="3" />
              <rect x="112" y="136" width="16" height="24" rx="8" fill="#f9a8d4" stroke="#26262e" strokeWidth="3" />
              <rect x="140" y="132" width="16" height="24" rx="8" fill="#f9a8d4" stroke="#26262e" strokeWidth="3" />

              <path d="M 40 92 Q 15 95 22 75 Q 32 82 24 95" fill="none" stroke="#26262e" strokeWidth="3.5" strokeLinecap="round" />
              <circle cx="95" cy="92" r="58" fill="#fce7f3" stroke="#26262e" strokeWidth="4" />

              <g clipPath="url(#pigBelly)">
                <rect x="0" y={fillY} width="200" height="170" fill="url(#coinFill)" opacity="0.95" />
              </g>
              <circle cx="95" cy="92" r="58" fill="none" stroke="#26262e" strokeWidth="4" />

              <path d="M 62 46 Q 52 18 72 24 Q 76 36 62 46 Z" fill="#f9a8d4" stroke="#26262e" strokeWidth="3" strokeLinejoin="round" />
              <path d="M 112 42 Q 102 14 122 18 Q 126 32 112 42 Z" fill="#f9a8d4" stroke="#26262e" strokeWidth="3" strokeLinejoin="round" />

              <ellipse cx="78" cy="98" rx="8" ry="5" fill="#f472b6" opacity="0.6" />
              <ellipse cx="128" cy="94" rx="8" ry="5" fill="#f472b6" opacity="0.6" />

              <ellipse cx="152" cy="96" rx="15" ry="12" fill="#f472b6" stroke="#26262e" strokeWidth="3" />
              <circle cx="147" cy="96" r="2" fill="#26262e" />
              <circle cx="157" cy="96" r="2" fill="#26262e" />

              <g fill="#26262e">
                <circle cx="94" cy="80" r="6" />
                <circle cx="124" cy="76" r="6" />
              </g>
              <g fill="#ffffff">
                <circle cx="92" cy="78" r="2" />
                <circle cx="122" cy="74" r="2" />
              </g>
              <rect x="82" y="34" width="26" height="7" rx="3.5" fill="#26262e" />
            </svg>
          </div>

          <div className="text-center">
            <div className="text-3xl font-black tracking-tight">{Math.round(fillLevelPercentage)}%</div>
            <p className="mt-1 text-sm font-bold text-foreground/70">
              {activeGoal.completed ? "You Made It Happen!" : milestoneMessage(pct)}
            </p>
          </div>

          <div className="h-4 w-full overflow-hidden rounded-full border-2 border-foreground bg-card">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-pink-400 transition-[width] duration-500"
              style={{ width: `${fillLevelPercentage}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border-2 border-foreground bg-card p-3 text-center shadow-[2px_2px_0_0_var(--color-foreground)] min-w-0">
              <div className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-foreground/60">
                <Wallet className="h-3 w-3" /> Stashed
              </div>
              <div className="mt-1 text-base sm:text-lg font-bold truncate">{formatINR(saved)}</div>
            </div>
            <div className="rounded-xl border-2 border-foreground bg-card p-3 text-center shadow-[2px_2px_0_0_var(--color-foreground)] min-w-0">
              <div className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-foreground/60">
                <Target className="h-3 w-3" /> Left to go
              </div>
              <div className="mt-1 text-base sm:text-lg font-bold truncate">{activeGoal.completed ? formatINR(0) : formatINR(remaining)}</div>
            </div>
          </div>

          {goalReached && !activeGoal.completed && (
            <button
              type="button"
              onClick={handleMarkAsComplete}
              className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-emerald-500 text-white p-3 text-center text-sm font-black shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 animate-bounce"
            >
              <CheckCircle2 className="h-4 w-4" /> Mark as Complete! ✨
            </button>
          )}
        </div>

        {/* RIGHT COLUMN — Inputs & stream logs */}
        <div className="space-y-4 min-w-0 max-w-full">
          {!activeGoal.completed ? (
            <>
              <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)] min-w-0">
                <span className="inline-flex items-center gap-1 rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                  <Sparkles className="h-3 w-3" /> Blueprint
                </span>
                <div className="mt-3 grid gap-3 grid-cols-1 sm:grid-cols-2">
                  <label className="block min-w-0">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">What are you saving for?</span>
                    <input
                      value={activeGoal.name}
                      onChange={(e) => handleUpdateActiveGoalName(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      aria-label="Goal name"
                      className="mt-1.5 w-full rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-foreground)] outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)] text-ellipsis overflow-hidden"
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Target amount</span>
                    <input
                      type="number"
                      min={0}
                      value={activeGoal.target}
                      onChange={(e) => handleUpdateActiveGoalTarget(+e.target.value || 0)}
                      onKeyDown={(e) => e.stopPropagation()}
                      aria-label="Target amount"
                      className="mt-1.5 w-full rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-foreground)] outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)]"
                    />
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {GOAL_PRESETS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleUpdateActiveGoalTarget(v)}
                      aria-pressed={activeGoal.target === v}
                      className={
                        "rounded-full border-2 border-foreground px-2.5 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 max-w-full truncate " +
                        (activeGoal.target === v ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]" : "bg-background")
                      }
                    >
                      {formatINR(v)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)] min-w-0">
                <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                  Feed the piggy bank
                </span>
                <div className="mt-3 flex gap-2">
                  <input
                    type="number"
                    min={0}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onKeyDown={(e) => { 
                      e.stopPropagation();
                      if (e.key === "Enter") addMoney(); 
                    }}
                    placeholder="Amount"
                    aria-label="Amount to add"
                    className="w-full min-w-0 rounded-xl border-2 border-foreground bg-background px-3 py-2.5 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-foreground)] outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)]"
                  />
                  <button
                    type="button"
                    onClick={addMoney}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-foreground bg-primary px-4 text-sm font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
                  >
                    <Plus className="h-4 w-4" /> Add
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {AMOUNT_PRESETS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAmount(String(v))}
                      className="rounded-full border-2 border-foreground bg-background px-2.5 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5"
                    >
                      +{formatINR(v)}
                    </button>
                  ))}
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addMoney(); } }}
                  placeholder="Note (optional) — e.g. saved on lunch"
                  aria-label="Note"
                  rows={2}
                  className="mt-3 w-full resize-none rounded-xl border-2 border-dashed border-foreground/30 bg-transparent px-3 py-2 text-xs font-medium outline-none focus:border-primary"
                />
              </div>
            </>
          ) : (
            <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-5 text-center shadow-[3px_3px_0_0_var(--color-foreground)]">
              <PartyPopper className="mx-auto h-10 w-10 text-emerald-600" />
              <h3 className="text-lg font-black text-emerald-700 dark:text-emerald-400">You Made It Happen!</h3>
              <p className="text-xs font-bold leading-relaxed text-muted-foreground">
                This goal has been fully unlocked and registered as a complete milestone achievement!
              </p>
            </div>
          )}


          <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)] min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex rounded-full border-2 border-foreground bg-secondary/40 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/70 flex items-center gap-1">
                <Layers className="h-3 w-3" /> Deposit History
              </span>
              {activeGoal.contributions.length > 0 && !activeGoal.completed && (
                <button
                  type="button"
                  onClick={resetAll}
                  className="inline-flex items-center gap-1 rounded-full border-2 border-foreground bg-background px-2.5 py-1 text-[11px] font-bold text-destructive transition-transform hover:-translate-y-0.5"
                >
                  <Trash2 className="h-3 w-3" /> Empty Piggy
                </button>
              )}
            </div>

            {activeGoal.contributions.length === 0 ? (
              <p className="mt-3 rounded-lg border-2 border-dashed border-foreground/30 px-3 py-4 text-center text-sm font-medium text-muted-foreground">
                No deposits logged for "{activeGoal.name}" yet!
              </p>
            ) : (
              <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
                {activeGoal.contributions.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-start gap-2 rounded-xl border-2 border-foreground bg-background px-3 py-2 shadow-[2px_2px_0_0_var(--color-foreground)] min-w-0"
                  >
                    <span className="text-lg select-none pt-0.5">🪙</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black truncate">{formatINR(c.amount)}</div>
                      <div className="text-[11px] font-medium text-muted-foreground break-words whitespace-pre-wrap leading-relaxed">
                        {timeAgo(c.at)}{c.note ? ` · ${c.note}` : ""}
                      </div>
                    </div>
                    {!activeGoal.completed && (
                      <button
                        type="button"
                        onClick={() => removeEntry(c.id)}
                        aria-label="Remove deposit"
                        className="shrink-0 rounded-full border-2 border-foreground bg-card p-1.5 transition-transform hover:-translate-y-0.5 self-center"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {completedGoals.length > 0 && (
            <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)] bg-emerald-500/5 min-w-0">
              <span className="inline-flex rounded-full border-2 border-foreground bg-emerald-500 text-white px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider">
               Completed Triumphs ({completedGoals.length})
              </span>
              <ul className="mt-3 space-y-2 max-h-36 overflow-y-auto pr-1">
                {completedGoals.map((g) => (
                  <li
                    key={g.id}
                    onClick={() => setActiveGoalId(g.id)}
                    className="flex items-center justify-between gap-2 rounded-xl border-2 border-foreground bg-background px-3 py-2 cursor-pointer shadow-[2px_2px_0_0_var(--color-foreground)] hover:-translate-y-0.5 transition-transform min-w-0"
                  >
                    <div className="truncate min-w-0">
                      <div className="text-xs font-black truncate text-emerald-600 dark:text-emerald-400">{g.name}</div>
                      <div className="text-[10px] font-medium text-muted-foreground truncate">Target: {formatINR(g.target)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteGoal(g.id, e)}
                      className="shrink-0 rounded-full border-2 border-foreground bg-card p-1 hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="rounded-lg border-2 border-dashed border-foreground/30 px-3 py-2 text-xs font-medium text-muted-foreground">
            All configuration states and complete badges are cached safely inside your browser session.
          </p>
        </div>
      </div>
    </div>
  );
}