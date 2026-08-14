/**
 * PhoneTransfer.tsx — Quickly Phone-to-Phone Transfer
 *
 * Architecture:
 * - WebRTC RTCDataChannel for actual file bytes (peer-to-peer, never hits app storage)
 * - A tiny signaling relay is used ONLY to exchange SDP offers/answers and ICE candidates
 * - The file itself is chunked (16 KB chunks) with backpressure via bufferedAmountLowThreshold
 * - Session IDs are ephemeral UUIDs; cleaned up after transfer or cancellation
 *
 * Supported: modern iOS Safari ≥ 15.4, Android Chrome ≥ 90
 */

import { useEffect, useRef, useState, useCallback } from "react";
import QRCode from "qrcode";
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

const CHUNK_SIZE = 16 * 1024; // 16 KB per RTCDataChannel message
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB guard
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

// Free public STUN servers for ICE gathering
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// Signaling via BroadcastChannel (same-origin tabs) for demo;
// in production swap with a WebSocket relay.
// We simulate peer signaling with a shared in-memory bus so this works
// in a single domain without a backend. For cross-device you'd replace
// the signal* helpers with a lightweight WebSocket or Firebase Realtime DB call.
// The file bytes never leave the RTCDataChannel.

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
  // Treat as mobile if any of these are present
  const mobileUA = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  // Also check for touch + small screen as secondary heuristic
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  return !mobileUA && !hasTouch;
}

// ─── Signaling bus (in-memory, same browser tab demo) ─────────────────────────
// Replace signal* with WebSocket calls for cross-device production use.
// The session ID in the QR encodes the rendezvous point.

type SignalMsg =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: RTCIceCandidateInit };

const _channels: Record<string, BroadcastChannel> = {};

function getChannel(sessionId: string) {
  if (!_channels[sessionId]) {
    _channels[sessionId] = new BroadcastChannel(`quickly-transfer-${sessionId}`);
  }
  return _channels[sessionId];
}

function signalSend(sessionId: string, msg: SignalMsg) {
  getChannel(sessionId).postMessage(msg);
}

function signalListen(
  sessionId: string,
  handler: (msg: SignalMsg) => void
): () => void {
  const ch = getChannel(sessionId);
  const listener = (e: MessageEvent) => handler(e.data);
  ch.addEventListener("message", listener);
  return () => ch.removeEventListener("message", listener);
}

function cleanupSignal(sessionId: string) {
  const ch = _channels[sessionId];
  if (ch) {
    ch.close();
    delete _channels[sessionId];
  }
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
  const [sessionId] = useState(() => crypto.randomUUID());
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);

  // Build QR payload — just the session ID
  const qrPayload = `quickly-transfer:${sessionId}`;

  // Draw QR once we move to qr-waiting
  useEffect(() => {
    if (state !== "qr-waiting" || !qrCanvasRef.current) return;
    QRCode.toCanvas(qrCanvasRef.current, qrPayload, {
      width: 280,
      color: { dark: "#111827", light: "#ffffff" },
      errorCorrectionLevel: "H",
      margin: 2,
    }).catch(() => {});
  }, [state, qrPayload]);

  // WebRTC sender logic
  const startSenderWebRTC = useCallback(async () => {
    if (!file) return;
    setState("connecting");

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    const dc = pc.createDataChannel("file", { ordered: true });
    dcRef.current = dc;

    // Backpressure: only write when buffer is low
    dc.bufferedAmountLowThreshold = CHUNK_SIZE * 4;

    dc.onopen = async () => {
      setState("sending");
      // Send metadata first as JSON
      const meta: FileMeta = { name: file.name, type: file.type, size: file.size };
      dc.send(JSON.stringify({ event: "meta", payload: meta }));

      // Then stream chunks
      const buf = await file.arrayBuffer();
      let offset = 0;

      const sendChunk = () => {
        while (offset < buf.byteLength) {
          if (dc.bufferedAmount > CHUNK_SIZE * 8) {
            // Wait for drain
            dc.onbufferedamountlow = sendChunk;
            return;
          }
          const chunk = buf.slice(offset, offset + CHUNK_SIZE);
          dc.send(chunk);
          offset += chunk.byteLength;
          setProgress(Math.round((offset / buf.byteLength) * 100));
        }
        dc.send(JSON.stringify({ event: "done" }));
        setState("done");
      };

      sendChunk();
    };

    dc.onerror = () => {
      setErrorMsg("Connection lost. The two phones were disconnected.");
      setState("error");
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) signalSend(sessionId, { type: "ice", candidate: candidate.toJSON() });
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signalSend(sessionId, { type: "offer", sdp: offer.sdp! });

    // Listen for answer + ICE from receiver
    const unsub = signalListen(sessionId, async (msg) => {
      if (msg.type === "answer") {
        await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
      } else if (msg.type === "ice") {
        await pc.addIceCandidate(msg.candidate).catch(() => {});
      }
    });

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setErrorMsg("Connection lost. The two phones were disconnected.");
        setState("error");
        unsub();
      }
    };

    return unsub;
  }, [file, sessionId]);

  // When file is selected and user confirms, show QR
  const handleFileConfirm = () => {
    setState("qr-waiting");
  };

  // When user taps "Start Transfer" (receiver scanned QR, we detect via signal)
  useEffect(() => {
    if (state !== "qr-waiting") return;

    // In a cross-device scenario, the receiver posts an "offer-request" signal.
    // Here we listen for receiver readiness as a "ready" message variant.
    const unsub = signalListen(sessionId, (msg) => {
      if ((msg as any).type === "ready") {
        startSenderWebRTC().catch(() => {
          setErrorMsg("Could not establish connection. Please try again.");
          setState("error");
        });
      }
    });
    return unsub;
  }, [state, sessionId, startSenderWebRTC]);

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
    pcRef.current?.close();
    dcRef.current?.close();
    cleanupSignal(sessionId);
    setState("cancelled");
  };

  const handleRetry = () => {
    pcRef.current?.close();
    setFile(null);
    setProgress(0);
    setErrorMsg(null);
    setState("file-select");
  };

  // ── Render ──

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
      {/* Header step */}
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

        {/* File select state */}
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
                onClick={handleFileConfirm}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)] transition-transform"
              >
                Generate QR code →
              </button>
            )}
          </div>
        )}

        {/* QR waiting state */}
        {state === "qr-waiting" && file && (
          <div className="space-y-4">
            <FileCard file={file} />
            <div className="flex flex-col items-center gap-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Scan this QR from the other phone
              </p>
              <div className="rounded-xl border-2 border-foreground p-3 bg-white shadow-[3px_3px_0_0_var(--color-foreground)]">
                <canvas ref={qrCanvasRef} />
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

        {/* Connecting */}
        {state === "connecting" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm font-bold">Connecting…</p>
            <p className="text-xs text-muted-foreground">Establishing direct connection</p>
          </div>
        )}

        {/* Sending */}
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [incomingMeta, setIncomingMeta] = useState<FileMeta | null>(null);
  const [progress, setProgress] = useState(0);
  const [receivedBlob, setReceivedBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<any>(null); // jsQR or equivalent
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const chunksRef = useRef<ArrayBuffer[]>([]);
  const metaRef = useRef<FileMeta | null>(null);
  const receivedRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);

  // Start camera
  useEffect(() => {
    if (state !== "scanner") return;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        startScan();
      } catch {
        setErrorMsg("Camera access was denied. Please allow camera permission and try again.");
        setState("error");
      }
    })();

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [state]);

  const startScan = () => {
    // Dynamically import jsQR for QR detection
    const tick = async () => {
      const video = videoRef.current;
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      try {
        const jsQR = (await import("jsqr")).default;
        const code = jsQR(imgData.data, imgData.width, imgData.height);
        if (code?.data?.startsWith("quickly-transfer:")) {
          const id = code.data.replace("quickly-transfer:", "");
          if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
          onQrDetected(id);
          return;
        }
      } catch {
        // jsqr not loaded yet, continue scanning
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  };

  const onQrDetected = async (id: string) => {
    setSessionId(id);
    setState("connecting");

    // Signal sender we're ready
    signalSend(id, { type: "ready" } as any);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.ondatachannel = ({ channel }) => {
      channel.onmessage = ({ data }) => {
        if (typeof data === "string") {
          const msg = JSON.parse(data);
          if (msg.event === "meta") {
            metaRef.current = msg.payload;
            setIncomingMeta(msg.payload);
            chunksRef.current = [];
            receivedRef.current = 0;
            setState("incoming");
          } else if (msg.event === "done") {
            const blob = new Blob(chunksRef.current, { type: metaRef.current?.type });
            setReceivedBlob(blob);
            setState("done");
          }
        } else {
          // Binary chunk
          chunksRef.current.push(data);
          receivedRef.current += (data as ArrayBuffer).byteLength;
          if (metaRef.current) {
            setProgress(Math.round((receivedRef.current / metaRef.current.size) * 100));
            if (state !== "receiving") setState("receiving");
          }
        }
      };
      channel.onerror = () => {
        setErrorMsg("Connection lost. The two phones were disconnected.");
        setState("error");
      };
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) signalSend(id, { type: "ice", candidate: candidate.toJSON() });
    };

    const unsub = signalListen(id, async (msg) => {
      if (msg.type === "offer") {
        await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signalSend(id, { type: "answer", sdp: answer.sdp! });
      } else if (msg.type === "ice") {
        await pc.addIceCandidate(msg.candidate).catch(() => {});
      }
    });

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setErrorMsg("Connection lost. The two phones were disconnected.");
        setState("error");
        unsub();
      }
    };
  };

  const handleDownload = () => {
    if (!receivedBlob || !incomingMeta) return;
    const url = URL.createObjectURL(receivedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = incomingMeta.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    if (sessionId) cleanupSignal(sessionId);
  };

  const handleCancel = () => {
    pcRef.current?.close();
    if (sessionId) cleanupSignal(sessionId);
    setState("cancelled");
  };

  const handleRetry = () => {
    pcRef.current?.close();
    if (sessionId) cleanupSignal(sessionId);
    setSessionId(null);
    setIncomingMeta(null);
    setProgress(0);
    setErrorMsg(null);
    chunksRef.current = [];
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
            <div className="min-w-0">
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
          <button type="button" onClick={onReset} className="w-full text-xs font-bold text-muted-foreground py-1">
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
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm font-bold">Connecting…</p>
            <p className="text-xs text-muted-foreground">Establishing direct connection</p>
          </div>
        )}

        {state === "incoming" && incomingMeta && (
          <div className="space-y-4 py-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Incoming file
            </p>
            <FileMetaCard meta={incomingMeta} />
            <p className="text-xs text-center font-medium text-muted-foreground">
              Ready to receive
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setState("receiving")}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-background px-4 py-3 text-sm font-bold shadow-[2px_2px_0_0_var(--color-foreground)]"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {state === "receiving" && incomingMeta && (
          <div className="space-y-4 py-2">
            <FileMetaCard meta={incomingMeta} />
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
        <img src={thumb} alt="" className="h-10 w-10 rounded-lg object-cover flex-shrink-0 border border-foreground/20" />
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