import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FlipHorizontal, FlipVertical, RotateCw, RotateCcw, Loader2 } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { loadImage, canvasToBlob } from "./_canvas";

export default function RotateImage() {
  const [files, setFiles] = useState<File[]>([]);
  const [angle, setAngle] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [previewLoading, setPreviewLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Identical to before — same canvas math, same blob generation, same download call.
  const run = async (dl: boolean) => {
    if (!files[0]) return;
    try {
      const img = await loadImage(files[0]);
      const rad = (angle * Math.PI) / 180;
      const sin = Math.abs(Math.sin(rad));
      const cos = Math.abs(Math.cos(rad));
      const w = img.width * cos + img.height * sin;
      const h = img.width * sin + img.height * cos;
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.translate(w / 2, h / 2);
      ctx.rotate(rad);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      const blob = await canvasToBlob(canvas, "image/png");
      if (dl) { downloadBlob(blob, "rotated.png"); toast.success("Downloaded"); }
      else setPreviewUrl(URL.createObjectURL(blob));
    } catch { toast.error("Failed"); }
  };

  // NEW: auto-preview whenever angle/flip/file changes, debounced — no button needed.
  // Calls the exact same run(false) that the old "Preview" button used to trigger manually.
  useEffect(() => {
    if (!files[0]) return;
    setPreviewLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      run(false).finally(() => setPreviewLoading(false));
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, angle, flipH, flipV]);

  return (
    <div className="space-y-6">
      {/* STEP 1 — upload */}
      <div>
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">1</span>
          Choose an image
        </p>
        <FileDrop accept="image/*" files={files} onFiles={(f) => { setFiles(f); setPreviewUrl(undefined); setAngle(0); setFlipH(false); setFlipV(false); }} />
      </div>

      {files[0] && (
        <>
          {/* Live preview sits right up top — updates automatically as controls change below */}
          <div className="space-y-2 rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
            <div className="flex items-center justify-between">
              <p className="inline-flex rounded-full border-2 border-foreground bg-background px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Live Preview
              </p>
              {previewLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {previewUrl ? (
              <img src={previewUrl} alt="preview" className="mx-auto max-h-96 rounded-xl border-2 border-foreground" />
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                Generating preview…
              </div>
            )}
          </div>

          {/* STEP 2 — rotate & flip controls */}
          <div className="space-y-5 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">2</span>
              Rotate and flip — the preview above updates instantly
            </p>

            <div className="flex flex-wrap gap-2">
              {([[-90, "−90°", RotateCcw], [90, "+90°", RotateCw], [180, "180°", RotateCw]] as const).map(([a, l, Icon]) => (
                <button
                  key={l}
                  onClick={() => setAngle((angle + a + 360) % 360)}
                  className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-background px-4 py-2 text-sm font-bold transition-all hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--color-foreground)]"
                >
                  <Icon className="h-4 w-4" />
                  <span>{l}</span>
                </button>
              ))}
              <button
                onClick={() => setFlipH(!flipH)}
                className={`inline-flex items-center gap-2 rounded-full border-2 border-foreground px-4 py-2 text-sm font-bold transition-all ${
                  flipH
                    ? "bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
                    : "bg-background hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--color-foreground)]"
                }`}
              >
                <FlipHorizontal className="h-4 w-4" /> Flip H
              </button>
              <button
                onClick={() => setFlipV(!flipV)}
                className={`inline-flex items-center gap-2 rounded-full border-2 border-foreground px-4 py-2 text-sm font-bold transition-all ${
                  flipV
                    ? "bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
                    : "bg-background hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--color-foreground)]"
                }`}
              >
                <FlipVertical className="h-4 w-4" /> Flip V
              </button>
              {(angle !== 0 || flipH || flipV) && (
                <button
                  onClick={() => { setAngle(0); setFlipH(false); setFlipV(false); }}
                  className="inline-flex items-center gap-2 rounded-full border-2 border-dashed border-foreground/50 px-4 py-2 text-sm font-bold text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-solid hover:text-foreground"
                >
                  Reset
                </button>
              )}
            </div>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Angle: {angle}°</span>
              <input
                type="range"
                min={0}
                max={360}
                value={angle}
                onChange={(e) => setAngle(+e.target.value)}
                className="mt-2 w-full accent-primary"
              />
            </label>
          </div>

          {/* STEP 3 — download once happy with the preview */}
          <button
            onClick={() => run(true)}
            className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)]"
          >
            <Download className="h-4 w-4" /> Download
          </button>
        </>
      )}
    </div>
  );
}