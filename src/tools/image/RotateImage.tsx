import { useState } from "react";
import { toast } from "sonner";
import { Download, FlipHorizontal, FlipVertical, RotateCw, RotateCcw } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { loadImage, canvasToBlob } from "./_canvas";
export default function RotateImage() {
  const [files, setFiles] = useState<File[]>([]);
  const [angle, setAngle] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();
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
  return (
    <div className="space-y-6">
      <FileDrop accept="image/*" files={files} onFiles={(f) => { setFiles(f); setPreviewUrl(undefined); }} />
      {files[0] && (
        <>
          <div className="flex flex-wrap gap-2">
            {([[-90, "−90°"], [90, "+90°"], [180, "180°"]] as const).map(([a, l]) => (
              <button key={l} onClick={() => setAngle((angle + a + 360) % 360)}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-4 py-2 text-sm hover:bg-secondary">
                <span>{l}</span>
              </button>
            ))}
            <button onClick={() => setFlipH(!flipH)} className={"inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm " + (flipH ? "bg-primary text-primary-foreground" : "border border-border bg-secondary/50")}>
              <FlipHorizontal className="h-4 w-4" /> Flip H
            </button>
            <button onClick={() => setFlipV(!flipV)} className={"inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm " + (flipV ? "bg-primary text-primary-foreground" : "border border-border bg-secondary/50")}>
              <FlipVertical className="h-4 w-4" /> Flip V
            </button>
          </div>
          <label className="block"><span className="text-xs uppercase text-muted-foreground">Angle: {angle}°</span>
            <input type="range" min={0} max={360} value={angle} onChange={(e) => setAngle(+e.target.value)} className="w-full" />
          </label>
          <div className="flex gap-2">
            <button onClick={() => run(false)} className="rounded-xl border border-border px-5 py-2.5 text-sm hover:bg-secondary">Preview</button>
            <button onClick={() => run(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
              <Download className="h-4 w-4" /> Download
            </button>
          </div>
          {previewUrl && <img src={previewUrl} alt="preview" className="mx-auto max-h-96 rounded-xl border border-border" />}
        </>
      )}
    </div>
  );
}
