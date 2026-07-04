import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";
import { Download, FileOutput } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";

// Same page-list parsing as before, just extracted into a function so the
// live preview and the final download can both call it identically.
function parseKeepSet(s: string, max: number): Set<number> {
  const keep = new Set<number>();
  s.split(",").map((x) => x.trim()).forEach((tok) => {
    if (tok.includes("-")) { const [a, b] = tok.split("-").map(Number); for (let i = a; i <= b; i++) if (i >= 1 && i <= max) keep.add(i - 1); }
    else { const n = parseInt(tok); if (n >= 1 && n <= max) keep.add(n - 1); }
  });
  return keep;
}

// Compresses a sorted list of 1-indexed page numbers back into the same
// "1-3" range syntax that parseKeepSet already understands, so clicking
// pages in the grid produces exactly the same string a person would type.
function numbersToRangeString(nums: number[]): string {
  if (nums.length === 0) return "";
  const parts: string[] = [];
  let start = nums[0], prev = nums[0];
  for (let i = 1; i <= nums.length; i++) {
    const n = nums[i];
    if (n === prev + 1) { prev = n; continue; }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    if (n !== undefined) { start = n; prev = n; }
  }
  return parts.join(", ");
}

// The one place the extraction actually happens — used for both the live
// preview and the final download, so what you preview is exactly what you get.
async function buildExtractedPdf(file: File, pagesStr: string): Promise<Blob> {
  const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const keep = parseKeepSet(pagesStr, src.getPageCount());
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, [...keep].sort((a, b) => a - b));
  copied.forEach((p) => out.addPage(p));
  const bytes = await out.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export default function ExtractPdfPages() {
  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [pages, setPages] = useState("1-3");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  const load = async (f: File) => { setPageCount((await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true })).getPageCount()); };

  // Same parsing used by run() below, reused here just to know which chips to highlight.
  const selected = (() => {
    const zeroIndexed = parseKeepSet(pages, pageCount);
    return new Set(Array.from(zeroIndexed, (i) => i + 1));
  })();

  const togglePage = (n: number) => {
    const next = new Set(selected);
    if (next.has(n)) next.delete(n); else next.add(n);
    setPages(numbersToRangeString(Array.from(next).sort((a, b) => a - b)));
  };

  // Regenerate the live preview whenever the file or the page selection changes.
  // Debounced so rapid clicking through the page grid doesn't rebuild per click.
  useEffect(() => {
    if (!files[0] || pageCount === 0) {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setPreviewUrl(null);
      return;
    }
    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      try {
        const blob = await buildExtractedPdf(files[0], pages);
        const url = URL.createObjectURL(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        setPreviewUrl(url);
      } catch {
        setPreviewUrl(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [files, pages, pageCount]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const run = async () => {
    if (!files[0]) return;
    setBusy(true);
    try {
      const blob = await buildExtractedPdf(files[0], pages);
      downloadBlob(blob, "extracted.pdf");
      toast.success("Extracted");
    } catch {
      toast.error("Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <FileOutput className="h-3.5 w-3.5" />
          Extract PDF Pages
        </span>
      </div>

      <div className="min-w-0">
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">1</span>
          Add your PDF
        </p>
        <FileDrop accept="application/pdf" files={files} onFiles={(f) => { setFiles(f); if (f[0]) load(f[0]); }} />
      </div>

      {pageCount > 0 && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start">
          {/* STEP 2 — choose pages */}
          <div className="min-w-0 space-y-4 rounded-2xl border-2 border-foreground bg-card p-3 shadow-[3px_3px_0_0_var(--color-foreground)] sm:p-5 sm:shadow-[4px_4px_0_0_var(--color-foreground)]">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">2</span>
                Tap pages to keep
              </p>
              <span className="shrink-0 rounded-full border-2 border-foreground bg-background px-3 py-1 text-xs font-bold">
                {pageCount} pages
              </span>
            </div>

            {selected.size > 0 && (
              <div className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                {selected.size} selected to extract
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <button
                onClick={() => setPages(numbersToRangeString(Array.from({ length: pageCount }, (_, i) => i + 1)))}
                className="rounded-full border-2 border-foreground bg-background px-2.5 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5"
              >
                Select all
              </button>
              <button
                onClick={() => setPages("")}
                className="rounded-full border-2 border-foreground bg-background px-2.5 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5"
              >
                Clear
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => togglePage(n)}
                  aria-pressed={selected.has(n)}
                  aria-label={`Page ${n}${selected.has(n) ? ", selected to extract" : ""}`}
                  className={
                    "flex h-9 w-9 items-center justify-center rounded-lg border-2 border-foreground text-sm font-bold transition-transform hover:-translate-y-0.5 " +
                    (selected.has(n)
                      ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
                      : "bg-background")
                  }
                >
                  {n}
                </button>
              ))}
            </div>

            <details open={showAdvanced} onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)} className="rounded-xl border-2 border-dashed border-foreground/30">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Or type page numbers / ranges directly
              </summary>
              <div className="border-t-2 border-dashed border-foreground/30 p-3">
                <input
                  value={pages}
                  onChange={(e) => setPages(e.target.value)}
                  placeholder="1-3"
                  aria-label="Pages to extract"
                  className="w-full rounded-xl border-2 border-foreground bg-background px-3 py-2.5 font-mono text-sm font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
                />
              </div>
            </details>

            <button
              onClick={run}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border-2 border-foreground bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform enabled:hover:-translate-y-0.5 enabled:hover:shadow-[5px_5px_0_0_var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> {busy ? "Extracting..." : "Extract & Download"}
            </button>
          </div>

          {/* LIVE PREVIEW of the actual extracted PDF, same pattern as Merge PDF / Delete PDF Pages */}
          <div className="min-w-0 rounded-2xl border-2 border-foreground bg-secondary/30 p-3 shadow-[3px_3px_0_0_var(--color-foreground)] sm:shadow-[4px_4px_0_0_var(--color-foreground)]">
            <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Live preview</p>
              {previewLoading && (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Updating…
                </span>
              )}
            </div>

            {previewUrl ? (
              <div className="w-full min-w-0 overflow-hidden rounded-xl border-2 border-foreground bg-white">
                <iframe
                  key={previewUrl}
                  src={previewUrl}
                  title="Extracted PDF preview"
                  className="block h-[50vh] w-full max-w-full border-0 sm:h-[65vh] lg:h-[640px]"
                />
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center rounded-xl border-2 border-dashed border-foreground/30 text-center text-sm font-medium text-muted-foreground sm:h-64">
                Preparing preview…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}