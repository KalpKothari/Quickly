import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
function parsePages(s: string, max: number) {
  const set = new Set<number>();
  s.split(",").map((x) => x.trim()).filter(Boolean).forEach((tok) => {
    if (tok.includes("-")) { const [a, b] = tok.split("-").map(Number); for (let i = a; i <= b; i++) if (i >= 1 && i <= max) set.add(i - 1); }
    else { const n = parseInt(tok); if (n >= 1 && n <= max) set.add(n - 1); }
  });
  return set;
}
export default function DeletePdfPages() {
  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [pages, setPages] = useState("2, 4-5");
  const load = async (f: File) => { setPageCount((await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true })).getPageCount()); };
  const run = async () => {
    if (!files[0]) return;
    try {
      const src = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true });
      const drop = parsePages(pages, src.getPageCount());
      const keep = src.getPageIndices().filter((i) => !drop.has(i));
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, keep); copied.forEach((p) => out.addPage(p));
      downloadBlob(new Blob([await out.save() as BlobPart], { type: "application/pdf" }), "trimmed.pdf");
      toast.success("Pages removed");
    } catch { toast.error("Failed"); }
  };
  return (
    <div className="space-y-6">
      <FileDrop accept="application/pdf" files={files} onFiles={(f) => { setFiles(f); if (f[0]) load(f[0]); }} />
      {pageCount > 0 && (
        <>
          <div className="text-sm text-muted-foreground">{pageCount} pages detected</div>
          <label className="block"><span className="text-xs uppercase text-muted-foreground">Pages to remove</span>
            <input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="1, 3-5"
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-sm" />
          </label>
          <button onClick={run} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Download className="h-4 w-4" /> Delete & Download
          </button>
        </>
      )}
    </div>
  );
}
