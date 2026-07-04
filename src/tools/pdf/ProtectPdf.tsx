import { useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { PDFDocument } from "@cantoo/pdf-lib";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";

export default function ProtectPdf() {
  const [files, setFiles] = useState<File[]>([]);
  const [userPassword, setUserPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!files[0]) { toast.error("Please choose a PDF first."); return; }
    if (!userPassword) { toast.error("Please enter a password."); return; }
    if (userPassword.length < 4) { toast.error("Password must be at least 4 characters."); return; }
    if (userPassword !== confirmPassword) { toast.error("Passwords do not match."); return; }
    setBusy(true);
    try {
      const doc = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true });
      doc.encrypt({
        userPassword,
        ownerPassword: ownerPassword || userPassword,
        permissions: {
          printing: "highResolution",
          modifying: false,
          copying: false,
          annotating: true,
          fillingForms: true,
          contentAccessibility: true,
          documentAssembly: false,
        },
      });
      const bytes = await doc.save();
      const name = files[0].name.replace(/\.pdf$/i, "") + "-protected.pdf";
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), name);
      toast.success("PDF encrypted");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't encrypt this PDF. It may already be protected.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <FileDrop accept="application/pdf" files={files} onFiles={setFiles} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs uppercase text-muted-foreground">Password</span>
          <input type="password" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} placeholder="Required"
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5" />
        </label>
        <label className="block">
          <span className="text-xs uppercase text-muted-foreground">Confirm password</span>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password"
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs uppercase text-muted-foreground">Owner password (optional)</span>
          <input type="password" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} placeholder="Defaults to the same password"
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5" />
          <span className="mt-1 block text-xs text-muted-foreground">Controls permissions like printing and copying.</span>
        </label>
      </div>
      <button
        onClick={run}
        disabled={busy || !files[0] || !userPassword || userPassword !== confirmPassword}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        <Lock className="h-4 w-4" /> {busy ? "Encrypting..." : "Encrypt & Download"}
      </button>
    </div>
  );
}
