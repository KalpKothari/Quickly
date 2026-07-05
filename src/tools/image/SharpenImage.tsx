import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Sparkles, Loader2 } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { loadImage, canvasToBlob } from "./_canvas";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

// Identical convolution — untouched.
function convolve(imgData: ImageData, kernel: number[]) {
  const { data, width, height } = imgData;
  const out = new Uint8ClampedArray(data);
  const k = Math.sqrt(kernel.length) | 0;
  const half = Math.floor(k / 2);
  for (let y = half; y < height - half; y++) {
    for (let x = half; x < width - half; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let ky = 0; ky < k; ky++) for (let kx = 0; kx < k; kx++) {
          const p = ((y + ky - half) * width + (x + kx - half)) * 4 + c;
          s += data[p] * kernel[ky * k + kx];
        }
        out[(y * width + x) * 4 + c] = Math.max(0, Math.min(255, s));
      }
    }
  }
  return new ImageData(out, width, height);
}

export default function SharpenImage() {
  const { showSupportPrompt } = useSupportPrompt();
  const [files, setFiles] = useState<File[]>([]);
  const [amount, setAmount] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [previewLoading, setPreviewLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shared core — builds the sharpened canvas. Used by both preview and download
  // so they're always guaranteed to match exactly.
  const buildSharpenedCanvas = async (): Promise<HTMLCanvasElement | null> => {
    if (!files[0]) return null;
    const img = await loadImage(files[0]);
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    const a = amount;
    const kernel = [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0];
    ctx.putImageData(convolve(data, kernel), 0, 0);
    return c;
  };

  // Identical to before, just now calling the shared builder — same output, same download.
  const run = async () => {
    try {
      const c = await buildSharpenedCanvas();
      if (!c) return;
      const blob = await canvasToBlob(c, "image/png");
      downloadBlob(blob, "sharpened.png"); toast.success("Sharpened & downloaded");
      
      // Trigger support prompt popup immediately following file download completion
      showSupportPrompt();
    } catch { toast.error("Failed"); }
  };

  // NEW: debounced auto-preview — waits until the slider settles before running
  // the (potentially expensive) convolution, so dragging stays smooth.
  useEffect(() => {
    if (!files[0]) { setPreviewUrl(undefined); return; }
    setPreviewLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const c = await buildSharpenedCanvas();
        if (!c) return;
        const blob = await canvasToBlob(c, "image/png");
        setPreviewUrl(URL.createObjectURL(blob));
      } catch {
        toast.error("Couldn't generate a preview.");
      } finally {
        setPreviewLoading(false);
      }
    }, 300); // slightly longer debounce than simpler tools, since convolution is CPU-heavier
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, amount]);

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

      {files[0] && (
        <>
          {/* Live preview */}
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

          {/* STEP 2 — sharpness amount */}
          <div className="space-y-4 rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">2</span>
              Adjust sharpness — preview updates automatically
            </p>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Sharpness: {amount.toFixed(1)}×</span>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.1}
                value={amount}
                onChange={(e) => setAmount(+e.target.value)}
                className="mt-2 w-full accent-primary"
              />
            </label>
          </div>

          {/* STEP 3 — download once happy with the preview */}
          <button
            type="button"
            onClick={run}
            className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)]"
          >
            <Sparkles className="h-4 w-4" /> Sharpen & Download
          </button>
        </>
      )}
    </div>
  );
}