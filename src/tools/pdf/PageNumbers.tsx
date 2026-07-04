import { useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
export default function PageNumbers() {
  const [files, setFiles] = useState<File[]>([]);
  const [position, setPosition] = useState<"br" | "bc" | "bl" | "tr" | "tc" | "tl">("br");
  const [size, setSize] = useState(12);
  const [startAt, setStartAt] = useState(1);
  const [margin, setMargin] = useState(24);
  const [color, setColor] = useState("#26262e");
  const hexToRgb = (hex: string) => {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };
  const run = async () => {
    if (!files[0]) return;
    try {
      const doc = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true });
      const font = await doc.embedFont(StandardFonts.Helvetica);
      doc.getPages().forEach((page, i) => {
        const label = String(i + startAt);
        const { width, height } = page.getSize();
        const tw = font.widthOfTextAtSize(label, size);
        const m = margin;
        let x = m, y = m;
        if (position.includes("r")) x = width - tw - m;
        if (position.includes("c")) x = (width - tw) / 2;
        if (position.startsWith("t")) y = height - size - m;
        page.drawText(label, { x, y, size, font, color: hexToRgb(color) });
      });
      downloadBlob(new Blob([await doc.save() as BlobPart], { type: "application/pdf" }), "numbered.pdf");
      toast.success("Numbered");
    } catch { toast.error("Failed"); }
  };
  return (
    <div className="space-y-6">
      <FileDrop accept="application/pdf" files={files} onFiles={setFiles} />
      {files[0] && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block"><span className="text-xs uppercase text-muted-foreground">Position</span>
              <select value={position} onChange={(e) => setPosition(e.target.value as "br" | "bc" | "bl" | "tr" | "tc" | "tl")} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5">
                <option value="tl">Top Left</option><option value="tc">Top Center</option><option value="tr">Top Right</option>
                <option value="bl">Bottom Left</option><option value="bc">Bottom Center</option><option value="br">Bottom Right</option>
              </select>
            </label>
            <label className="block"><span className="text-xs uppercase text-muted-foreground">Font size</span>
              <input type="number" min={6} max={48} value={size} onChange={(e) => setSize(+e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5" />
            </label>
            <label className="block"><span className="text-xs uppercase text-muted-foreground">Margin (pt)</span>
              <input type="number" min={0} max={100} value={margin} onChange={(e) => setMargin(+e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5" />
            </label>
            <label className="block"><span className="text-xs uppercase text-muted-foreground">Starting number</span>
              <input type="number" min={1} value={startAt} onChange={(e) => setStartAt(Math.max(1, +e.target.value || 1))}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5" />
            </label>
            <label className="block"><span className="text-xs uppercase text-muted-foreground">Color</span>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-2" />
            </label>
          </div>
          <button onClick={run} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Download className="h-4 w-4" /> Apply & Download
          </button>
        </>
      )}
    </div>
  );
}
