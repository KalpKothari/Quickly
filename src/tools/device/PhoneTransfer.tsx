/**
 * PhoneTransfer.tsx — Quickly Phone-to-Phone Transfer
 *
 * Architecture:
 * - Direct WebRTC P2P DataChannel via PeerJS
 * - Multi-file streaming support with sequential batching
 * - Real-time Receiver ACK syncing (both phones progress in 1:1 lockstep)
 * - Safe screen lock notice preventing premature tab exit
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
  Video,
  X,
  RefreshCw,
  CheckCircle2,
  Download,
  Shield,
  Loader2,
  AlertTriangle,
  Smartphone,
  Copy,
  Check,
  Zap,
  Lock,
  Wifi,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 16 * 1024; // 16 KB binary chunks
const MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 500 MB combined batch guard
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/avi",
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

const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ],
    iceCandidatePoolSize: 10,
  },
};

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
  | "receiving"
  | "done"
  | "error"
  | "cancelled";

interface FileMeta {
  name: string;
  type: string;
  size: number;
}

interface ReceivedItem {
  meta: FileMeta;
  blob: Blob;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeIcon(type: string) {
  if (type.startsWith("image/")) return ImageIcon;
  if (type.startsWith("video/")) return Video;
  return FileText;
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

// ─── Desktop View (Redesigned & Clean) ─────────────────────────────────────────

function DesktopBlock() {
  const [copied, setCopied] = useState(false);
  const [pageUrl, setPageUrl] = useState("");
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = window.location.href;
      setPageUrl(url);
      if (qrCanvasRef.current) {
        QRCode.toCanvas(qrCanvasRef.current, url, {
          width: 180,
          color: { dark: "#111827", light: "#ffffff" },
          errorCorrectionLevel: "M",
          margin: 1,
        }).catch(() => {});
      }
    }
  }, []);

  const handleCopy = () => {
    if (!pageUrl) return;
    navigator.clipboard.writeText(pageUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      {/* Main Single Card Container */}
      <div className="rounded-3xl border-2 border-foreground bg-card p-8 md:p-12 shadow-[6px_6px_0_0_var(--color-foreground)]">
        <div className="grid md:grid-cols-12 gap-10 items-center">
          
          {/* Left Column: Clear & Friendly Pitch */}
          <div className="md:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border-2 border-foreground bg-primary/10 text-xs font-bold">
              <Smartphone className="h-4 w-4" />
              Direct Phone-to-Phone Transfer
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
                Move files between phones instantly.
              </h1>
              <p className="text-base text-muted-foreground leading-relaxed">
                Send photos, videos, and full-resolution documents directly to another phone nearby. No logins, no cloud storage, and zero quality compression.
              </p>
            </div>

            {/* Simple Value Points - No Tech Jargon */}
            <div className="space-y-3 pt-2">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-foreground">
                  <Zap className="h-3.5 w-3.5" />
                </div>
                <p className="text-sm text-foreground">
                  <strong>Instant & direct:</strong> Files travel straight phone-to-phone without waiting for cloud uploads.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-foreground">
                  <Lock className="h-3.5 w-3.5" />
                </div>
                <p className="text-sm text-foreground">
                  <strong>100% private:</strong> Your data is never saved on any servers or databases.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-foreground">
                  <Wifi className="h-3.5 w-3.5" />
                </div>
                <p className="text-sm text-foreground">
                  <strong>Original quality:</strong> Media is never resized or compressed during the transfer.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Scan to open on mobile */}
          <div className="md:col-span-5 flex flex-col items-center justify-center text-center p-6 rounded-2xl bg-secondary/30 border-2 border-foreground/30 space-y-4">
            <div className="p-3 bg-white rounded-2xl border-2 border-foreground shadow-[3px_3px_0_0_var(--color-foreground)]">
              <canvas ref={qrCanvasRef} />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-bold">Open on your phone</p>
              <p className="text-xs text-muted-foreground">
                Scan with your phone's camera to start sending or receiving.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-background px-4 py-2.5 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] hover:bg-muted transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-600" /> Link Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy Link to Share
                </>
              )}
            </button>
          </div>

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
              Share files from this phone
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
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const filesRef = useRef<File[]>([]);

  filesRef.current = files;

  // Initialize Sender Peer on mount
  useEffect(() => {
    const peer = new Peer(PEER_CONFIG);
    peerRef.current = peer;

    peer.on("open", (id) => {
      setPeerId(id);
    });

    peer.on("connection", (conn) => {
      connRef.current = conn;
      setState("connecting");

      conn.on("open", () => {
        if (filesRef.current.length > 0) {
          const fileMetas: FileMeta[] = filesRef.current.map((f) => ({
            name: f.name,
            size: f.size,
            type: f.type,
          }));
          const totalBatchSize = filesRef.current.reduce((acc, f) => acc + f.size, 0);

          conn.send({
            type: "BATCH_META",
            files: fileMetas,
            totalSize: totalBatchSize,
          });
        }
      });

      conn.on("data", async (data: any) => {
        // Sync sender progress directly with receiver's verified bytes
        if (data?.type === "PROGRESS_SYNC") {
          setProgress(data.percent);
          setCurrentFileIndex(data.fileIndex);
          return;
        }

        // When receiver is ready to receive the stream
        if (data?.type === "READY_FOR_FILES" && filesRef.current.length > 0) {
          setState("sending");

          const fileList = filesRef.current;
          for (let i = 0; i < fileList.length; i++) {
            const currentFile = fileList[i];
            conn.send({ type: "START_FILE", index: i });

            const arrayBuf = await currentFile.arrayBuffer();
            let offset = 0;

            while (offset < arrayBuf.byteLength) {
              const chunk = arrayBuf.slice(offset, offset + CHUNK_SIZE);
              conn.send(chunk);
              offset += chunk.byteLength;

              if (offset % (CHUNK_SIZE * 4) === 0) {
                await new Promise((r) => setTimeout(r, 4));
              }
            }

            conn.send({ type: "FILE_DONE", index: i });
          }

          conn.send({ type: "ALL_DONE" });
        }

        // Final completion confirmation received from receiver
        if (data?.type === "TRANSFER_COMPLETE_ACK") {
          setProgress(100);
          setState("done");
        }
      });

      conn.on("close", () => {
        setState((curr) => {
          if (curr !== "done") {
            setErrorMsg("Connection closed by the receiving phone.");
            return "error";
          }
          return curr;
        });
      });

      conn.on("error", () => {
        setErrorMsg("Direct peer communication error.");
        setState("error");
      });
    });

    peer.on("error", (err) => {
      setErrorMsg(`Signaling error: ${err.message || "Failed to reach relay"}`);
      setState("error");
    });

    return () => {
      peer.destroy();
    };
  }, []);

  // Draw QR
  useEffect(() => {
    if (state !== "qr-waiting" || !qrCanvasRef.current || !peerId) return;

    const payload = `quickly-transfer:${peerId}`;
    QRCode.toCanvas(qrCanvasRef.current, payload, {
      width: 260,
      color: { dark: "#111827", light: "#ffffff" },
      errorCorrectionLevel: "M",
      margin: 2,
    }).catch(() => {});
  }, [state, peerId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;

    const invalid = selected.find((f) => !ALLOWED_TYPES.includes(f.type));
    if (invalid) {
      setFileError(`"${invalid.name}" has an unsupported format.`);
      return;
    }

    const totalSize = selected.reduce((acc, f) => acc + f.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      setFileError("Total batch size exceeds 500 MB.");
      return;
    }

    setFiles((prev) => [...prev, ...selected]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCancel = () => {
    connRef.current?.close();
    setState("cancelled");
  };

  const handleRetry = () => {
    connRef.current?.close();
    setFiles([]);
    setProgress(0);
    setErrorMsg(null);
    setState("file-select");
  };

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  if (state === "cancelled") {
    return (
      <StatusCard
        icon={<X className="h-7 w-7" />}
        title="Transfer cancelled"
        desc="The transfer was cancelled. No files were sent."
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
        desc={`All ${files.length} file(s) (${formatBytes(totalBytes)}) were sent successfully.`}
        action={<ResetButton label="Send more files" onClick={onReset} />}
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
            Send files ({files.length})
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
            <label className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-foreground/40 bg-background cursor-pointer px-4 py-8 hover:border-foreground/80 transition-colors">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-foreground bg-primary/15">
                <Upload className="h-6 w-6" />
              </span>
              <div className="text-center">
                <p className="text-sm font-bold">Select images, videos, or docs</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select multiple files at once · up to 500 MB total
                </p>
              </div>
              <input
                type="file"
                multiple
                className="sr-only"
                accept={ALLOWED_TYPES.join(",")}
                onChange={handleFileSelect}
              />
            </label>

            {files.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {files.map((f, i) => (
                  <FileCard key={`${f.name}-${i}`} file={f} onRemove={() => removeFile(i)} />
                ))}
              </div>
            )}

            {fileError && (
              <p className="text-xs font-bold text-red-600 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> {fileError}
              </p>
            )}

            {files.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-xs font-bold text-muted-foreground px-1">
                  <span>Total files: {files.length}</span>
                  <span>{formatBytes(totalBytes)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setState("qr-waiting")}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform"
                >
                  Generate QR code →
                </button>
              </div>
            )}
          </div>
        )}

        {state === "qr-waiting" && files.length > 0 && (
          <div className="space-y-4">
            <div className="rounded-xl border-2 border-foreground bg-background px-3 py-2 text-xs font-bold flex justify-between">
              <span>{files.length} file(s) ready to send</span>
              <span>{formatBytes(totalBytes)}</span>
            </div>

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
            <div className="rounded-xl border-2 border-foreground bg-secondary/30 p-3 space-y-1">
              <p className="text-xs font-bold truncate">
                Sending file {currentFileIndex + 1} of {files.length}: {files[currentFileIndex]?.name}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Total size: {formatBytes(totalBytes)}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span>Synchronized Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="h-3 rounded-full border-2 border-foreground bg-background overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-foreground/20 bg-background/60 p-2.5 text-center">
              <p className="text-[11px] font-bold text-foreground">
                Do not close or leave this screen on either phone until transfer completes.
              </p>
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
  const [incomingMetas, setIncomingMetas] = useState<FileMeta[]>([]);
  const [totalBatchSize, setTotalBatchSize] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const peerReadyRef = useRef<boolean>(false);
  const connRef = useRef<DataConnection | null>(null);

  const batchMetasRef = useRef<FileMeta[]>([]);
  const totalBatchSizeRef = useRef<number>(0);
  const activeFileIndexRef = useRef<number>(0);
  const currentChunksRef = useRef<BlobPart[]>([]);
  const totalBytesReceivedRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize Receiver Peer
  useEffect(() => {
    const peer = new Peer(PEER_CONFIG);
    peerRef.current = peer;

    peer.on("open", () => {
      peerReadyRef.current = true;
    });

    peer.on("error", (err) => {
      setErrorMsg(`Receiver signaling error: ${err.message || "Failed"}`);
      setState("error");
    });

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

  const initiateConnection = useCallback((senderPeerId: string) => {
    if (!peerRef.current || !peerReadyRef.current) {
      setTimeout(() => initiateConnection(senderPeerId), 100);
      return;
    }

    const conn = peerRef.current.connect(senderPeerId, { reliable: true });
    connRef.current = conn;

    conn.on("open", () => {
      setState("receiving");
    });

    conn.on("data", (data: any) => {
      // 1. Batch metadata announcement
      if (data?.type === "BATCH_META") {
        batchMetasRef.current = data.files;
        totalBatchSizeRef.current = data.totalSize;
        setIncomingMetas(data.files);
        setTotalBatchSize(data.totalSize);
        totalBytesReceivedRef.current = 0;
        setReceivedItems([]);

        conn.send({ type: "READY_FOR_FILES" });
        return;
      }

      // 2. Start of a specific file
      if (data?.type === "START_FILE") {
        activeFileIndexRef.current = data.index;
        setCurrentFileIndex(data.index);
        currentChunksRef.current = [];
        return;
      }

      // 3. Single file completion
      if (data?.type === "FILE_DONE") {
        const meta = batchMetasRef.current[data.index];
        const blob = new Blob(currentChunksRef.current, {
          type: meta?.type || "application/octet-stream",
        });

        setReceivedItems((prev) => [...prev, { meta, blob }]);
        currentChunksRef.current = [];
        return;
      }

      // 4. Entire batch completed
      if (data?.type === "ALL_DONE") {
        conn.send({ type: "TRANSFER_COMPLETE_ACK" });
        setProgress(100);
        setState("done");
        return;
      }

      // 5. Binary chunk payload
      let chunkBytes: Uint8Array;
      if (data instanceof ArrayBuffer) {
        chunkBytes = new Uint8Array(data);
      } else if (data?.buffer instanceof ArrayBuffer) {
        chunkBytes = new Uint8Array(data.buffer);
      } else if (data instanceof Uint8Array) {
        chunkBytes = data;
      } else {
        return;
      }

      currentChunksRef.current.push(chunkBytes as unknown as BlobPart);
      totalBytesReceivedRef.current += chunkBytes.byteLength;

      if (totalBatchSizeRef.current > 0) {
        const calculatedPercent = Math.min(
          99,
          Math.round((totalBytesReceivedRef.current / totalBatchSizeRef.current) * 100)
        );
        setProgress(calculatedPercent);

        // Send progress heartbeat ACK back to sender to keep both devices in sync
        conn.send({
          type: "PROGRESS_SYNC",
          percent: calculatedPercent,
          fileIndex: activeFileIndexRef.current,
        });
      }
    });

    conn.on("close", () => {
      setState((curr) => {
        if (curr !== "done") {
          setErrorMsg("Connection closed by the sending phone.");
          return "error";
        }
        return curr;
      });
    });

    conn.on("error", () => {
      setErrorMsg("Failed to establish P2P connection with sender.");
      setState("error");
    });
  }, []);

  const connectToSender = useCallback(
    (senderPeerId: string) => {
      stopCamera();
      setState("connecting");
      initiateConnection(senderPeerId);
    },
    [stopCamera, initiateConnection]
  );

  // Camera QR scanner loop
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

  const handleDownloadSingle = (item: ReceivedItem) => {
    const url = URL.createObjectURL(item.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.meta.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleDownloadAll = () => {
    receivedItems.forEach((item, index) => {
      setTimeout(() => {
        handleDownloadSingle(item);
      }, index * 250);
    });
  };

  const handleCancel = () => {
    connRef.current?.close();
    stopCamera();
    setState("cancelled");
  };

  const handleRetry = () => {
    connRef.current?.close();
    setIncomingMetas([]);
    setReceivedItems([]);
    setProgress(0);
    setErrorMsg(null);
    currentChunksRef.current = [];
    totalBytesReceivedRef.current = 0;
    setState("scanner");
  };

  if (state === "cancelled") {
    return (
      <StatusCard
        icon={<X className="h-7 w-7" />}
        title="Transfer cancelled"
        desc="The transfer was cancelled. No files were received."
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
      <div className="space-y-4">
        <div className="rounded-2xl border-2 border-foreground bg-card p-6 shadow-[4px_4px_0_0_var(--color-foreground)] space-y-4">
          <div className="flex flex-col items-center gap-2">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-foreground bg-green-50">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </span>
            <p className="text-base font-bold">Transfer complete ✓</p>
            <p className="text-xs text-muted-foreground">
              Received {receivedItems.length} file(s) ({formatBytes(totalBatchSize)})
            </p>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {receivedItems.map((item, index) => {
              const Icon = mimeIcon(item.meta.type);
              return (
                <div
                  key={`${item.meta.name}-${index}`}
                  className="rounded-xl border-2 border-foreground bg-background p-2.5 flex items-center justify-between gap-2 shadow-[2px_2px_0_0_var(--color-foreground)]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-foreground/20 bg-secondary/40 shrink-0">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{item.meta.name}</p>
                      <p className="text-[10px] text-muted-foreground">{formatBytes(item.meta.size)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadSingle(item)}
                    className="p-1.5 rounded-lg border border-foreground bg-primary text-primary-foreground shrink-0 hover:bg-primary/90"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleDownloadAll}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform"
          >
            <Download className="h-4 w-4" /> Save all to device
          </button>
          <button
            type="button"
            onClick={onReset}
            className="w-full text-xs font-bold text-muted-foreground py-1"
          >
            Receive more files
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
            Receive files
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
            <p className="text-xs text-muted-foreground">
              Establishing direct connection with sender
            </p>
          </div>
        )}

        {state === "receiving" && (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border-2 border-foreground bg-secondary/30 p-3 space-y-1">
              <p className="text-xs font-bold truncate">
                Receiving file {currentFileIndex + 1} of {incomingMetas.length}: {incomingMetas[currentFileIndex]?.name}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Total size: {formatBytes(totalBatchSize)}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span>Synchronized Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="h-3 rounded-full border-2 border-foreground bg-background overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-foreground/20 bg-background/60 p-2.5 text-center">
              <p className="text-[11px] font-bold text-foreground">
                Do not close or leave this screen on either phone until transfer completes.
              </p>
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
  const isVideo = file.type.startsWith("video/");
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
          className="h-10 w-10 rounded-lg object-cover shrink-0 border border-foreground/20"
        />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-foreground/20 bg-secondary/40 shrink-0">
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
          className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-foreground/20 bg-background hover:bg-secondary/40 shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
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
      <Shield className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
      <div>
        <p className="text-xs font-bold">Private transfer</p>
        <p className="text-[11px] font-medium text-muted-foreground leading-relaxed">
          Quickly works best for images and everyday files. 
          For larger videos or files, use a direct Wi-Fi connection for the fastest transfer experience.
        </p>
      </div>
    </div>
  );
}