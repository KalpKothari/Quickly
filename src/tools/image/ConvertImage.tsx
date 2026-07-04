import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { loadImage, canvasToBlob } from "./_canvas";
const FORMATS = [{ v: "image/png", ext: "png" }, { v: "image/jpeg", ext: "jpg" }, { v: "image/webp", ext: "webp" }];
export default function ConvertImage() {
  const [files, setFiles] = useState<File[]>([]);
  const [target, setTarget] = useState("image/webp");
  const [q, setQ] = useState(0.9);
  const run = async () => {
    if (!files[0]) return;
    try {
      const img = await loadImage(files[0]);
      const canvas = document.createElement("canvas");
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      if (target === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(img, 0, 0);
      const blob = await canvasToBlob(canvas, target, q);
      const ext = FORMATS.find((f) => f.v === target)!.ext;
      downloadBlob(blob, files[0].name.replace(/\.[^.]+$/, "") + "." + ext);
      toast.success("Converted & downloaded");
    } catch { toast.error("Conversion failed"); }
  };
  return (
    <div className="space-y-6">
      <FileDrop accept="image/*" files={files} onFiles={setFiles} hint="PNG, JPG, WEBP, GIF" />
      {files[0] && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="text-xs uppercase text-muted-foreground">Convert to</span>
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5">
                {FORMATS.map((f) => <option key={f.v} value={f.v}>{f.ext.toUpperCase()}</option>)}
              </select>
            </label>
            {target !== "image/png" && (
              <label className="block"><span className="text-xs uppercase text-muted-foreground">Quality: {Math.round(q * 100)}%</span>
                <input type="range" min={0.1} max={1} step={0.05} value={q} onChange={(e) => setQ(+e.target.value)} className="mt-3 w-full" />
              </label>
            )}
          </div>
          <button onClick={run} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Download className="h-4 w-4" /> Convert & Download
          </button>
        </>
      )}
    </div>
  );
}
