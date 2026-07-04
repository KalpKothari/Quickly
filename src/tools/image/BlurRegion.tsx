import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { loadImage, canvasToBlob } from "./_canvas";
export default function BlurRegion() {
  const [files, setFiles] = useState<File[]>([]);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [region, setRegion] = useState({ x: 25, y: 25, w: 40, h: 30 });
  const [blur, setBlur] = useState(20);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (files[0]) loadImage(files[0]).then(setImg); else setImg(null); }, [files]);
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
  };
  return (
    <div className="space-y-6">
      <FileDrop accept="image/*" files={files} onFiles={setFiles} />
      {img && (
        <>
          <canvas ref={canvasRef} className="mx-auto max-w-full rounded-xl border border-border" style={{ maxHeight: 400 }} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(["x","y","w","h"] as const).map((k) => (
              <label key={k}><span className="text-xs uppercase text-muted-foreground">{k}: {region[k]}%</span>
                <input type="range" min={0} max={100} value={region[k]} onChange={(e) => setRegion({...region, [k]: +e.target.value})} className="w-full" />
              </label>
            ))}
            <label><span className="text-xs uppercase text-muted-foreground">Blur: {blur}px</span>
              <input type="range" min={2} max={80} value={blur} onChange={(e) => setBlur(+e.target.value)} className="w-full" />
            </label>
          </div>
          <button onClick={run} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Download className="h-4 w-4" /> Download
          </button>
        </>
      )}
    </div>
  );
}
