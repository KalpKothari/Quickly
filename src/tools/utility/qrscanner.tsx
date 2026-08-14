import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { toast } from "sonner";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  ShieldCheck,
  Upload,
  User,
  Wifi,
} from "lucide-react";
import { useSupportPrompt } from "@/hooks/useSupportPrompt";

/* -------------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------------- */

type ScanState =
  | "idle"
  | "requesting"
  | "scanning"
  | "denied"
  | "unsupported"
  | "result";

type ResultType = "url" | "email" | "phone" | "wifi" | "vcard" | "geo" | "text";

type ParsedField = { label: string; value: string };

type ParsedResult = {
  type: ResultType;
  raw: string;
  title: string;
  fields: ParsedField[];
  /** For types with a single "go do something" action (open link / call / email / map) */
  actionHref?: string;
  actionLabel?: string;
};

/* -------------------------------------------------------------------------
 * QR content parsing — all local, nothing leaves the browser
 * ---------------------------------------------------------------------- */

function parseQrContent(raw: string): ParsedResult {
  const trimmed = raw.trim();

  // Website URL
  if (/^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed)) {
    const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return {
      type: "url",
      raw,
      title: "Website URL",
      fields: [{ label: "Link", value: trimmed }],
      actionHref: href,
      actionLabel: "Open Link",
    };
  }

  // Email
  if (/^mailto:/i.test(trimmed)) {
    const email = trimmed.replace(/^mailto:/i, "").split("?")[0];
    return {
      type: "email",
      raw,
      title: "Email Address",
      fields: [{ label: "Email", value: email }],
      actionHref: trimmed,
      actionLabel: "Send Email",
    };
  }

  // Phone
  if (/^tel:/i.test(trimmed)) {
    const phone = trimmed.replace(/^tel:/i, "");
    return {
      type: "phone",
      raw,
      title: "Phone Number",
      fields: [{ label: "Phone", value: phone }],
      actionHref: trimmed,
      actionLabel: "Call Number",
    };
  }

  // Wi-Fi — WIFI:T:WPA;S:MyNetwork;P:password123;;
  if (/^WIFI:/i.test(trimmed)) {
    const get = (key: string) => {
      const m = trimmed.match(new RegExp(`${key}:((?:\\\\.|[^;])*)`, "i"));
      return m ? m[1].replace(/\\(.)/g, "$1") : "";
    };
    const ssid = get("S");
    const password = get("P");
    const security = get("T") || "None";
    return {
      type: "wifi",
      raw,
      title: "Wi-Fi Network",
      fields: [
        { label: "Network", value: ssid || "—" },
        { label: "Password", value: password || "None" },
        { label: "Security", value: security },
      ],
    };
  }

  // vCard / contact
  if (/^BEGIN:VCARD/i.test(trimmed)) {
    const getLine = (key: string) => {
      const m = trimmed.match(new RegExp(`^${key}[^:]*:(.*)$`, "im"));
      return m ? m[1].trim().replace(/\\(.)/g, "$1") : "";
    };
    const name = getLine("FN") || getLine("N");
    const org = getLine("ORG");
    const tel = getLine("TEL");
    const email = getLine("EMAIL");
    const fields = [
      name && { label: "Name", value: name },
      org && { label: "Organization", value: org },
      tel && { label: "Phone", value: tel },
      email && { label: "Email", value: email },
    ].filter(Boolean) as ParsedField[];
    return {
      type: "vcard",
      raw,
      title: "Contact Card",
      fields: fields.length ? fields : [{ label: "Contact", value: trimmed }],
    };
  }

  // Geographic location — geo:37.786971,-122.399677
  if (/^geo:/i.test(trimmed)) {
    const [lat, lng] = trimmed.replace(/^geo:/i, "").split(",");
    return {
      type: "geo",
      raw,
      title: "Location",
      fields: [{ label: "Coordinates", value: `${lat}, ${lng}` }],
      actionHref: `https://www.google.com/maps?q=${lat},${lng}`,
      actionLabel: "Open in Maps",
    };
  }

  // Fallback — plain text
  return {
    type: "text",
    raw,
    title: "Text",
    fields: [{ label: "Content", value: trimmed }],
  };
}

const RESULT_ICON: Record<ResultType, typeof LinkIcon> = {
  url: LinkIcon,
  email: Mail,
  phone: Phone,
  wifi: Wifi,
  vcard: User,
  geo: MapPin,
  text: FileText,
};

/* -------------------------------------------------------------------------
 * Component
 * ---------------------------------------------------------------------- */

export default function QrCodeScanner() {
  const { showSupportPrompt } = useSupportPrompt();

  const [state, setState] = useState<ScanState>("idle");
  const [cameraSupported, setCameraSupported] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [result, setResult] = useState<ParsedResult | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  // Detect camera support up front so we can skip straight to a graceful state.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraSupported(false);
    }
  }, []);

  // Move focus to the result so screen reader users know a scan completed.
  useEffect(() => {
    if (state === "result") {
      resultHeadingRef.current?.focus();
    }
  }, [state]);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleDecoded = useCallback(
    (data: string) => {
      stopCamera();
      setResult(parseQrContent(data));
      setState("result");
      showSupportPrompt();
    },
    [stopCamera, showSupportPrompt]
  );

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        if (code?.data) {
          handleDecoded(code.data);
          return;
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [handleDecoded]);

  const startCamera = useCallback(async () => {
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState("scanning");
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setState("denied");
      } else {
        setState("unsupported");
      }
    }
  }, [tick]);

  const cancelScan = useCallback(() => {
    stopCamera();
    setState("idle");
  }, [stopCamera]);

  // Stop the camera whenever this page unmounts (user navigates away).
  useEffect(() => stopCamera, [stopCamera]);

  const decodeImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Please choose an image file");
        return;
      }
      setUploadBusy(true);
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        URL.revokeObjectURL(objectUrl);

        if (!ctx) {
          setUploadBusy(false);
          toast.error("This image couldn't be read");
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        setUploadBusy(false);

        if (code?.data) {
          handleDecoded(code.data);
        } else {
          toast.error("No QR code found in that image");
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        setUploadBusy(false);
        toast.error("That file couldn't be read as an image");
      };

      img.src = objectUrl;
    },
    [handleDecoded]
  );

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) decodeImageFile(file);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) decodeImageFile(file);
  };

  const copyToClipboard = async (value: string, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} to clipboard`);
    } catch {
      toast.error("Couldn't copy — try selecting the text manually");
    }
  };

  const saveContact = (vcardRaw: string) => {
    const blob = new Blob([vcardRaw], { type: "text/vcard" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "contact.vcf";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const scanAgain = () => {
    setResult(null);
    setState("idle");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Hidden canvas used only to grab video frames for decoding */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)] space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">
              1
            </span>
            Scan a QR code
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/20 bg-background px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
            <ShieldCheck className="h-2.5 w-2.5" /> Private & Secure
          </span>
        </div>

        {/* ---------------- IDLE ---------------- */}
        {state === "idle" && (
          <div
            className={`space-y-3 rounded-xl border-2 border-dashed p-4 transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-foreground/30"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {cameraSupported ? (
                <button
                  type="button"
                  onClick={startCamera}
                  aria-label="Scan a QR code with your camera"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-5 py-4 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <Camera className="h-4 w-4" /> Scan with Camera
                </button>
              ) : (
                <div
                  role="status"
                  className="flex items-center gap-2 rounded-xl border-2 border-foreground bg-background px-4 py-4 text-xs font-medium text-muted-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Camera scanning isn't available on this device.
                </div>
              )}

              <label
                htmlFor="qr-upload-input"
                tabIndex={0}
                role="button"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                aria-label="Upload a QR code image"
                aria-busy={uploadBusy}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-background px-5 py-4 text-sm font-bold text-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:bg-secondary/40 hover:shadow-[4px_4px_0_0_var(--color-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {uploadBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload QR Image
                <input
                  ref={fileInputRef}
                  id="qr-upload-input"
                  type="file"
                  accept="image/*"
                  onChange={onFileInputChange}
                  className="sr-only"
                />
              </label>
            </div>

            <p className="text-center text-[11px] font-medium text-muted-foreground">
              Drag and drop an image here, or your photo is processed in your browser and is
              never uploaded.
            </p>
          </div>
        )}

        {/* ---------------- REQUESTING ---------------- */}
        {state === "requesting" && (
          <div
            role="status"
            className="flex flex-col items-center gap-3 rounded-xl border-2 border-foreground bg-background py-10 text-sm font-medium text-muted-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
          >
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            Requesting camera access…
          </div>
        )}

        {/* ---------------- SCANNING ---------------- */}
        {state === "scanning" && (
          <div className="space-y-3">
            <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl border-2 border-foreground bg-black shadow-[3px_3px_0_0_var(--color-foreground)]">
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                aria-label="Live camera preview for QR scanning"
                className="h-full w-full object-cover"
              />
              {/* Scan frame overlay */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-3/4 w-3/4">
                  <span className="absolute -top-0.5 -left-0.5 h-8 w-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                  <span className="absolute -top-0.5 -right-0.5 h-8 w-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                  <span className="absolute -bottom-0.5 -left-0.5 h-8 w-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                  <span className="absolute -bottom-0.5 -right-0.5 h-8 w-8 border-b-4 border-r-4 border-primary rounded-br-lg" />
                  <span className="qr-scanline absolute left-0 right-0 h-0.5 bg-primary/90 shadow-[0_0_8px_var(--color-primary)]" />
                </div>
              </div>
            </div>
            <p className="text-center text-xs font-medium text-muted-foreground">
              Point your camera at a QR code — it'll be detected automatically.
            </p>
            <button
              type="button"
              onClick={cancelScan}
              className="mx-auto flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-background px-4 py-2 text-xs font-bold uppercase tracking-wide text-foreground shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ---------------- DENIED ---------------- */}
        {state === "denied" && (
          <div
            role="alert"
            className="space-y-3 rounded-xl border-2 border-foreground bg-background p-4 shadow-[2px_2px_0_0_var(--color-foreground)]"
          >
            <p className="flex items-center gap-2 text-sm font-bold text-foreground">
              <AlertCircle className="h-4 w-4 text-primary" /> Camera access is blocked
            </p>
            <p className="text-xs font-medium text-muted-foreground">
              You can allow camera access in your browser settings, or scan a QR image instead.
            </p>
            <label
              htmlFor="qr-upload-input-denied"
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Upload className="h-3.5 w-3.5" /> Upload QR Image
              <input
                id="qr-upload-input-denied"
                type="file"
                accept="image/*"
                onChange={onFileInputChange}
                className="sr-only"
              />
            </label>
          </div>
        )}

        {/* ---------------- UNSUPPORTED ---------------- */}
        {state === "unsupported" && (
          <div
            role="alert"
            className="space-y-3 rounded-xl border-2 border-foreground bg-background p-4 shadow-[2px_2px_0_0_var(--color-foreground)]"
          >
            <p className="flex items-center gap-2 text-sm font-bold text-foreground">
              <AlertCircle className="h-4 w-4 text-primary" /> Camera scanning isn't available
            </p>
            <p className="text-xs font-medium text-muted-foreground">
              This device or browser doesn't support camera scanning. You can still scan a QR
              image instead.
            </p>
            <label
              htmlFor="qr-upload-input-unsupported"
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Upload className="h-3.5 w-3.5" /> Upload QR Image
              <input
                id="qr-upload-input-unsupported"
                type="file"
                accept="image/*"
                onChange={onFileInputChange}
                className="sr-only"
              />
            </label>
          </div>
        )}

        {/* ---------------- RESULT ---------------- */}
        {state === "result" && result && (
          <div role="status" aria-live="polite" className="space-y-3">
            <div className="rounded-xl border-2 border-foreground bg-secondary/40 p-4 shadow-[2px_2px_0_0_var(--color-foreground)]">
              <h2
                ref={resultHeadingRef}
                tabIndex={-1}
                className="flex items-center gap-2 text-sm font-bold text-foreground outline-none"
              >
                <CheckCircle2 className="h-4 w-4 text-primary" /> QR Code Detected
              </h2>
              <p className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {(() => {
                  const Icon = RESULT_ICON[result.type];
                  return <Icon className="h-3 w-3" />;
                })()}
                {result.title}
              </p>

              <div className="mt-3 space-y-2">
                {result.fields.map((field) => (
                  <div
                    key={field.label}
                    className="flex items-center justify-between gap-2 rounded-lg border-2 border-foreground bg-card px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        {field.label}
                      </p>
                      <p className="truncate text-sm font-medium text-foreground">
                        {field.value}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(field.value, field.label)}
                      aria-label={`Copy ${field.label}`}
                      className="shrink-0 rounded-lg border-2 border-foreground bg-background p-1.5 shadow-[1px_1px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {result.actionHref && (
                  <a
                    href={result.actionHref}
                    target={result.type === "url" || result.type === "geo" ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> {result.actionLabel}
                  </a>
                )}

                {result.type === "vcard" && (
                  <button
                    type="button"
                    onClick={() => saveContact(result.raw)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <Download className="h-3.5 w-3.5" /> Save Contact
                  </button>
                )}

                {!result.actionHref && result.type !== "vcard" && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(result.fields[0]?.value ?? result.raw)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={scanAgain}
              className="mx-auto flex w-full items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-background px-4 py-3 text-sm font-bold uppercase tracking-wide text-foreground shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:bg-secondary/40 hover:shadow-[3px_3px_0_0_var(--color-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <RotateCcw className="h-4 w-4" /> Scan Another QR
            </button>
          </div>
        )}
      </div>

      {/* Local, minimal styles for the scan-line animation only. */}
      <style>{`
        .qr-scanline {
          animation: qr-scan-move 2s ease-in-out infinite;
        }
        @keyframes qr-scan-move {
          0% { top: 4%; opacity: 0; }
          10% { opacity: 1; }
          50% { top: 92%; opacity: 1; }
          60% { opacity: 1; }
          100% { top: 4%; opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .qr-scanline { animation: none; top: 50%; opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}