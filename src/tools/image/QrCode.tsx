import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Download } from "lucide-react";
export default function QrCodeGen() {
  const [text, setText] = useState("https://quickly.app");
  const [size, setSize] = useState(400);
  const [fg, setFg] = useState("#111827");
  const [bg, setBg] = useState("#ffffff");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current || !text) return;
    QRCode.toCanvas(canvasRef.current, text, { width: size, color: { dark: fg, light: bg }, errorCorrectionLevel: "H", margin: 2 }).catch(() => {});
  }, [text, size, fg, bg]);
  const download = () => {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "qr-code.png";
      a.click();
      toast.success("QR code downloaded");
    });
  };
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-4">
        <label className="block"><span className="text-xs uppercase text-muted-foreground">Content</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
            className="mt-1 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
        </label>
        <label className="block"><span className="text-xs uppercase text-muted-foreground">Size: {size}px</span>
          <input type="range" min={128} max={1024} step={16} value={size} onChange={(e) => setSize(+e.target.value)} className="mt-1 w-full" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-xs uppercase text-muted-foreground">Foreground</span>
            <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border" />
          </label>
          <label className="block"><span className="text-xs uppercase text-muted-foreground">Background</span>
            <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border" />
          </label>
        </div>
        <button onClick={download} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
          <Download className="h-4 w-4" /> Download PNG
        </button>
      </div>
      <div className="flex items-center justify-center rounded-2xl bg-secondary/40 p-8">
        <canvas ref={canvasRef} className="max-w-full rounded-xl bg-white shadow-lg" />
      </div>
    </div>
  );
}
