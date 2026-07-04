import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";
import { Download, GripVertical, FileText } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";

export default function ReorderPdf() {
  const [files, setFiles] = useState<File[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const load = async (f: File) => {
    const doc = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
    setOrder(doc.getPageIndices());
  };

  const moveTo = (from: number, to: number) => {
    if (from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder(next);
  };

  const run = async () => {
    if (!files[0]) return;
    try {
      const src = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, order);
      pages.forEach((p) => out.addPage(p));
      const bytes = await out.save();
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), "reordered.pdf");
      toast.success("Reordered");
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-6">
      <FileDrop accept="application/pdf" files={files} onFiles={(f) => { setFiles(f); if (f[0]) load(f[0]); }} />
      {order.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            Drag any page tile to rearrange. The final PDF will follow the visual order below.
          </p>
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {order.map((p, i) => (
              <li
                key={`${p}-${i}`}
                draggable
                onDragStart={(e) => {
                  setDragIdx(i);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(i));
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (overIdx !== i) setOverIdx(i);
                }}
                onDragLeave={() => setOverIdx((cur) => (cur === i ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragIdx ?? Number(e.dataTransfer.getData("text/plain"));
                  if (!Number.isNaN(from)) moveTo(from, i);
                  setDragIdx(null);
                  setOverIdx(null);
                }}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                className={
                  "group relative flex aspect-[3/4] cursor-grab flex-col items-center justify-center rounded-xl border-2 bg-card p-3 transition-all active:cursor-grabbing " +
                  (dragIdx === i ? "opacity-40 " : "") +
                  (overIdx === i && dragIdx !== i ? "border-primary ring-2 ring-primary/30 " : "border-border")
                }
              >
                <GripVertical className="absolute left-2 top-2 h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                <span className="absolute right-2 top-2 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <FileText className="h-10 w-10 text-muted-foreground" />
                <span className="mt-2 text-xs text-muted-foreground">Original page {p + 1}</span>
              </li>
            ))}
          </ul>
          <button onClick={run} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Download className="h-4 w-4" /> Apply & Download
          </button>
        </>
      )}
    </div>
  );
}
