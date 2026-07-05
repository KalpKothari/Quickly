import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";
import { Download, ArrowUp, ArrowDown, ArrowRight, FileText, ExternalLink } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob, formatBytes } from "@/lib/format";
import { useRecent } from "@/lib/stores";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

// The one place the actual merge happens — used for both the live preview
// and the final download, so what you preview is exactly what you get.
async function buildMergedPdf(files: File[]): Promise<Blob> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  const bytes = await out.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export default function MergePdf() {
  const { showSupportPrompt } = useSupportPrompt();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const addRecent = useRecent((s) => s.addProcessed);

  // Mobile/touch browsers (Android Chrome, Safari iOS, etc.) generally can't
  // render a blob: PDF inline via <object>/<iframe> the way desktop browsers
  // can with their built-in PDF viewer — it shows a native "refused to
  // connect" error instead. Detect that up front and skip the broken embed
  // there, offering an "open in new tab" button instead (which does work,
  // since it's a full navigation, not an inline embed).
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setIsTouchDevice(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsTouchDevice(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= files.length) return;
    const copy = [...files];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setFiles(copy);
  };

  // Regenerate the live preview whenever the file list or order changes.
  // Debounced so rapid reorder clicks don't trigger a rebuild per click.
  useEffect(() => {
    if (files.length < 2) {
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
        const blob = await buildMergedPdf(files);
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
  }, [files]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const run = async () => {
    if (files.length < 2) {
      toast.error("Add at least 2 PDFs");
      return;
    }
    setBusy(true);
    try {
      const blob = await buildMergedPdf(files);
      downloadBlob(blob, "merged.pdf");
      addRecent({
        toolSlug: "merge-pdf",
        toolName: "Merge PDFs",
        category: "pdf",
        fileName: "merged.pdf",
        meta: `${files.length} files`,
        at: Date.now(),
      });
      toast.success("Merged");

      // Trigger support prompt popup immediately following file download completion
      showSupportPrompt();
    } catch {
      toast.error("Merge failed. Check that files are valid PDFs.");
    } finally {
      setBusy(false);
    }
  };

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  return (
    <div className="w-full min-w-0 space-y-6">
      {/* STEP 1 — add files */}
      <div className="min-w-0">
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">1</span>
          Add your PDFs
        </p>
        <FileDrop accept="application/pdf" multiple files={files} onFiles={setFiles} hint="Add 2 or more PDFs" />
      </div>

      {files.length > 0 && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start">
          {/* STEP 2 — order them */}
          <div className="min-w-0 space-y-4 rounded-2xl border-2 border-foreground bg-card p-3 shadow-[3px_3px_0_0_var(--color-foreground)] sm:p-5 sm:shadow-[4px_4px_0_0_var(--color-foreground)]">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">2</span>
                Put them in merge order
              </p>
              <span className="shrink-0 rounded-full border-2 border-foreground bg-background px-3 py-1 text-xs font-bold">
                {files.length} files · {formatBytes(totalSize)}
              </span>
            </div>

            <ul className="min-w-0 space-y-2">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex min-w-0 items-center gap-2 rounded-xl border-2 border-foreground bg-background px-2.5 py-2.5 shadow-[2px_2px_0_0_var(--color-foreground)] sm:gap-3 sm:px-3 sm:shadow-[3px_3px_0_0_var(--color-foreground)]"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[11px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.name}</span>
                  <span className="hidden shrink-0 text-xs font-medium text-muted-foreground sm:inline">{formatBytes(f.size)}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="rounded-full border-2 border-foreground bg-card p-1.5 transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`Move ${f.name} up`}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === files.length - 1}
                      className="rounded-full border-2 border-foreground bg-card p-1.5 transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`Move ${f.name} down`}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            {/* visual merge-order preview */}
            {files.length >= 2 && (
              <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-foreground/30 bg-secondary/30 p-3">
                {files.map((f, i) => (
                  <span key={i} className="flex min-w-0 items-center gap-2">
                    <span className="max-w-[6rem] truncate rounded-full border-2 border-foreground bg-card px-2.5 py-1 text-[11px] font-bold sm:max-w-[9rem]">
                      {f.name}
                    </span>
                    {i < files.length - 1 && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                  </span>
                ))}
              </div>
            )}

            {files.length < 2 && (
              <p className="text-xs font-medium text-muted-foreground">Add one more PDF to start merging.</p>
            )}

            <button
              type="button"
              onClick={run}
              disabled={files.length < 2 || busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border-2 border-foreground bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform enabled:hover:-translate-y-0.5 enabled:hover:shadow-[5px_5px_0_0_var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> {busy ? "Merging..." : "Merge & Download"}
            </button>
          </div>

          {/* LIVE PREVIEW of the actual merged output */}
          <div className="min-w-0 rounded-2xl border-2 border-foreground bg-secondary/30 p-3 shadow-[3px_3px_0_0_var(--color-foreground)] sm:shadow-[4px_4px_0_0_var(--color-foreground)]">
            <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Live preview</p>
              <div className="flex shrink-0 items-center gap-2">
                {previewLoading && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Updating…
                  </span>
                )}
                {previewUrl && !isTouchDevice && (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border-2 border-foreground bg-card px-2 py-1 text-[11px] font-bold transition-transform hover:-translate-y-0.5"
                  >
                    <ExternalLink className="h-3 w-3" /> Open in new tab
                  </a>
                )}
              </div>
            </div>

            {files.length < 2 ? (
              <div className="flex h-48 items-center justify-center rounded-xl border-2 border-dashed border-foreground/30 p-4 text-center text-sm font-medium text-muted-foreground sm:h-64">
                Add a second PDF to see a live preview of the merged file
              </div>
            ) : previewUrl ? (
              isTouchDevice ? (
                <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-foreground/30 p-6 text-center sm:h-64">
                  <p className="text-sm font-medium text-muted-foreground">
                    Inline preview isn't supported on mobile browsers — tap below to view it instead.
                  </p>
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
                  >
                    <ExternalLink className="h-4 w-4" /> View merged PDF
                  </a>
                </div>
              ) : (
                <div className="w-full min-w-0 overflow-hidden rounded-xl border-2 border-foreground bg-white">
                  {/* object (not iframe) so a blocked/failed embed shows real fallback
                      content instead of going silently blank — this is what production
                      hosts with a strict Content-Security-Policy (missing `blob:` in
                      frame-src/object-src) were doing to the old iframe. */}
                  <object
                    key={previewUrl}
                    data={previewUrl}
                    type="application/pdf"
                    className="block h-[50vh] w-full max-w-full sm:h-[65vh] lg:h-[640px]"
                  >
                    <div className="flex h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center text-sm font-medium text-muted-foreground sm:h-[65vh] lg:h-[640px]">
                      <p>Your browser blocked the inline preview.</p>
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
                      >
                        <ExternalLink className="h-4 w-4" /> Open the preview in a new tab
                      </a>
                    </div>
                  </object>
                </div>
              )
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