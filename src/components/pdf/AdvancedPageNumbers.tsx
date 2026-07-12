import { useCallback, useEffect, useRef, useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { toast } from "sonner";
import {
  Lock, Unlock, Mail, Monitor, Download, Plus, Trash2,
  ChevronDown, ChevronUp, Eye, EyeOff, CheckCircle2,
  FileText, Layers, Hash, SlidersHorizontal, AlignLeft,
  LayoutGrid, Sparkles, Shield, ArrowRight,
} from "lucide-react";import { downloadBlob } from "@/lib/format";
import {
  makeSection, buildPageMap, formatPageNumber, isAuthenticated,
  authenticate, computeNextSectionDefaults, sectionLabelRange,
  type Section, type NumStyle,
} from "@/lib/advanced-page-numbers";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

// ─── helpers ─────────────────────────────────────────────────────────────────

function hexToRgbLib(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const POSITION_SPOTS: [Section["position"], string][] = [
  ["tl", "top-2 left-2"], ["tc", "top-2 left-1/2 -translate-x-1/2"], ["tr", "top-2 right-2"],
  ["bl", "bottom-2 left-2"], ["bc", "bottom-2 left-1/2 -translate-x-1/2"], ["br", "bottom-2 right-2"],
];
const SIZE_PRESETS = [9, 10, 12, 14, 16];
const MARGIN_PRESETS = [12, 18, 24, 36, 48];
const COLOR_PRESETS = ["#26262e", "#6b7280", "#2563eb", "#dc2626", "#ffffff"];
const STYLE_OPTIONS: { key: NumStyle; label: string; example: string }[] = [
  { key: "decimal", label: "1, 2, 3", example: "1" },
  { key: "roman-lower", label: "i, ii, iii", example: "i" },
  { key: "roman-upper", label: "I, II, III", example: "I" },
  { key: "alpha-lower", label: "a, b, c", example: "a" },
  { key: "alpha-upper", label: "A, B, C", example: "A" },
];

// ─── Mobile block ─────────────────────────────────────────────────────────────

function MobileBlock() {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card shadow-[4px_4px_0_0_var(--color-foreground)] overflow-hidden">
      <div className="bg-gradient-to-r from-primary/20 to-fuchsia-500/20 border-b-2 border-foreground px-6 pt-8 pb-6 text-center space-y-3">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-foreground bg-card shadow-[3px_3px_0_0_var(--color-foreground)]">
          <Monitor className="h-8 w-8 text-primary" />
        </div>
        <h3 className="font-display text-xl font-bold">Desktop feature</h3>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
          Advanced Page Numbering is built for large screens — it needs the space for live PDF preview and multi-section editing to work properly.
        </p>
      </div>
      <div className="px-6 py-5 space-y-3">
        {[
          { icon: LayoutGrid, text: "Live preview alongside your settings" },
          { icon: Layers, text: "Multi-section numbering configuration" },
          { icon: SlidersHorizontal, text: "Per-section position, size, and color controls" },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-foreground bg-primary/10 text-primary">
              <Icon className="h-3.5 w-3.5" />
            </span>
            {text}
          </div>
        ))}
        <p className="pt-1 text-xs font-semibold text-muted-foreground">
          The standard Page Numbering tab works great on mobile.
        </p>
      </div>
    </div>
  );
}

// ─── Lock screen ──────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: Hash, title: "Custom start page", body: "Begin numbering from any page in your document" },
  { icon: FileText, title: "Skip pages", body: "Skipped pages carry no number and don't advance the counter" },
  { icon: Layers, title: "Multiple sections", body: "Independent numbering ranges with different styles" },
  { icon: AlignLeft, title: "Number styles", body: "Decimal, Roman (upper/lower), Alphabetical (upper/lower)" },
  { icon: Eye, title: "Live preview", body: "See exactly how the export will look before downloading" },
  { icon: SlidersHorizontal, title: "Per-section styling", body: "Position, size, font size, and color per section" },
];

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [shaking, setShaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showForm) setTimeout(() => usernameRef.current?.focus(), 50);
  }, [showForm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    // Small deliberate pause so the loading state is visible — auth itself is synchronous.
    await new Promise((r) => setTimeout(r, 600));
    setLoading(false);
    if (authenticate(username, password)) {
      setSuccess(true);
      setTimeout(() => onUnlock(), 700);
    } else {
      setError("Incorrect username or password.");
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    }
  };

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes qk-shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes qk-success-pop {
          0% { transform: scale(0.8); opacity: 0; }
          60% { transform: scale(1.08); }
          100% { transform: scale(1); opacity: 1; }
        }
        .qk-shake { animation: qk-shake 0.45s ease-out; }
        .qk-success-pop { animation: qk-success-pop 0.4s ease-out forwards; }
      `}</style>

      <div className="rounded-2xl border-2 border-foreground bg-card shadow-[4px_4px_0_0_var(--color-foreground)] overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-primary/25 via-fuchsia-500/15 to-transparent border-b-2 border-foreground px-6 pt-8 pb-6">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-foreground bg-card shadow-[3px_3px_0_0_var(--color-foreground)]">
              <Shield className="h-7 w-7 text-primary" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary shadow-[2px_2px_0_0_var(--color-foreground)] mb-2">
                <Sparkles className="h-3 w-3" />
                Pro Feature
              </div>
              <h2 className="font-display text-xl font-bold">Advanced Page Numbering</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Professional-grade control over page numbering — sections, skips, Roman numerals, live preview.
              </p>
            </div>
          </div>
        </div>

        {/* Feature grid */}
        <div className="px-6 py-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 border-b-2 border-foreground">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex items-start gap-2.5 rounded-xl border-2 border-foreground bg-background p-3 shadow-[2px_2px_0_0_var(--color-foreground)]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-foreground bg-primary/10 text-primary">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-xs font-bold">{title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Auth */}
        <div className="px-6 py-5 space-y-4">
          {success ? (
            <div className="qk-success-pop flex items-center justify-center gap-3 rounded-xl border-2 border-foreground bg-primary/10 px-5 py-4">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span className="font-bold text-sm text-primary">Access granted — loading your workspace…</span>
            </div>
          ) : !showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full border-2 border-foreground bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
            >
              <Unlock className="h-4 w-4" />
              Unlock Advanced Features
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <form onSubmit={handleSubmit} className={`space-y-3 ${shaking ? "qk-shake" : ""}`}>
              <div className="rounded-xl border-2 border-foreground bg-background px-3 py-2.5 shadow-[2px_2px_0_0_var(--color-foreground)] focus-within:shadow-[3px_3px_0_0_var(--color-primary)]">
                <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Username</label>
                <input
                  ref={usernameRef}
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(""); }}
                  placeholder="Enter your username"
                  autoComplete="username"
                  className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="rounded-xl border-2 border-foreground bg-background px-3 py-2.5 shadow-[2px_2px_0_0_var(--color-foreground)] focus-within:shadow-[3px_3px_0_0_var(--color-primary)]">
                <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Password</label>
                <div className="flex items-center gap-2">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-lg border-2 border-dashed border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full border-2 border-foreground bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:opacity-70 disabled:translate-y-0"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                    Verifying…
                  </>
                ) : (
                  <>
                    <Unlock className="h-4 w-4" />
                    Sign in
                  </>
                )}
              </button>
            </form>
          )}

          <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5 flex-wrap">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            Need access? Contact{" "}
            <a href="mailto:kalpkothari14@gmail.com" className="font-semibold text-primary underline underline-offset-2">
              kalpkothari14@gmail.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Section editor ───────────────────────────────────────────────────────────

function SectionEditor({
  section, index, totalSections, totalPages,
  onChange, onDelete,
}: {
  section: Section; index: number; totalSections: number; totalPages: number;
  onChange: (s: Section) => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(index === 0);
  const upd = (patch: Partial<Section>) => onChange({ ...section, ...patch });

  const skipInput = useRef<HTMLInputElement>(null);
  const addSkip = () => {
    const v = parseInt(skipInput.current?.value ?? "");
    if (!Number.isFinite(v) || v < section.startPdfPage || v > section.endPdfPage) return;
    if (!section.skipPdfPages.includes(v)) {
      upd({ skipPdfPages: [...section.skipPdfPages, v].sort((a, b) => a - b) });
    }
    if (skipInput.current) skipInput.current.value = "";
  };

  const { first, last } = sectionLabelRange(section);

  return (
    <div className="rounded-2xl border-2 border-foreground bg-card shadow-[3px_3px_0_0_var(--color-foreground)]">
      {/* Collapsed header with summary */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-4 font-bold"
      >
        <span className="flex items-center gap-2.5 text-sm min-w-0">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px] font-bold text-primary">
            {index + 1}
          </span>
          <span className="truncate">{section.label || `Section ${index + 1}`}</span>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-foreground/20 bg-secondary/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            PDF {section.startPdfPage}–{section.endPdfPage}
            <span className="mx-0.5 text-foreground/30">·</span>
            {first} – {last}
          </span>
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {totalSections > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              aria-label="Delete section"
              className="rounded-full border-2 border-foreground bg-background p-1.5 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t-2 border-foreground divide-y-2 divide-foreground/10">

          {/* Block 1: Page range — the primary question, answered first */}
          <div className="p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Page range</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Section label</span>
                <input
                  value={section.label}
                  onChange={(e) => upd({ label: e.target.value })}
                  className="mt-1 w-full rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-foreground)] outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">PDF start page</span>
                <input
                  type="number" min={1} max={totalPages} value={section.startPdfPage}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(+e.target.value, section.endPdfPage));
                    upd({ startPdfPage: v });
                  }}
                  className="mt-1 w-full rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-foreground)] outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">PDF end page</span>
                <input
                  type="number" min={section.startPdfPage} max={totalPages} value={section.endPdfPage}
                  onChange={(e) => upd({ endPdfPage: Math.max(section.startPdfPage, Math.min(+e.target.value, totalPages)) })}
                  className="mt-1 w-full rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-foreground)] outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)]"
                />
              </label>
            </div>
          </div>

          {/* Block 2: Numbering */}
          <div className="p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Numbering</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">First number to display</span>
                <input
                  type="number" min={1} value={section.startNumber}
                  onChange={(e) => upd({ startNumber: Math.max(1, +e.target.value) })}
                  className="mt-1 w-full rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-foreground)] outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)]"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Auto-set when you add a section — override freely.</p>
              </label>
              <div>
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Numbering style</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {STYLE_OPTIONS.map((s) => (
                    <button
                      key={s.key} type="button"
                      onClick={() => upd({ style: s.key })}
                      className={`rounded-full border-2 border-foreground px-2.5 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 ${
                        section.style === s.key
                          ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
                          : "bg-background"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Block 3: Position */}
          <div className="p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Position on page</p>
            <div className="relative h-28 w-full rounded-xl border-2 border-foreground bg-secondary/20 shadow-[2px_2px_0_0_var(--color-foreground)]">
              {POSITION_SPOTS.map(([pos, spot]) => (
                <button
                  key={pos} type="button"
                  onClick={() => upd({ position: pos })}
                  className={`absolute flex h-7 w-7 items-center justify-center rounded-lg border-2 border-foreground text-[10px] font-bold transition-transform hover:-translate-y-0.5 ${spot} ${
                    section.position === pos
                      ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
                      : "bg-card"
                  }`}
                >
                  {formatPageNumber(section.startNumber, section.style)}
                </button>
              ))}
            </div>
          </div>

          {/* Block 4: Appearance */}
          <div className="p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Appearance</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Font size</span>
                <input
                  type="number" min={6} max={48} value={section.size}
                  onChange={(e) => upd({ size: +e.target.value })}
                  className="mt-1 w-full rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-foreground)] outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)]"
                />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {SIZE_PRESETS.map((v) => (
                    <button key={v} type="button" onClick={() => upd({ size: v })}
                      className={`rounded-full border-2 border-foreground px-2 py-0.5 text-[10px] font-bold transition-transform hover:-translate-y-0.5 ${section.size === v ? "bg-primary text-primary-foreground" : "bg-background"}`}>
                      {v}pt
                    </button>
                  ))}
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Margin (pt)</span>
                <input
                  type="number" min={0} max={100} value={section.margin}
                  onChange={(e) => upd({ margin: +e.target.value })}
                  className="mt-1 w-full rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-foreground)] outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)]"
                />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {MARGIN_PRESETS.map((v) => (
                    <button key={v} type="button" onClick={() => upd({ margin: v })}
                      className={`rounded-full border-2 border-foreground px-2 py-0.5 text-[10px] font-bold transition-transform hover:-translate-y-0.5 ${section.margin === v ? "bg-primary text-primary-foreground" : "bg-background"}`}>
                      {v}pt
                    </button>
                  ))}
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Color</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color" value={section.color}
                    onChange={(e) => upd({ color: e.target.value })}
                    className="h-9 w-10 shrink-0 rounded-xl border-2 border-foreground bg-card px-1 shadow-[2px_2px_0_0_var(--color-foreground)]"
                  />
                  <div className="flex flex-wrap gap-1">
                    {COLOR_PRESETS.map((c) => (
                      <button key={c} type="button" onClick={() => upd({ color: c })}
                        style={{ backgroundColor: c }}
                        className={`h-7 w-7 rounded-full border-2 border-foreground transition-transform hover:-translate-y-0.5 ${section.color === c ? "ring-2 ring-primary ring-offset-1" : ""}`}
                      />
                    ))}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Block 5: Skip pages */}
          <div className="p-4 space-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Skip pages (optional)</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Pages listed here carry no number and don't advance the counter.
                Must be within PDF {section.startPdfPage}–{section.endPdfPage}.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                ref={skipInput}
                type="number" min={section.startPdfPage} max={section.endPdfPage}
                placeholder={`${section.startPdfPage}–${section.endPdfPage}`}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkip(); } }}
                className="min-w-0 flex-1 rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold shadow-[2px_2px_0_0_var(--color-foreground)] outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)]"
              />
              <button
                type="button" onClick={addSkip}
                className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            {section.skipPdfPages.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {section.skipPdfPages.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 rounded-full border-2 border-foreground bg-secondary/40 px-2 py-0.5 text-xs font-bold">
                    Page {p}
                    <button
                      type="button"
                      onClick={() => upd({ skipPdfPages: section.skipPdfPages.filter((x) => x !== p) })}
                      className="text-destructive hover:text-destructive/70"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Live preview ─────────────────────────────────────────────────────────────

function LivePreview({ file, sections }: { file: File; sections: Section[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rendering, setRendering] = useState(false);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  // pageMap is real state (not a ref) so the canvas effect genuinely re-runs
  // whenever sections change — the previous mapRef pattern was invisible to React.
  const [pageMap, setPageMap] = useState<(string | null)[]>([]);

  // Load the PDF document once per file.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const buf = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      if (cancelled) return;
      docRef.current = doc;
      setTotal(doc.numPages);
      setPage(1);
    })();
    return () => { cancelled = true; };
  }, [file]);

  // Recompute the label map whenever sections or total pages change.
  useEffect(() => {
    if (total === 0) return;
    setPageMap(buildPageMap(sections, total));
  }, [sections, total]);

  // Re-render the canvas whenever page, map, or total changes.
  useEffect(() => {
    if (!docRef.current || !canvasRef.current || total === 0 || pageMap.length === 0) return;
    let cancelled = false;
    setRendering(true);
    (async () => {
      try {
        const pdfPage = await docRef.current!.getPage(page);
        const vp = pdfPage.getViewport({ scale: 1.2 });
        const canvas = canvasRef.current!;
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext("2d")!;
        await pdfPage.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
        if (cancelled) return;

        const label = pageMap[page - 1];
        if (label) {
          const activeSection = [...sections].reverse().find(
            (s) => page >= s.startPdfPage && !s.skipPdfPages.includes(page)
          );
          if (activeSection) {
            const fontSize = activeSection.size * 1.2;
            ctx.font = `bold ${fontSize}px Helvetica, Arial, sans-serif`;
            ctx.fillStyle = activeSection.color;
            const tw = ctx.measureText(label).width;
            const m = activeSection.margin * 1.2;
            let x = m, y = vp.height - m;
            if (activeSection.position.includes("r")) x = vp.width - tw - m;
            if (activeSection.position.includes("c")) x = (vp.width - tw) / 2;
            if (activeSection.position.startsWith("t")) y = m + fontSize;
            ctx.fillText(label, x, y);
          }
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => { cancelled = true; };
  }, [page, pageMap, total]);

  if (total === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border-2 border-foreground bg-card shadow-[3px_3px_0_0_var(--color-foreground)] text-sm text-muted-foreground">
        Loading preview…
      </div>
    );
  }

  const currentLabel = pageMap[page - 1];

  return (
    <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card shadow-[4px_4px_0_0_var(--color-foreground)]">
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-foreground bg-primary/10 text-primary">
            <Eye className="h-3.5 w-3.5" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Live preview
          </span>
          {rendering && (
            <span className="inline-flex items-center gap-1 text-xs text-primary font-semibold">
              <span className="h-3 w-3 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
              Rendering
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="rounded-lg border-2 border-foreground bg-background px-2.5 py-1 text-xs font-bold disabled:opacity-40 transition-transform hover:-translate-y-0.5"
          >
            Prev
          </button>
          <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
            {page} / {total}
            {currentLabel ? (
              <span className="ml-1 text-primary font-bold">"{currentLabel}"</span>
            ) : (
              <span className="ml-1 text-muted-foreground italic">skipped</span>
            )}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(total, p + 1))} disabled={page >= total}
            className="rounded-lg border-2 border-foreground bg-background px-2.5 py-1 text-xs font-bold disabled:opacity-40 transition-transform hover:-translate-y-0.5"
          >
            Next
          </button>
        </div>
      </div>
      <div className="max-h-[500px] overflow-auto rounded-b-2xl border-t-2 border-foreground bg-secondary/20 px-4 pb-4 pt-3">
        <canvas ref={canvasRef} className="mx-auto block max-w-full rounded-xl shadow-[3px_3px_0_0_var(--color-foreground)]" />
      </div>
    </div>
  );
}

// ─── Main advanced panel ──────────────────────────────────────────────────────

export default function AdvancedPageNumbers({ file }: { file: File | null }) {
  const { showSupportPrompt } = useSupportPrompt();
  const [authed, setAuthed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [sections, setSections] = useState<Section[]>([makeSection({ endPdfPage: 1 })]);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    setAuthed(isAuthenticated());
    setIsMobile(window.innerWidth < 1024);
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // When the file changes, read the real page count and reset sections to cover the whole doc.
  useEffect(() => {
    if (!file) { setTotalPages(0); return; }
    (async () => {
      const buf = await file.arrayBuffer();
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
      const n = doc.getPages().length;
      setTotalPages(n);
      setSections([makeSection({ endPdfPage: n, label: "Section 1" })]);
    })();
  }, [file]);

  const updateSection = (i: number, s: Section) =>
    setSections((prev) => prev.map((x, idx) => (idx === i ? s : x)));
  const deleteSection = (i: number) =>
    setSections((prev) => prev.filter((_, idx) => idx !== i));

  // Auto-continuity: the new section starts right after the last one ends and
  // continues numbering from where it left off (accounting for skips).
  const addSection = () => {
    setSections((prev) => {
      const last = prev[prev.length - 1];
      const defaults = computeNextSectionDefaults(last, totalPages || 9999);
      return [
        ...prev,
        makeSection({
          label: `Section ${prev.length + 1}`,
          startPdfPage: defaults.startPdfPage,
          endPdfPage: Math.max(defaults.startPdfPage, totalPages || defaults.startPdfPage),
          startNumber: defaults.startNumber,
          style: defaults.style,
          // Inherit appearance from the previous section so users don't have to repeat it.
          position: last.position,
          size: last.size,
          margin: last.margin,
          color: last.color,
        }),
      ];
    });
  };

  const run = async () => {
    if (!file) { toast.error("Upload a PDF first."); return; }
    setProcessing(true);
    try {
      const buf = await file.arrayBuffer();
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const pages = doc.getPages();
      const map = buildPageMap(sections, pages.length);

      pages.forEach((pdfPage, i) => {
        const pdfPageNum = i + 1;
        const label = map[i];
        if (!label) return;
        // Find the owning section: the last one in the array whose range contains this page
        // and that doesn't skip it — consistent with buildPageMap's priority rule.
        const activeSection = [...sections].reverse().find(
          (s) =>
            pdfPageNum >= s.startPdfPage &&
            pdfPageNum <= s.endPdfPage &&
            !s.skipPdfPages.includes(pdfPageNum)
        );
        if (!activeSection) return;
        const { width, height } = pdfPage.getSize();
        const tw = font.widthOfTextAtSize(label, activeSection.size);
        const m = activeSection.margin;
        let x = m, y = m;
        if (activeSection.position.includes("r")) x = width - tw - m;
        if (activeSection.position.includes("c")) x = (width - tw) / 2;
        if (activeSection.position.startsWith("t")) y = height - activeSection.size - m;
        pdfPage.drawText(label, { x, y, size: activeSection.size, font, color: hexToRgbLib(activeSection.color) });
      });

      downloadBlob(new Blob([await doc.save() as BlobPart], { type: "application/pdf" }), "numbered-advanced.pdf");
      toast.success("Downloaded with advanced numbering");
      showSupportPrompt();
    } catch {
      toast.error("Failed to apply numbering.");
    } finally {
      setProcessing(false);
    }
  };

  if (isMobile) return <MobileBlock />;
  if (!authed) return <LockScreen onUnlock={() => setAuthed(true)} />;

  return (
    <div className="space-y-5">
      {!file && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-foreground/40 bg-secondary/20 p-4 text-sm text-muted-foreground">
          <FileText className="h-5 w-5 shrink-0" />
          Upload a PDF using the tab above — page count will be read automatically, then configure numbering here.
        </div>
      )}

      {/* Flow summary — shows the full numbering plan at a glance */}
      {sections.length > 1 && (
        <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Numbering flow</p>
          <div className="flex flex-wrap items-center gap-2">
            {sections.map((sec, i) => {
              const { first, last } = sectionLabelRange(sec);
              return (
                <div key={sec.id} className="flex items-center gap-2">
                  <div className="rounded-xl border-2 border-foreground bg-background px-3 py-2 shadow-[2px_2px_0_0_var(--color-foreground)]">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {sec.label || `Section ${i + 1}`}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold">
                      PDF {sec.startPdfPage}–{sec.endPdfPage}
                    </p>
                    <p className="text-xs text-primary font-bold">
                      {first} – {last}
                    </p>
                  </div>
                  {i < sections.length - 1 && (
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section list */}
      <div className="space-y-3">
        {sections.map((s, i) => (
          <SectionEditor
            key={s.id}
            section={s}
            index={i}
            totalSections={sections.length}
            totalPages={totalPages || 9999}
            onChange={(updated) => updateSection(i, updated)}
            onDelete={() => deleteSection(i)}
          />
        ))}
        <button
          type="button"
          onClick={addSection}
          className="inline-flex items-center gap-2 rounded-full border-2 border-dashed border-foreground/60 bg-background px-4 py-2 text-xs font-bold text-muted-foreground shadow-[1px_1px_0_0_var(--color-foreground)] transition-all hover:-translate-y-0.5 hover:border-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Add section — continues from where this one ends
        </button>
      </div>

      {/* Live preview */}
      {file && <LivePreview file={file} sections={sections} />}

      {/* Apply */}
      <button
        type="button"
        onClick={run}
        disabled={!file || processing}
        className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)] disabled:opacity-50 disabled:translate-y-0 disabled:shadow-[3px_3px_0_0_var(--color-foreground)]"
      >
        {processing ? (
          <>
            <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
            Applying…
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            Apply numbering and download
          </>
        )}
      </button>
    </div>
  );
}