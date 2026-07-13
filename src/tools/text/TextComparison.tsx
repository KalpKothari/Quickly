import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Copy, Download,
  Search, X, AlertTriangle, Hash, Calendar, Languages, FileText,
} from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { compare, type ComparisonResult, type DiffChunk } from "@/lib/text-diff";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── helpers ─────────────────────────────────────────────────────────────────

function countWords(t: string) {
  return t.trim().split(/\s+/).filter(Boolean).length;
}

function highlight(text: string, query: string): string {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(${escaped})`, "gi"), "%%MATCH%%$1%%END%%");
}

function renderHighlighted(text: string, query: string) {
  const h = highlight(text, query);
  const parts = h.split(/(%%MATCH%%.*?%%END%%)/g);
  return parts.map((p, i) => {
    if (p.startsWith("%%MATCH%%")) {
      const content = p.replace("%%MATCH%%", "").replace("%%END%%", "");
      return <mark key={i} className="rounded bg-yellow-300 px-0.5 text-yellow-900 dark:bg-yellow-500/50 dark:text-yellow-100">{content}</mark>;
    }
    return <span key={i}>{p}</span>;
  });
}

// ─── Chunk renderer ───────────────────────────────────────────────────────────

function ChunkSpan({
  chunk, side, searchQuery, isActive, onClick,
}: {
  chunk: DiffChunk; side: "a" | "b"; searchQuery: string;
  isActive: boolean; onClick: () => void;
}) {
  const text = side === "a" ? chunk.textA : chunk.textB;
  if (!text) return null;

  const base = "inline cursor-pointer rounded px-0.5 transition-all";
  let cls = "";
  if (chunk.type === "equal") cls = "";
  else if (chunk.type === "added" && side === "b") cls = `${base} bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-400/40 ${isActive ? "ring-2 ring-emerald-500" : ""}`;
  else if (chunk.type === "removed" && side === "a") cls = `${base} bg-red-500/20 text-red-800 dark:text-red-300 ring-1 ring-red-400/40 line-through ${isActive ? "ring-2 ring-red-500" : ""}`;
  else if (chunk.type === "modified") {
    const baseModified = `${base} ${isActive ? "ring-2 ring-amber-500" : ""}`;
    if (chunk.isContradiction) cls = `${baseModified} bg-orange-500/30 text-orange-900 dark:text-orange-200 ring-1 ring-orange-500/60`;
    else if (chunk.isNumeric || chunk.isDate) cls = `${baseModified} bg-blue-500/20 text-blue-900 dark:text-blue-200 ring-1 ring-blue-400/40`;
    else cls = `${baseModified} bg-amber-400/25 text-amber-900 dark:text-amber-200 ring-1 ring-amber-400/40`;
  }

  return (
    <span className={cls} onClick={onClick} title={chunk.type !== "equal" ? `${chunk.type}${chunk.isContradiction ? " (contradiction)" : ""}${chunk.isNumeric ? " (numeric)" : ""}${chunk.isDate ? " (date)" : ""}` : undefined}>
      {cls ? renderHighlighted(text, searchQuery) : text}
    </span>
  );
}

// ─── Collapsible unchanged block ──────────────────────────────────────────────

function CollapsibleEqual({ text, searchQuery, forceExpand = false }: { text: string; searchQuery: string; forceExpand?: boolean }) {
  const [open, setOpen] = useState(false);
  const words = countWords(text);
  if (words < 20) return <span>{renderHighlighted(text, searchQuery)}</span>;
  
  if (forceExpand || open) {
    return (
      <span>
        {renderHighlighted(text, searchQuery)}
        {!forceExpand && (
          <button onClick={() => setOpen(false)} className="mx-1 inline-flex items-center gap-0.5 rounded border border-foreground/20 bg-secondary/40 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground hover:bg-secondary print:hidden">
            <ChevronUp className="h-3 w-3" /> collapse
          </button>
        )}
      </span>
    );
  }

  return (
    <>
      <span className="hidden print:inline">{renderHighlighted(text, searchQuery)}</span>
      <span className="print:hidden">
        <button onClick={() => setOpen(true)} className="mx-1 inline-flex items-center gap-0.5 rounded border border-foreground/20 bg-secondary/40 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground hover:bg-secondary">
          <ChevronDown className="h-3 w-3" /> {words} unchanged words
        </button>
      </span>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const TABS = ["comparison", "report", "analytics"] as const;
type Tab = typeof TABS[number];

export default function TextComparison() {
  const [textA, setTextA] = useState("");
  const [textB, setTextB] = useState("");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("comparison");
  const [mobileView, setMobileView] = useState<"a" | "b">("a");
  const [activeChunkId, setActiveChunkId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "added" | "removed" | "modified">("all");
  
  // Scroll sync refs
  const panelARef = useRef<HTMLDivElement>(null);
  const panelBRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  // Auto-compare with debounce and error capturing logic
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!textA.trim() && !textB.trim()) { 
      setResult(null); 
      setErrorMsg(null);
      return; 
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    debounceRef.current = setTimeout(() => {
      try {
        const res = compare(textA, textB);
        setResult(res);
        setErrorMsg(null);
      } catch (err: any) {
        setResult(null);
        const msg = err?.message || "Unsupported language encountered.";
        setErrorMsg(msg);
        toast.error(msg);
      }
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [textA, textB]);

  // Scroll sync logic
  const syncScroll = useCallback((source: "a" | "b") => (e: React.UIEvent<HTMLDivElement>) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    const other = source === "a" ? panelBRef.current : panelARef.current;
    if (other) { other.scrollTop = e.currentTarget.scrollTop; }
    syncingRef.current = false;
  }, []);

  // Navigation Filters
  const diffChunks = useMemo(() => result?.chunks.filter((c) => c.type !== "equal") ?? [], [result]);
  const filteredDiffChunks = useMemo(() =>
    filterType === "all" ? diffChunks : diffChunks.filter((c) => {
      if (filterType === "added") return c.type === "added";
      if (filterType === "removed") return c.type === "removed";
      if (filterType === "modified") return c.type === "modified";
      return true;
    }),
    [diffChunks, filterType]);

  const activeIdx = filteredDiffChunks.findIndex((c) => c.id === activeChunkId);
  const goNext = () => {
    const idx = activeIdx < 0 ? 0 : (activeIdx + 1) % filteredDiffChunks.length;
    setActiveChunkId(filteredDiffChunks[idx]?.id ?? null);
  };
  const goPrev = () => {
    const idx = activeIdx <= 0 ? filteredDiffChunks.length - 1 : activeIdx - 1;
    setActiveChunkId(filteredDiffChunks[idx]?.id ?? null);
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
  };

  const downloadReport = () => {
    if (!result) return;
    setTimeout(() => { window.print(); }, 250);
  };

  // Chart Mappers
  const pie = result ? [
    { name: "Added", value: result.stats.additions, color: "#10b981" },
    { name: "Removed", value: result.stats.deletions, color: "#ef4444" },
    { name: "Modified", value: result.stats.modifications, color: "#f59e0b" },
  ].filter((d) => d.value > 0) : [];

  const bar = result ? [
    { name: "Words Original (A)", value: result.stats.wordsA, fill: "#6366f1" },
    { name: "Words Updated (B)", value: result.stats.wordsB, fill: "#8b5cf6" },
  ] : [];

  return (
    <div className="space-y-5">
      {/* ─── PRINT CONTAINER (AUTOMATICALLY TRIGGERED BY PRINT / SAVE AS PDF) ─── */}
      {result && (
        <div className="hidden print:block w-full text-black bg-white p-4 font-sans antialiased">
          <div className="flex items-center justify-between border-b-4 border-black pb-4 mb-6">
            <div>
              <h1 className="text-3xl font-black tracking-tight"> Text Comparison Report</h1>
              <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mt-1">
                Quickly Analytics Core Infrastructure System — Generated: {new Date().toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block px-4 py-2 bg-black text-white text-base font-black rounded-xl">
                {result.stats.similarity}% MATCH SCORE
              </span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="border-2 border-black p-3 bg-neutral-50 rounded-xl">
              <div className="text-[10px] font-black tracking-wider text-neutral-400 uppercase">Original Words (A)</div>
              <div className="text-2xl font-black mt-0.5">{result.stats.wordsA}</div>
            </div>
            <div className="border-2 border-black p-3 bg-neutral-50 rounded-xl">
              <div className="text-[10px] font-black tracking-wider text-neutral-400 uppercase">Updated Words (B)</div>
              <div className="text-2xl font-black mt-0.5">{result.stats.wordsB}</div>
            </div>
            <div className="border-2 border-black p-3 bg-neutral-50 rounded-xl">
              <div className="text-[10px] font-black tracking-wider text-neutral-400 uppercase">Total Modifications</div>
              <div className="text-2xl font-black mt-0.5 text-amber-600">{result.stats.modifications} changes</div>
            </div>
            <div className="border-2 border-black p-3 bg-neutral-50 rounded-xl">
              <div className="text-[10px] font-black tracking-wider text-neutral-400 uppercase">Structural Shifts</div>
              <div className="text-2xl font-black mt-0.5 flex items-center gap-1">
                <span className="text-emerald-600 font-extrabold">+{result.stats.additions}</span>
                <span className="text-neutral-300">/</span>
                <span className="text-red-500 font-extrabold">-{result.stats.deletions}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs font-bold bg-neutral-50 p-3 rounded-xl border-2 border-black/10 mb-6">
            <div><div>🌐 Detected Language (Text A): <span className="underline uppercase ml-1">{result.language.a || "English"}</span></div></div>
            <div><div>🌐 Detected Language (Text B): <span className="underline uppercase ml-1">{result.language.b || "English"}</span></div></div>
          </div>

          {result.contradictions.length > 0 && (
            <div className="border-2 border-orange-500 bg-orange-500/5 p-4 rounded-2xl mb-6 break-inside-avoid">
              <h3 className="text-sm font-black text-orange-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> Semantic Meaning Contradictions Detected ({result.contradictions.length})
              </h3>
              <div className="space-y-2.5">
                {result.contradictions.map((c, idx) => (
                  <div key={idx} className="border border-orange-400/40 p-3 text-xs bg-white rounded-xl">
                    <div className="mb-1.5"><span className="px-1.5 py-0.5 bg-red-100 text-red-800 rounded font-black mr-2">ORIGINAL:</span> {c.original}</div>
                    <div><span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-black mr-2">CONTRADICTORY UPDATE:</span> {c.updated}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(result.numericChanges.length > 0 || result.dateChanges.length > 0) && (
            <div className="border-2 border-blue-500 bg-blue-500/5 p-4 rounded-2xl mb-6 break-inside-avoid">
              <h3 className="text-sm font-black text-blue-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Hash className="h-4 w-4" /> Crucial Numerical & Date Modifications
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.numericChanges.map((c, i) => (
                  <div key={i} className="text-xs bg-white border border-blue-400/40 px-3 py-1.5 rounded-lg flex items-center gap-2">
                    <span className="line-through text-red-500 font-bold">{c.original}</span>
                    <span className="text-neutral-400 font-black">→</span>
                    <span className="text-blue-700 font-extrabold underline">{c.updated}</span>
                  </div>
                ))}
                {result.dateChanges.map((c, i) => (
                  <div key={i} className="text-xs bg-white border border-violet-400/40 px-3 py-1.5 rounded-lg flex items-center gap-2">
                    <span className="line-through text-red-500">{c.original}</span>
                    <span className="text-neutral-400 font-black">→</span>
                    <span className="text-violet-700 font-extrabold underline">{c.updated}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-2 border-black p-5 rounded-2xl bg-white space-y-4">
            <h3 className="text-sm font-black uppercase tracking-wider border-b-2 border-neutral-100 pb-2">
              Full Document Comparative Output View
            </h3>
            <div className="text-sm leading-relaxed whitespace-pre-wrap tracking-tight text-neutral-800">
              {result.chunks.map((chunk) => {
                if (chunk.type === "equal") return <span key={chunk.id}>{chunk.textA}</span>;
                if (chunk.type === "added") return <span key={chunk.id} className="bg-emerald-100 text-emerald-900 px-0.5 border-b-2 border-emerald-500 mx-0.5">{chunk.textB}</span>;
                if (chunk.type === "removed") return <span key={chunk.id} className="bg-red-100 text-red-900 line-through px-0.5 border-b-2 border-red-500 mx-0.5">{chunk.textA}</span>;
                if (chunk.type === "modified") {
                  return (
                    <span key={chunk.id} className={cn("px-1 border-b-2 mx-0.5", chunk.isContradiction ? "bg-orange-100 text-orange-950 border-orange-500 font-bold" : chunk.isNumeric || chunk.isDate ? "bg-blue-100 text-blue-950 border-blue-500" : "bg-amber-100 text-amber-950 border-amber-500")}>
                      {` [${chunk.textA.trim()} → ${chunk.textB.trim()}] `}
                    </span>
                  );
                }
                return null;
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── WEB PANEL INTERFACE SCREEN ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <FileText className="h-3.5 w-3.5" /> Text Comparison Dashboard
        </span>
        {result && (
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border-2 border-foreground px-3 py-1 text-xs font-black shadow-[2px_2px_0_0_var(--color-foreground)] ${result.stats.similarity >= 80 ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : result.stats.similarity >= 50 ? "bg-amber-400/20 text-amber-700 dark:text-amber-300" : "bg-red-500/20 text-red-700 dark:text-red-300"}`}>
              {result.stats.similarity}% Similar
            </span>
            <button onClick={downloadReport} className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-background px-3 py-1.5 text-xs font-bold transition-all hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_var(--color-foreground)]">
              <Download className="h-3.5 w-3.5" /> Download PDF Report
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 print:hidden">
        {[{ label: "Text A — Original Content", value: textA, set: setTextA, lang: result?.language.a }, { label: "Text B — Modified Changes", value: textB, set: setTextB, lang: result?.language.b }].map(({ label, value, set, lang }) => (
          <div key={label} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {label}
                {lang && (
                  <span className="rounded-full border border-foreground/20 bg-secondary/40 px-2 py-0.5 text-[10px] font-semibold">
                    <Languages className="mr-0.5 inline h-2.5 w-2.5" />{lang}
                  </span>
                )}
              </p>
              <span className="text-[10px] text-muted-foreground">{countWords(value)} words</span>
            </div>
            <textarea
              value={value}
              onChange={(e) => set(e.target.value)}
              placeholder={`Paste raw text copy assets inside this container...`}
              rows={8}
              className="w-full resize-y rounded-2xl border-2 border-foreground bg-background px-4 py-3 text-sm font-medium leading-relaxed shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)] placeholder:text-muted-foreground/50"
            />
          </div>
        ))}
      </div>

      {(textA || textB) && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button onClick={() => { setTextA(""); setTextB(""); setResult(null); setErrorMsg(null); }}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground transition-all hover:-translate-y-0.5 hover:text-destructive hover:shadow-[2px_2px_0_0_var(--color-foreground)]">
            <X className="h-3.5 w-3.5" /> Clear All
          </button>
          <button onClick={() => setShowSearch((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1.5 text-xs font-bold transition-all hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_var(--color-foreground)] ${showSearch ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]" : "bg-background text-muted-foreground"}`}>
            <Search className="h-3.5 w-3.5" /> Inline String Match
          </button>
          {showSearch && (
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Type segment string matches..."
              autoFocus
              className="rounded-full border-2 border-foreground bg-background px-4 py-1.5 text-xs font-bold outline-none focus:shadow-[2px_2px_0_0_var(--color-primary)]" />
          )}
        </div>
      )}

      {/* ─── UI LAYER ERROR DISPLAY BOX ─── */}
      {errorMsg && (
        <div className="rounded-2xl border-2 border-destructive bg-destructive/10 p-5 shadow-[3px_3px_0_0_var(--color-destructive)] print:hidden flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <h4 className="font-black text-sm text-destructive uppercase tracking-wide">Analysis Blocked</h4>
            <p className="text-xs font-medium text-muted-foreground mt-1">{errorMsg}</p>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-5 print:hidden">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              { label: "Words Original", value: result.stats.wordsA, color: "text-foreground" },
              { label: "Words Updated", value: result.stats.wordsB, color: "text-foreground" },
              { label: "Additions", value: result.stats.additions, color: "text-emerald-600 dark:text-emerald-400" },
              { label: "Deletions", value: result.stats.deletions, color: "text-red-600 dark:text-red-400" },
              { label: "Modified", value: result.stats.modifications, color: "text-amber-600 dark:text-amber-400" },
              { label: "Similarity", value: `${result.stats.similarity}%`, color: "text-primary" },
              { label: "Total Edits", value: result.stats.additions + result.stats.deletions + result.stats.modifications, color: "text-foreground" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border-2 border-foreground bg-card p-3 text-center shadow-[3px_3px_0_0_var(--color-foreground)]">
                <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
                <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1 overflow-x-auto">
            <div className="inline-flex rounded-xl border-2 border-foreground bg-background p-1">
              {TABS.map((t) => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition-all ${activeTab === t ? "border-2 border-foreground bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]" : "border-2 border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Tab 1: Comparison splits */}
          {activeTab === "comparison" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-secondary/20 p-2 rounded-2xl border-2 border-foreground/10">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-xl border-2 border-foreground bg-background p-0.5">
                    {(["all", "added", "removed", "modified"] as const).map((f) => (
                      <button key={f} onClick={() => setFilterType(f)}
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-bold capitalize transition-all ${filterType === f ? "border-2 border-foreground bg-primary text-primary-foreground shadow-[1.5px_1.5px_0_0_var(--color-foreground)]" : "border-2 border-transparent text-muted-foreground hover:text-foreground"}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={goPrev} disabled={!filteredDiffChunks.length}
                      className="rounded-lg border-2 border-foreground bg-background p-1 text-xs disabled:opacity-40 hover:shadow-[1.5px_1.5px_0_0_var(--color-foreground)]">
                      <ArrowLeft className="h-3 w-3" />
                    </button>
                    <span className="text-[11px] font-bold text-muted-foreground px-1">
                      {activeIdx >= 0 ? `${activeIdx + 1}/` : ""}{filteredDiffChunks.length} markers
                    </span>
                    <button onClick={goNext} disabled={!filteredDiffChunks.length}
                      className="rounded-lg border-2 border-foreground bg-background p-1 text-xs disabled:opacity-40 hover:shadow-[1.5px_1.5px_0_0_var(--color-foreground)]">
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex lg:hidden mb-2">
                <div className="inline-flex rounded-xl border-2 border-foreground bg-background p-1">
                  {(["a", "b"] as const).map((v) => (
                    <button key={v} onClick={() => setMobileView(v)}
                      className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${mobileView === v ? "border-2 border-foreground bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]" : "border-2 border-transparent text-muted-foreground"}`}>
                      {v === "a" ? "Original" : "Updated"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className={cn(mobileView === "b" ? "hidden lg:block" : "block")}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider text-muted-foreground/80">Original (Text A)</p>
                    <button onClick={() => copyText(textA, "Original Text")} className="inline-flex items-center gap-1 rounded-lg border border-foreground/20 bg-background px-2 py-0.5 text-[10px] font-bold hover:shadow-[2px_2px_0_0_var(--color-foreground)] transition-all">
                      <Copy className="h-3 w-3" /> Copy A
                    </button>
                  </div>
                  <div ref={panelARef} onScroll={syncScroll("a")}
                    className="max-h-96 min-h-[16rem] overflow-y-auto rounded-2xl border-2 border-foreground bg-card p-4 text-sm leading-relaxed shadow-[3px_3px_0_0_var(--color-foreground)] font-medium">
                    {result.chunks.map((chunk) =>
                      chunk.type === "equal"
                        ? <CollapsibleEqual key={chunk.id} text={chunk.textA} searchQuery={searchQuery} />
                        : <ChunkSpan key={chunk.id} chunk={chunk} side="a" searchQuery={searchQuery}
                            isActive={chunk.id === activeChunkId}
                            onClick={() => setActiveChunkId(chunk.id === activeChunkId ? null : chunk.id)} />
                    )}
                  </div>
                </div>

                <div className={cn(mobileView === "a" ? "hidden lg:block" : "block")}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider text-muted-foreground/80">Modified (Text B)</p>
                    <button onClick={() => copyText(textB, "Updated Text")} className="inline-flex items-center gap-1 rounded-lg border border-foreground/20 bg-background px-2 py-0.5 text-[10px] font-bold hover:shadow-[2px_2px_0_0_var(--color-foreground)] transition-all">
                      <Copy className="h-3 w-3" /> Copy B
                    </button>
                  </div>
                  <div ref={panelBRef} onScroll={syncScroll("b")}
                    className="max-h-96 min-h-[16rem] overflow-y-auto rounded-2xl border-2 border-foreground bg-card p-4 text-sm leading-relaxed shadow-[3px_3px_0_0_var(--color-foreground)] font-medium">
                    {result.chunks.map((chunk) =>
                      chunk.type === "equal"
                        ? <CollapsibleEqual key={chunk.id} text={chunk.textB} searchQuery={searchQuery} />
                        : <ChunkSpan key={chunk.id} chunk={chunk} side="b" searchQuery={searchQuery}
                            isActive={chunk.id === activeChunkId}
                            onClick={() => setActiveChunkId(chunk.id === activeChunkId ? null : chunk.id)} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Reports Tab view */}
          {activeTab === "report" && (
            <div className="space-y-4">
              {result.chunks.filter((c) => c.type === "modified").length > 0 && (
                <div className="space-y-2 rounded-2xl border-2 border-foreground bg-card p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
                  <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Changes Mutations (Before → After)</p>
                  <div className="space-y-2">
                    {result.chunks.filter((c) => c.type === "modified").map((c) => (
                      <div key={c.id} className={cn("rounded-xl border-2 p-3 text-xs flex flex-wrap items-center gap-2 font-medium", c.isContradiction ? "border-orange-400 bg-orange-500/5" : c.isNumeric || c.isDate ? "border-blue-400 bg-blue-500/5" : "border-amber-400 bg-amber-400/5")}>
                        <span className="rounded bg-red-500/20 px-1.5 py-0.5 line-through text-red-800 dark:text-red-300">{c.textA.trim()}</span>
                        <span className="font-bold text-neutral-400">→</span>
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-800 dark:text-emerald-300">{c.textB.trim()}</span>
                        {c.isContradiction && <span className="ml-auto text-[9px] font-black px-2 py-0.5 bg-orange-500 text-white rounded uppercase tracking-wider">Semantic Lock</span>}
                        {(c.isNumeric || c.isDate) && <span className="ml-auto text-[9px] font-black px-2 py-0.5 bg-blue-600 text-white rounded uppercase tracking-wider">Delta Match</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {result.chunks.filter((c) => c.type === "removed").length > 0 && (
                  <div className="rounded-2xl border-2 border-red-500/30 bg-red-500/5 p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
                    <p className="mb-2 text-xs font-black uppercase tracking-wider text-red-700 dark:text-red-400">Purged Content Strings (Only inside Text A)</p>
                    {result.chunks.filter((c) => c.type === "removed").map((c) => (
                      <p key={c.id} className="rounded-lg border border-red-200 bg-background px-2 py-1.5 text-xs text-red-800 line-through dark:text-red-300 mb-1 font-medium shadow-sm">{c.textA.trim()}</p>
                    ))}
                  </div>
                )}
                {result.chunks.filter((c) => c.type === "added").length > 0 && (
                  <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 p-4 shadow-[3px_3px_0_0_var(--color-foreground)]">
                    <p className="mb-2 text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Inserted Content Strings (Only inside Text B)</p>
                    {result.chunks.filter((c) => c.type === "added").map((c) => (
                      <p key={c.id} className="rounded-lg border border-emerald-200 bg-background px-2 py-1.5 text-xs text-emerald-800 dark:text-emerald-300 mb-1 font-medium shadow-sm">{c.textB.trim()}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Restored Advanced Vector Analytics Graphs */}
          {activeTab === "analytics" && (
            <div className="grid gap-5 sm:grid-cols-2">
              {pie.length > 0 && (
                <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
                  <p className="mb-3 text-xs font-black uppercase tracking-wider text-muted-foreground">Variance Distribution Weights</p>
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pie} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" label={({ name, value }) => `${name}:${value}`} labelLine={false}>
                          {pie.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
                <p className="mb-3 text-xs font-black uppercase tracking-wider text-muted-foreground">Document Word Quantities Comparison</p>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bar}>
                      <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: "bold" }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="value">
                        {bar.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State Context Fallback */}
      {!textA && !textB && !errorMsg && (
        <div className="rounded-2xl border-2 border-dashed border-foreground/30 p-8 text-center print:hidden">
          <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="font-bold text-muted-foreground text-sm">Paste strings into the inputs above to run structural analysis checks</p>
        </div>
      )}

      {/* ─── PRINT ENGINE CUSTOM CSS STYLES INTERCEPT ─── */}
      <style>{`
        @media print {
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print\\:hidden, 
          header, 
          footer, 
          nav, 
          button, 
          textarea, 
          input,
          .space-y-5 > :not(.print\\:block) { 
            display: none !important; 
          }
          .max-h-96, .max-h-64, .overflow-y-auto, .min-h-\\[16rem\\] {
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
          }
          .print\\:block {
            display: block !important;
            width: 100% !important;
            position: relative !important;
          }
          .break-inside-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  );
}