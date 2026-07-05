import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

export default function ImageToPdf() {
  const { showSupportPrompt } = useSupportPrompt();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!files.length) return;
    setBusy(true);
    try {
      const doc = await PDFDocument.create();
      for (const f of files) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const embed = f.type.includes("png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const page = doc.addPage([embed.width, embed.height]);
        page.drawImage(embed, { x: 0, y: 0, width: embed.width, height: embed.height });
      }
      const pdf = await doc.save();
      downloadBlob(new Blob([pdf as BlobPart], { type: "application/pdf" }), "images.pdf");
      toast.success("PDF created");

      // Trigger support prompt popup immediately following file download completion
      showSupportPrompt();
    } catch { 
      toast.error("Only PNG or JPG images supported"); 
    } finally { 
      setBusy(false); 
    }
  };

  return (
    <div className="space-y-6">
      <FileDrop accept="image/png,image/jpeg" multiple files={files} onFiles={setFiles} hint="Add PNG/JPG images (order = drop order)" />
      {files.length > 0 && (
        <button type="button" onClick={run} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
          <Download className="h-4 w-4" /> {busy ? "Creating..." : `Create PDF (${files.length} pages)`}
        </button>
      )}
    </div>
  );
}