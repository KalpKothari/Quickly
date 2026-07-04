import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Download, QrCode } from "lucide-react";

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
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Top Section: Split equally into Content and Configuration side-by-side */}
      <div className="grid gap-4 md:grid-cols-2 items-stretch">
        {/* Module 1: Content Workspace */}
        <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)] flex flex-col justify-between">
          <div className="space-y-3 flex-1 flex flex-col">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">1</span>
              What should the QR code contain?
            </p>
            <label className="block flex-1 flex flex-col">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">Content</span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type your URL or text content here..."
                className="w-full h-32 md:h-full min-h-[120px] resize-none rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-medium shadow-[2px_2px_0_0_var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
          </div>
        </div>

        {/* Module 2: Style Tuning Parameters */}
        <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">2</span>
            Style Configurations
          </p>
          
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Size: {size}px</span>
            <input
              type="range"
              min={128}
              max={1024}
              step={16}
              value={size}
              onChange={(e) => setSize(+e.target.value)}
              className="mt-1 w-full accent-primary cursor-pointer"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Foreground</span>
              <input
                type="color"
                value={fg}
                onChange={(e) => setFg(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border-2 border-foreground shadow-[2px_2px_0_0_var(--color-foreground)] cursor-pointer bg-background"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Background</span>
              <input
                type="color"
                value={bg}
                onChange={(e) => setBg(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border-2 border-foreground shadow-[2px_2px_0_0_var(--color-foreground)] cursor-pointer bg-background"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Bottom Section: Combined Preview and Single Trigger Download Bar */}
      <div className="grid gap-4 sm:grid-cols-[200px_1fr] items-center rounded-2xl border-2 border-foreground bg-secondary/40 p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
        {/* Micro Live Preview Target */}
        <div className="flex flex-col items-center gap-2 bg-card border-2 border-foreground p-2 rounded-xl shadow-[2px_2px_0_0_var(--color-foreground)] w-full max-w-[160px] mx-auto aspect-square justify-center">
          <canvas ref={canvasRef} className="max-w-full max-h-full" />
        </div>

        {/* Informational Descriptor + Direct Action Button */}
        <div className="space-y-3 text-center sm:text-left">
          <div className="space-y-0.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/20 bg-background px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
            <QrCode className="h-2.5 w-2.5" /> Live Generation
          </span>
          <p className="text-xs font-medium text-muted-foreground">
            Your QR code is generated instantly and refreshed with every change. Download a clean, high-quality image whenever you're ready.
          </p>
          </div>
          
          <button
            onClick={download}
            disabled={!text}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)] disabled:opacity-40 disabled:pointer-events-none"
          >
            <Download className="h-4 w-4" /> Download PNG Output
          </button>
        </div>
      </div>
    </div>
  );
}