import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Download, QrCode } from "lucide-react";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

type QrMode = "url" | "phone" | "whatsapp";

function normalizePhoneForTel(input: string) {
  // Keep the leading + and all digits, strip spaces, hyphens, and brackets.
  return input.trim().replace(/[\s\-()]/g, "");
}

function normalizeNumberForWa(input: string) {
  // wa.me needs digits only (no +, spaces, hyphens, or brackets).
  return input.trim().replace(/[^\d]/g, "");
}

const DEFAULT_WA_MESSAGE =
  "Hey! I came across your contact through a Quickly QR code and thought I'd reach out. Looking forward to connecting! 😊";

export default function QrCodeGen() {
  const { showSupportPrompt } = useSupportPrompt();
  const [mode, setMode] = useState<QrMode>("url");

  // Existing URL / Text state — untouched.
  const [text, setText] = useState("https://usequickly.vercel.app");

  // Phone QR state
  const [phone, setPhone] = useState("");

  // WhatsApp QR state
  const [waNumber, setWaNumber] = useState("");
  const [waMessage, setWaMessage] = useState(DEFAULT_WA_MESSAGE);

  const [size, setSize] = useState(400);
  const [fg, setFg] = useState("#111827");
  const [bg, setBg] = useState("#ffffff");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The actual payload encoded into the QR, derived from the selected mode.
  const qrValue =
    mode === "url"
      ? text
      : mode === "phone"
      ? phone.trim()
        ? `tel:${normalizePhoneForTel(phone)}`
        : ""
      : waNumber.trim()
      ? `https://wa.me/${normalizeNumberForWa(waNumber)}${
          waMessage.trim() ? `?text=${encodeURIComponent(waMessage.trim())}` : ""
        }`
      : "";

  useEffect(() => {
    if (!canvasRef.current || !qrValue) return;
    const canvas = canvasRef.current;

    const qrCanvas = document.createElement("canvas");
    QRCode.toCanvas(qrCanvas, qrValue, {
      width: size,
      color: { dark: fg, light: bg },
      errorCorrectionLevel: "H",
      margin: 2,
    })
      .then(() => {
        const brandHeight = Math.max(20, Math.round(size * 0.06));
        canvas.width = qrCanvas.width;
        canvas.height = qrCanvas.height + brandHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(qrCanvas, 0, 0);

        const fontSize = Math.max(12, Math.round(brandHeight * 0.6));
        const y = qrCanvas.height + brandHeight / 2;
        const rightEdge = canvas.width - 8;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";

        const label = "Quickly";
        const lead = "Made with ";
        ctx.font = `italic 700 ${fontSize}px Georgia, 'Times New Roman', serif`;
        const labelWidth = ctx.measureText(label).width;
        ctx.font = `italic 500 ${fontSize}px Georgia, 'Times New Roman', serif`;
        const leadWidth = ctx.measureText(lead).width;

        const labelX = rightEdge - labelWidth;
        const leadX = labelX - leadWidth;

        ctx.fillStyle = fg;
        ctx.globalAlpha = 0.5;
        ctx.fillText(lead, leadX, y);

        ctx.font = `italic 700 ${fontSize}px Georgia, 'Times New Roman', serif`;
        ctx.globalAlpha = 0.8;
        ctx.fillText(label, labelX, y);
        ctx.globalAlpha = 1;
      })
      .catch(() => {});
  }, [qrValue, size, fg, bg]);

  const download = () => {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "qr-code.png";
      a.click();
      toast.success("QR code downloaded");

      showSupportPrompt();
    });
  };

  const tabs: { key: QrMode; label: string }[] = [
    { key: "url", label: "URL / Text" },
    { key: "phone", label: "Phone" },
    { key: "whatsapp", label: "WhatsApp" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Top Section: Split equally into Content and Configuration side-by-side */}
      <div className="grid gap-4 md:grid-cols-2 items-stretch">
        {/* Module 1: Content Workspace */}
        <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)] flex flex-col justify-between">
          <div className="space-y-3 flex-1 flex flex-col">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">
                1
              </span>
              What should the QR code contain?
            </p>

            {/* QR type selector */}
            <div className="inline-flex self-start rounded-xl border-2 border-foreground overflow-hidden shadow-[2px_2px_0_0_var(--color-foreground)]">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setMode(tab.key)}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide border-r-2 border-foreground last:border-r-0 transition-colors ${
                    mode === tab.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-foreground hover:bg-secondary/40"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {mode === "url" && (
              <label className="block flex-1 flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">
                  Content
                </span>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type your URL or text content here..."
                  className="w-full h-32 md:h-full min-h-[120px] resize-none rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-medium shadow-[2px_2px_0_0_var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
            )}

            {mode === "phone" && (
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">
                  Phone Number
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 9876543210"
                  className="w-full rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-medium shadow-[2px_2px_0_0_var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
            )}

            {mode === "whatsapp" && (
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">
                    Your WhatsApp Number
                  </span>
                  <input
                    type="tel"
                    value={waNumber}
                    onChange={(e) => setWaNumber(e.target.value)}
                    placeholder="+91 9876543210"
                    className="w-full rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-medium shadow-[2px_2px_0_0_var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">
                    Pre-filled Message (Sent to you by scanner)
                  </span>
                  <textarea
                    value={waMessage}
                    onChange={(e) => setWaMessage(e.target.value)}
                    className="w-full h-24 resize-none rounded-xl border-2 border-foreground bg-background px-3 py-2 text-sm font-medium shadow-[2px_2px_0_0_var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <span className="mt-1 block text-[11px] font-medium text-muted-foreground">
                    When someone scans your QR code, this text will appear pre-typed in their WhatsApp input bar ready to be sent to you. Customize what you'd like them to say first.
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Module 2: Style Tuning Parameters */}
        <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">
              2
            </span>
            Style Configurations
          </p>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Size: {size}px
            </span>
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
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Foreground
              </span>
              <input
                type="color"
                value={fg}
                onChange={(e) => setFg(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border-2 border-foreground shadow-[2px_2px_0_0_var(--color-foreground)] cursor-pointer bg-background"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Background
              </span>
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
            type="button"
            onClick={download}
            disabled={!qrValue}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)] disabled:opacity-40 disabled:pointer-events-none"
          >
            <Download className="h-4 w-4" /> Download PNG Output
          </button>
          <p className="text-[11px] font-medium text-muted-foreground">
            Want to test your QR?{" "}
            <a href="./qr-scanner" className="font-bold text-foreground underline underline-offset-2">
              Scan QR Code →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}