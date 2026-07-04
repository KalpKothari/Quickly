import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";
import { Download, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { useRecent } from "@/lib/stores";
export default function MergePdf() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const addRecent = useRecent((s) => s.addProcessed);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= files.length) return;
    const copy = [...files]; [copy[i], copy[j]] = [copy[j], copy[i]]; setFiles(copy);
  };
  const run = async () => {
    if (files.length < 2) { toast.error("Add at least 2 PDFs"); return; }
    setBusy(true);
    try {
      const out = await PDFDocument.create();
      for (const f of files) {
        const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      }
      const bytes = await out.save();
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), "merged.pdf");
      addRecent({ toolSlug: "merge-pdf", toolName: "Merge PDFs", category: "pdf", fileName: "merged.pdf", meta: `${files.length} files`, at: Date.now() });
      toast.success("Merged");
    } catch { toast.error("Merge failed. Check that files are valid PDFs."); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-6">
      <FileDrop accept="application/pdf" multiple files={files} onFiles={setFiles} hint="Add 2 or more PDFs" />
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate text-sm">{i + 1}. {f.name}</span>
              <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded-md p-1 hover:bg-secondary disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
              <button onClick={() => move(i, 1)} disabled={i === files.length - 1} className="rounded-md p-1 hover:bg-secondary disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
      <button onClick={run} disabled={files.length < 2 || busy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
        <Download className="h-4 w-4" /> {busy ? "Merging..." : "Merge & Download"}
      </button>
    </div>
  );
}
