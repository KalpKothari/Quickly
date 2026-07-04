import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { GitCompare, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pixelmatch from "pixelmatch";
import { useDocumentJob } from "@/hooks/useDocumentJob";
import DocumentDropzone from "@/components/document/DocumentDropzone";
import DocProcessingOverlay from "@/components/document/DocProcessingOverlay";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export default function ComparePdfs() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [pageCountA, setPageCountA] = useState(0);
  const [pageCountB, setPageCountB] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [diffPercent, setDiffPercent] = useState<number | null>(null);
  const canvasARef = useRef<HTMLCanvasElement>(null);
  const canvasBRef = useRef<HTMLCanvasElement>(null);
  const canvasDiffRef = useRef<HTMLCanvasElement>(null);
  const scrollARef = useRef<HTMLDivElement>(null);
  const scrollBRef = useRef<HTMLDivElement>(null);
  const docARef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const docBRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const { status, progress, stepLabel, errorMessage, run, cancel, reset } = useDocumentJob();

  const handleReset = () => {
    setFileA(null);
    setFileB(null);
    setPageCountA(0);
    setPageCountB(0);
    setCurrentPage(1);
    setDiffPercent(null);
    docARef.current = null;
    docBRef.current = null;
    reset();
  };

  const loadPair = async (a: File, b: File) => {
    await run("loading these PDFs", async (setProgress, checkCancelled) => {
      setProgress(10, "Reading first PDF…");
      const bufA = await a.arrayBuffer();
      checkCancelled();
      const docA = await pdfjsLib.getDocument({ data: bufA }).promise;
      setProgress(40, "Reading second PDF…");
      docARef.current = docA;
      setPageCountA(docA.numPages);

      const bufB = await b.arrayBuffer();
      checkCancelled();
      const docB = await pdfjsLib.getDocument({ data: bufB }).promise;
      docBRef.current = docB;
      setPageCountB(docB.numPages);

      setProgress(100, "Ready");
      setCurrentPage(1);
    });
  };

  const handleFileA = (f: File) => {
    setFileA(f);
    if (fileB) loadPair(f, fileB);
  };
  const handleFileB = (f: File) => {
    setFileB(f);
    if (fileA) loadPair(fileA, f);
  };

  const renderPage = async () => {
    const docA = docARef.current;
    const docB = docBRef.current;
    if (!docA || !docB) return;

    const hasA = currentPage <= docA.numPages;
    const hasB = currentPage <= docB.numPages;

   if (hasA && canvasARef.current) {
  const page = await docA.getPage(currentPage);
  const viewport = page.getViewport({ scale: zoom * 1.5 });
  const canvas = canvasARef.current;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
}

if (hasB && canvasBRef.current) {
  const page = await docB.getPage(currentPage);
  const viewport = page.getViewport({ scale: zoom * 1.5 });
  const canvas = canvasBRef.current;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
}

    // Pixel diff — only meaningful when both pages exist and share dimensions.
    if (hasA && hasB && canvasARef.current && canvasBRef.current && canvasDiffRef.current) {
      const a = canvasARef.current;
      const b = canvasBRef.current;
      if (a.width === b.width && a.height === b.height) {
        const ctxA = a.getContext("2d")!;
        const ctxB = b.getContext("2d")!;
        const imgA = ctxA.getImageData(0, 0, a.width, a.height);
        const imgB = ctxB.getImageData(0, 0, b.width, b.height);
        const diffCanvas = canvasDiffRef.current;
        diffCanvas.width = a.width;
        diffCanvas.height = a.height;
        const diffCtx = diffCanvas.getContext("2d")!;
        const diffImg = diffCtx.createImageData(a.width, a.height);

        const changedPixels = pixelmatch(imgA.data, imgB.data, diffImg.data, a.width, a.height, {
          threshold: 0.1,
          diffColor: [255, 0, 80],
        });

        diffCtx.putImageData(diffImg, 0, 0);
        setDiffPercent((changedPixels / (a.width * a.height)) * 100);
      } else {
        setDiffPercent(null);
      }
    } else {
      setDiffPercent(null);
    }
  };

  useEffect(() => {
    if (docARef.current && docBRef.current) renderPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, zoom]);

  const maxPage = Math.max(pageCountA, pageCountB);

  const syncScroll = (source: "a" | "b") => (e: React.UIEvent<HTMLDivElement>) => {
    const target = source === "a" ? scrollBRef.current : scrollARef.current;
    if (target) {
      target.scrollTop = e.currentTarget.scrollTop;
      target.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  return (
    <div className="space-y-6">
      {(!fileA || !fileB) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs uppercase text-muted-foreground">First PDF</p>
            {!fileA ? (
              <DocumentDropzone onFile={handleFileA} accept="application/pdf" label="Drop first PDF here" />
            ) : (
              <p className="rounded-xl border border-border bg-secondary/30 p-3 text-sm">{fileA.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase text-muted-foreground">Second PDF</p>
            {!fileB ? (
              <DocumentDropzone onFile={handleFileB} accept="application/pdf" label="Drop second PDF here" />
            ) : (
              <p className="rounded-xl border border-border bg-secondary/30 p-3 text-sm">{fileB.name}</p>
            )}
          </div>
        </div>
      )}

      <DocProcessingOverlay status={status} progress={progress} stepLabel={stepLabel} errorMessage={errorMessage} onCancel={cancel} />

      {fileA && fileB && status === "done" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span>{fileA.name} ({pageCountA} pages)</span>
              <span className="text-muted-foreground">vs</span>
              <span>{fileB.name} ({pageCountB} pages)</span>
            </div>
            <button onClick={handleReset} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
              <RotateCcw className="h-3.5 w-3.5" /> Compare different files
            </button>
          </div>

          {pageCountA !== pageCountB && (
            <p className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-3 text-sm text-amber-700 dark:text-amber-400">
              These PDFs have different page counts ({pageCountA} vs {pageCountB}) — pages beyond the shorter document will show as blank on that side.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-sm text-muted-foreground">Page {currentPage} / {maxPage}</span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(maxPage, p + 1))}
                disabled={currentPage >= maxPage}
                className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Next →
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="rounded-lg border border-border p-1.5">
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-sm text-muted-foreground">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className="rounded-lg border border-border p-1.5">
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div ref={scrollARef} onScroll={syncScroll("a")} className="max-h-[600px] overflow-auto rounded-xl border border-border bg-secondary/20 p-2">
              {currentPage <= pageCountA ? (
                <canvas ref={canvasARef} className="mx-auto" />
              ) : (
                <p className="p-8 text-center text-sm text-muted-foreground">No page {currentPage} in this document</p>
              )}
            </div>
            <div ref={scrollBRef} onScroll={syncScroll("b")} className="max-h-[600px] overflow-auto rounded-xl border border-border bg-secondary/20 p-2">
              {currentPage <= pageCountB ? (
                <canvas ref={canvasBRef} className="mx-auto" />
              ) : (
                <p className="p-8 text-center text-sm text-muted-foreground">No page {currentPage} in this document</p>
              )}
            </div>
          </div>

          {diffPercent !== null && (
            <div className="space-y-2 rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex items-center gap-2 text-sm">
                <GitCompare className="h-4 w-4" />
                <span>{diffPercent < 0.5 ? "Pages appear visually identical" : `${diffPercent.toFixed(2)}% of this page differs`}</span>
              </div>
              {diffPercent >= 0.5 && (
                <canvas ref={canvasDiffRef} className="mx-auto max-w-full rounded-lg border border-border" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}