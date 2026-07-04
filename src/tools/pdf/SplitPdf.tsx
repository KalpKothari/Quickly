import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { toast } from "sonner";
import { Download, FileText, RotateCcw } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";

function allPagesRanges(count: number) {
  return Array.from({ length: count }, (_, i) => `${i + 1}-${i + 1}`).join(", ");
}

export default function SplitPdf() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [ranges, setRanges] = useState("1-1, 2-2");
  const [rangeStart, setRangeStart] = useState<number | null>(null);

  const parseRanges = (s: string) => s.split(",").map((r) => r.trim()).filter(Boolean).map((r) => {
    const [a, b] = r.split("-").map((x) => parseInt(x)); return [a - 1, (b ? b : a) - 1] as [number, number];
  });

  const load = async (f: File) => {
    const doc = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
    setPageCount(doc.getPageCount());
    setRanges(allPagesRanges(doc.getPageCount()));
    setRangeStart(null);
  };

  const run = async () => {
    if (!files[0]) return;
    setBusy(true);
    try {
      const src = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true });
      const parts = parseRanges(ranges);
      
      // Check if user is accessing from a mobile device
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (isMobile) {
        // Mobile Workflow: Download each split part separately as native PDF files
        let i = 0;
        for (const [a, b] of parts) {
          const doc = await PDFDocument.create();
          const idx = []; for (let p = a; p <= b; p++) if (p >= 0 && p < src.getPageCount()) idx.push(p);
          const pages = await doc.copyPages(src, idx); pages.forEach((p) => doc.addPage(p));
          const bytes = await doc.save();
          
          const pdfBlob = new Blob([bytes], { type: "application/pdf" });
          downloadBlob(pdfBlob, `part-${++i}-pages-${a + 1}-${b + 1}.pdf`);
        }
        toast.success(`Downloaded ${parts.length} separate PDF files`);
      } else {
        // Desktop Workflow: Pack all split parts into a single clean ZIP file
        const zip = new JSZip();
        let i = 0;
        for (const [a, b] of parts) {
          const doc = await PDFDocument.create();
          const idx = []; for (let p = a; p <= b; p++) if (p >= 0 && p < src.getPageCount()) idx.push(p);
          const pages = await doc.copyPages(src, idx); pages.forEach((p) => doc.addPage(p));
          const bytes = await doc.save();
          zip.file(`part-${++i}-pages-${a + 1}-${b + 1}.pdf`, bytes);
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, "split.zip");
        toast.success("Split into " + parts.length + " files wrapped in ZIP");
      }
    } catch { 
      toast.error("Split failed"); 
    } finally { 
      setBusy(false); 
    }
  };

  const handleResetWorkspace = () => {
    setFiles([]);
    setPageCount(0);
    setRanges("1-1, 2-2");
    setRangeStart(null);
  };

  // --- workflow helpers (display/convenience only — don't touch parseRanges/run) ---
  const currentTokens = ranges.split(",").map((r) => r.trim().replace(/\s+/g, "")).filter(Boolean);
  const parsedPreview = pageCount > 0 ? parseRanges(ranges) : [];

  const pickPage = (n: number) => {
    if (rangeStart === null) {
      setRangeStart(n);
      toast.info(`Selected page ${n} as start. Tap another page to complete the range.`);
      return;
    }
    const from = Math.min(rangeStart, n);
    const to = Math.max(rangeStart, n);
    const token = `${from}-${to}`;
    
    // Clear ranges if it matches the fallback baseline reset array length completely
    const isBaseline = ranges === allPagesRanges(pageCount);
    const updatedTokens = isBaseline ? [token] : [...currentTokens, token];
    
    setRanges(updatedTokens.join(", "));
    setRangeStart(null);
    toast.success(`Added range: ${from} to ${to}`);
  };

  const applyHalves = () => {
    const mid = Math.ceil(pageCount / 2);
    setRanges(`1-${mid}, ${mid + 1}-${pageCount}`);
    setRangeStart(null);
  };

  const applyWhole = () => {
    setRanges(`1-${pageCount}`);
    setRangeStart(null);
  };
  
  const applyOnePerPage = () => {
    setRanges(allPagesRanges(pageCount));
    setRangeStart(null);
  };

  return (
    <div className="space-y-6">
      {/* Neo-brutalist Header Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
            <FileText className="h-3.5 w-3.5" />
            PDF Range Splitter
          </span>
        </div>
      </div>

      {/* STEP 1 — upload */}
      {!files[0] ? (
        <div className="rounded-2xl border-2 border-foreground bg-card p-2 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <FileDrop accept="application/pdf" files={files} onFiles={(f) => { setFiles(f); if (f[0]) load(f[0]); }} />
        </div>
      ) : (
        pageCount > 0 && (
          <div className="space-y-5">
            {/* Metadata and Reset Row Capsule Pill Layout */}
            <div className="rounded-full border-2 border-foreground bg-card p-2 pl-4 pr-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shadow-[3px_3px_0_0_var(--color-foreground)]">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[11px] font-bold text-primary">
                  1
                </span>
                <div className="text-sm font-semibold text-foreground truncate">
                  {files[0].name}
                  <span className="text-muted-foreground font-normal"> ({pageCount} Pages Loaded)</span>
                </div>
              </div>
              
              <button
                type="button"
                onClick={handleResetWorkspace}
                className="rounded-full border-2 border-foreground bg-destructive text-destructive-foreground px-4 py-1.5 text-xs font-bold shrink-0 shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
              >
                <RotateCcw className="h-3.5 w-3.5 inline mr-1" /> Reset Workspace
              </button>
            </div>

            {/* Selection Setup Box */}
            <div className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)] space-y-5">
              <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                Choose Split Profile Action
              </span>

              {/* Quick presets */}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={applyOnePerPage} className="rounded-xl border-2 border-foreground bg-background px-3 py-1.5 text-xs font-bold transition-transform hover:-translate-y-0.5 shadow-[2px_2px_0_0_var(--color-foreground)]">
                  One PDF per page
                </button>
                <button type="button" onClick={applyHalves} className="rounded-xl border-2 border-foreground bg-background px-3 py-1.5 text-xs font-bold transition-transform hover:-translate-y-0.5 shadow-[2px_2px_0_0_var(--color-foreground)]">
                  Split in half
                </button>
                <button type="button" onClick={applyWhole} className="rounded-xl border-2 border-foreground bg-background px-3 py-1.5 text-xs font-bold transition-transform hover:-translate-y-0.5 shadow-[2px_2px_0_0_var(--color-foreground)]">
                  Keep as one file
                </button>
              </div>

              {/* Tappable page range selector panel */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-foreground/70">
                    Tap pages consecutively to define extraction boundaries (From - To)
                  </span>
                  {rangeStart !== null && (
                    <span className="text-[11px] font-black text-primary bg-primary/15 border border-primary/20 rounded px-2 py-0.5 animate-pulse">
                      Selecting from page {rangeStart}...
                    </span>
                  )}
                </div>

                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-xl border-2 border-foreground bg-background p-3">
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => {
                    const isStartNode = rangeStart === n;
                    const insideActiveRange = parsedPreview.some(([a, b]) => (n - 1) >= a && (n - 1) <= b);
                    
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => pickPage(n)}
                        className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 border-foreground text-xs font-black transition-transform hover:-translate-y-0.5 ${
                          isStartNode 
                            ? "bg-amber-400 text-black shadow-[1px_1px_0_0_var(--color-foreground)]" 
                            : insideActiveRange 
                            ? "bg-primary text-primary-foreground shadow-[1px_1px_0_0_var(--color-foreground)]" 
                            : "bg-card text-foreground"
                        }`}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ranges Custom String Input */}
              <label className="block">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <span className="inline-flex rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/70">
                    Configured Generation Ranges
                  </span>
                  {rangeStart !== null && (
                    <button 
                      type="button" 
                      onClick={() => setRangeStart(null)}
                      className="text-[10px] font-bold text-destructive underline hover:text-destructive/80"
                    >
                      Cancel Pending Range Selection
                    </button>
                  )}
                </div>
                <input
                  value={ranges}
                  onChange={(e) => setRanges(e.target.value)}
                  placeholder="1-3, 5-5, 8-10"
                  className="w-full rounded-xl border-2 border-foreground bg-background px-3 py-2.5 font-mono text-sm outline-none focus:shadow-[3px_3px_0_0_var(--color-primary)] shadow-[2px_2px_0_0_var(--color-foreground)]"
                />
                <span className="mt-2 block text-[11px] font-bold text-foreground/60 px-1">
                  This execution will generate {parsedPreview.length} individual split file{parsedPreview.length === 1 ? "" : "s"} inside the package.
                </span>
              </label>

              {/* Core Execution Trigger */}
              <button
                type="button"
                onClick={run}
                disabled={busy || parsedPreview.length === 0}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-5 py-4 text-base font-bold text-primary-foreground shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="h-5 w-5" /> {busy ? "Processing Split Operations..." : "Split & Download PDF Pages"}
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}