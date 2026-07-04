import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
export default function SplitPdf() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [ranges, setRanges] = useState("1-1, 2-2");
  const parseRanges = (s: string) => s.split(",").map((r) => r.trim()).filter(Boolean).map((r) => {
    const [a, b] = r.split("-").map((x) => parseInt(x)); return [a - 1, (b ? b : a) - 1] as [number, number];
  });
  const load = async (f: File) => {
    const doc = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
    setPageCount(doc.getPageCount());
    setRanges(Array.from({ length: doc.getPageCount() }, (_, i) => `${i+1}-${i+1}`).join(", "));
  };
  const run = async () => {
    if (!files[0]) return;
    setBusy(true);
    try {
      const src = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true });
      const parts = parseRanges(ranges);
      const zip = new JSZip();
      let i = 0;
      for (const [a, b] of parts) {
        const doc = await PDFDocument.create();
        const idx = []; for (let p = a; p <= b; p++) if (p >= 0 && p < src.getPageCount()) idx.push(p);
        const pages = await doc.copyPages(src, idx); pages.forEach((p) => doc.addPage(p));
        const bytes = await doc.save();
        zip.file(`part-${++i}-pages-${a+1}-${b+1}.pdf`, bytes);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, "split.zip");
      toast.success("Split into " + parts.length + " files");
    } catch { toast.error("Split failed"); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-6">
      <FileDrop accept="application/pdf" files={files} onFiles={(f) => { setFiles(f); if (f[0]) load(f[0]); }} />
      {files[0] && pageCount > 0 && (
        <>
          <div className="text-sm text-muted-foreground">{pageCount} pages detected</div>
          <label className="block"><span className="text-xs uppercase text-muted-foreground">Ranges (comma-separated)</span>
            <input value={ranges} onChange={(e) => setRanges(e.target.value)} placeholder="1-3, 5-5, 8-10"
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-sm" />
          </label>
          <button onClick={run} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Download className="h-4 w-4" /> {busy ? "Splitting..." : "Split & Download ZIP"}
          </button>
        </>
      )}
    </div>
  );
}
