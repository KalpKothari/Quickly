import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { toast } from "sonner";
import { Download, GripVertical, FileText, RotateCcw } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export default function ReorderPdf() {
  const { showSupportPrompt } = useSupportPrompt();
  const [files, setFiles] = useState<File[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [rendering, setRendering] = useState(false);

  // Mobile Touch tracking state variables
  const [activeTouchIdx, setActiveTouchIdx] = useState<number | null>(null);

  const load = async (f: File) => {
    setRendering(true);
    try {
      const arrayBuffer = await f.arrayBuffer();
      const doc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
      setOrder(doc.getPageIndices());

      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const generatedThumbs: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.4 });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (context) {
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          generatedThumbs.push(canvas.toDataURL("image/jpeg", 0.85));
        } else {
          generatedThumbs.push("");
        }
      }
      setThumbnails(generatedThumbs);
    } catch (err) {
      toast.error("Failed to extract visual pages from PDF.");
    } finally {
      setRendering(false);
    }
  };

  const moveTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder(next);
  };

  const run = async () => {
    if (!files[0]) return;
    try {
      const src = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, order);
      pages.forEach((p) => out.addPage(p));
      const bytes = await out.save();
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), "reordered.pdf");
      toast.success("Reordered successfully");

      // Trigger support prompt popup immediately following file download completion
      showSupportPrompt();
    } catch {
      toast.error("Failed to generate PDF");
    }
  };

  const handleResetWorkspace = () => {
    setFiles([]);
    setOrder([]);
    setThumbnails([]);
    setDragIdx(null);
    setOverIdx(null);
    setActiveTouchIdx(null);
  };

  // --- MOBILE TOUCH EMULATION HANDLERS ---
  const handleTouchStart = (index: number) => {
    setActiveTouchIdx(index);
    setDragIdx(index);
  };

  const handleTouchMove = (e: React.TouchEvent, index: number) => {
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const itemElement = element?.closest("[data-page-index]");

    if (itemElement) {
      const targetIdx = Number(itemElement.getAttribute("data-page-index"));
      if (!Number.isNaN(targetIdx) && overIdx !== targetIdx) {
        setOverIdx(targetIdx);
      }
    }
  };

  const handleTouchEnd = () => {
    if (activeTouchIdx !== null && overIdx !== null && activeTouchIdx !== overIdx) {
      moveTo(activeTouchIdx, overIdx);
    }
    setDragIdx(null);
    setOverIdx(null);
    setActiveTouchIdx(null);
  };

  return (
    <div className="space-y-6">
      {/* Neo-brutalist Header Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
            <FileText className="h-3.5 w-3.5" />
            PDF Page Organiser
          </span>
        </div>
      </div>

      {!files[0] ? (
        <div className="rounded-2xl border-2 border-foreground bg-card p-2 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <FileDrop accept="application/pdf" files={files} onFiles={(f) => { setFiles(f); if (f[0]) load(f[0]); }} />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Metadata Matrix Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-full border-2 border-foreground bg-card p-2 pl-4 pr-3 shadow-[3px_3px_0_0_var(--color-foreground)]">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[11px] font-bold text-primary">
                1
              </span>
              <div className="text-sm font-semibold text-foreground truncate">
                {files[0].name} <span className="text-muted-foreground font-normal">({order.length} Pages Loaded)</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetWorkspace}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-foreground bg-destructive text-destructive-foreground px-4 py-1.5 text-xs font-bold transition-transform hover:-translate-y-0.5 shadow-[2px_2px_0_0_var(--color-foreground)] shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Change Source
            </button>
          </div>

          {rendering ? (
            <div className="rounded-2xl border-2 border-foreground bg-card p-8 text-center shadow-[4px_4px_0_0_var(--color-foreground)] font-bold animate-pulse text-sm text-foreground/70">
              Generating rendering page grid thumbnails...
            </div>
          ) : (
            order.length > 0 && (
              <>
                <div className="rounded-xl border-2 border-foreground bg-primary/10 p-3 text-xs font-bold text-foreground/80 shadow-[2px_2px_0_0_var(--color-foreground)]">
                  Drag or hold any page tile to rearrange. The final PDF output composition will follow the sequential layout order below.
                </div>

                {/* Fully Responsive Grid Container */}
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 select-none touch-none">
                  {order.map((p, i) => (
                    <li
                      key={`${p}-${i}`}
                      draggable
                      data-page-index={i}
                      // Desktop Drag Events
                      onDragStart={(e) => {
                        setDragIdx(i);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(i));
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (overIdx !== i) setOverIdx(i);
                      }}
                      onDragLeave={() => setOverIdx((cur) => (cur === i ? null : cur))}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = dragIdx ?? Number(e.dataTransfer.getData("text/plain"));
                        if (!Number.isNaN(from)) moveTo(from, i);
                        setDragIdx(null);
                        setOverIdx(null);
                      }}
                      onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                      // Mobile Touch Event Injection
                      onTouchStart={() => handleTouchStart(i)}
                      onTouchMove={(e) => handleTouchMove(e, i)}
                      onTouchEnd={handleTouchEnd}
                      className={
                        "group relative flex aspect-[3/4] cursor-grab flex-col items-center justify-between rounded-2xl border-2 bg-card p-2 transition-all active:cursor-grabbing shadow-[3px_3px_0_0_var(--color-foreground)] " +
                        (dragIdx === i ? "opacity-30 scale-95 " : "hover:-translate-y-0.5 ") +
                        (overIdx === i && dragIdx !== i ? "border-primary bg-primary/5 ring-4 ring-primary/20 " : "border-foreground")
                      }
                    >
                      {/* Drag Handle Overlay */}
                      <GripVertical className="absolute left-2 top-2 h-4 w-4 text-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 bg-background/80 rounded border border-foreground/10 p-0.5" />

                      {/* Live Index Position Badge */}
                      <span className="absolute right-2 top-2 rounded-md border-2 border-foreground bg-primary px-2 py-0.5 text-xs font-black text-primary-foreground shadow-[1px_1px_0_0_var(--color-foreground)] z-10">
                        {i + 1}
                      </span>

                      {/* Dynamic Visual Content Thumbnail Wrapper */}
                      <div className="w-full h-[82%] mt-6 rounded-lg border border-foreground/10 overflow-hidden bg-background flex items-center justify-center relative">
                        {thumbnails[p] ? (
                          <img
                            src={thumbnails[p]}
                            alt={`Page visual preview ${p + 1}`}
                            className="w-full h-full object-contain pointer-events-none"
                          />
                        ) : (
                          <FileText className="h-10 w-10 text-foreground/20" />
                        )}
                      </div>

                      {/* Source Metadata Tracker text */}
                      <span className="text-[10px] font-bold text-foreground/60 tracking-tight font-mono truncate w-full text-center mt-1">
                        Original Pg {p + 1}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Compile Action Control Module */}
                <button
                  type="button"
                  onClick={run}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-5 py-3.5 text-base font-bold text-primary-foreground shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
                >
                  <Download className="h-5 w-5" /> Apply Structural Sequence & Save PDF
                </button>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}