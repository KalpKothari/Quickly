import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { loadImage, canvasToBlob } from "./_canvas";
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
  const [files, setFiles] = useState<File[]>([]);
  const [amount, setAmount] = useState(1);
  const run = async () => {
    if (!files[0]) return;
    try {
      const img = await loadImage(files[0]);
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const a = amount;
      const kernel = [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0];
      ctx.putImageData(convolve(data, kernel), 0, 0);
      const blob = await canvasToBlob(c, "image/png");
      downloadBlob(blob, "sharpened.png"); toast.success("Sharpened & downloaded");
    } catch { toast.error("Failed"); }
  };
  return (
    <div className="space-y-6">
      <FileDrop accept="image/*" files={files} onFiles={setFiles} />
      {files[0] && (
        <>
          <label className="block"><span className="text-xs uppercase text-muted-foreground">Sharpness: {amount.toFixed(1)}×</span>
            <input type="range" min={0.2} max={3} step={0.1} value={amount} onChange={(e) => setAmount(+e.target.value)} className="w-full" />
          </label>
          <button onClick={run} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Download className="h-4 w-4" /> Sharpen & Download
          </button>
        </>
      )}
    </div>
  );
}
