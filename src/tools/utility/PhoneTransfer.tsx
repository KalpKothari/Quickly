/**
 * PhoneTransfer.tsx — Quickly Phone-to-Phone Transfer
 *
 * Architecture:
 * - PeerJS (backed by public WebRTC cloud broker) for cross-device signaling
 * - Direct peer-to-peer WebRTC DataConnection for encrypted file delivery
 * - 16 KB binary chunk streaming with automatic reassembly
 * - Works across different phones, Wi-Fi networks, and mobile data
 */

import { useEffect, useRef, useState, useCallback } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import Peer, { type DataConnection } from "peerjs";
import {
  Upload,
  ScanLine,
  FileText,
  ImageIcon,
  X,
  RefreshCw,
  CheckCircle2,
  Download,
  Shield,
  Loader2,
  AlertTriangle,
  Smartphone,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 16 * 1024; // 16 KB per WebRTC packet
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB max guard
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "idle" | "send" | "receive";
type SendState =
  | "file-select"
  | "qr-waiting"
  | "connecting"
  | "sending"
  | "done"
  | "error"
  | "cancelled";
type ReceiveState =
  | "scanner"
  | "connecting"
  | "incoming"
  | "receiving"
  | "done"
  | "error"
  | "cancelled";

interface FileMeta {
  name: string;
  type: string;
  size: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeIcon(type: string) {
  return type.startsWith("image/") ? ImageIcon : FileText;
}

function isDesktop() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const mobileUA = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  return !mobileUA && !hasTouch;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PhoneTransfer() {
  const [role, setRole] = useState<Role>("idle");

  if (isDesktop()) {
    return <DesktopBlock />;
  }

  if (role === "idle") {
    return <RoleSelect onSelect={setRole} />;
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {role === "send" ? (
        <SenderFlow onReset={() => setRole("idle")} />
      ) : (
        <ReceiverFlow onReset={() => setRole("idle")} />
      )}
      <PrivacyBadge />
    </div>
  );
}

// ─── Desktop Block ────────────────────────────────────────────────────────────

function DesktopBlock() {
  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-2xl border-2 border-foreground bg-card p-8 shadow-[4px_4px_0_0_var(--color-foreground)] text-center space-y-4">
        <span className="flex h-14 w-14 mx-auto items-center justify-center rounded-full border-2 border-foreground bg-primary/15">
          <Smartphone className="h-7 w-7" />
        </span>
        <div className="space-y-1">
          <p className="text-lg font-bold">Built for Mobile</p>
          <p className="text-sm text-muted-foreground">
            Phone-to-Phone Transfer is designed for mobile devices. Open this page on
            your phone to send or receive files directly between two devices.
          </p>
        </div>
        <div className="rounded-xl border-2 border-foreground bg-secondary/40 px-4 py-3 text-xs font-medium text-muted-foreground">
          Scan this page's URL from your phone, or copy the link and open it there.
        </div>
      </div>
    </div>
  );
}

// ─── Role Select ──────────────────────────────────────────────────────────────

function RoleSelect({ onSelect }: { onSelect: (r: Role) => void }) {
  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="rounded-2xl border-2 border-foreground bg-card p-6 shadow-[4px_4px_0_0_var(--color-foreground)] space-y-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          What would you like to do?
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onSelect("send")}
            className="flex flex-col items-center gap-3 rounded-xl border-2 border-foreground bg-background px-4 py-6 shadow-[3px_3px_0_0_var(--color-foreground)] hover:bg-primary hover:text-primary-foreground transition-colors group"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 group-hover:bg-primary-foreground/20">
              <Upload className="h-6 w-6" />
            </span>
            <span className="text-sm font-bold">Send</span>
            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-primary-foreground/80 text-center">
              Share a file from this phone
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSelect("receive")}
            className="flex flex-col items-center gap-3 rounded-xl border-2 border-foreground bg-background px-4 py-6 shadow-[3px_3px_0_0_var(--color-foreground)] hover:bg-primary hover:text-primary-foreground transition-colors group"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 group-hover:bg-primary-foreground/20">
              <ScanLine className="h-6 w-6" />
            </span>
            <span className="text-sm font-bold">Receive</span>
            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-primary-foreground/80 text-center">
              Scan a QR from the other phone
            </span>
          </button>
        </div>
      </div>
      <PrivacyBadge />
    </div>
  );
}

// ─── Sender Flow ──────────────────────────────────────────────────────────────

function SenderFlow({ onReset }: { onReset: () => void }) {
  const [state, setState] = useState<SendState>("file-select");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);

  // Initialize Sender Peer on mount
  useEffect(() => {
    const peer = new Peer({
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      },
    });

    peer.on("open", (id) => {
      setPeerId(id);
    });

    peer.on("error", () => {
      setErrorMsg("Failed to connect to the transfer network. Check your internet connection.");
      setState("error");
    });

    peerRef.current = peer;

    return () => {
      peer.destroy();
    };
  }, []);

  // Listen for receiver connection once QR is displayed
  useEffect(() => {
    if (!peerRef.current || !file) return;

    const peer = peerRef.current;

    peer.on("connection", (conn) => {
      connRef.current = conn;
      setState("connecting");

      conn.on("open", async () => {
        setState("sending");

        // 1. Send file metadata
        const meta: FileMeta = { name: file.name, type: file.type, size: file.size };
        conn.send({ event: "meta", payload: meta });

        // 2. Stream binary array buffer
        const buf = await file.arrayBuffer();
        let offset = 0;

        const sendNextChunk = () => {
          while (offset < buf.byteLength) {
            const chunk = buf.slice(offset, offset + CHUNK_SIZE);
            conn.send(chunk);
            offset += chunk.byteLength;
            setProgress(Math.round((offset / buf.byteLength) * 100));

            // Yield control back to browser runtime every few chunks
            if (offset % (CHUNK_SIZE * 8) === 0) {
              setTimeout(sendNextChunk, 10);
              return;
            }
          }

          // 3. Send completion packet
          conn.send({ event: "done" });
          setState("done");
        };

        sendNextChunk();
      });

      conn.on("close", () => {
        if (state !== "done") {
          setErrorMsg("Connection lost with receiving phone.");
          setState("error");
        }
      });

      conn.on("error", () => {
        setErrorMsg("Direct connection encountered an error.");
        setState("error");
      });
    });
  }, [file, state]);

  // Draw QR code whenever peerId is ready and user is waiting
  useEffect(() => {
    if (state !== "qr-waiting" || !qrCanvasRef.current || !peerId) return;

    const qrPayload = `quickly-transfer:${peerId}`;
    QRCode.toCanvas(qrCanvasRef.current, qrPayload, {
      width: 260,
      color: { dark: "#111827", light: "#ffffff" },
      errorCorrectionLevel: "H",
      margin: 2,
    }).catch(() => {});
  }, [state, peerId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ALLOWED_TYPES.includes(f.type)) {
      setFileError("Unsupported file type. Choose an image or document.");
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setFileError("File too large. Maximum size is 100 MB.");
      return;
    }
    setFile(f);
  };

  const handleCancel = () => {
    connRef.current?.close();
    setState("cancelled");
  };

  const handleRetry = () => {
    connRef.current?.close();
    setFile(null);
    setProgress(0);
    setErrorMsg(null);
    setState("file-select");
  };

  if (state === "cancelled") {
    return (
      <StatusCard
        icon={<X className="h-7 w-7" />}
        title="Transfer cancelled"
        desc="The transfer was cancelled. No file was sent."
        action={<ResetButton label="Start over" onClick={onReset} />}
      />
    );
  }

  if (state === "error") {
    return (
      <StatusCard
        icon={<AlertTriangle className="h-7 w-7" />}
        title="Transfer failed"
        desc={errorMsg ?? "Something went wrong. Please try again."}
        action={
          <div className="flex gap-3 w-full">
            <button
              type="button"
              onClick={handleRetry}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
            >
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
            <button
              type="button"
              onClick={onReset}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-background px-4 py-3 text-sm font-bold shadow-[2px_2px_0_0_var(--color-foreground)]"
            >
              Home
            </button>
          </div>
        }
      />
    );
  }

  if (state === "done") {
    return (
      <StatusCard
        icon={<CheckCircle2 className="h-7 w-7 text-green-600" />}
        title="Transfer complete"
        desc={`"${file?.name}" was sent successfully.`}
        action={<ResetButton label="Send another" onClick={onReset} />}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
        <div className="flex items-center justify-between mb-3">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">
              ↑
            </span>
            Send a file
          </p>
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
        </div>

        {state === "file-select" && (
          <div className="space-y-3">
            {!file ? (
              <label className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-foreground/40 bg-background cursor-pointer px-4 py-10 hover:border-foreground/80 transition-colors">
                <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-foreground bg-primary/15">
                  <Upload className="h-6 w-6" />
                </span>
                <div className="text-center">
                  <p className="text-sm font-bold">Choose image or document</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    JPG, PNG, PDF, DOCX, XLSX and more · up to 100 MB
                  </p>
                </div>
                <input
                  type="file"
                  className="sr-only"
                  accept={ALLOWED_TYPES.join(",")}
                  onChange={handleFileSelect}
                />
              </label>
            ) : (
              <FileCard file={file} onRemove={() => setFile(null)} />
            )}

            {fileError && (
              <p className="text-xs font-bold text-red-600 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> {fileError}
              </p>
            )}

            {file && (
              <button
                type="button"
                onClick={() => setState("qr-waiting")}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform"
              >
                Generate QR code →
              </button>
            )}
          </div>
        )}

        {state === "qr-waiting" && file && (
          <div className="space-y-4">
            <FileCard file={file} />
            <div className="flex flex-col items-center gap-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Scan this QR from the other phone
              </p>
              <div className="rounded-xl border-2 border-foreground p-3 bg-white shadow-[3px_3px_0_0_var(--color-foreground)] flex items-center justify-center min-h-[260px] min-w-[260px]">
                {peerId ? (
                  <canvas ref={qrCanvasRef} />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-xs font-bold text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    Generating secure QR…
                  </div>
                )}
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-foreground/20 bg-secondary/40 px-3 py-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-xs font-medium">Waiting for receiver…</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-background px-4 py-2.5 text-sm font-bold shadow-[2px_2px_0_0_var(--color-foreground)]"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
          </div>
        )}

        {state === "connecting" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-bold">Connecting…</p>
            <p className="text-xs text-muted-foreground">Establishing direct connection</p>
          </div>
        )}

        {state === "sending" && (
          <div className="space-y-4 py-2">
            <FileCard file={file!} />
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span>Sending…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-3 rounded-full border-2 border-foreground bg-background overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-background px-4 py-2.5 text-sm font-bold shadow-[2px_2px_0_0_var(--color-foreground)]"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Receiver Flow ────────────────────────────────────────────────────────────

function ReceiverFlow({ onReset }: { onReset: () => void }) {
  const [state, setState] = useState<ReceiveState>("scanner");
  const [incomingMeta, setIncomingMeta] = useState<FileMeta | null>(null);
  const [progress, setProgress] = useState(0);
  const [receivedBlob, setReceivedBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const chunksRef = useRef<ArrayBuffer[]>([]);
  const metaRef = useRef<FileMeta | null>(null);
  const receivedBytesRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize Receiver Peer
  useEffect(() => {
    const peer = new Peer({
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      },
    });

    peerRef.current = peer;

    return () => {
      peer.destroy();
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const connectToSender = useCallback((senderPeerId: string) => {
    stopCamera();
    setState("connecting");

    if (!peerRef.current) {
      setErrorMsg("Signaling client uninitialized. Please refresh and try again.");
      setState("error");
      return;
    }

    const conn = peerRef.current.connect(senderPeerId, { reliable: true });
    connRef.current = conn;

    conn.on("open", () => {
      setState("receiving");
    });

    conn.on("data", (data: any) => {
      // 1. Metadata packet
      if (data?.event === "meta") {
        metaRef.current = data.payload;
        setIncomingMeta(data.payload);
        chunksRef.current = [];
        receivedBytesRef.current = 0;
        return;
      }

      // 2. Finished packet
      if (data?.event === "done") {
        const blob = new Blob(chunksRef.current, {
          type: metaRef.current?.type || "application/octet-stream",
        });
        setReceivedBlob(blob);
        setState("done");
        return;
      }

      // 3. Binary chunk packet
      if (data instanceof ArrayBuffer || data?.buffer instanceof ArrayBuffer) {
        const chunk = data instanceof ArrayBuffer ? data : data.buffer;
        chunksRef.current.push(chunk);
        receivedBytesRef.current += chunk.byteLength;

        if (metaRef.current?.size) {
          setProgress(
            Math.min(100, Math.round((receivedBytesRef.current / metaRef.current.size) * 100))
          );
        }
      }
    });

    conn.on("close", () => {
      if (state !== "done") {
        setErrorMsg("Connection with sender lost.");
        setState("error");
      }
    });

    conn.on("error", () => {
      setErrorMsg("Failed to connect to sender phone.");
      setState("error");
    });
  }, [state, stopCamera]);

  // Start Camera & Frame Detection
  useEffect(() => {
    if (state !== "scanner") return;

    let isScanning = true;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (!isScanning) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const scanFrame = () => {
          const video = videoRef.current;
          if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
              });

              if (code?.data?.startsWith("quickly-transfer:")) {
                const targetPeerId = code.data.replace("quickly-transfer:", "").trim();
                connectToSender(targetPeerId);
                return;
              }
            }
          }
          animFrameRef.current = requestAnimationFrame(scanFrame);
        };

        animFrameRef.current = requestAnimationFrame(scanFrame);
      } catch {
        setErrorMsg("Camera access was denied. Please allow camera permission and try again.");
        setState("error");
      }
    })();

    return () => {
      isScanning = false;
      stopCamera();
    };
  }, [state, connectToSender, stopCamera]);

  const handleDownload = () => {
    if (!receivedBlob || !incomingMeta) return;
    const url = URL.createObjectURL(receivedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = incomingMeta.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleCancel = () => {
    connRef.current?.close();
    stopCamera();
    setState("cancelled");
  };

  const handleRetry = () => {
    connRef.current?.close();
    setIncomingMeta(null);
    setProgress(0);
    setErrorMsg(null);
    chunksRef.current = [];
    receivedBytesRef.current = 0;
    setState("scanner");
  };

  if (state === "cancelled") {
    return (
      <StatusCard
        icon={<X className="h-7 w-7" />}
        title="Transfer cancelled"
        desc="The transfer was cancelled. No file was received."
        action={<ResetButton label="Start over" onClick={onReset} />}
      />
    );
  }

  if (state === "error") {
    return (
      <StatusCard
        icon={<AlertTriangle className="h-7 w-7" />}
        title="Transfer failed"
        desc={errorMsg ?? "Something went wrong. Please try again."}
        action={
          <div className="flex gap-3 w-full">
            <button
              type="button"
              onClick={handleRetry}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
            >
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
            <button
              type="button"
              onClick={onReset}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-background px-4 py-3 text-sm font-bold shadow-[2px_2px_0_0_var(--color-foreground)]"
            >
              Home
            </button>
          </div>
        }
      />
    );
  }

  if (state === "done" && incomingMeta) {
    const Icon = mimeIcon(incomingMeta.type);
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border-2 border-foreground bg-card p-6 shadow-[4px_4px_0_0_var(--color-foreground)] space-y-4">
          <div className="flex flex-col items-center gap-2">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-foreground bg-green-50">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </span>
            <p className="text-base font-bold">Transfer complete ✓</p>
          </div>
          {receivedBlob && incomingMeta.type.startsWith("image/") && (
            <img
              src={URL.createObjectURL(receivedBlob)}
              alt={incomingMeta.name}
              className="rounded-xl border-2 border-foreground w-full max-h-64 object-contain bg-secondary/20"
            />
          )}
          <div className="rounded-xl border-2 border-foreground bg-background px-3 py-2.5 flex items-center gap-3">
            <Icon className="h-5 w-5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{incomingMeta.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(incomingMeta.size)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform"
          >
            <Download className="h-4 w-4" /> Save to device
          </button>
          <button
            type="button"
            onClick={onReset}
            className="w-full text-xs font-bold text-muted-foreground py-1"
          >
            Receive another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
        <div className="flex items-center justify-between mb-3">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px]">
              ↓
            </span>
            Receive a file
          </p>
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
        </div>

        {state === "scanner" && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Scan the sender's QR code
            </p>
            <div className="relative rounded-xl border-2 border-foreground overflow-hidden bg-black shadow-[3px_3px_0_0_var(--color-foreground)]">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full aspect-square object-cover"
              />
              {/* Scanning frame overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-4 border-white/80 rounded-2xl shadow-lg" />
              </div>
              <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
                  <ScanLine className="h-3.5 w-3.5 animate-pulse" /> Scanning…
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-background px-4 py-2.5 text-sm font-bold shadow-[2px_2px_0_0_var(--color-foreground)]"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
          </div>
        )}

        {state === "connecting" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-bold">Connecting…</p>
            <p className="text-xs text-muted-foreground">Establishing direct connection with sender</p>
          </div>
        )}

        {state === "receiving" && (
          <div className="space-y-4 py-2">
            {incomingMeta && <FileMetaCard meta={incomingMeta} />}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span>Receiving…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-3 rounded-full border-2 border-foreground bg-background overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-background px-4 py-2.5 text-sm font-bold shadow-[2px_2px_0_0_var(--color-foreground)]"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function FileCard({ file, onRemove }: { file: File; onRemove?: () => void }) {
  const isImage = file.type.startsWith("image/");
  const Icon = mimeIcon(file.type);
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setThumb(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <div className="flex items-center gap-3 rounded-xl border-2 border-foreground bg-background px-3 py-2.5 shadow-[2px_2px_0_0_var(--color-foreground)]">
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="h-10 w-10 rounded-lg object-cover flex-shrink-0 border border-foreground/20"
        />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-foreground/20 bg-secondary/40 flex-shrink-0">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-foreground/20 bg-background hover:bg-secondary/40 flex-shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function FileMetaCard({ meta }: { meta: FileMeta }) {
  const Icon = mimeIcon(meta.type);
  return (
    <div className="flex items-center gap-3 rounded-xl border-2 border-foreground bg-background px-3 py-2.5 shadow-[2px_2px_0_0_var(--color-foreground)]">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-foreground/20 bg-secondary/40 flex-shrink-0">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold truncate">{meta.name}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(meta.size)}</p>
      </div>
    </div>
  );
}

function StatusCard({
  icon,
  title,
  desc,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  action: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-6 shadow-[4px_4px_0_0_var(--color-foreground)] space-y-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-foreground bg-primary/15">
          {icon}
        </span>
        <p className="text-base font-bold">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      {action}
    </div>
  );
}

function ResetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform"
    >
      {label}
    </button>
  );
}

function PrivacyBadge() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-foreground/20 bg-secondary/30 px-3 py-2.5">
      <Shield className="h-4 w-4 flex-shrink-0 mt-0.5 text-muted-foreground" />
      <div>
        <p className="text-xs font-bold">Private transfer</p>
        <p className="text-[11px] font-medium text-muted-foreground leading-relaxed">
          No account. No cloud storage. Files travel directly between devices via WebRTC.
          A temporary session ID is used for connection setup only — your file is never stored.
        </p>
      </div>
    </div>
  );
}