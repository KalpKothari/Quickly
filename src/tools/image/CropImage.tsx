import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { loadImage, canvasToBlob } from "./_canvas";
export default function CropImage() {
  const [files, setFiles] = useState<File[]>([]);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState({ x: 10, y: 10, w: 80, h: 80 }); // percent
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!files[0]) { setImg(null); return; }
    loadImage(files[0]).then(setImg);
  }, [files]);
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
  return (
    <div className="space-y-6">
      <FileDrop accept="image/*" files={files} onFiles={setFiles} />
      {img && (
        <>
          <div ref={boxRef} className="relative mx-auto max-w-lg overflow-hidden rounded-xl border border-border">
            <img src={img.src} alt="src" className="w-full" />
            <div className="pointer-events-none absolute inset-0 bg-black/40" />
            <div className="absolute border-2 border-primary" style={{
              left: crop.x + "%", top: crop.y + "%", width: crop.w + "%", height: crop.h + "%",
              boxShadow: "0 0 0 9999px oklch(0 0 0 / 0.5) inset"
            }} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["x","y","w","h"] as const).map((k) => (
              <label key={k} className="block">
                <span className="text-xs uppercase text-muted-foreground">{k === "w" ? "Width" : k === "h" ? "Height" : k === "x" ? "Left" : "Top"}: {crop[k]}%</span>
                <input type="range" min={0} max={100} value={crop[k]} onChange={(e) => setCrop({ ...crop, [k]: +e.target.value })} className="w-full" />
              </label>
            ))}
          </div>
          <button onClick={run} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Download className="h-4 w-4" /> Crop & Download
          </button>
        </>
      )}
    </div>
  );
}
