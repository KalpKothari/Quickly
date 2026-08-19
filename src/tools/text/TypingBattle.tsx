import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  Swords, Play, Pause, RotateCcw, Volume2, VolumeX, Zap, Trophy,
  Skull, Flame, Keyboard, ChevronLeft, ShieldHalf, Crosshair,
} from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  config                                                             */
/* ------------------------------------------------------------------ */

type Difficulty = "easy" | "medium" | "hard" | "insane";
type Phase = "setup" | "countdown" | "battle" | "over";

type DiffCfg = {
  label: string;
  blurb: string;
  min: number; max: number;          // target length range
  playerHp: number; botHp: number;
  botCps: number;                    // bot chars-per-second
  botAcc: number;                    // bot chance to land a finished target
  botRest: [number, number];         // ms between bot targets
  botDmg: [number, number];          // bot hit damage range
  chip: number;                      // damage per correct keystroke
  base: number;                      // base damage of a completed target
  parCps: number;                    // "expected" player speed for this tier
  mistakeGift: number;               // ms of bot progress gifted on a typo
  lockMs: number;                    // input lockout after a typo
};

const DIFFS: Record<Difficulty, DiffCfg> = {
  easy: {
    label: "Easy", blurb: "Short targets. A patient opponent.",
    min: 2, max: 4, playerHp: 1000, botHp: 800,
    botCps: 2.4, botAcc: 0.74, botRest: [900, 1500], botDmg: [14, 20],
    chip: 1.8, base: 10, parCps: 2.6, mistakeGift: 260, lockMs: 240,
  },
  medium: {
    label: "Medium", blurb: "A fair trade. The default fight.",
    min: 3, max: 5, playerHp: 900, botHp: 1000,
    botCps: 3.6, botAcc: 0.86, botRest: [700, 1200], botDmg: [20, 30],
    chip: 1.4, base: 8, parCps: 3.4, mistakeGift: 340, lockMs: 280,
  },
  hard: {
    label: "Hard", blurb: "Longer targets. Fast, precise bot.",
    min: 4, max: 7, playerHp: 850, botHp: 1200,
    botCps: 5.0, botAcc: 0.92, botRest: [500, 900], botDmg: [24, 34],
    chip: 1.2, base: 7, parCps: 4.2, mistakeGift: 420, lockMs: 320,
  },
  insane: {
    label: "Insane", blurb: "Every keystroke counts. No mercy.",
    min: 5, max: 8, playerHp: 800, botHp: 1350,
    botCps: 6.4, botAcc: 0.97, botRest: [350, 700], botDmg: [28, 40],
    chip: 1.0, base: 6.5, parCps: 5.2, mistakeGift: 520, lockMs: 360,
  },
};

const ORDER: Difficulty[] = ["easy", "medium", "hard", "insane"];
const RAGE_AT = 70_000; // ms — both fighters hit harder so no stalemates

/* ------------------------------------------------------------------ */
/*  random target generation (100% client side, no word lists)         */
/* ------------------------------------------------------------------ */

const VOWELS = "aeiou";
// weighted pools — repeated letters are more likely to be picked
const CONS = "ttnnssrrllddcchmmggppbbffwwyykvjxqz";
const ALL = "eeeettttaaaooiinnssrrhhllddccuummffppggwwyybbvvkxjqz";
// bigrams that are genuinely unpleasant to type — never generated
const AWKWARD = new Set([
  "qz", "zq", "xq", "qx", "jq", "qj", "vq", "qv", "zx", "xz", "kq", "qk",
  "wq", "qw", "pq", "qp", "jx", "xj", "jz", "zj", "vx", "xv", "fq", "qf",
]);

const ri = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pk = (s: string) => s[Math.floor(Math.random() * s.length)];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

function makeTarget(min: number, max: number) {
  const len = ri(min, max);
  const syllabic = Math.random() < 0.5; // half word-like, half pure random
  let wantVowel = syllabic ? Math.random() < 0.3 : false;
  let out = "";
  let guard = 0;

  while (out.length < len && guard < 500) {
    guard++;
    const ch = syllabic ? (wantVowel ? pk(VOWELS) : pk(CONS)) : pk(ALL);
    const prev = out[out.length - 1];
    if (prev === ch) continue;                                   // no doubles
    if (prev && AWKWARD.has(prev + ch)) continue;                 // no finger-breakers
    if (out.length >= 2 && out[out.length - 2] === ch && prev && !VOWELS.includes(prev))
      continue;                                                   // no consonant stutter
    out += ch;
    if (syllabic) wantVowel = !wantVowel;
  }

  // keep longer targets pronounceable-ish
  if (len >= 4 && !/[aeiou]/.test(out)) {
    const i = ri(1, out.length - 2);
    out = out.slice(0, i) + pk(VOWELS) + out.slice(i + 1);
  }
  return out.toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  tiny WebAudio sfx engine (no files, no network)                    */
/* ------------------------------------------------------------------ */

type Sfx = "key" | "err" | "hit" | "crit" | "taken" | "miss" | "count" | "go" | "win" | "lose";

function useSfx(muted: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  return useCallback((kind: Sfx) => {
    if (muted || typeof window === "undefined") return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctxRef.current) ctxRef.current = new AC();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") void ctx.resume();

    const t0 = ctx.currentTime;
    const tone = (
      freq: number, dur: number, type: OscillatorType,
      vol: number, at = 0, slideTo?: number,
    ) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0 + at);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + at + dur);
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.03);
    };

    switch (kind) {
      case "key":   tone(500 + Math.random() * 110, 0.04, "square", 0.035); break;
      case "err":   tone(150, 0.16, "sawtooth", 0.06, 0, 80); break;
      case "hit":   tone(210, 0.13, "square", 0.075, 0, 95); break;
      case "crit":  tone(330, 0.08, "square", 0.09, 0, 720);
                    tone(880, 0.16, "triangle", 0.08, 0.07, 330); break;
      case "taken": tone(120, 0.18, "sawtooth", 0.07, 0, 62); break;
      case "miss":  tone(700, 0.07, "triangle", 0.05, 0, 420); break;
      case "count": tone(440, 0.11, "triangle", 0.08); break;
      case "go":    tone(660, 0.1, "square", 0.09); tone(990, 0.22, "square", 0.09, 0.1); break;
      case "win":   [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, "triangle", 0.08, i * 0.11)); break;
      case "lose":  [392, 330, 262, 196].forEach((f, i) => tone(f, 0.26, "sawtooth", 0.06, i * 0.13)); break;
    }
  }, [muted]);
}

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}

/* ------------------------------------------------------------------ */
/*  game state (mutable ref — React only re-renders on a throttle)     */
/* ------------------------------------------------------------------ */

type Floater = { id: number; text: string; kind: "dmg" | "crit" | "chip" | "miss"; dx: number; dy: number; die: number };
type Proj = { id: number; crit: boolean; die: number };

function freshGame(cfg: DiffCfg) {
  return {
    t: 0, cd: 3400, cdLabel: "",
    hpP: cfg.playerHp, hpB: cfg.botHp, maxP: cfg.playerHp, maxB: cfg.botHp,
    target: makeTarget(cfg.min, cfg.max),
    queued: makeTarget(cfg.min, cfg.max),
    typed: 0, targetStart: 0, clean: true,
    botTarget: makeTarget(cfg.min, cfg.max), botT: 0, botNeed: 1200, botRest: 900, botTyped: 0,
    combo: 0, bestCombo: 0, perfect: 0,
    chars: 0, correct: 0, errors: 0, targets: 0, crits: 0,
    dealt: 0, taken: 0, blocked: 0,
    lock: 0, lastKey: 0, errUntil: 0,
    fP: [] as Floater[], fB: [] as Floater[],
    pP: [] as Proj[], pB: [] as Proj[],
    pAnim: "", bAnim: "", pKey: 0, bKey: 0, pEnd: 0, bEnd: 0,
    shake: 0, rage: false, uid: 1,
  };
}
type Game = ReturnType<typeof freshGame>;

type Best = { wpm: number; acc: number; wins: number };

/* ------------------------------------------------------------------ */
/*  component                                                          */
/* ------------------------------------------------------------------ */

export default function TypingBattle() {
  const [diff, setDiff] = useState<Difficulty>("medium");
  const [phase, setPhase] = useState<Phase>("setup");
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [focused, setFocused] = useState(false);
  const [winner, setWinner] = useState<"player" | "bot" | null>(null);
  const [bests, setBests] = useState<Record<Difficulty, Best>>({
    easy: { wpm: 0, acc: 0, wins: 0 }, medium: { wpm: 0, acc: 0, wins: 0 },
    hard: { wpm: 0, acc: 0, wins: 0 }, insane: { wpm: 0, acc: 0, wins: 0 },
  });
  const [fresh, setFresh] = useState<{ wpm: boolean; acc: boolean }>({ wpm: false, acc: false });

  const cfg = DIFFS[diff];
  const sfx = useSfx(muted);
  const reduce = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const g = useRef<Game>(freshGame(DIFFS.medium));
  const [, force] = useReducer((x: number) => x + 1, 0);

  /* ---------- helpers ---------- */

  const float = (side: "p" | "b", text: string, kind: Floater["kind"]) => {
    const G = g.current;
    const list = side === "p" ? G.fP : G.fB;
    if (list.length > 7) list.shift();
    list.push({
      id: G.uid++, text, kind,
      dx: ri(-38, 38), dy: ri(12, 34), die: G.t + 900,
    });
  };

  const anim = (side: "p" | "b", name: string, ms: number) => {
    const G = g.current;
    if (side === "p") { G.pAnim = name; G.pKey = G.uid++; G.pEnd = G.t + ms; }
    else { G.bAnim = name; G.bKey = G.uid++; G.bEnd = G.t + ms; }
  };

  const nextTarget = () => {
    const G = g.current;
    G.target = G.queued;
    G.queued = makeTarget(cfg.min, cfg.max);
    G.typed = 0;
    G.clean = true;
    G.targetStart = G.t;
  };

  const endBattle = (who: "player" | "bot") => {
    const G = g.current;
    const mins = Math.max(G.t, 1) / 60000;
    const wpm = Math.round((G.correct / 5) / mins);
    const acc = G.chars ? Math.round((G.correct / G.chars) * 100) : 100;

    anim("p", who === "player" ? "cheer" : "fall", 4000);
    anim("b", who === "bot" ? "cheer" : "fall", 4000);
    G.shake = 1;

    const prev = bests[diff];
    const newWpm = wpm > prev.wpm;
    const newAcc = acc > prev.acc;
    setFresh({ wpm: newWpm, acc: newAcc });
    setBests((b) => ({
      ...b,
      [diff]: {
        wpm: Math.max(prev.wpm, wpm),
        acc: Math.max(prev.acc, acc),
        wins: prev.wins + (who === "player" ? 1 : 0),
      },
    }));
    if (newWpm && wpm > 0) toast.success(`New ${cfg.label} best — ${wpm} WPM`);

    setWinner(who);
    setPhase("over");
    sfx(who === "player" ? "win" : "lose");
    force();
  };

  /* ---------- damage ---------- */

  const hitBot = (amount: number, kind: "dmg" | "crit" | "chip") => {
    const G = g.current;
    G.hpB = Math.max(0, G.hpB - amount);
    G.dealt += amount;

    if (kind === "chip") {
      if (Math.random() < 0.18) float("b", `-${Math.max(1, Math.round(amount))}`, "chip");
    } else {
      const v = Math.max(1, Math.round(amount));
      float("b", kind === "crit" ? `CRITICAL -${v}` : `-${v}`, kind);
      if (G.pB.length > 4) G.pB.shift();
      G.pB.push({ id: G.uid++, crit: kind === "crit", die: G.t + 520 });
      anim("p", "atk", 420);
      anim("b", "hit", 380);
      G.shake = Math.max(G.shake, kind === "crit" ? 1 : 0.5);
      sfx(kind === "crit" ? "crit" : "hit");
    }
    if (G.hpB <= 0) endBattle("player");
  };

  const hitPlayer = (amount: number) => {
    const G = g.current;
    // high combo = partial guard, up to 28% reduction
    const guard = Math.min(0.28, G.combo * 0.006);
    const dealt = amount * (1 - guard);
    G.blocked += amount - dealt;
    G.hpP = Math.max(0, G.hpP - dealt);
    G.taken += dealt;

    const v = Math.max(1, Math.round(dealt));
    float("p", guard > 0.1 ? `-${v} GUARD` : `-${v}`, "dmg");
    if (G.pP.length > 4) G.pP.shift();
    G.pP.push({ id: G.uid++, crit: false, die: G.t + 520 });
    anim("b", "atk", 420);
    anim("p", "hit", 380);
    G.shake = Math.max(G.shake, 0.7);
    sfx("taken");
    if (G.hpP <= 0) endBattle("bot");
  };

  /* ---------- typing ---------- */

  const handleChar = useCallback((raw: string) => {
    const G = g.current;
    if (phase !== "battle" || paused) return;
    const ch = raw.toUpperCase();
    if (!/^[A-Z]$/.test(ch)) return;
    if (G.t < G.lock) return; // interrupted after a mistake

    G.lastKey = G.t;
    G.chars++;

    if (ch === G.target[G.typed]) {
      G.correct++;
      G.typed++;
      G.combo++;
      if (G.combo > G.bestCombo) G.bestCombo = G.combo;
      sfx("key");
      hitBot(cfg.chip * (1 + Math.min(G.combo, 80) * 0.005) * (G.rage ? 1.25 : 1), "chip");

      if (G.hpB > 0 && G.typed >= G.target.length) {
        // ---- target completed → real attack ----
        const took = Math.max(120, G.t - G.targetStart);
        const cps = (G.target.length / took) * 1000;
        const speed = clamp(cps / cfg.parCps, 0.65, 1.85);
        const lenM = 0.7 + G.target.length * 0.12;
        const comboM = 1 + Math.min(G.combo, 60) * 0.012;

        G.targets++;
        G.perfect = G.clean ? G.perfect + 1 : 0;
        const critChance = G.perfect >= 3 ? Math.min(0.65, 0.12 + (G.perfect - 2) * 0.09) : 0;
        const crit = Math.random() < critChance;
        if (crit) G.crits++;

        let dmg = cfg.base * lenM * speed * comboM * (G.rage ? 1.25 : 1);
        if (crit) dmg *= 2;
        hitBot(dmg, crit ? "crit" : "dmg");
        if (G.hpB > 0) nextTarget();
      }
    } else {
      // ---- mistake ----
      G.errors++;
      G.combo = 0;
      G.perfect = 0;
      G.clean = false;
      G.typed = 0;
      G.lock = G.t + cfg.lockMs;
      G.errUntil = G.t + 420;
      G.botT += cfg.mistakeGift; // the bot gets an opening
      sfx("err");
    }
    force();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, paused, cfg, sfx]);

  /* ---------- main loop ---------- */

  const tickRef = useRef<(dt: number) => void>(() => {});
  const accRef = useRef(0);

  tickRef.current = (dt: number) => {
    const G = g.current;

    if (phase === "countdown") {
      G.cd -= dt;
      const label = G.cd > 2600 ? "3" : G.cd > 1800 ? "2" : G.cd > 1000 ? "1" : "FIGHT!";
      if (label !== G.cdLabel) {
        G.cdLabel = label;
        sfx(label === "FIGHT!" ? "go" : "count");
        force();
      }
      if (G.cd <= 0) {
        G.targetStart = 0;
        G.lastKey = 0;
        setPhase("battle");
        inputRef.current?.focus();
      }
      return;
    }
    if (phase !== "battle") return;

    G.t += dt;

    if (!G.rage && G.t > RAGE_AT) { G.rage = true; force(); }

    // prune transient visuals
    if (G.fP.length && G.fP[0].die < G.t) G.fP.shift();
    if (G.fB.length && G.fB[0].die < G.t) G.fB.shift();
    if (G.pP.length && G.pP[0].die < G.t) G.pP.shift();
    if (G.pB.length && G.pB[0].die < G.t) G.pB.shift();
    if (G.pAnim && G.pEnd < G.t) G.pAnim = "";
    if (G.bAnim && G.bEnd < G.t) G.bAnim = "";
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt / 320);

    // ---- bot ----
    const ramp = 1 + Math.min(0.35, G.t / 180000);
    const idle = G.t - G.lastKey > 1400 ? 1.35 : 1;
    const speedMul = ramp * idle;

    if (G.botRest > 0) {
      G.botRest -= dt * speedMul;
      if (G.botRest <= 0) {
        G.botTarget = makeTarget(cfg.min, cfg.max);
        G.botT = 0;
        G.botTyped = 0;
        G.botNeed = (G.botTarget.length / cfg.botCps) * 1000;
      }
    } else {
      G.botT += dt * speedMul;
      G.botTyped = Math.min(G.botTarget.length, Math.floor((G.botT / G.botNeed) * G.botTarget.length));
      if (G.botT >= G.botNeed) {
        if (Math.random() < cfg.botAcc) {
          const raw = ri(cfg.botDmg[0], cfg.botDmg[1]) * (G.rage ? 1.25 : 1) * ramp;
          hitPlayer(raw);
          G.botRest = ri(cfg.botRest[0], cfg.botRest[1]);
        } else {
          float("p", "MISS", "miss");
          anim("b", "stumble", 520);
          sfx("miss");
          G.botRest = ri(cfg.botRest[0], cfg.botRest[1]) * 1.7;
        }
        G.botT = 0;
        G.botTyped = 0;
      }
    }

    accRef.current += dt;
    if (accRef.current > 40) { accRef.current = 0; force(); }
  };

  useEffect(() => {
    if ((phase !== "countdown" && phase !== "battle") || paused) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      tickRef.current(dt);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, paused]);

  /* ---------- flow ---------- */

  const start = () => {
    g.current = freshGame(cfg);
    setWinner(null);
    setFresh({ wpm: false, acc: false });
    setPaused(false);
    setPhase("countdown");
    force();
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const backToSetup = () => {
    setPhase("setup");
    setPaused(false);
    setWinner(null);
  };

  /* ---------- global keys ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === "setup") {
        const i = "1234".indexOf(e.key);
        if (i >= 0) { setDiff(ORDER[i]); return; }
        if (e.key === "Enter") { e.preventDefault(); start(); }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (phase === "battle") { setPaused((p) => !p); setTimeout(() => inputRef.current?.focus(), 20); }
        else if (phase === "over" || phase === "countdown") backToSetup();
        return;
      }
      if (phase === "over" && e.key === "Enter") { e.preventDefault(); start(); }
      // stop the page scrolling while the battle is live
      if (phase === "battle" && [" ", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, diff, cfg]);

  useEffect(() => {
    const onHide = () => { if (document.hidden && phase === "battle") setPaused(true); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [phase]);

  /* ---------- derived ---------- */

  const G = g.current;
  const mins = Math.max(G.t, 1) / 60000;
  const wpm = Math.round((G.correct / 5) / mins) || 0;
  const acc = G.chars ? Math.round((G.correct / G.chars) * 100) : 100;
  const hpPct = (v: number, m: number) => clamp((v / m) * 100, 0, 100);
  const live = phase === "battle" || phase === "countdown" || phase === "over";
  const shake = !reduce && G.shake > 0.35;
  const comboTier =
    G.combo >= 35 ? "UNREAL" : G.combo >= 20 ? "BLAZING" : G.combo >= 10 ? "ON FIRE" : G.combo >= 5 ? "NICE" : "";

  /* ---------- render ---------- */

  return (
    <div className="tb-wrap space-y-6">
      <style>{CSS}</style>

      {/* ---------------- toolbar ---------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-primary shadow-[3px_3px_0_0_var(--color-foreground)]">
          <Swords className="h-3.5 w-3.5" /> Keystroke Arena
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          {phase === "battle" && (
            <button
              onClick={() => { setPaused((p) => !p); setTimeout(() => inputRef.current?.focus(), 20); }}
              className={BTN}
              aria-label={paused ? "Resume battle" : "Pause battle"}
            >
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {paused ? "Resume" : "Pause"}
              <kbd className={KBD}>Esc</kbd>
            </button>
          )}
          {live && (
            <button onClick={start} className={BTN} aria-label="Restart battle">
              <RotateCcw className="h-3.5 w-3.5" /> Restart
            </button>
          )}
          <button
            onClick={() => setMuted((m) => !m)}
            className={BTN}
            aria-pressed={muted}
            aria-label={muted ? "Unmute sound effects" : "Mute sound effects"}
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            {muted ? "Muted" : "Sound"}
          </button>
        </div>
      </div>

      {/* ---------------- setup ---------------- */}
      {phase === "setup" && (
        <div className="space-y-5">
          <div
            className="rounded-2xl border-2 border-foreground bg-gradient-to-br from-primary/20 to-fuchsia-500/20 p-5 shadow-[4px_4px_0_0_var(--color-foreground)]"
            style={{ transform: "rotate(-0.5deg)" }}
          >
            <div className="inline-flex rounded-full border-2 border-foreground bg-card px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
              How it works
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed">
              Random letter targets are generated in your browser. Every correct key chips the
              opponent, finishing a whole target lands a real hit. Type fast and clean for combos
              and critical strikes. Miss a key and the bot gets an opening.
            </p>
          </div>

          <div role="radiogroup" aria-label="Difficulty" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ORDER.map((d, i) => {
              const c = DIFFS[d];
              const on = diff === d;
              return (
                <button
                  key={d}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setDiff(d)}
                  className={cx(
                    "rounded-2xl border-2 border-foreground p-4 text-left transition-transform hover:-translate-y-0.5",
                    on
                      ? "bg-gradient-to-br from-primary/25 to-fuchsia-500/20 shadow-[5px_5px_0_0_var(--color-foreground)]"
                      : "bg-card shadow-[3px_3px_0_0_var(--color-foreground)] hover:shadow-[4px_4px_0_0_var(--color-foreground)]",
                  )}
                  style={{ transform: `rotate(${i % 2 === 0 ? "-0.8deg" : "0.8deg"})` }}
                >
                  <div className="flex items-center justify-between">
                    <span className={cx(
                      "inline-flex rounded-full border-2 border-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      on ? "bg-card text-primary" : "bg-primary/15 text-primary",
                    )}>
                      {c.label}
                    </span>
                    <kbd className={KBD}>{i + 1}</kbd>
                  </div>
                  <div className="mt-2 font-display text-lg font-extrabold leading-tight">{c.blurb}</div>
                  <div className="mt-3 space-y-1 text-[11px] font-semibold text-muted-foreground">
                    <div>Target length · {c.min}–{c.max}</div>
                    <div>Bot speed · {Math.round(c.botCps * 12)} WPM</div>
                    <div>Bot accuracy · {Math.round(c.botAcc * 100)}%</div>
                  </div>
                  {bests[d].wpm > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="rounded-full border-2 border-foreground bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold">
                        Best {bests[d].wpm} WPM
                      </span>
                      <span className="rounded-full border-2 border-foreground bg-primary/15 px-2 py-0.5 text-[10px] font-bold">
                        {bests[d].acc}% acc
                      </span>
                      {bests[d].wins > 0 && (
                        <span className="rounded-full border-2 border-foreground bg-amber-400/25 px-2 py-0.5 text-[10px] font-bold">
                          {bests[d].wins}W
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={start}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-foreground bg-primary px-6 py-4 font-display text-xl font-extrabold text-primary-foreground shadow-[5px_5px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[7px_7px_0_0_var(--color-foreground)] active:translate-y-0 active:shadow-[3px_3px_0_0_var(--color-foreground)] sm:w-auto"
          >
            <Swords className="h-5 w-5" /> Start Battle
            <kbd className="ml-1 rounded-md border-2 border-foreground bg-card px-1.5 py-0.5 text-[10px] font-bold text-foreground">Enter</kbd>
          </button>
        </div>
      )}

      {/* ---------------- arena ---------------- */}
      {live && (
        <div
          className={cx(
            "tb-arena relative overflow-hidden rounded-3xl border-2 border-foreground bg-gradient-to-b from-primary/10 via-transparent to-fuchsia-500/10 p-3 shadow-[6px_6px_0_0_var(--color-foreground)] sm:p-5",
            shake && "tb-shake",
          )}
          onClick={() => phase === "battle" && !paused && inputRef.current?.focus()}
        >
          {/* animated backdrop */}
          <div className="tb-grid pointer-events-none absolute inset-0 opacity-[0.07]" aria-hidden />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 border-t-2 border-dashed border-foreground/25" aria-hidden />

          {G.rage && phase === "battle" && (
            <div className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2">
              <span className="tb-pop inline-flex items-center gap-1 rounded-full border-2 border-foreground bg-orange-500/25 px-3 py-1 text-[10px] font-bold uppercase tracking-wide shadow-[2px_2px_0_0_var(--color-foreground)]">
                <Flame className="h-3 w-3" /> Rage — damage boosted
              </span>
            </div>
          )}

          <div className="relative z-10 grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)_minmax(0,1fr)]">
            {/* ---- player ---- */}
            <FighterPanel
              name="You"
              side="p"
              hp={G.hpP} max={G.maxP}
              anim={G.pAnim} animKey={G.pKey}
              floaters={G.fP} projs={G.pP}
              reduce={reduce}
              className="order-1"
            />

            {/* ---- typing core ---- */}
            <div className="order-3 col-span-2 lg:order-2 lg:col-span-1">
              <div
                className={cx(
                  "relative flex h-full flex-col justify-center rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)] transition-shadow sm:p-5",
                  phase === "battle" && focused && "shadow-[6px_6px_0_0_var(--color-primary)]",
                  G.t < G.errUntil && "tb-err !border-red-500",
                )}
              >
                {/* combo */}
                <div className="mb-3 flex min-h-[26px] items-center justify-center gap-2">
                  {G.combo > 1 && (
                    <span
                      key={G.combo}
                      className="tb-pop inline-flex items-center gap-1 rounded-full border-2 border-foreground bg-primary/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary shadow-[2px_2px_0_0_var(--color-foreground)]"
                    >
                      <Zap className="h-3 w-3" /> {G.combo}× combo
                    </span>
                  )}
                  {comboTier && (
                    <span className="inline-flex rounded-full border-2 border-foreground bg-orange-400/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                      {comboTier}
                    </span>
                  )}
                  {G.perfect >= 3 && (
                    <span className="inline-flex items-center gap-1 rounded-full border-2 border-foreground bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                      <Crosshair className="h-3 w-3" /> crit ready
                    </span>
                  )}
                </div>

                {/* target */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                  {G.target.split("").map((ch, i) => (
                    <span
                      key={`${G.targets}-${i}`}
                      className={cx(
                        "inline-flex h-11 w-9 items-center justify-center rounded-xl border-2 font-display text-2xl font-extrabold transition-colors sm:h-14 sm:w-12 sm:text-4xl",
                        i < G.typed && "border-foreground bg-emerald-500/20 text-foreground",
                        i === G.typed && "tb-cur border-foreground bg-primary/25 text-primary shadow-[3px_3px_0_0_var(--color-foreground)]",
                        i > G.typed && "border-foreground/25 bg-card text-muted-foreground",
                      )}
                    >
                      {ch}
                    </span>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <span>Next</span>
                  <span className="rounded-full border-2 border-foreground/30 bg-card px-2 py-0.5 tracking-[0.2em]">
                    {G.queued}
                  </span>
                </div>

                {/* live stats */}
                <div className="mt-4 grid grid-cols-4 gap-2">
                  <MiniStat label="WPM" value={phase === "battle" ? wpm : 0} />
                  <MiniStat label="Acc" value={`${acc}%`} />
                  <MiniStat label="Chars" value={G.correct} />
                  <MiniStat label="Guard" value={`${Math.round(Math.min(0.28, G.combo * 0.006) * 100)}%`} />
                </div>

                {/* the real input (invisible, always focused during battle) */}
                <input
                  ref={inputRef}
                  type="text"
                  value=""
                  aria-label="Type the target letters"
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                  className="absolute inset-0 h-full w-full cursor-text opacity-0"
                  style={{ caretColor: "transparent" }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onChange={(e) => {
                    // virtual / mobile keyboards land here
                    for (const c of e.target.value) handleChar(c);
                    e.target.value = "";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" || e.key === "Tab") return;
                    if (e.ctrlKey || e.metaKey || e.altKey) return;
                    if (e.key.length === 1) {
                      e.preventDefault();
                      handleChar(e.key);
                    } else if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", " "].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                />

                {/* focus hint */}
                {phase === "battle" && !focused && !paused && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-card/85 backdrop-blur-[2px]">
                    <span className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary/15 px-3 py-1.5 text-xs font-bold shadow-[3px_3px_0_0_var(--color-foreground)]">
                      <Keyboard className="h-4 w-4" /> Click here to keep typing
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ---- bot ---- */}
            <FighterPanel
              name="Bot"
              side="b"
              hp={G.hpB} max={G.maxB}
              anim={G.bAnim} animKey={G.bKey}
              floaters={G.fB} projs={G.pB}
              reduce={reduce}
              className="order-2 lg:order-3"
              botTarget={phase === "battle" ? G.botTarget : undefined}
              botTyped={G.botTyped}
              botResting={G.botRest > 0}
            />
          </div>

          {/* countdown */}
          {phase === "countdown" && (
            <div className="absolute inset-0 z-30 flex items-center justify-center rounded-3xl bg-card/80 backdrop-blur-[3px]">
              <div
                key={G.cdLabel}
                className="tb-cd font-display text-6xl font-extrabold text-primary drop-shadow-[4px_4px_0_var(--color-foreground)] sm:text-8xl"
              >
                {G.cdLabel}
              </div>
            </div>
          )}

          {/* pause */}
          {paused && phase === "battle" && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 rounded-3xl bg-card/85 p-4 backdrop-blur-[3px]">
              <div className="font-display text-3xl font-extrabold">Paused</div>
              <div className="flex flex-wrap justify-center gap-2">
                <button onClick={() => { setPaused(false); setTimeout(() => inputRef.current?.focus(), 20); }} className={BTN_PRIMARY}>
                  <Play className="h-4 w-4" /> Resume
                </button>
                <button onClick={start} className={BTN}><RotateCcw className="h-3.5 w-3.5" /> Restart</button>
                <button onClick={backToSetup} className={BTN}><ChevronLeft className="h-3.5 w-3.5" /> Change difficulty</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------- results ---------------- */}
      {phase === "over" && winner && (
        <div className="space-y-4">
          <div
            className={cx(
              "tb-pop rounded-2xl border-2 border-foreground p-5 shadow-[5px_5px_0_0_var(--color-foreground)]",
              winner === "player"
                ? "bg-gradient-to-br from-emerald-400/25 to-primary/20"
                : "bg-gradient-to-br from-red-500/20 to-fuchsia-500/20",
            )}
            style={{ transform: "rotate(-0.5deg)" }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-foreground bg-card shadow-[3px_3px_0_0_var(--color-foreground)]">
                {winner === "player" ? <Trophy className="h-5 w-5 text-amber-500" /> : <Skull className="h-5 w-5" />}
              </span>
              <div>
                <div className="font-display text-3xl font-extrabold leading-none sm:text-4xl">
                  {winner === "player" ? "Victory" : "Defeated"}
                </div>
                <div className="mt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {cfg.label} · {(G.t / 1000).toFixed(1)}s · {G.targets} targets cleared
                </div>
              </div>
              <div className="ml-auto flex flex-wrap gap-1.5">
                {fresh.wpm && <span className="tb-pop rounded-full border-2 border-foreground bg-amber-400/30 px-2.5 py-1 text-[10px] font-bold uppercase">New best WPM</span>}
                {fresh.acc && <span className="tb-pop rounded-full border-2 border-foreground bg-emerald-400/30 px-2.5 py-1 text-[10px] font-bold uppercase">New best accuracy</span>}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr]">
            <div
              className="rounded-2xl border-2 border-foreground bg-gradient-to-br from-primary/20 to-fuchsia-500/20 p-5 shadow-[4px_4px_0_0_var(--color-foreground)]"
              style={{ transform: "rotate(-0.5deg)" }}
            >
              <div className="inline-flex rounded-full border-2 border-foreground bg-card px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                Words per minute
              </div>
              <div className="mt-2 font-display text-4xl font-extrabold">{wpm}</div>
            </div>
            <StatCard label="Accuracy" value={`${acc}%`} tilt={1} />
            <StatCard label="Best combo" value={G.bestCombo} tilt={-1} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {([
              ["Damage dealt", Math.round(G.dealt)],
              ["Damage taken", Math.round(G.taken)],
              ["Blocked", Math.round(G.blocked)],
              ["Correct keys", G.correct],
              ["Mistakes", G.errors],
              ["Criticals", G.crits],
            ] as const).map(([label, val], i) => (
              <div
                key={label}
                className="rounded-xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]"
                style={{ transform: `rotate(${i % 2 === 0 ? "-1deg" : "1deg"})` }}
              >
                <div className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  {label}
                </div>
                <div className="mt-2 font-display text-2xl font-extrabold">{val}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={start} className={BTN_PRIMARY}>
              <Swords className="h-4 w-4" /> Rematch
              <kbd className="ml-1 rounded-md border-2 border-foreground bg-card px-1.5 py-0.5 text-[10px] font-bold text-foreground">Enter</kbd>
            </button>
            <button onClick={backToSetup} className={BTN}>
              <ChevronLeft className="h-3.5 w-3.5" /> Change difficulty
            </button>
          </div>
        </div>
      )}

      {/* screen-reader status */}
      <p className="sr-only" role="status" aria-live="polite">
        {phase === "over" && winner
          ? `${winner === "player" ? "Victory" : "Defeat"}. ${wpm} words per minute, ${acc} percent accuracy.`
          : phase === "battle"
            ? `Target ${G.target}. Your health ${Math.ceil(G.hpP)}, opponent health ${Math.ceil(G.hpB)}.`
            : ""}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  sub-components                                                     */
/* ------------------------------------------------------------------ */

const BTN =
  "inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)]";

const BTN_PRIMARY =
  "inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--color-foreground)] active:translate-y-0 active:shadow-[2px_2px_0_0_var(--color-foreground)]";

const KBD =
  "rounded-md border-2 border-foreground bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold leading-none";

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border-2 border-foreground bg-card px-2 py-1.5 text-center shadow-[2px_2px_0_0_var(--color-foreground)]">
      <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display text-base font-extrabold leading-tight">{value}</div>
    </div>
  );
}

function StatCard({ label, value, tilt }: { label: string; value: string | number; tilt: number }) {
  return (
    <div
      className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <div className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
        {label}
      </div>
      <div className="mt-2 font-display text-2xl font-extrabold">{value}</div>
    </div>
  );
}

function FighterPanel({
  name, side, hp, max, anim, animKey, floaters, projs, reduce, className,
  botTarget, botTyped = 0, botResting,
}: {
  name: string; side: "p" | "b";
  hp: number; max: number;
  anim: string; animKey: number;
  floaters: Floater[]; projs: Proj[];
  reduce: boolean; className?: string;
  botTarget?: string; botTyped?: number; botResting?: boolean;
}) {
  const pct = clamp((hp / max) * 100, 0, 100);
  const low = pct <= 30;
  const dir = side === "p" ? "r" : "l"; // player attacks right, bot attacks left
  const actionClass =
    anim === "atk" ? `tb-atk-${dir}`
    : anim === "hit" ? `tb-hit-${dir}`
    : anim === "stumble" ? "tb-stumble"
    : anim === "fall" ? `tb-fall-${dir}`
    : anim === "cheer" ? "tb-cheer"
    : "";

  return (
    <div className={cx("relative rounded-2xl border-2 border-foreground bg-card p-3 shadow-[4px_4px_0_0_var(--color-foreground)]", className)}>
      {/* name + hp */}
      <div className="flex items-center justify-between gap-2">
        <span className={cx(
          "inline-flex rounded-full border-2 border-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
          side === "p" ? "bg-primary/15 text-primary" : "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
        )}>
          {name}
        </span>
        <span className="font-display text-sm font-extrabold tabular-nums">{Math.ceil(hp)}</span>
      </div>

      <div className="mt-1.5 h-3.5 w-full overflow-hidden rounded-full border-2 border-foreground bg-card">
        <div
          className={cx(
            "h-full rounded-full transition-[width] duration-300 ease-out",
            pct > 55 ? "bg-emerald-500" : pct > 28 ? "bg-amber-500" : "bg-red-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* stage */}
      <div className="relative mt-2 flex h-[132px] items-end justify-center overflow-hidden sm:h-[176px]">
        {/* incoming attack */}
        {!reduce && projs.map((p) => (
          <div key={p.id} className="pointer-events-none absolute inset-0">
            <div
              className={cx(
                `tb-proj-${side === "p" ? "l" : "r"} absolute left-1/2 top-[38%] -ml-6 h-5 w-12 rounded-full border-2 border-foreground`,
                p.crit ? "bg-orange-400" : "bg-primary",
              )}
            />
            <div className={cx(
              "tb-ring absolute left-1/2 top-[38%] -ml-7 -mt-3.5 h-14 w-14 rounded-full border-4",
              p.crit ? "border-orange-400" : "border-primary",
            )} />
          </div>
        ))}

        {/* damage numbers */}
        {floaters.map((f) => (
          <div
            key={f.id}
            className={cx(
              "tb-float pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-foreground px-2 py-0.5 font-display font-extrabold shadow-[2px_2px_0_0_var(--color-foreground)]",
              f.kind === "crit" ? "bg-orange-400 text-[11px] text-foreground"
                : f.kind === "miss" ? "bg-card text-[10px] text-muted-foreground"
                : f.kind === "chip" ? "bg-card text-[10px]"
                : "bg-red-500 text-[11px] text-white",
            )}
            style={{ left: `calc(50% + ${f.dx}px)`, top: `${f.dy}%` }}
          >
            {f.text}
          </div>
        ))}

        {/* the fighter */}
        <div
          className="tb-idle"
          style={{ animationDuration: low ? "1.05s" : "2.4s", animationPlayState: anim === "fall" ? "paused" : "running" }}
        >
          <div key={animKey} className={actionClass}>
            <Stickman kind={side === "p" ? "player" : "bot"} low={low} />
          </div>
        </div>

        {low && <div className="tb-low pointer-events-none absolute inset-0 rounded-xl bg-red-500/10" />}
      </div>

      {/* bot's own target — makes the threat readable */}
      {botTarget && (
        <div className="mt-1 min-h-[34px]">
          {botResting ? (
            <div className="text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              recovering…
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-center gap-0.5">
                {botTarget.split("").map((c, i) => (
                  <span
                    key={i}
                    className={cx(
                      "font-display text-xs font-extrabold sm:text-sm",
                      i < botTyped ? "text-fuchsia-500" : "text-muted-foreground/50",
                    )}
                  >
                    {c}
                  </span>
                ))}
              </div>
              <div className="mx-auto mt-1 h-1.5 w-full overflow-hidden rounded-full border-2 border-foreground/40 bg-card">
                <div
                  className="h-full bg-fuchsia-500 transition-[width] duration-100 ease-linear"
                  style={{ width: `${(botTyped / Math.max(1, botTarget.length)) * 100}%` }}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stickman({ kind, low }: { kind: "player" | "bot"; low: boolean }) {
  const mirror = kind === "bot";
  return (
    <svg
      viewBox="0 0 130 170"
      className={cx("h-[118px] w-auto text-foreground sm:h-[158px]", low && "opacity-90")}
      role="img"
      aria-label={kind === "player" ? "Your fighter" : "Opponent fighter"}
    >
      <ellipse cx="65" cy="163" rx="33" ry="6" className="fill-foreground/15" />
      <g transform={mirror ? "translate(130,0) scale(-1,1)" : undefined}>
        <g stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M65 100 L45 130 L49 153" />
          <path d="M65 100 L86 129 L82 153" />
          <path d="M65 50 L65 101" />
          <path d="M65 63 L40 79 L27 68" />
          <path d="M65 60 L93 70 L106 57" />
        </g>

        {kind === "player" ? (
          <>
            <circle cx="65" cy="32" r="17" className="fill-primary" stroke="currentColor" strokeWidth="6" />
            <path d="M48 25 H82" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
            <path d="M48 25 L33 17 M48 25 L32 30" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <circle cx="60" cy="35" r="2.6" className="fill-foreground" />
            <circle cx="72" cy="35" r="2.6" className="fill-foreground" />
          </>
        ) : (
          <>
            <path d="M65 12 V4" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
            <circle cx="65" cy="2" r="4.5" className="fill-fuchsia-500" stroke="currentColor" strokeWidth="3" />
            <rect x="46" y="14" width="38" height="36" rx="11" className="fill-fuchsia-500" stroke="currentColor" strokeWidth="6" />
            <rect x="53" y="28" width="24" height="8" rx="4" className="fill-foreground" />
          </>
        )}
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  animations                                                         */
/* ------------------------------------------------------------------ */

const CSS = `
.tb-wrap{ overscroll-behavior: contain; }
.tb-grid{
  background-image: linear-gradient(to right, var(--color-foreground) 1px, transparent 1px),
                    linear-gradient(to bottom, var(--color-foreground) 1px, transparent 1px);
  background-size: 34px 34px;
  animation: tb-drift 9s linear infinite;
}
@keyframes tb-drift { from{background-position:0 0} to{background-position:34px 0} }

.tb-idle{ animation: tb-bob 2.4s ease-in-out infinite; }
@keyframes tb-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }

.tb-atk-r{ animation: tb-atk-r 400ms cubic-bezier(.3,1.4,.4,1) 1; }
.tb-atk-l{ animation: tb-atk-l 400ms cubic-bezier(.3,1.4,.4,1) 1; }
@keyframes tb-atk-r { 0%{transform:translateX(0) rotate(0)} 30%{transform:translateX(28px) rotate(7deg)} 60%{transform:translateX(14px) rotate(3deg)} 100%{transform:translateX(0) rotate(0)} }
@keyframes tb-atk-l { 0%{transform:translateX(0) rotate(0)} 30%{transform:translateX(-28px) rotate(-7deg)} 60%{transform:translateX(-14px) rotate(-3deg)} 100%{transform:translateX(0) rotate(0)} }

.tb-hit-r{ animation: tb-hit-r 360ms ease-out 1; }
.tb-hit-l{ animation: tb-hit-l 360ms ease-out 1; }
@keyframes tb-hit-r { 0%{transform:translateX(0);color:inherit} 22%{transform:translateX(-17px) rotate(-8deg);color:#ef4444} 60%{transform:translateX(5px) rotate(3deg);color:#ef4444} 100%{transform:translateX(0);color:inherit} }
@keyframes tb-hit-l { 0%{transform:translateX(0);color:inherit} 22%{transform:translateX(17px) rotate(8deg);color:#ef4444} 60%{transform:translateX(-5px) rotate(-3deg);color:#ef4444} 100%{transform:translateX(0);color:inherit} }

.tb-stumble{ animation: tb-stumble 500ms ease-in-out 1; }
@keyframes tb-stumble { 0%,100%{transform:rotate(0) translateY(0)} 30%{transform:rotate(-9deg) translateY(5px)} 65%{transform:rotate(6deg) translateY(2px)} }

.tb-fall-r{ animation: tb-fall-r 700ms cubic-bezier(.6,-0.2,.7,1) forwards; }
.tb-fall-l{ animation: tb-fall-l 700ms cubic-bezier(.6,-0.2,.7,1) forwards; }
@keyframes tb-fall-r { to{ transform: translateY(30px) rotate(80deg); opacity:.55 } }
@keyframes tb-fall-l { to{ transform: translateY(30px) rotate(-80deg); opacity:.55 } }

.tb-cheer{ animation: tb-cheer 620ms ease-out 3; }
@keyframes tb-cheer { 0%,100%{transform:translateY(0)} 32%{transform:translateY(-18px)} 62%{transform:translateY(-4px)} }

.tb-float{ animation: tb-float 900ms cubic-bezier(.2,.8,.3,1) forwards; }
@keyframes tb-float { 0%{opacity:0;transform:translate(-50%,10px) scale(.7)} 18%{opacity:1;transform:translate(-50%,0) scale(1.1)} 100%{opacity:0;transform:translate(-50%,-54px) scale(1)} }

.tb-proj-r{ animation: tb-proj-r 300ms ease-in forwards; }
.tb-proj-l{ animation: tb-proj-l 300ms ease-in forwards; }
@keyframes tb-proj-r { 0%{opacity:0;transform:translateX(-150%) scaleX(.5)} 25%{opacity:1} 80%{opacity:1;transform:translateX(0) scaleX(1)} 100%{opacity:0;transform:translateX(12%) scaleX(1.5)} }
@keyframes tb-proj-l { 0%{opacity:0;transform:translateX(150%) scaleX(.5)} 25%{opacity:1} 80%{opacity:1;transform:translateX(0) scaleX(1)} 100%{opacity:0;transform:translateX(-12%) scaleX(1.5)} }

.tb-ring{ animation: tb-ring 420ms 190ms ease-out forwards; opacity:0; }
@keyframes tb-ring { 0%{opacity:.85;transform:scale(.2)} 100%{opacity:0;transform:scale(1.9)} }

.tb-shake{ animation: tb-shake 260ms ease-in-out 1; }
@keyframes tb-shake { 0%,100%{transform:translate(0,0)} 20%{transform:translate(-5px,3px)} 45%{transform:translate(4px,-3px)} 70%{transform:translate(-3px,-2px)} }

.tb-err{ animation: tb-errshake 300ms ease-in-out 1; }
@keyframes tb-errshake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 55%{transform:translateX(7px)} 80%{transform:translateX(-3px)} }

.tb-cur::after{ content:''; }
.tb-cur{ animation: tb-cur 900ms ease-in-out infinite; }
@keyframes tb-cur { 0%,100%{ box-shadow: 3px 3px 0 0 var(--color-foreground) } 50%{ box-shadow: 3px 3px 0 0 var(--color-primary) } }

.tb-pop{ animation: tb-pop 260ms cubic-bezier(.2,1.5,.4,1) 1; }
@keyframes tb-pop { 0%{transform:scale(.6);opacity:0} 60%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }

.tb-cd{ animation: tb-cd 780ms ease-out 1; }
@keyframes tb-cd { 0%{transform:scale(2);opacity:0} 22%{transform:scale(1);opacity:1} 78%{transform:scale(1);opacity:1} 100%{transform:scale(.85);opacity:0} }

.tb-low{ animation: tb-low 1.4s ease-in-out infinite; }
@keyframes tb-low { 0%,100%{opacity:.35} 50%{opacity:.75} }

@media (prefers-reduced-motion: reduce){
  .tb-wrap .tb-idle,
  .tb-wrap .tb-grid,
  .tb-wrap .tb-shake,
  .tb-wrap .tb-err,
  .tb-wrap .tb-cur,
  .tb-wrap .tb-cheer,
  .tb-wrap .tb-stumble,
  .tb-wrap [class*="tb-atk-"],
  .tb-wrap [class*="tb-hit-"]{ animation: none !important; }
  .tb-wrap .tb-float{ animation: tb-fade 900ms linear forwards !important; }
  .tb-wrap [class*="tb-fall-"]{ animation: none !important; opacity:.55; }
  @keyframes tb-fade { 0%{opacity:0} 15%{opacity:1} 100%{opacity:0} }
}
`;