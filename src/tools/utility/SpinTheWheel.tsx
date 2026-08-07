import { useCallback, useEffect, useRef, useState } from "react";
import {
  Disc3,
  Plus,
  X,
  RotateCcw,
  Shuffle,
  Eye,
  EyeOff,
  PartyPopper,
  Volume2,
  VolumeX,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types & helpers                                                   */
/* ------------------------------------------------------------------ */

type WheelOption = {
  id: string;
  label: string;
  color: string;
};

const PALETTE = [
  "#FF6B6B",
  "#4ECDC4",
  "#FFD93D",
  "#6C5CE7",
  "#FF9F43",
  "#1DD1A1",
  "#54A0FF",
  "#FF6B9D",
  "#00D2D3",
  "#A29BFE",
  "#FD79A8",
  "#00B894",
  "#FDCB6E",
  "#0984E3",
  "#E17055",
  "#6AB04C",
];

const DEFAULT_LABELS = ["Pizza", "Burger", "Movie", "Sleep"];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function makeOption(label: string, color: string): WheelOption {
  return { id: uid(), label, color };
}

function contrastText(hex: string) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111111" : "#FFFFFF";
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function shuffleArray<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CONFETTI_COLORS = PALETTE;

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function SpinTheWheel() {
  const [options, setOptions] = useState<WheelOption[]>(() =>
    DEFAULT_LABELS.map((label, i) => makeOption(label, PALETTE[i % PALETTE.length]))
  );
  const [inputValue, setInputValue] = useState("");
  const [showList, setShowList] = useState(true);
  const [muted, setMuted] = useState(false);

  const [rotation, setRotation] = useState(0);
  const [transitionMs, setTransitionMs] = useState(0);
  const [easing, setEasing] = useState("cubic-bezier(0.15,0.85,0.1,1)");
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<WheelOption | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [confettiPieces, setConfettiPieces] = useState<
    { id: string; left: number; color: string; delay: number; duration: number; rotate: number }[]
  >([]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const tickTimeoutRef = useRef<number | null>(null);
  const resultTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (tickTimeoutRef.current) window.clearTimeout(tickTimeoutRef.current);
      if (resultTimeoutRef.current) window.clearTimeout(resultTimeoutRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  /* ---------------------------- sound ---------------------------- */

  const ensureAudioCtx = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      try {
        const Ctx =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new Ctx();
      } catch {
        audioCtxRef.current = null;
      }
    }
    return audioCtxRef.current;
  }, []);

  const playTick = useCallback(
    (freq: number) => {
      if (muted) return;
      const ctx = ensureAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.045);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    },
    [muted, ensureAudioCtx]
  );

  const playWin = useCallback(() => {
    if (muted) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.13, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.34);
    });
  }, [muted, ensureAudioCtx]);

  const scheduleTicks = useCallback(
    (durationMs: number) => {
      const start = performance.now();
      const loop = () => {
        const elapsed = performance.now() - start;
        const progress = Math.min(elapsed / durationMs, 1);
        playTick(620 - progress * 220);
        if (progress < 1) {
          const interval = 35 + progress * progress * 260;
          tickTimeoutRef.current = window.setTimeout(loop, interval);
        }
      };
      loop();
    },
    [playTick]
  );

  /* -------------------------- confetti ---------------------------- */

  const fireConfetti = useCallback(() => {
    const pieces = Array.from({ length: 60 }).map(() => ({
      id: uid(),
      left: Math.random() * 100,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      delay: Math.random() * 0.3,
      duration: 1.8 + Math.random() * 1.2,
      rotate: Math.random() * 720 - 360,
    }));
    setConfettiPieces(pieces);
    window.setTimeout(() => setConfettiPieces([]), 3200);
  }, []);

  /* ---------------------------- options ---------------------------- */

  const addOption = useCallback(() => {
    const label = inputValue.trim();
    if (!label || spinning) return;
    setOptions((prev) => [...prev, makeOption(label, PALETTE[prev.length % PALETTE.length])]);
    setInputValue("");
  }, [inputValue, spinning]);

  const removeOption = useCallback(
    (id: string) => {
      if (spinning) return;
      setOptions((prev) => prev.filter((o) => o.id !== id));
    },
    [spinning]
  );

  const shuffleColors = useCallback(() => {
    if (spinning) return;
    setOptions((prev) => {
      const colors = shuffleArray(PALETTE);
      return prev.map((o, i) => ({ ...o, color: colors[i % colors.length] }));
    });
  }, [spinning]);

  const resetWheel = useCallback(() => {
    if (spinning) return;
    setRotation(0);
    setTransitionMs(0);
    setResult(null);
    setShowResult(false);
  }, [spinning]);

  /* ------------------------------ spin ------------------------------ */

  const spin = useCallback(() => {
    if (spinning || options.length < 2) return;
    setResult(null);
    setShowResult(false);
    setSpinning(true);

    setEasing("cubic-bezier(0.5,0,0.9,0.4)");
    setTransitionMs(180);
    setRotation((r) => r - 6);

    window.setTimeout(() => {
      const n = options.length;
      const sliceAngle = 360 / n;
      const selectedIndex = Math.floor(Math.random() * n);
      const sliceCenter = selectedIndex * sliceAngle + sliceAngle / 2;
      const targetMod = (360 - sliceCenter + 360) % 360;
      const extraSpins = 8 + Math.floor(Math.random() * 5);
      const jitterRange = Math.max(sliceAngle * 0.32, 4);
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      const duration = Math.min(8000, 5000 + Math.random() * 1800 + n * 45);

      setRotation((current) => {
        const currentMod = ((current % 360) + 360) % 360;
        const diff = (targetMod - currentMod + 360) % 360;
        return current + diff + extraSpins * 360 + jitter;
      });

      setEasing("cubic-bezier(0.14,0.82,0.1,1)");
      setTransitionMs(duration);
      scheduleTicks(duration);
      if (navigator.vibrate) navigator.vibrate(15);

      resultTimeoutRef.current = window.setTimeout(() => {
        setSpinning(false);
        setResult(options[selectedIndex]);
        setShowResult(true);
        playWin();
        fireConfetti();
        if (navigator.vibrate) navigator.vibrate([40, 30, 60]);
      }, duration + 40);
    }, 190);
  }, [spinning, options, scheduleTicks, playWin, fireConfetti]);

  /* ------------------------------ wheel geometry ------------------------------ */

  const cx = 200;
  const cy = 200;
  const r = 194;
  const sliceAngle = options.length > 0 ? 360 / options.length : 0;

  return (
    <div className="space-y-6">
      {/* Header badge */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <Disc3 className="h-3.5 w-3.5" />
          Spin The Wheel
        </span>

        <button
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Unmute sound" : "Mute sound"}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-foreground bg-card text-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Wheel section */}
      <div className="rounded-2xl border-2 border-foreground bg-gradient-to-br from-violet-500/15 to-indigo-500/15 p-6 sm:p-8 shadow-[5px_5px_0_0_var(--color-foreground)]">
        <div className="relative mx-auto w-full max-w-[420px] aspect-square">
          {/* Pointer */}
          <svg
            width="40"
            height="34"
            viewBox="0 0 40 34"
            className="absolute left-1/2 -top-3 z-20 -translate-x-1/2 drop-shadow-[2px_2px_0_var(--color-foreground)]"
          >
            <polygon
              points="20,34 2,2 38,2"
              fill="var(--color-primary)"
              stroke="var(--color-foreground)"
              strokeWidth="3"
              strokeLinejoin="round"
            />
          </svg>

          {/* Rotating wheel */}
          <div
            className="h-full w-full rounded-full border-2 border-foreground shadow-[5px_5px_0_0_var(--color-foreground)] overflow-hidden"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: `transform ${transitionMs}ms ${easing}`,
              willChange: "transform",
            }}
          >
            {options.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center bg-card text-center text-sm font-bold text-foreground/50 px-8">
                Add options below to build your wheel
              </div>
            ) : (
              <svg viewBox="0 0 400 400" className="h-full w-full">
                {options.map((opt, i) => {
                  const startAngle = i * sliceAngle;
                  const endAngle = startAngle + sliceAngle;
                  const midAngle = startAngle + sliceAngle / 2;
                  const p1 = polar(cx, cy, r, startAngle);
                  const p2 = polar(cx, cy, r, endAngle);
                  const largeArc = sliceAngle > 180 ? 1 : 0;
                  
                  const flip = midAngle > 90 && midAngle < 270;

                  // Prevent overflow into center button (r=50) and outer boundary (r=194)
                  const maxChars = options.length > 12 ? 6 : options.length > 8 ? 8 : 10;
                  const fontSize = options.length > 12 ? 10 : options.length > 8 ? 12 : 14;
                  
                  const formattedLabel =
                    opt.label.length > maxChars ? `${opt.label.slice(0, maxChars - 1)}…` : opt.label;

                  // Adjust distance based on text length to keep text contained safely in the safe zone
                  const textRadius = r * 0.58;

                  return (
                    <g key={opt.id}>
                      <path
                        d={`M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`}
                        fill={opt.color}
                        stroke="var(--color-foreground)"
                        strokeWidth="2"
                      />
                      <g transform={`rotate(${midAngle}, ${cx}, ${cy})`}>
                        <text
                          x={cx}
                          y={cy - textRadius}
                          transform={flip ? `rotate(180, ${cx}, ${cy - textRadius})` : undefined}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={fontSize}
                          fontWeight={700}
                          fill={contrastText(opt.color)}
                          style={{ fontFamily: "inherit" }}
                        >
                          {formattedLabel}
                        </text>
                      </g>
                    </g>
                  );
                })}
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-foreground)" strokeWidth="2" />
              </svg>
            )}
          </div>

          {/* Hub / Spin button */}
          <button
            onClick={spin}
            disabled={spinning || options.length < 2}
            className="absolute left-1/2 top-1/2 z-10 flex h-20 w-20 sm:h-24 sm:w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-foreground bg-primary text-lg sm:text-xl font-extrabold tracking-wide text-primary-foreground shadow-[4px_4px_0_0_var(--color-foreground)] disabled:opacity-50"
          >
            {spinning ? "···" : "SPIN"}
          </button>
        </div>

        {options.length < 2 && (
          <p className="mt-4 text-center text-sm font-semibold text-foreground/60">
            Add at least 2 options to spin the wheel
          </p>
        )}
      </div>

      {/* Wheel actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={resetWheel}
          disabled={spinning}
          className="inline-flex items-center gap-2 rounded-xl border-2 border-foreground bg-card px-4 py-2.5 text-sm font-bold text-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
        >
          <RotateCcw className="h-4 w-4" /> Reset Wheel
        </button>
        <button
          onClick={shuffleColors}
          disabled={spinning}
          className="inline-flex items-center gap-2 rounded-xl border-2 border-foreground bg-card px-4 py-2.5 text-sm font-bold text-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
        >
          <Shuffle className="h-4 w-4" /> Shuffle Colors
        </button>
        <button
          onClick={() => setShowList((s) => !s)}
          className="inline-flex items-center gap-2 rounded-xl border-2 border-foreground bg-card px-4 py-2.5 text-sm font-bold text-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
        >
          {showList ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showList ? "Hide Options" : "Show Options"}
        </button>
      </div>

      {/* Add options section */}
      {showList && (
        <div className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <div className="flex gap-3">
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addOption();
              }}
              placeholder="Enter an option"
              disabled={spinning}
              className="flex-1 rounded-xl border-2 border-foreground bg-background px-4 py-3 text-sm font-semibold text-foreground placeholder:text-foreground/40 outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
            <button
              onClick={addOption}
              disabled={spinning || !inputValue.trim()}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-foreground bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>

          {options.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {options.map((opt) => (
                <span
                  key={opt.id}
                  className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-background px-3 py-1.5 text-sm font-bold text-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
                >
                  <span
                    className="h-3 w-3 rounded-full border border-foreground/40"
                    style={{ backgroundColor: opt.color }}
                  />
                  {opt.label}
                  <button
                    onClick={() => removeOption(opt.id)}
                    disabled={spinning}
                    aria-label={`Remove ${opt.label}`}
                    className="ml-1 rounded-full text-foreground/50 hover:text-foreground disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confetti */}
      {confettiPieces.length > 0 && (
        <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
          {confettiPieces.map((p) => (
            <span
              key={p.id}
              className="qk-spinwheel-confetti"
              style={{
                left: `${p.left}%`,
                backgroundColor: p.color,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                // @ts-expect-error custom property used by keyframes
                "--qk-rotate": `${p.rotate}deg`,
              }}
            />
          ))}
        </div>
      )}

      {/* Result modal */}
      {showResult && result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
          <div className="qk-pop w-full max-w-sm rounded-2xl border-2 border-foreground bg-card p-6 text-center shadow-[6px_6px_0_0_var(--color-foreground)]">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-foreground bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
              <PartyPopper className="h-6 w-6" />
            </div>
            <p className="text-sm font-bold uppercase tracking-wide text-foreground/60">Quickly chose...</p>
            <p
              className="mt-2 rounded-xl border-2 border-foreground px-4 py-3 text-2xl font-extrabold break-words"
              style={{ backgroundColor: result.color, color: contrastText(result.color) }}
            >
              {result.label}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => {
                  setShowResult(false);
                  spin();
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
              >
                Spin Again
              </button>
              <button
                onClick={() => setShowResult(false)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-card px-4 py-3 text-sm font-bold text-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .qk-spinwheel-confetti {
          position: absolute;
          top: -12px;
          width: 8px;
          height: 14px;
          border-radius: 2px;
          opacity: 0.95;
          animation-name: qk-spinwheel-fall;
          animation-timing-function: cubic-bezier(0.35, 0, 0.65, 1);
          animation-fill-mode: forwards;
        }
        @keyframes qk-spinwheel-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(105vh) rotate(var(--qk-rotate, 360deg));
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}