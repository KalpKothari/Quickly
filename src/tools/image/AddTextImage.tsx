import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { loadImage, canvasToBlob } from "./_canvas";

const POSITION_PRESETS: { key: string; label: string; x: number; y: number }[] = [
  { key: "tl", label: "↖", x: 10, y: 10 },
  { key: "tc", label: "↑", x: 50, y: 10 },
  { key: "tr", label: "↗", x: 90, y: 10 },
  { key: "c", label: "•", x: 50, y: 50 },
  { key: "bl", label: "↙", x: 10, y: 90 },
  { key: "bc", label: "↓", x: 50, y: 90 },
  { key: "br", label: "↘", x: 90, y: 90 },
];

export default function AddTextImage() {
  const [files, setFiles] = useState<File[]>([]);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [text, setText] = useState("Made with Quickly");
  const [size, setSize] = useState(48);
  const [color, setColor] = useState("#ffffff");
  const [x, setX] = useState(50); const [y, setY] = useState(90); // unchanged state shape
  const [dragging, setDragging] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (files[0]) loadImage(files[0]).then(setImg); else setImg(null); }, [files]);

  // Identical draw logic — untouched.
  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const c = canvasRef.current; c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 8;
    ctx.fillText(text, (x / 100) * img.width, (y / 100) * img.height);
  }, [img, text, size, color, x, y]);

  const run = async () => {
    if (!canvasRef.current) return;
    const b = await canvasToBlob(canvasRef.current, "image/png");
    downloadBlob(b, "with-text.png"); toast.success("Downloaded");
  };

  // Converts a pointer position on the rendered canvas into the same 0-100 percent
  // space that x/y already use — no change to how the draw effect interprets them.
  const updatePositionFromPointer = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pctX = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const pctY = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    setX(Math.round(pctX));
    setY(Math.round(pctY));
  };

  const onCanvasPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setDragging(true);
    updatePositionFromPointer(e.clientX, e.clientY);

    const onMove = (ev: PointerEvent) => updatePositionFromPointer(ev.clientX, ev.clientY);
    const onUp = () => {
      setDragging(false);
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
          {/* Draggable live preview */}
          <div className="space-y-2 rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
            <div className="flex items-center justify-between">
              <p className="inline-flex rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Live Preview
              </p>
              <p className="text-xs text-muted-foreground">Drag the text on the image to move it</p>
            </div>
            <div ref={wrapperRef} className="mx-auto w-fit">
              <canvas
                ref={canvasRef}
                onPointerDown={onCanvasPointerDown}
                className={`mx-auto max-w-full touch-none rounded-xl border-2 border-foreground ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
                style={{ maxHeight: 400 }}
              />
            </div>
          </div>

          {/* STEP 2 — quick position + fine style controls */}
          <div className="space-y-5 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">2</span>
              Position and style
            </p>

            {/* Quick position presets — one click, same x/y state as dragging */}
            <div className="flex flex-wrap gap-2">
              {POSITION_PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => { setX(p.x); setY(p.y); }}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-foreground text-sm font-bold transition-all ${
                    x === p.x && y === p.y
                      ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
                      : "bg-background hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_var(--color-foreground)]"
                  }`}
                  title={p.label}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Text</span>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-foreground bg-background px-3 py-2.5 text-sm font-medium shadow-[2px_2px_0_0_var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Color</span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border-2 border-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
                />
              </label>
              <label className="col-span-full block">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Size: {size}px</span>
                <input
                  type="range"
                  min={10}
                  max={200}
                  value={size}
                  onChange={(e) => setSize(+e.target.value)}
                  className="mt-2 w-full accent-primary"
                />
              </label>
            </div>

            {/* Manual x/y fine-tune kept for precision, tucked away since dragging covers the common case */}
            <details className="group">
              <summary className="cursor-pointer text-xs font-bold text-primary underline decoration-2 underline-offset-2">
                Fine-tune position manually
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Horizontal: {x}%</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={x}
                    onChange={(e) => setX(+e.target.value)}
                    className="mt-2 w-full accent-primary"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Vertical: {y}%</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={y}
                    onChange={(e) => setY(+e.target.value)}
                    className="mt-2 w-full accent-primary"
                  />
                </label>
              </div>
            </details>
          </div>

          {/* STEP 3 — download */}
          <button
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