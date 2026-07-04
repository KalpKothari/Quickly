import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";
import { Download, RotateCcw, ArrowRight, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";

type Step = "sign" | "place";

export default function SignPdf() {
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
      const pdfjs = await import("pdfjs-dist");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default as string;
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      const buf = await files[0].arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buf }).promise;
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
      <FileDrop accept="application/pdf" files={files} onFiles={setFiles} />

      {files[0] && step === "sign" && (
        <>
          <div>
            <div className="mb-2 text-xs uppercase text-muted-foreground">Draw your signature below</div>
            <canvas
              ref={canvasRef} width={600} height={200}
              onPointerDown={startStroke} onPointerMove={moveStroke} onPointerUp={endStroke} onPointerLeave={endStroke}
              className="w-full touch-none rounded-2xl border-2 border-dashed border-border bg-white"
              style={{ aspectRatio: "3/1" }}
            />
            <button onClick={clearSig} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary">
              <RotateCcw className="h-3 w-3" /> Clear
            </button>
          </div>
          <button
            onClick={goToPlacement}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        </>
      )}

      {files[0] && step === "place" && signaturePng && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTargetPage((p) => Math.max(1, p - 1))}
                disabled={targetPage <= 1}
                className="rounded-lg border border-border p-2 hover:bg-secondary disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm">Page {targetPage} of {pageCount}</span>
              <button
                onClick={() => setTargetPage((p) => Math.min(pageCount, p + 1))}
                disabled={targetPage >= pageCount}
                className="rounded-lg border border-border p-2 hover:bg-secondary disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Size
                <input
                  type="range" min={0.1} max={0.6} step={0.01}
                  value={sigWidthPct}
                  onChange={(e) => setSigWidthPct(+e.target.value)}
                />
              </label>
              <button
                onClick={() => { setSignaturePng(null); setStep("sign"); }}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary"
              >
                <Trash2 className="h-3 w-3" /> Redraw
              </button>
            </div>
          </div>

          <div className="mx-auto max-w-2xl">
            <div
              ref={previewRef}
              className="relative w-full overflow-hidden rounded-xl border border-border bg-white shadow-sm"
              style={{ aspectRatio: previewAspect }}
            >
              {pageImg ? (
                <img src={pageImg} alt="" className="pointer-events-none absolute inset-0 h-full w-full select-none" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
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
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Drag the signature to position it. Use the slider to resize.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={apply}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> {busy ? "Applying..." : "Apply Signature & Download"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
