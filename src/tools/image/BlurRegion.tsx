import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { loadImage, canvasToBlob } from "./_canvas";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

type Handle = "move" | "nw" | "ne" | "sw" | "se";

export default function BlurRegion() {
  const { showSupportPrompt } = useSupportPrompt();
  const [files, setFiles] = useState<File[]>([]);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [region, setRegion] = useState({ x: 25, y: 25, w: 40, h: 30 }); // unchanged state shape
  const [blur, setBlur] = useState(20);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragState = useRef<{ handle: Handle; startX: number; startY: number; startRegion: typeof region } | null>(null);

  useEffect(() => { if (files[0]) loadImage(files[0]).then(setImg); else setImg(null); }, [files]);

  // Identical draw/blur logic — untouched.
  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const c = canvasRef.current; c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
    const rx = (region.x/100)*img.width, ry = (region.y/100)*img.height;
    const rw = (region.w/100)*img.width, rh = (region.h/100)*img.height;
    ctx.save();
    ctx.filter = `blur(${blur}px)`;
    ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }, [img, region, blur]);

  const run = async () => {
    if (!canvasRef.current) return;
    const b = await canvasToBlob(canvasRef.current, "image/png");
    downloadBlob(b, "blurred.png"); toast.success("Downloaded");
    
    // Trigger support prompt popup immediately following file download completion
    showSupportPrompt();
  };

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  // Drag/resize handles write into the exact same region state the blur effect reads from.
  const onDragStart = (handle: Handle) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragState.current = { handle, startX: e.clientX, startY: e.clientY, startRegion: region };

    const onMove = (ev: PointerEvent) => {
      const state = dragState.current;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!state || !rect) return;
      const dxPct = ((ev.clientX - state.startX) / rect.width) * 100;
      const dyPct = ((ev.clientY - state.startY) / rect.height) * 100;
      const s = state.startRegion;
      let next = { ...s };

      if (state.handle === "move") {
        next.x = clamp(s.x + dxPct, 0, 100 - s.w);
        next.y = clamp(s.y + dyPct, 0, 100 - s.h);
      } else if (state.handle === "se") {
        next.w = clamp(s.w + dxPct, 5, 100 - s.x);
        next.h = clamp(s.h + dyPct, 5, 100 - s.y);
      } else if (state.handle === "sw") {
        const newW = clamp(s.w - dxPct, 5, s.x + s.w);
        next.x = s.x + s.w - newW;
        next.w = newW;
        next.h = clamp(s.h + dyPct, 5, 100 - s.y);
      } else if (state.handle === "ne") {
        next.w = clamp(s.w + dxPct, 5, 100 - s.x);
        const newH = clamp(s.h - dyPct, 5, s.y + s.h);
        next.y = s.y + s.h - newH;
        next.h = newH;
      } else if (state.handle === "nw") {
        const newW = clamp(s.w - dxPct, 5, s.x + s.w);
        const newH = clamp(s.h - dyPct, 5, s.y + s.h);
        next.x = s.x + s.w - newW;
        next.y = s.y + s.h - newH;
        next.w = newW;
        next.h = newH;
      }
      setRegion(next);
    };

    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="space-y-6">
      {/* STEP 1 — upload */}
      <div>
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">1</span>
          Choose an image
        </p>
        <FileDrop accept="image/*" files={files} onFiles={setFiles} />
      </div>

      {img && (
        <>
          {/* STEP 2 — drag the region directly on the image */}
          <div className="space-y-4 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">2</span>
              Drag the box over what to blur
            </p>

            <div className="relative mx-auto w-fit touch-none select-none">
              <canvas
                ref={canvasRef}
                className="mx-auto max-w-full rounded-xl border-2 border-foreground"
                style={{ maxHeight: 400 }}
              />
              {/* Overlay box — purely visual/interactive; the actual blur is baked into the canvas above by the effect */}
              <div
                onPointerDown={onDragStart("move")}
                className="absolute cursor-move border-2 border-dashed border-primary"
                style={{
                  left: region.x + "%", top: region.y + "%", width: region.w + "%", height: region.h + "%",
                }}
              >
                {(["nw", "ne", "sw", "se"] as const).map((h) => (
                  <div
                    key={h}
                    onPointerDown={onDragStart(h)}
                    className={`absolute h-4 w-4 rounded-full border-2 border-foreground bg-primary shadow-[2px_2px_0_0_var(--color-foreground)] ${
                      h === "nw" ? "-left-2 -top-2 cursor-nwse-resize" :
                      h === "ne" ? "-right-2 -top-2 cursor-nesw-resize" :
                      h === "sw" ? "-bottom-2 -left-2 cursor-nesw-resize" :
                      "-bottom-2 -right-2 cursor-nwse-resize"
                    }`}
                  />
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Drag inside the box to move it, or drag a corner handle to resize.
            </p>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Blur strength: {blur}px</span>
              <input
                type="range"
                min={2}
                max={80}
                value={blur}
                onChange={(e) => setBlur(+e.target.value)}
                className="mt-2 w-full accent-primary"
              />
            </label>

            {/* Manual fine-tune kept for precision, tucked away since dragging covers the common case */}
            <details>
              <summary className="cursor-pointer text-xs font-bold text-primary underline decoration-2 underline-offset-2">
                Fine-tune region manually
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {(["x", "y", "w", "h"] as const).map((k) => (
                  <label key={k} className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {k === "w" ? "Width" : k === "h" ? "Height" : k === "x" ? "Left" : "Top"}: {Math.round(region[k])}%
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={region[k]}
                      onChange={(e) => setRegion({ ...region, [k]: +e.target.value })}
                      className="mt-2 w-full accent-primary"
                    />
                  </label>
                ))}
              </div>
            </details>
          </div>

          {/* STEP 3 — download */}
          <button
            type="button"
            onClick={run}
            className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)]"
          >
            <Download className="h-4 w-4" /> Download
          </button>
        </>
      )}
    </div>
  );
}