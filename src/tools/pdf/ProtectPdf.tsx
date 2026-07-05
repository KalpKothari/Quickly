import { useState } from "react";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, Check, X } from "lucide-react";
import { PDFDocument } from "@cantoo/pdf-lib";
import { FileDrop } from "@/components/tool/FileDrop";
import { downloadBlob } from "@/lib/format";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

export default function ProtectPdf() {
  const { showSupportPrompt } = useSupportPrompt();
  const [files, setFiles] = useState<File[]>([]);
  const [userPassword, setUserPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ownerPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const lengthOk = userPassword.length >= 4;
  const matchOk = confirmPassword.length > 0 && userPassword === confirmPassword;

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

      // Trigger support prompt popup immediately following file download completion
      showSupportPrompt();
    } catch (e) {
      console.error(e);
      toast.error("Couldn't encrypt this PDF. It may already be protected.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
          <Lock className="h-3.5 w-3.5" />
          Protect PDF
        </span>
      </div>

      <FileDrop accept="application/pdf" files={files} onFiles={setFiles} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            Password
          </span>
          <div className="relative mt-2">
            <input
              type={showPassword ? "text" : "password"}
              value={userPassword}
              onChange={(e) => setUserPassword(e.target.value)}
              placeholder="Required"
              aria-label="Password"
              className="w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 pr-10 text-sm font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {/* Live feedback instead of waiting for the error toast on submit. */}
          {userPassword.length > 0 && (
            <div className={"mt-1.5 flex items-center gap-1 text-xs font-semibold " + (lengthOk ? "text-emerald-600" : "text-muted-foreground")}>
              {lengthOk ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              At least 4 characters
            </div>
          )}
        </label>

        <label className="block">
          <span className="inline-flex rounded-full border-2 border-foreground bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
            Confirm password
          </span>
          <div className="relative mt-2">
            <input
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              aria-label="Confirm password"
              className="w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 pr-10 text-sm font-semibold shadow-[3px_3px_0_0_var(--color-foreground)] outline-none focus:shadow-[4px_4px_0_0_var(--color-primary)]"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {/* Live feedback instead of waiting for the error toast on submit. */}
          {confirmPassword.length > 0 && (
            <div className={"mt-1.5 flex items-center gap-1 text-xs font-semibold " + (matchOk ? "text-emerald-600" : "text-destructive")}>
              {matchOk ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {matchOk ? "Passwords match" : "Passwords don't match"}
            </div>
          )}
        </label>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={busy || !files[0] || !userPassword || userPassword !== confirmPassword}
        className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
      >
        <Lock className="h-4 w-4" /> {busy ? "Encrypting..." : "Encrypt & Download"}
      </button>
    </div>
  );
}