import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { loadImage, canvasToBlob } from "./_canvas";
export default function AddTextImage() {
  const [files, setFiles] = useState<File[]>([]);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [text, setText] = useState("Made with Quickly");
  const [size, setSize] = useState(48);
  const [color, setColor] = useState("#ffffff");
  const [x, setX] = useState(50); const [y, setY] = useState(90);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (files[0]) loadImage(files[0]).then(setImg); else setImg(null); }, [files]);
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
  return (
    <div className="space-y-6">
      <FileDrop accept="image/*" files={files} onFiles={setFiles} />
      {img && (
        <>
          <canvas ref={canvasRef} className="mx-auto max-w-full rounded-xl border border-border" style={{ maxHeight: 400 }} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="text-xs uppercase text-muted-foreground">Text</span>
              <input value={text} onChange={(e) => setText(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5" />
            </label>
            <label className="block"><span className="text-xs uppercase text-muted-foreground">Color</span>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border" />
            </label>
            <label className="block"><span className="text-xs uppercase text-muted-foreground">Size: {size}px</span>
              <input type="range" min={10} max={200} value={size} onChange={(e) => setSize(+e.target.value)} className="w-full" />
            </label>
            <label className="block"><span className="text-xs uppercase text-muted-foreground">Horizontal: {x}%</span>
              <input type="range" min={0} max={100} value={x} onChange={(e) => setX(+e.target.value)} className="w-full" />
            </label>
            <label className="block col-span-full"><span className="text-xs uppercase text-muted-foreground">Vertical: {y}%</span>
              <input type="range" min={0} max={100} value={y} onChange={(e) => setY(+e.target.value)} className="w-full" />
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
