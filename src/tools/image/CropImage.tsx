import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { Download, Crop as CropIcon } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { loadImage, canvasToBlob } from "./_canvas";

type Handle = "move" | "nw" | "ne" | "sw" | "se";

const ASPECTS: { key: string; label: string; ratio: number | null }[] = [
  { key: "free", label: "Free", ratio: null },
  { key: "1:1", label: "1:1", ratio: 1 },
  { key: "16:9", label: "16:9", ratio: 16 / 9 },
  { key: "9:16", label: "9:16", ratio: 9 / 16 },
  { key: "4:3", label: "4:3", ratio: 4 / 3 },
];

export default function CropImage() {
  const [files, setFiles] = useState<File[]>([]);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState({ x: 10, y: 10, w: 80, h: 80 }); // percent — same shape as before
  const [aspectKey, setAspectKey] = useState("free");
  const [showManual, setShowManual] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ handle: Handle; startX: number; startY: number; startCrop: typeof crop } | null>(null);

  useEffect(() => {
    if (!files[0]) { setImg(null); return; }
    loadImage(files[0]).then(setImg);
  }, [files]);

  // Identical crop/export logic — untouched.
  const run = async () => {
    if (!img) return;
    const cx = (crop.x / 100) * img.width, cy = (crop.y / 100) * img.height;
    const cw = (crop.w / 100) * img.width, ch = (crop.h / 100) * img.height;
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
    const blob = await canvasToBlob(canvas, "image/png");
    downloadBlob(blob, "cropped.png");
    toast.success("Cropped & downloaded");
  };

  const labelFor = (k: "x" | "y" | "w" | "h") =>
    k === "w" ? "Width" : k === "h" ? "Height" : k === "x" ? "Left" : "Top";

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const applyAspect = (next: typeof crop, ratio: number | null, containerAspect: number): typeof crop => {
    if (ratio === null) return next;
    // container is in on-screen pixels; convert the target ratio into percent-space
    const targetPctRatio = ratio / containerAspect;
    return { ...next, h: clamp(next.w / targetPctRatio, 5, 100 - next.y) };
  };

  const onDragStart = (handle: Handle) => (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragState.current = { handle, startX: e.clientX, startY: e.clientY, startCrop: crop };

    const containerRect = boxRef.current?.getBoundingClientRect();
    const containerAspect = containerRect ? containerRect.width / containerRect.height : 1;
    const activeRatio = ASPECTS.find((a) => a.key === aspectKey)?.ratio ?? null;

    const onMove = (ev: PointerEvent) => {
      const state = dragState.current;
      const rect = boxRef.current?.getBoundingClientRect();
      if (!state || !rect) return;
      const dxPct = ((ev.clientX - state.startX) / rect.width) * 100;
      const dyPct = ((ev.clientY - state.startY) / rect.height) * 100;
      const s = state.startCrop;

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

      if (state.handle !== "move") next = applyAspect(next, activeRatio, containerAspect);
      setCrop(next);
    };

    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleAspectPick = (key: string) => {
    setAspectKey(key);
    const ratio = ASPECTS.find((a) => a.key === key)?.ratio ?? null;
    if (ratio === null) return;
    const containerRect = boxRef.current?.getBoundingClientRect();
    const containerAspect = containerRect ? containerRect.width / containerRect.height : 1;
    setCrop((prev) => applyAspect(prev, ratio, containerAspect));
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
          {/* STEP 2 — drag directly on the image */}
          <div className="space-y-4 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">2</span>
                Drag the box to crop
              </p>
              <div className="inline-flex rounded-xl border-2 border-foreground bg-background p-1">
                {ASPECTS.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => handleAspectPick(a.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                      aspectKey === a.key
                        ? "border-2 border-foreground bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
                        : "border-2 border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={boxRef}
              className="relative mx-auto max-w-lg touch-none select-none overflow-hidden rounded-2xl border-2 border-foreground shadow-[4px_4px_0_0_var(--color-foreground)]"
            >
              <img src={img.src} alt="src" className="w-full" draggable={false} />
              <div className="pointer-events-none absolute inset-0 bg-black/40" />
              <div
                onPointerDown={onDragStart("move")}
                className="absolute cursor-move border-2 border-primary"
                style={{
                  left: crop.x + "%", top: crop.y + "%", width: crop.w + "%", height: crop.h + "%",
                  boxShadow: "0 0 0 9999px oklch(0 0 0 / 0.5) inset, 3px 3px 0 0 var(--color-foreground)",
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

            {/* Manual fine-tune kept for anyone who wants exact percentages — same sliders as before */}
            <button
              onClick={() => setShowManual((v) => !v)}
              className="text-xs font-bold text-primary underline decoration-2 underline-offset-2"
            >
              {showManual ? "Hide manual fine-tuning" : "Fine-tune manually"}
            </button>

            {showManual && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(["x", "y", "w", "h"] as const).map((k) => (
                  <label key={k} className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {labelFor(k)}: {Math.round(crop[k])}%
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={crop[k]}
                      onChange={(e) => {
                        setAspectKey("free");
                        setCrop({ ...crop, [k]: +e.target.value });
                      }}
                      className="mt-2 w-full accent-primary"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={run}
            className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)]"
          >
            <CropIcon className="h-4 w-4" /> Crop & Download
          </button>
        </>
      )}
    </div>
  );
}