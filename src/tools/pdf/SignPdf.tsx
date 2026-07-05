import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { toast } from "sonner";
import { Download, RotateCcw, ArrowRight, ChevronLeft, ChevronRight, Trash2, PenTool } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

// Bundler-native worker URL (works with Vite and Webpack 5 without a special
// loader), set once at module load instead of resolved at render time.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).href;

type Step = "sign" | "place";

// One-tap placements so the common corners/edges never need manual dragging —
// dragging still works exactly as before, this just sets the same `pos` state.
const POSITION_PRESETS: [string, { x: number; y: number }][] = [
  ["Top left", { x: 0.1, y: 0.08 }],
  ["Top center", { x: 0.5, y: 0.08 }],
  ["Top right", { x: 0.9, y: 0.08 }],
  ["Center", { x: 0.5, y: 0.5 }],
  ["Bottom left", { x: 0.1, y: 0.92 }],
  ["Bottom center", { x: 0.5, y: 0.92 }],
  ["Bottom right", { x: 0.9, y: 0.92 }],
];

export default function SignPdf() {
  const { showSupportPrompt } = useSupportPrompt();
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<Step>("sign");
  const [pageCount, setPageCount] = useState(1);
  const [targetPage, setTargetPage] = useState(1);
  const [signaturePng, setSignaturePng] = useState<string | null>(null);
  const [pageImg, setPageImg] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<{ w: number; h: number }>({ w: 612, h: 792 });

  // Placement in normalized [0,1] coordinates relative to the page.
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });
  const [sigWidthPct, setSigWidthPct] = useState(0.3); // width as fraction of page width
  const [busy, setBusy] = useState(false);

  // -------- signature pad
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasStrokes = useRef(false);

  const canvasPos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const startStroke = (e: React.PointerEvent) => {
    onPointerDown(e);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    drawing.current = true;
    hasStrokes.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.strokeStyle = "#111"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    const p = canvasPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  const moveStroke = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = canvasPos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const endStroke = () => { drawing.current = false; };
  const clearSig = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    hasStrokes.current = false;
  };

  // -------- load pdf metadata
  useEffect(() => {
    if (!files[0]) return;
    (async () => {
      const doc = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true });
      setPageCount(doc.getPageCount());
      setTargetPage(1);
      setStep("sign");
      setSignaturePng(null);
      setPageImg(null);
    })();
  }, [files]);

  // -------- render selected page with pdf.js when in placement step
  useEffect(() => {
    if (step !== "place" || !files[0]) return;
    let cancelled = false;
    (async () => {
      const buf = await files[0].arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      const page = await doc.getPage(targetPage);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas }).promise;
      if (cancelled) return;
      setPageImg(canvas.toDataURL("image/png"));
      const baseViewport = page.getViewport({ scale: 1 });
      setPageSize({ w: baseViewport.width, h: baseViewport.height });
    })().catch((e) => {
      console.error(e);
      toast.error("Couldn't preview this page.");
    });
    return () => { cancelled = true; };
  }, [step, files, targetPage]);

  const goToPlacement = () => {
    if (!files[0]) { toast.error("Please upload a PDF."); return; }
    if (!hasStrokes.current) { toast.error("Please draw your signature."); return; }
    setSignaturePng(canvasRef.current!.toDataURL("image/png"));
    setStep("place");
  };

  // -------- placement drag
  const previewRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const onSigPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onSigPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !previewRef.current) return;
    const r = previewRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setPos({ x: Math.min(0.99, Math.max(0.01, x)), y: Math.min(0.99, Math.max(0.01, y)) });
  };
  const onSigPointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const apply = async () => {
    if (!files[0] || !signaturePng) return;
    setBusy(true);
    try {
      const doc = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true });
      const embed = await doc.embedPng(signaturePng);
      const page = doc.getPage(targetPage - 1);
      const { width, height } = page.getSize();
      const sigW = width * sigWidthPct;
      const sigH = sigW * (embed.height / embed.width);
      // Convert normalized centre (top-origin) → pdf-lib bottom-left origin.
      const cx = pos.x * width;
      const cy = (1 - pos.y) * height;
      page.drawImage(embed, {
        x: cx - sigW / 2,
        y: cy - sigH / 2,
        width: sigW,
        height: sigH,
      });
      const bytes = await doc.save();
      const name = files[0].name.replace(/\.pdf$/i, "") + "-signed.pdf";
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), name);
      toast.success("Signature applied");

      // Trigger support prompt popup immediately following file download completion
      showSupportPrompt();
    } catch (e) {
      console.error(e);
      toast.error("Couldn't sign this PDF.");
    } finally {
      setBusy(false);
    }
  };

  const previewAspect = pageSize.w / pageSize.h;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <PenTool className="h-3.5 w-3.5" />
          Sign PDF
        </span>
      </div>

      <FileDrop accept="application/pdf" files={files} onFiles={setFiles} />

      {files[0] && (
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className={"flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-foreground text-[10px] " + (step === "sign" ? "bg-primary text-primary-foreground" : "bg-primary/15")}>1</span>
          Draw
          <span className="h-px w-6 bg-foreground/20" />
          <span className={"flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-foreground text-[10px] " + (step === "place" ? "bg-primary text-primary-foreground" : "bg-primary/15")}>2</span>
          Place
        </div>
      )}

      {files[0] && step === "sign" && (
        <>
          <div>
            <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
              Draw your signature below
            </span>
            <canvas
              ref={canvasRef} width={600} height={200}
              onPointerDown={startStroke} onPointerMove={moveStroke} onPointerUp={endStroke} onPointerLeave={endStroke}
              className="mt-2 w-full touch-none rounded-2xl border-2 border-dashed border-foreground/40 bg-white shadow-[3px_3px_0_0_var(--color-foreground)]"
              style={{ aspectRatio: "3/1" }}
            />
            <button
              type="button"
              onClick={clearSig}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold transition-transform hover:-translate-y-0.5"
            >
              <RotateCcw className="h-3 w-3" /> Clear
            </button>
          </div>
          <button
            type="button"
            onClick={goToPlacement}
            className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5"
          >
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        </>
      )}

      {files[0] && step === "place" && signaturePng && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-foreground bg-card p-3 shadow-[3px_3px_0_0_var(--color-foreground)]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTargetPage((p) => Math.max(1, p - 1))}
                disabled={targetPage <= 1}
                className="rounded-full border-2 border-foreground bg-background p-2 transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="rounded-full border-2 border-foreground bg-background px-3 py-1 text-xs font-bold">
                Page {targetPage} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setTargetPage((p) => Math.min(pageCount, p + 1))}
                disabled={targetPage >= pageCount}
                className="rounded-full border-2 border-foreground bg-background p-2 transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Size
                <input
                  type="range" min={0.1} max={0.6} step={0.01}
                  value={sigWidthPct}
                  onChange={(e) => setSigWidthPct(+e.target.value)}
                  aria-label="Signature size"
                  className="accent-primary"
                />
              </label>
              <button
                type="button"
                onClick={() => { setSignaturePng(null); setStep("sign"); }}
                className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-background px-3 py-1.5 text-xs font-bold transition-transform hover:-translate-y-0.5"
              >
                <Trash2 className="h-3 w-3" /> Redraw
              </button>
            </div>
          </div>

          {/* One-tap placements — dragging on the preview below still works exactly the same. */}
          <div className="flex flex-wrap gap-1.5">
            {POSITION_PRESETS.map(([label, p]) => (
              <button
                key={label}
                type="button"
                onClick={() => setPos(p)}
                aria-pressed={pos.x === p.x && pos.y === p.y}
                className={
                  "rounded-full border-2 border-foreground px-2.5 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 " +
                  (pos.x === p.x && pos.y === p.y ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]" : "bg-card")
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mx-auto max-w-2xl">
            <div
              ref={previewRef}
              className="relative w-full overflow-hidden rounded-2xl border-2 border-foreground bg-white shadow-[5px_5px_0_0_var(--color-foreground)]"
              style={{ aspectRatio: previewAspect }}
            >
              {pageImg ? (
                <img src={pageImg} alt="" className="pointer-events-none absolute inset-0 h-full w-full select-none" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-muted-foreground">
                  Loading page…
                </div>
              )}
              <img
                src={signaturePng}
                alt="Signature"
                draggable={false}
                onPointerDown={onSigPointerDown}
                onPointerMove={onSigPointerMove}
                onPointerUp={onSigPointerUp}
                className="absolute cursor-grab select-none touch-none active:cursor-grabbing"
                style={{
                  left: `${pos.x * 100}%`,
                  top: `${pos.y * 100}%`,
                  width: `${sigWidthPct * 100}%`,
                  transform: "translate(-50%, -50%)",
                  filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.2))",
                }}
              />
            </div>
            <p className="mt-2 rounded-lg border-2 border-dashed border-foreground/30 px-3 py-2 text-center text-xs font-medium text-muted-foreground">
              Tap a position above, or drag the signature to place it exactly. Use the slider to resize.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={apply}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
            >
              <Download className="h-4 w-4" /> {busy ? "Applying..." : "Apply Signature & Download"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}