/**
 * Chat.tsx — Quickly Temporary P2P Chat
 *
 * Architecture:
 * - Direct WebRTC P2P DataChannels via PeerJS, using the shared ICE/TURN config
 * - Room discovery via deterministic slot peer IDs: qkchat-<roomcore>-<0..7>
 *   → first free slot is claimed, all other slots are dialled → full mesh, no new server
 * - Password never leaves the device: peers exchange SHA-256(roomId + password) and compare
 * - Text-only structured frames, deduplicated by message id, 1-hop relay for mesh gaps
 * - localStorage is a local convenience cache only; cleared on explicit Leave, expires in 24h
 * - iOS-safe: bfcache-aware unload, WebKit clipboard fallback
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import Peer, { type DataConnection } from "peerjs";
import { PEER_CONFIG } from "./webrtc";
import {
  MessageSquare,
  Users,
  Plus,
  LogIn,
  LogOut,
  Copy,
  Check,
  Share2,
  Info,
  Send,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  X,
  Wifi,
  WifiOff,
  Trash2,
  ArrowLeft,
  KeyRound,
  Radio,
  UserRound,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_PARTICIPANTS = 8; // change this one value to resize rooms
const PROTOCOL_VERSION = 1;

const MAX_MESSAGE_LENGTH = 2000;
const MAX_NAME_LENGTH = 24;
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 64;

const MAX_MESSAGES = 500; // in-memory + cache ceiling
const MAX_HISTORY_SYNC = 200; // cap on what a peer may push at us

const SEND_WINDOW_MS = 10_000;
const SEND_WINDOW_MAX = 12; // our own outgoing budget
const RECV_WINDOW_MAX = 40; // per-peer inbound frame budget

const SLOT_CLAIM_TIMEOUT_MS = 9000;
const ROOM_PROBE_MS = 9000; // how long we wait for anyone to answer
const HEARTBEAT_MS = 15_000;
const PEER_STALE_MS = 45_000;

const HISTORY_PREFIX = "quickly:chat:";
const SESSION_KEY = "quickly:chat-session";
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;

const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen = "landing" | "create" | "join" | "room";
type ConnStatus = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";
type RoomMode = "create" | "join" | "rejoin";
type SendResult = "sent" | "empty" | "rate-limited";

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

interface Participant {
  peerId: string;
  name: string;
  slot: number;
  lastSeen: number;
}

interface ChatError {
  title: string;
  detail: string;
  canRetry: boolean;
}

interface SessionHint {
  roomId: string;
  name: string;
  lastUpdated: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomChars(n: number) {
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < n; i++) out += ID_ALPHABET[buf[i] % ID_ALPHABET.length];
  return out;
}

function generateRoomId() {
  return `QUICKLY-${randomChars(4)}-${randomChars(3)}`;
}

/** Accepts "QUICKLY-K7P4-XQ9", "k7p4 xq9", "K7P4XQ9" → canonical form, or null. */
function normalizeRoomId(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
  const core = cleaned.startsWith("QUICKLY") ? cleaned.slice(7) : cleaned;
  if (!/^[A-Z0-9]{7}$/.test(core)) return null;
  return `QUICKLY-${core.slice(0, 4)}-${core.slice(4)}`;
}

function roomCore(roomId: string) {
  return roomId.replace(/[^A-Z0-9]/g, "").replace(/^QUICKLY/, "");
}

function shortRoomId(roomId: string) {
  const core = roomCore(roomId);
  return `${core.slice(0, 4)}-${core.slice(4)}`;
}

/** qkchat- keeps Chat rooms in a different namespace from Clipboard's qkclip- rooms. */
function slotPeerId(core: string, slot: number) {
  return `qkchat-${core.toLowerCase()}-${slot}`;
}

function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${randomChars(10).toLowerCase()}`;
}

function hasSecureCrypto() {
  return typeof crypto !== "undefined" && !!crypto.subtle && typeof crypto.subtle.digest === "function";
}

function webrtcSupported() {
  if (typeof window === "undefined") return false;
  const PC = (window as any).RTCPeerConnection;
  if (!PC) return false;
  try {
    return typeof PC.prototype.createDataChannel === "function";
  } catch {
    return false;
  }
}

/** The room credential never leaves the device — only this digest is exchanged. */
async function deriveAuthToken(roomId: string, password: string) {
  const data = new TextEncoder().encode(`quickly-chat:v${PROTOCOL_VERSION}:${roomId}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function cleanName(value: unknown): string {
  if (typeof value !== "string") return "Guest";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH) || "Guest";
}

function formatTime(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function inviteUrl(roomId: string) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/tool/chat?room=${encodeURIComponent(roomId)}`;
}

/**
 * writeText() is called first and synchronously, which is what WebKit requires.
 * The execCommand fallback uses an explicit Range because iOS ignores select().
 */
async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }

  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.contentEditable = "true";
    el.readOnly = false;
    el.style.position = "fixed";
    el.style.top = "0";
    el.style.left = "0";
    el.style.opacity = "0";
    document.body.appendChild(el);

    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    el.setSelectionRange(0, 999999);

    const ok = document.execCommand("copy");
    selection?.removeAllRanges();
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

// ─── Local history (cache only — never the source of truth) ───────────────────

function historyKey(roomId: string) {
  return `${HISTORY_PREFIX}${roomId}`;
}

function loadHistory(roomId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(historyKey(roomId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { messages?: unknown; lastUpdated?: number } | null;
    if (!parsed || !Array.isArray(parsed.messages)) return [];
    if (typeof parsed.lastUpdated === "number" && Date.now() - parsed.lastUpdated > HISTORY_TTL_MS) {
      localStorage.removeItem(historyKey(roomId));
      return [];
    }
    return (parsed.messages as unknown[])
      .map((m) => sanitizeMessage(m, "cache"))
      .filter((m): m is ChatMessage => m !== null)
      .slice(-MAX_MESSAGES);
  } catch {
    return [];
  }
}

function saveHistory(roomId: string, messages: ChatMessage[]) {
  try {
    localStorage.setItem(
      historyKey(roomId),
      JSON.stringify({ roomId, messages: messages.slice(-MAX_MESSAGES), lastUpdated: Date.now() })
    );
  } catch {
    /* quota exceeded or storage disabled — chat keeps working from memory */
  }
}

function removeHistory(roomId: string) {
  try {
    localStorage.removeItem(historyKey(roomId));
  } catch {
    /* ignore */
  }
}

/** Only ever touches keys under the chat namespace. Other rooms and tools are untouched. */
function pruneStaleHistories() {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(HISTORY_PREFIX)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        if (!parsed || typeof parsed.lastUpdated !== "number") doomed.push(key);
        else if (Date.now() - parsed.lastUpdated > HISTORY_TTL_MS) doomed.push(key);
      } catch {
        doomed.push(key);
      }
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

function loadSession(): SessionHint | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as SessionHint | null;
    if (!parsed || typeof parsed.roomId !== "string") return null;
    if (typeof parsed.lastUpdated !== "number" || Date.now() - parsed.lastUpdated > HISTORY_TTL_MS) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    if (!normalizeRoomId(parsed.roomId)) return null;
    return { roomId: parsed.roomId, name: cleanName(parsed.name), lastUpdated: parsed.lastUpdated };
  } catch {
    return null;
  }
}

function saveSession(hint: SessionHint) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(hint));
  } catch {
    /* ignore */
  }
}

function removeSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

// ─── Payload validation (everything off the wire is untrusted) ────────────────

function sanitizeMessage(raw: any, fallbackSender: string): ChatMessage | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.text !== "string") return null;

  const text = raw.text.slice(0, MAX_MESSAGE_LENGTH);
  if (!text.trim()) return null;

  let timestamp =
    typeof raw.timestamp === "number" && Number.isFinite(raw.timestamp) ? raw.timestamp : Date.now();
  const now = Date.now();
  // Tolerate small clock skew, reject nonsense.
  if (timestamp > now + 5 * 60 * 1000 || timestamp < now - HISTORY_TTL_MS * 7) timestamp = now;

  return {
    id: raw.id.slice(0, 64),
    senderId: typeof raw.senderId === "string" && raw.senderId ? raw.senderId.slice(0, 64) : fallbackSender,
    senderName: cleanName(raw.senderName),
    text,
    timestamp,
  };
}

function sortMessages(list: ChatMessage[]) {
  return [...list].sort((a, b) => a.timestamp - b.timestamp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function safeSend(conn: DataConnection | undefined | null, payload: unknown) {
  if (!conn || !conn.open) return false;
  try {
    conn.send(payload);
    return true;
  } catch {
    return false;
  }
}

function detachListeners(target: unknown) {
  try {
    (target as { removeAllListeners?: () => void })?.removeAllListeners?.();
  } catch {
    /* peerjs versions differ — ignore */
  }
}

// ─── Slot claiming (room discovery without a new signaling server) ────────────

type ClaimResult =
  | { peer: Peer; taken?: never; fatal?: never }
  | { peer?: never; taken: true; fatal?: never }
  | { peer?: never; taken?: never; fatal: string };

function claimSlot(id: string): Promise<ClaimResult> {
  return new Promise((resolve) => {
    let settled = false;
    let peer: Peer;

    try {
      peer = new Peer(id, PEER_CONFIG);
    } catch {
      resolve({ fatal: "We couldn't start a secure connection in this browser." });
      return;
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        peer.destroy();
      } catch {
        /* ignore */
      }
      resolve({ fatal: "The connection service didn't respond. Check your network and try again." });
    }, SLOT_CLAIM_TIMEOUT_MS);

    peer.on("open", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ peer });
    });

    peer.on("error", (err: any) => {
      if (settled) return; // long-lived errors belong to the caller's own listener
      settled = true;
      clearTimeout(timer);
      const type = err?.type;
      try {
        peer.destroy();
      } catch {
        /* ignore */
      }
      if (type === "unavailable-id") resolve({ taken: true });
      else if (type === "browser-incompatible")
        resolve({ fatal: "This browser doesn't support the connection Chat needs." });
      else resolve({ fatal: "We couldn't reach the connection service. Check your network and try again." });
    });
  });
}

// ─── Room hook (all networking lives here; UI below stays presentational) ─────

function useChatRoom() {
  const [status, setStatus] = useState<ConnStatus>("idle");
  const [inRoom, setInRoom] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [myName, setMyName] = useState("");
  const [myPeerId, setMyPeerId] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [joinError, setJoinError] = useState<ChatError | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const connsRef = useRef<Map<string, DataConnection>>(new Map());
  const authedRef = useRef<Set<string>>(new Set());
  const historyServedRef = useRef<Set<string>>(new Set());
  const historyAskedRef = useRef(false);
  const participantMapRef = useRef<Map<string, Participant>>(new Map());

  const authTokenRef = useRef("");
  const passwordRef = useRef("");
  const nameRef = useRef("");
  const roomIdRef = useRef("");
  const myIdRef = useRef("");
  const mySlotRef = useRef(-1);

  const messagesRef = useRef<ChatMessage[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const outWindowRef = useRef<number[]>([]);
  const inWindowRef = useRef<Map<string, number[]>>(new Map());

  const leavingRef = useRef(false);
  const inRoomRef = useRef(false);
  const pendingEntryRef = useRef(false);
  const probeTimerRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const persistTimerRef = useRef<number | null>(null);

  // ── persistence ────────────────────────────────────────────────────────────

  const flushPersist = useCallback(() => {
    if (persistTimerRef.current !== null) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (roomIdRef.current) saveHistory(roomIdRef.current, messagesRef.current);
  }, []);

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current !== null) return;
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      if (roomIdRef.current) saveHistory(roomIdRef.current, messagesRef.current);
    }, 600);
  }, []);

  // ── message store ──────────────────────────────────────────────────────────

  const addMessages = useCallback(
    (incoming: ChatMessage[]) => {
      const fresh = incoming.filter((m) => !seenIdsRef.current.has(m.id));
      if (!fresh.length) return [];
      fresh.forEach((m) => seenIdsRef.current.add(m.id));
      const merged = sortMessages([...messagesRef.current, ...fresh]).slice(-MAX_MESSAGES);
      messagesRef.current = merged;
      setMessages(merged);
      schedulePersist();
      return fresh;
    },
    [schedulePersist]
  );

  // ── transport ──────────────────────────────────────────────────────────────

  const broadcast = useCallback((payload: unknown, exceptPeerId?: string) => {
    connsRef.current.forEach((conn, pid) => {
      if (pid === exceptPeerId) return;
      if (!authedRef.current.has(pid)) return;
      safeSend(conn, payload);
    });
  }, []);

  const syncParticipants = useCallback(() => {
    const list: Participant[] = [];
    authedRef.current.forEach((pid) => {
      const p = participantMapRef.current.get(pid);
      if (p) list.push(p);
    });
    list.sort((a, b) => a.slot - b.slot);
    setParticipants(list);
  }, []);

  const upsertParticipant = useCallback(
    (p: Participant) => {
      participantMapRef.current.set(p.peerId, p);
      syncParticipants();
    },
    [syncParticipants]
  );

  const dropPeer = useCallback(
    (peerId: string) => {
      const conn = connsRef.current.get(peerId);
      if (conn) {
        try {
          conn.close();
        } catch {
          /* ignore */
        }
      }
      connsRef.current.delete(peerId);
      authedRef.current.delete(peerId);
      historyServedRef.current.delete(peerId);
      participantMapRef.current.delete(peerId);
      inWindowRef.current.delete(peerId);
      syncParticipants();
    },
    [syncParticipants]
  );

  const teardown = useCallback(() => {
    if (probeTimerRef.current !== null) {
      clearTimeout(probeTimerRef.current);
      probeTimerRef.current = null;
    }
    if (persistTimerRef.current !== null) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (heartbeatRef.current !== null) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    connsRef.current.forEach((conn) => {
      detachListeners(conn);
      try {
        conn.close();
      } catch {
        /* ignore */
      }
    });
    connsRef.current.clear();
    authedRef.current.clear();
    historyServedRef.current.clear();
    historyAskedRef.current = false;
    participantMapRef.current.clear();
    inWindowRef.current.clear();

    const peer = peerRef.current;
    peerRef.current = null;
    if (peer) {
      detachListeners(peer);
      try {
        peer.destroy();
      } catch {
        /* ignore */
      }
    }
    setParticipants([]);
  }, []);

  /** Join attempt failed after we already had a peer — return to the form cleanly. */
  const abortJoin = useCallback(
    (err: ChatError) => {
      leavingRef.current = true;
      flushPersist();
      teardown();
      leavingRef.current = false;
      pendingEntryRef.current = false;
      inRoomRef.current = false;
      setInRoom(false);
      setConnecting(false);
      setStatus("idle");
      setJoinError(err);
    },
    [flushPersist, teardown]
  );

  const enterRoom = useCallback(() => {
    if (probeTimerRef.current !== null) {
      clearTimeout(probeTimerRef.current);
      probeTimerRef.current = null;
    }
    pendingEntryRef.current = false;
    inRoomRef.current = true;
    setInRoom(true);
    setConnecting(false);
    setStatus("connected");
  }, []);

  // ── rate limiting ──────────────────────────────────────────────────────────

  const allowOutgoing = useCallback(() => {
    const now = Date.now();
    outWindowRef.current = outWindowRef.current.filter((t) => now - t < SEND_WINDOW_MS);
    if (outWindowRef.current.length >= SEND_WINDOW_MAX) return false;
    outWindowRef.current.push(now);
    return true;
  }, []);

  const allowIncoming = useCallback((peerId: string) => {
    const now = Date.now();
    const win = (inWindowRef.current.get(peerId) || []).filter((t) => now - t < SEND_WINDOW_MS);
    if (win.length >= RECV_WINDOW_MAX) {
      inWindowRef.current.set(peerId, win);
      return false;
    }
    win.push(now);
    inWindowRef.current.set(peerId, win);
    return true;
  }, []);

  // ── frame handling ─────────────────────────────────────────────────────────

  const handleData = useCallback(
    (conn: DataConnection, raw: any) => {
      if (leavingRef.current) return;
      if (!raw || typeof raw !== "object" || typeof raw.type !== "string") return;

      const from = conn.peer;
      if (!authedRef.current.has(from) && raw.type !== "hello" && raw.type !== "auth-failed") return;
      if (!allowIncoming(from)) return;

      const touch = () => {
        const p = participantMapRef.current.get(from);
        if (p) participantMapRef.current.set(from, { ...p, lastSeen: Date.now() });
      };

      switch (raw.type) {
        case "hello": {
          if (typeof raw.auth !== "string" || raw.auth.length !== 64 || raw.auth !== authTokenRef.current) {
            safeSend(conn, { type: "auth-failed" });
            window.setTimeout(() => {
              try {
                conn.close();
              } catch {
                /* ignore */
              }
            }, 150);
            return;
          }
          authedRef.current.add(from);
          const slot =
            Number.isInteger(raw.slot) && raw.slot >= 0 && raw.slot < MAX_PARTICIPANTS ? raw.slot : 99;
          upsertParticipant({ peerId: from, name: cleanName(raw.name), slot, lastSeen: Date.now() });

          if (pendingEntryRef.current) enterRoom();
          else if (inRoomRef.current) setStatus("connected");

          // Ask the first authenticated peer for recent history.
          if (!historyAskedRef.current) {
            historyAskedRef.current = true;
            safeSend(conn, { type: "history-request" });
          }
          return;
        }

        case "auth-failed":
          abortJoin({
            title: "That password didn't match",
            detail: "Check the room password with whoever invited you, then try again.",
            canRetry: false,
          });
          return;

        case "chat-message": {
          touch();
          const msg = sanitizeMessage(raw, from);
          if (!msg) return;
          const added = addMessages([msg]);
          // One-hop relay so a missing edge in the mesh doesn't lose a message.
          if (added.length && !raw.hops) broadcast({ type: "chat-message", ...msg, hops: 1 }, from);
          return;
        }

        case "history-request": {
          touch();
          if (historyServedRef.current.has(from)) return;
          historyServedRef.current.add(from);
          safeSend(conn, {
            type: "history-response",
            messages: messagesRef.current.slice(-MAX_HISTORY_SYNC),
          });
          return;
        }

        case "history-response": {
          touch();
          if (!Array.isArray(raw.messages)) return;
          addMessages(
            raw.messages
              .slice(0, MAX_HISTORY_SYNC)
              .map((m: unknown) => sanitizeMessage(m, from))
              .filter((m: ChatMessage | null): m is ChatMessage => m !== null)
          );
          return;
        }

        case "peer-left":
          dropPeer(from);
          return;

        case "ping":
          touch();
          safeSend(conn, { type: "pong" });
          return;

        case "pong":
          touch();
          return;

        default:
          return;
      }
    },
    [abortJoin, addMessages, allowIncoming, broadcast, dropPeer, enterRoom, upsertParticipant]
  );

  const wireConn = useCallback(
    (conn: DataConnection, outgoing: boolean) => {
      conn.on("open", () => {
        if (leavingRef.current) {
          try {
            conn.close();
          } catch {
            /* ignore */
          }
          return;
        }

        // Both sides may dial each other at once. Deterministic tie-break:
        // the connection opened by the smaller peer id wins, on both ends.
        const prev = connsRef.current.get(conn.peer);
        if (prev && prev !== conn && prev.open) {
          const keepThis = outgoing ? myIdRef.current < conn.peer : conn.peer < myIdRef.current;
          if (!keepThis) {
            try {
              conn.close();
            } catch {
              /* ignore */
            }
            return;
          }
          try {
            prev.close();
          } catch {
            /* ignore */
          }
        }

        connsRef.current.set(conn.peer, conn);
        safeSend(conn, {
          type: "hello",
          v: PROTOCOL_VERSION,
          peerId: myIdRef.current,
          name: nameRef.current,
          slot: mySlotRef.current,
          auth: authTokenRef.current,
        });
      });

      conn.on("data", (raw: any) => handleData(conn, raw));
      conn.on("close", () => {
        if (connsRef.current.get(conn.peer) === conn) dropPeer(conn.peer);
      });
      conn.on("error", () => {
        if (connsRef.current.get(conn.peer) === conn) dropPeer(conn.peer);
      });
    },
    [dropPeer, handleData]
  );

  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current !== null) clearInterval(heartbeatRef.current);
    heartbeatRef.current = window.setInterval(() => {
      if (leavingRef.current) return;
      broadcast({ type: "ping" });
      const now = Date.now();
      const stale: string[] = [];
      participantMapRef.current.forEach((p, pid) => {
        if (now - p.lastSeen > PEER_STALE_MS) stale.push(pid);
      });
      stale.forEach(dropPeer);
    }, HEARTBEAT_MS);
  }, [broadcast, dropPeer]);

  // ── the main entry point ───────────────────────────────────────────────────

  const startRoom = useCallback(
    async (opts: {
      roomId: string;
      password: string;
      name: string;
      mode: RoomMode;
      keepMessages?: boolean;
    }) => {
      if (!webrtcSupported()) {
        setJoinError({
          title: "This browser can't run Chat",
          detail:
            "Chat needs a browser with WebRTC data channels. Try the latest Chrome, Edge, Safari, or Firefox.",
          canRetry: false,
        });
        return false;
      }
      if (!hasSecureCrypto()) {
        setJoinError({
          title: "Secure features unavailable",
          detail:
            "Chat needs a secure (HTTPS) connection to protect the room password. Open Quickly over HTTPS and try again.",
          canRetry: false,
        });
        return false;
      }

      leavingRef.current = true;
      teardown();
      leavingRef.current = false;

      setJoinError(null);
      setConnecting(true);
      setStatus("connecting");

      const name = cleanName(opts.name);
      nameRef.current = name;
      passwordRef.current = opts.password;
      setMyName(name);

      let rid = opts.roomId;
      let peer: Peer | null = null;
      let slot = -1;

      try {
        if (opts.mode === "create") {
          for (let attempt = 0; attempt < 5 && !peer; attempt++) {
            const res = await claimSlot(slotPeerId(roomCore(rid), 0));
            if (res.peer) {
              peer = res.peer;
              slot = 0;
              break;
            }
            if (res.fatal) throw new Error(res.fatal);
            rid = generateRoomId(); // slot 0 taken — pick another room id
          }
          if (!peer) throw new Error("We couldn't reserve a room right now. Please try again in a moment.");
        } else {
          const core = roomCore(rid);
          for (let i = 0; i < MAX_PARTICIPANTS; i++) {
            const res = await claimSlot(slotPeerId(core, i));
            if (res.peer) {
              peer = res.peer;
              slot = i;
              break;
            }
            if (res.fatal) throw new Error(res.fatal);
          }
          if (!peer) {
            setConnecting(false);
            setStatus("idle");
            setJoinError({
              title: "This room is full",
              detail: `Rooms are limited to ${MAX_PARTICIPANTS} people so the connection stays fast. Ask someone to leave, or start a new room.`,
              canRetry: false,
            });
            return false;
          }
        }
      } catch (e: any) {
        setConnecting(false);
        setStatus("idle");
        setJoinError({
          title: "We couldn't connect",
          detail:
            e?.message ||
            "Something went wrong reaching the connection service. Check your network and try again.",
          canRetry: true,
        });
        return false;
      }

      const activePeer = peer as Peer;
      peerRef.current = activePeer;
      myIdRef.current = activePeer.id;
      mySlotRef.current = slot;
      roomIdRef.current = rid;
      setRoomId(rid);
      setMyPeerId(activePeer.id);

      try {
        authTokenRef.current = await deriveAuthToken(rid, opts.password);
      } catch {
        teardown();
        setConnecting(false);
        setStatus("idle");
        setJoinError({
          title: "We couldn't secure the room",
          detail: "Your browser blocked the secure hashing Chat needs. Try again, or use a different browser.",
          canRetry: true,
        });
        return false;
      }

      // Seed from local cache (refresh continuity) unless we're keeping memory state.
      const seed = opts.keepMessages ? messagesRef.current : loadHistory(rid);
      messagesRef.current = seed;
      seenIdsRef.current = new Set(seed.map((m) => m.id));
      setMessages(seed);

      activePeer.on("connection", (conn) => wireConn(conn, false));

      activePeer.on("error", (err: any) => {
        // Empty slots always answer with peer-unavailable — that's how we probe a room.
        if (err?.type === "peer-unavailable") return;
        if (leavingRef.current) return;
        if (err?.type === "network") {
          setStatus("reconnecting");
          return;
        }
        if (inRoomRef.current) setStatus("disconnected");
      });

      activePeer.on("disconnected", () => {
        if (leavingRef.current) return;
        setStatus("reconnecting");
        try {
          activePeer.reconnect();
        } catch {
          setStatus("disconnected");
        }
      });

      activePeer.on("close", () => {
        if (!leavingRef.current) setStatus("disconnected");
      });

      // Dial every other slot. Occupied ones connect; empty ones fall through
      // to peer-unavailable and are ignored.
      const core = roomCore(rid);
      for (let i = 0; i < MAX_PARTICIPANTS; i++) {
        if (i === slot) continue;
        try {
          wireConn(activePeer.connect(slotPeerId(core, i), { reliable: true }), true);
        } catch {
          /* a single failed dial is expected for empty slots */
        }
      }

      saveSession({ roomId: rid, name, lastUpdated: Date.now() });
      startHeartbeat();

      if (opts.mode === "join") {
        // Stay on the connecting screen until someone answers, so a bad room id
        // or a dead room never dumps the user into an empty-looking chat.
        pendingEntryRef.current = true;
        setStatus("connecting");
        probeTimerRef.current = window.setTimeout(() => {
          probeTimerRef.current = null;
          if (!pendingEntryRef.current || leavingRef.current) return;
          if (authedRef.current.size > 0) {
            enterRoom();
            return;
          }
          if (slot === 0) {
            abortJoin({
              title: "Room not found",
              detail:
                "Nobody is in this room. It may have expired, or everyone has left. Check the room ID, or create a new room.",
              canRetry: false,
            });
          } else {
            abortJoin({
              title: "We couldn't establish the connection",
              detail:
                "The room exists but we couldn't reach anyone in it. Check your network connection and try again.",
              canRetry: true,
            });
          }
        }, ROOM_PROBE_MS);
      } else {
        enterRoom();
      }

      return true;
    },
    [abortJoin, enterRoom, startHeartbeat, teardown, wireConn]
  );

  // ── public actions ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    (text: string): SendResult => {
      const trimmed = text.replace(/\s+$/g, "").slice(0, MAX_MESSAGE_LENGTH);
      if (!trimmed.trim()) return "empty";
      if (!allowOutgoing()) return "rate-limited";

      const msg: ChatMessage = {
        id: randomId(),
        senderId: myIdRef.current,
        senderName: nameRef.current,
        text: trimmed,
        timestamp: Date.now(),
      };
      addMessages([msg]);
      broadcast({ type: "chat-message", ...msg });
      return "sent";
    },
    [addMessages, allowOutgoing, broadcast]
  );

  const leave = useCallback(() => {
    const rid = roomIdRef.current;
    leavingRef.current = true;
    broadcast({ type: "peer-left", peerId: myIdRef.current });
    teardown();

    if (rid) removeHistory(rid); // only this room's cache
    removeSession();

    messagesRef.current = [];
    seenIdsRef.current.clear();
    outWindowRef.current = [];
    roomIdRef.current = "";
    myIdRef.current = "";
    mySlotRef.current = -1;
    passwordRef.current = "";
    authTokenRef.current = "";

    setMessages([]);
    setRoomId(null);
    setMyPeerId("");
    setInRoom(false);
    setConnecting(false);
    setStatus("idle");
    setJoinError(null);

    inRoomRef.current = false;
    pendingEntryRef.current = false;
    leavingRef.current = false;
  }, [broadcast, teardown]);

  const reconnect = useCallback(() => {
    if (!roomIdRef.current) return;
    return startRoom({
      roomId: roomIdRef.current,
      password: passwordRef.current,
      name: nameRef.current,
      mode: "rejoin",
      keepMessages: true,
    });
  }, [startRoom]);

  const clearLocalHistory = useCallback(() => {
    if (persistTimerRef.current !== null) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    messagesRef.current = [];
    seenIdsRef.current.clear();
    setMessages([]);
    if (roomIdRef.current) removeHistory(roomIdRef.current);
  }, []);

  // ── browser lifecycle (React cleanup alone is not reliable here) ────────────

  useEffect(() => {
    const hardExit = () => {
      try {
        broadcast({ type: "peer-left", peerId: myIdRef.current });
      } catch {
        /* ignore */
      }
      connsRef.current.forEach((c) => {
        try {
          c.close();
        } catch {
          /* ignore */
        }
      });
      try {
        peerRef.current?.destroy();
      } catch {
        /* ignore */
      }
    };

    // iOS pushes the page into bfcache when you switch apps and fires pagehide
    // with persisted=true. Tearing the peer down there would kill the room on
    // an app switch, so only a real unload gets the full teardown.
    const onPageHide = (e: PageTransitionEvent) => {
      if (!inRoomRef.current) return;
      flushPersist();
      if (e.persisted) return;
      hardExit();
    };

    const onBeforeUnload = () => {
      if (!inRoomRef.current) return;
      flushPersist();
      hardExit();
    };

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [broadcast, flushPersist]);

  useEffect(() => {
    return () => {
      leavingRef.current = true;
      flushPersist();
      teardown();
    };
  }, [flushPersist, teardown]);

  return {
    status,
    inRoom,
    connecting,
    roomId,
    myName,
    myPeerId,
    participants,
    messages,
    joinError,
    setJoinError,
    startRoom,
    sendMessage,
    leave,
    reconnect,
    clearLocalHistory,
  };
}

type RoomApi = ReturnType<typeof useChatRoom>;

// ─── Toast (swap notify() for Quickly's toast system if one exists) ───────────

function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return { toast, notify };
}

function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <div className="inline-flex items-center gap-2 rounded-xl border-2 border-foreground bg-card px-3.5 py-2 shadow-[3px_3px_0_0_var(--color-foreground)]">
        <Check className="h-3.5 w-3.5 text-green-600" />
        <span className="text-xs font-bold">{message}</span>
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-xl border-2 border-foreground bg-background px-3 py-2.5 text-sm font-medium shadow-[2px_2px_0_0_var(--color-foreground)] placeholder:font-normal placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

const primaryButtonClass =
  "w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)] disabled:pointer-events-none disabled:opacity-60";

const chipButtonClass =
  "inline-flex items-center gap-1.5 rounded-lg border-2 border-foreground bg-background px-2.5 py-1.5 text-[11px] font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-colors hover:bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

// ─── Component ────────────────────────────────────────────────────────────────

export default function Chat() {
  const room = useChatRoom();
  const { toast, notify } = useToast();

  const [screen, setScreen] = useState<Screen>("landing");
  const [prefillRoomId, setPrefillRoomId] = useState("");
  const [session, setSession] = useState<SessionHint | null>(null);
  const [supported, setSupported] = useState(true);

  // Startup: prune stale caches, pick up ?room=, offer a rejoin if we have one.
  useEffect(() => {
    setSupported(webrtcSupported() && hasSecureCrypto());
    pruneStaleHistories();
    setSession(loadSession());
    try {
      const raw = new URLSearchParams(window.location.search).get("room");
      if (raw) {
        const normalized = normalizeRoomId(raw);
        if (normalized) {
          setPrefillRoomId(normalized);
          setScreen("join");
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (room.inRoom) setScreen("room");
  }, [room.inRoom]);

  const handleLeave = useCallback(() => {
    room.leave();
    setSession(null);
    setPrefillRoomId("");
    setScreen("landing");
    notify("You left the room. Local history cleared.");
  }, [notify, room]);

  if (!supported) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <ChatHero />
        <StatusCard
          icon={<AlertTriangle className="h-7 w-7" />}
          title="Chat isn't available here"
          desc={
            webrtcSupported()
              ? "Chat needs a secure (HTTPS) connection to protect your room password. Open Quickly over HTTPS and try again."
              : "This browser doesn't support the peer-to-peer data channels Chat needs. Try the latest Chrome, Edge, Safari, or Firefox."
          }
        />
      </div>
    );
  }

  if (room.inRoom && room.roomId) {
    return (
      <>
        <ChatRoom room={room} onLeave={handleLeave} notify={notify} />
        <Toast message={toast} />
      </>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-lg space-y-4">
        <ChatHero />
        {room.connecting ? (
          <ConnectingCard />
        ) : screen === "create" ? (
          <CreateRoomForm room={room} onBack={() => setScreen("landing")} />
        ) : screen === "join" ? (
          <JoinRoomForm room={room} initialRoomId={prefillRoomId} onBack={() => setScreen("landing")} />
        ) : (
          <ChatLanding
            session={session}
            onCreate={() => {
              room.setJoinError(null);
              setScreen("create");
            }}
            onJoin={() => {
              room.setJoinError(null);
              setScreen("join");
            }}
            onRejoin={(hint) => {
              room.setJoinError(null);
              setPrefillRoomId(hint.roomId);
              setScreen("join");
            }}
            onForgetSession={() => {
              if (session) removeHistory(session.roomId);
              removeSession();
              setSession(null);
              notify("Saved room cleared");
            }}
          />
        )}
        <PrivacyBadge />
      </div>
      <Toast message={toast} />
    </>
  );
}

// ─── Landing ──────────────────────────────────────────────────────────────────

function ChatHero() {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15">
          <MessageSquare className="h-5 w-5" />
        </span>
        <div className="space-y-1">
          <h1 className="text-lg font-extrabold tracking-tight">Chat</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Temporary peer-to-peer chat. No accounts, no chat history, no uploads.
          </p>
        </div>
      </div>
    </div>
  );
}

function ChatLanding({
  session,
  onCreate,
  onJoin,
  onRejoin,
  onForgetSession,
}: {
  session: SessionHint | null;
  onCreate: () => void;
  onJoin: () => void;
  onRejoin: (hint: SessionHint) => void;
  onForgetSession: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-2xl border-2 border-foreground bg-card p-6 shadow-[4px_4px_0_0_var(--color-foreground)]">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          What would you like to do?
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCreate}
            className="group flex flex-col items-center gap-3 rounded-xl border-2 border-foreground bg-background px-4 py-6 shadow-[3px_3px_0_0_var(--color-foreground)] transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 group-hover:bg-primary-foreground/20">
              <Plus className="h-6 w-6" />
            </span>
            <span className="text-sm font-bold">Create room</span>
            <span className="text-center text-[11px] font-medium text-muted-foreground group-hover:text-primary-foreground/80">
              Start a room and share the ID
            </span>
          </button>
          <button
            type="button"
            onClick={onJoin}
            className="group flex flex-col items-center gap-3 rounded-xl border-2 border-foreground bg-background px-4 py-6 shadow-[3px_3px_0_0_var(--color-foreground)] transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 group-hover:bg-primary-foreground/20">
              <LogIn className="h-6 w-6" />
            </span>
            <span className="text-sm font-bold">Join room</span>
            <span className="text-center text-[11px] font-medium text-muted-foreground group-hover:text-primary-foreground/80">
              Enter a room ID and password
            </span>
          </button>
        </div>
      </div>

      {session && (
        <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Recent room</p>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-mono text-sm font-bold">{session.roomId}</p>
              <p className="text-[11px] text-muted-foreground">Joined as {session.name}</p>
            </div>
            <button
              type="button"
              onClick={() => onRejoin(session)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-foreground bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Rejoin
            </button>
          </div>
          <button
            type="button"
            onClick={onForgetSession}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="h-3 w-3" /> Forget this room and clear its local history
          </button>
        </div>
      )}
    </div>
  );
}

function ConnectingCard() {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-6 shadow-[4px_4px_0_0_var(--color-foreground)]">
      <div className="flex flex-col items-center gap-3 py-6" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-bold">Connecting&hellip;</p>
        <p className="text-center text-xs text-muted-foreground">
          Setting up a direct connection between browsers.
        </p>
      </div>
    </div>
  );
}

// ─── Create / Join forms ──────────────────────────────────────────────────────

function FormShell({
  title,
  icon,
  onBack,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
      <div className="mb-4 flex items-center justify-between">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-foreground bg-primary/15">
            {icon}
          </span>
          {title}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      </div>
      {children}
    </div>
  );
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs font-bold text-red-600">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {message}
    </p>
  );
}

function ErrorNotice({ error }: { error: ChatError | null }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border-2 border-foreground bg-red-50 px-3 py-2.5 shadow-[2px_2px_0_0_var(--color-foreground)]"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
      <div>
        <p className="text-xs font-bold text-foreground">{error.title}</p>
        <p className="text-[11px] font-medium leading-relaxed text-muted-foreground">{error.detail}</p>
      </div>
    </div>
  );
}

function CreateRoomForm({ room, onBack }: { room: RoomApi; onBack: () => void }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!name.trim()) {
      setLocalError("Enter a display name so others know who you are.");
      return;
    }
    if (password.trim().length < MIN_PASSWORD_LENGTH) {
      setLocalError(`Room password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    await room.startRoom({
      roomId: generateRoomId(),
      password: password.trim().slice(0, MAX_PASSWORD_LENGTH),
      name: name.trim(),
      mode: "create",
    });
  };

  return (
    <FormShell title="Create room" icon={<Plus className="h-3 w-3" />} onBack={onBack}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="chat-create-name" className="block text-xs font-bold">
            Your name
          </label>
          <input
            id="chat-create-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="nickname"
            placeholder="Shown to everyone in the room"
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="chat-create-password" className="block text-xs font-bold">
            Room password
          </label>
          <input
            id="chat-create-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={MAX_PASSWORD_LENGTH}
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            className={inputClass}
          />
          <p className="text-[11px] font-medium text-muted-foreground">
            Share this separately from the room ID. It is never sent to a server or put in the invite link.
          </p>
        </div>

        <FieldError message={localError} />
        <ErrorNotice error={room.joinError} />

        <button type="submit" className={primaryButtonClass}>
          Create room
        </button>
      </form>
    </FormShell>
  );
}

function JoinRoomForm({
  room,
  initialRoomId,
  onBack,
}: {
  room: RoomApi;
  initialRoomId: string;
  onBack: () => void;
}) {
  const [roomIdInput, setRoomIdInput] = useState(initialRoomId);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRoomId) setRoomIdInput(initialRoomId);
  }, [initialRoomId]);

  useEffect(() => {
    const hint = loadSession();
    if (hint?.name) setName(hint.name);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const normalized = normalizeRoomId(roomIdInput);
    if (!normalized) {
      setLocalError("Room IDs look like QUICKLY-K7P4-XQ9. Check the ID and try again.");
      return;
    }
    if (!password.trim()) {
      setLocalError("Enter the room password.");
      return;
    }
    if (!name.trim()) {
      setLocalError("Enter a display name so others know who you are.");
      return;
    }

    await room.startRoom({
      roomId: normalized,
      password: password.trim().slice(0, MAX_PASSWORD_LENGTH),
      name: name.trim(),
      mode: "join",
    });
  };

  return (
    <FormShell title="Join room" icon={<LogIn className="h-3 w-3" />} onBack={onBack}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="chat-join-room" className="block text-xs font-bold">
            Room ID
          </label>
          <input
            id="chat-join-room"
            type="text"
            value={roomIdInput}
            onChange={(e) => setRoomIdInput(e.target.value)}
            maxLength={32}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="QUICKLY-K7P4-XQ9"
            className={`${inputClass} font-mono uppercase`}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="chat-join-password" className="block text-xs font-bold">
            Room password
          </label>
          <input
            id="chat-join-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={MAX_PASSWORD_LENGTH}
            autoComplete="current-password"
            placeholder="Ask whoever created the room"
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="chat-join-name" className="block text-xs font-bold">
            Your name
          </label>
          <input
            id="chat-join-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="nickname"
            placeholder="Shown to everyone in the room"
            className={inputClass}
          />
        </div>

        <FieldError message={localError} />
        <ErrorNotice error={room.joinError} />

        <button type="submit" className={primaryButtonClass}>
          Join room
        </button>
      </form>
    </FormShell>
  );
}

// ─── Chat room ────────────────────────────────────────────────────────────────

function ChatRoom({
  room,
  onLeave,
  notify,
}: {
  room: RoomApi;
  onLeave: () => void;
  notify: (message: string) => void;
}) {
  const [showParticipants, setShowParticipants] = useState(false);
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const roomId = room.roomId as string;
  const total = room.participants.length + 1;
  const canSend = room.status === "connected" && room.participants.length > 0;

  const handleCopyRoomId = async () =>
    notify((await copyText(roomId)) ? "Room ID copied" : "Couldn't copy — select and copy manually");

  const handleCopyInvite = async () =>
    notify((await copyText(inviteUrl(roomId))) ? "Invite link copied" : "Couldn't copy — select and copy manually");

  const handleShare = async () => {
    const url = inviteUrl(roomId);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Quickly Chat",
          text: `Join my Quickly chat room: ${roomId}`,
          url,
        });
        return;
      } catch {
        /* dismissed or unavailable — fall through to copy */
      }
    }
    await handleCopyInvite();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_15rem]">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-foreground bg-card shadow-[4px_4px_0_0_var(--color-foreground)]">
          <ChatHeader
            roomId={roomId}
            status={room.status}
            participantCount={total}
            onShowParticipants={() => setShowParticipants(true)}
            onShowInfo={() => setShowRoomInfo(true)}
            onLeave={() => setConfirmLeave(true)}
          />

          {room.status !== "connected" && (
            <ConnectionBanner status={room.status} onReconnect={room.reconnect} />
          )}

          {room.participants.length === 0 && room.status === "connected" && (
            <WaitingStrip roomId={roomId} onCopyRoomId={handleCopyRoomId} onCopyInvite={handleCopyInvite} />
          )}

          <MessageList messages={room.messages} myPeerId={room.myPeerId} />

          <MessageComposer
            disabled={!canSend}
            disabledReason={
              room.status !== "connected"
                ? "Reconnecting — messages will send once you're back."
                : "Waiting for someone else to join."
            }
            onSend={room.sendMessage}
            onRateLimited={() => notify("Slow down a moment before sending again")}
          />
        </div>

        <aside className="hidden lg:block">
          <ParticipantPanel myName={room.myName} participants={room.participants} />
        </aside>
      </div>

      {showParticipants && (
        <Modal title="Participants" onClose={() => setShowParticipants(false)}>
          <ParticipantPanel myName={room.myName} participants={room.participants} bare />
        </Modal>
      )}

      {showRoomInfo && (
        <Modal title="Room info" onClose={() => setShowRoomInfo(false)}>
          <RoomInfo
            roomId={roomId}
            status={room.status}
            participantCount={total}
            onCopyRoomId={handleCopyRoomId}
            onCopyInvite={handleCopyInvite}
            onShare={handleShare}
            onClearHistory={() => {
              room.clearLocalHistory();
              notify("Local history cleared");
            }}
          />
        </Modal>
      )}

      {confirmLeave && (
        <Modal title="Leave room" onClose={() => setConfirmLeave(false)}>
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              You'll disconnect from everyone, and this room's chat history will be removed from this device.
              This can't be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                className="inline-flex flex-1 items-center justify-center rounded-xl border-2 border-foreground bg-background px-4 py-2.5 text-sm font-bold shadow-[2px_2px_0_0_var(--color-foreground)]"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmLeave(false);
                  onLeave();
                }}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)]"
              >
                <LogOut className="h-4 w-4" /> Leave
              </button>
            </div>
          </div>
        </Modal>
      )}

      <PrivacyBadge />
    </div>
  );
}

function ChatHeader({
  roomId,
  status,
  participantCount,
  onShowParticipants,
  onShowInfo,
  onLeave,
}: {
  roomId: string;
  status: ConnStatus;
  participantCount: number;
  onShowParticipants: () => void;
  onShowInfo: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b-2 border-foreground px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 shrink-0" />
          <h2 className="text-sm font-extrabold tracking-tight">Chat</h2>
          <span className="truncate font-mono text-xs font-bold text-muted-foreground">
            {shortRoomId(roomId)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <ConnectionStatus status={status} />
          <span className="text-[11px] font-medium text-muted-foreground">
            {participantCount} {participantCount === 1 ? "participant" : "participants"}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <IconButton label="Participants" onClick={onShowParticipants} className="lg:hidden">
          <Users className="h-4 w-4" />
        </IconButton>
        <IconButton label="Room info" onClick={onShowInfo}>
          <Info className="h-4 w-4" />
        </IconButton>
        <IconButton label="Leave room" onClick={onLeave}>
          <LogOut className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 border-foreground bg-background shadow-[2px_2px_0_0_var(--color-foreground)] transition-colors hover:bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
    >
      {children}
    </button>
  );
}

function ConnectionStatus({ status }: { status: ConnStatus }) {
  const map: Record<ConnStatus, { label: string; icon: React.ReactNode; tone: string }> = {
    idle: { label: "Idle", icon: <Radio className="h-3 w-3" />, tone: "text-muted-foreground" },
    connecting: {
      label: "Connecting",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      tone: "text-muted-foreground",
    },
    connected: { label: "Connected", icon: <Wifi className="h-3 w-3" />, tone: "text-green-600" },
    reconnecting: {
      label: "Reconnecting",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      tone: "text-amber-600",
    },
    disconnected: { label: "Disconnected", icon: <WifiOff className="h-3 w-3" />, tone: "text-red-600" },
  };
  const s = map[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1 text-[11px] font-bold ${s.tone}`}
    >
      {s.icon}
      {s.label}
    </span>
  );
}

function ConnectionBanner({ status, onReconnect }: { status: ConnStatus; onReconnect: () => void }) {
  const busy = status === "reconnecting" || status === "connecting";
  return (
    <div className="flex items-center justify-between gap-3 border-b-2 border-foreground/20 bg-secondary/30 px-4 py-2.5">
      <p className="text-[11px] font-bold">
        {busy
          ? "Reconnecting to the room…"
          : "We couldn't establish the connection. Check your network connection and try again."}
      </p>
      {!busy && (
        <button type="button" onClick={onReconnect} className={`${chipButtonClass} shrink-0`}>
          <RefreshCw className="h-3 w-3" /> Reconnect
        </button>
      )}
    </div>
  );
}

function WaitingStrip({
  roomId,
  onCopyRoomId,
  onCopyInvite,
}: {
  roomId: string;
  onCopyRoomId: () => void;
  onCopyInvite: () => void;
}) {
  return (
    <div className="space-y-2.5 border-b-2 border-foreground/20 bg-secondary/30 px-4 py-3">
      <div className="flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <p className="text-xs font-bold">Waiting for participants&hellip;</p>
      </div>
      <p className="font-mono text-sm font-bold">{roomId}</p>
      <p className="text-[11px] font-medium text-muted-foreground">
        Share the room ID and password to start chatting.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onCopyRoomId} className={chipButtonClass}>
          <Copy className="h-3 w-3" /> Copy room ID
        </button>
        <button type="button" onClick={onCopyInvite} className={chipButtonClass}>
          <Share2 className="h-3 w-3" /> Copy invite
        </button>
      </div>
    </div>
  );
}

// ─── Messages ─────────────────────────────────────────────────────────────────

function MessageList({ messages, myPeerId }: { messages: ChatMessage[]; myPeerId: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      role="log"
      aria-live="polite"
      aria-label="Messages"
      className="h-[52dvh] min-h-[240px] flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:h-[420px]"
    >
      {messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-foreground bg-primary/15">
            <MessageSquare className="h-5 w-5" />
          </span>
          <p className="text-sm font-bold">No messages yet</p>
          <p className="text-xs text-muted-foreground">Start the conversation.</p>
        </div>
      ) : (
        messages.map((msg, index) => {
          const prev = messages[index - 1];
          const grouped =
            !!prev && prev.senderId === msg.senderId && msg.timestamp - prev.timestamp < 5 * 60 * 1000;
          return <Message key={msg.id} message={msg} mine={msg.senderId === myPeerId} grouped={grouped} />;
        })
      )}
    </div>
  );
}

function Message({ message, mine, grouped }: { message: ChatMessage; mine: boolean; grouped: boolean }) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} ${grouped ? "pt-0.5" : "pt-3"}`}>
      <div className={`flex min-w-0 max-w-[85%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {!grouped && !mine && (
          <p className="mb-1 px-1 text-[11px] font-bold text-muted-foreground">{message.senderName}</p>
        )}
        <div
          className={`rounded-2xl border-2 border-foreground px-3 py-2 shadow-[2px_2px_0_0_var(--color-foreground)] ${
            mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-background"
          }`}
        >
          {/* Rendered as a text node — never dangerouslySetInnerHTML. */}
          <p className="whitespace-pre-wrap break-words text-sm font-medium [overflow-wrap:anywhere]">
            {message.text}
          </p>
        </div>
        <p className="mt-0.5 px-1 text-[10px] font-medium text-muted-foreground">
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}

function MessageComposer({
  disabled,
  disabledReason,
  onSend,
  onRateLimited,
}: {
  disabled: boolean;
  disabledReason: string;
  onSend: (text: string) => SendResult;
  onRateLimited: () => void;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const remaining = MAX_MESSAGE_LENGTH - value.length;
  const showCounter = value.length > MAX_MESSAGE_LENGTH * 0.8;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  const submit = () => {
    if (disabled || sending) return; // guards against double-send
    if (!value.trim()) return;
    setSending(true);
    const result = onSend(value);
    if (result === "rate-limited") onRateLimited();
    if (result === "sent") setValue("");
    setSending(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return (
    <div
      className="border-t-2 border-foreground px-3 py-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      {disabled && <p className="mb-2 px-1 text-[11px] font-bold text-muted-foreground">{disabledReason}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2"
      >
        <label htmlFor="chat-composer" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-composer"
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey) return;
            // Leave IME composition alone — committing a candidate must not send.
            if ((e.nativeEvent as unknown as { isComposing?: boolean }).isComposing) return;
            e.preventDefault();
            submit();
          }}
          enterKeyHint="send"
          placeholder={disabled ? "Not connected" : "Write a message"}
          className="max-h-[140px] min-h-[42px] flex-1 resize-none rounded-xl border-2 border-foreground bg-background px-3 py-2.5 text-sm font-medium shadow-[2px_2px_0_0_var(--color-foreground)] placeholder:font-normal placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim() || sending}
          aria-label="Send message"
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border-2 border-foreground bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      {showCounter && (
        <p className="mt-1.5 px-1 text-right text-[10px] font-bold text-muted-foreground">
          {remaining} characters left
        </p>
      )}
    </div>
  );
}

// ─── Participants ─────────────────────────────────────────────────────────────

function ParticipantPanel({
  myName,
  participants,
  bare = false,
}: {
  myName: string;
  participants: Participant[];
  bare?: boolean;
}) {
  const rows = (
    <div className="space-y-2">
      <ParticipantRow name={myName} suffix="You" />
      {participants.map((p) => (
        <ParticipantRow key={p.peerId} name={p.name} />
      ))}
      {participants.length === 0 && (
        <p className="px-1 pt-1 text-[11px] font-medium text-muted-foreground">Nobody else has joined yet.</p>
      )}
    </div>
  );

  if (bare) return rows;

  return (
    <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
      <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> Participants ({participants.length + 1})
      </p>
      {rows}
      <p className="text-[10px] font-medium leading-relaxed text-muted-foreground">
        Up to {MAX_PARTICIPANTS} people per room.
      </p>
    </div>
  );
}

function ParticipantRow({ name, suffix }: { name: string; suffix?: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border-2 border-foreground bg-background px-2.5 py-2 shadow-[2px_2px_0_0_var(--color-foreground)]">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15 text-[10px] font-extrabold">
        {initials(name) || <UserRound className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-bold">{name}</span>
      {suffix && (
        <span className="shrink-0 rounded-md border border-foreground/20 bg-secondary/40 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
          {suffix}
        </span>
      )}
      <Wifi className="h-3 w-3 shrink-0 text-green-600" aria-label="Connected" />
    </div>
  );
}

// ─── Room info ────────────────────────────────────────────────────────────────

function RoomInfo({
  roomId,
  status,
  participantCount,
  onCopyRoomId,
  onCopyInvite,
  onShare,
  onClearHistory,
}: {
  roomId: string;
  status: ConnStatus;
  participantCount: number;
  onCopyRoomId: () => void;
  onCopyInvite: () => void;
  onShare: () => void;
  onClearHistory: () => void;
}) {
  const qrRef = useRef<HTMLCanvasElement>(null);
  const url = useMemo(() => inviteUrl(roomId), [roomId]);

  useEffect(() => {
    if (!qrRef.current || !url) return;
    QRCode.toCanvas(qrRef.current, url, {
      width: 148,
      color: { dark: "#111827", light: "#ffffff" },
      errorCorrectionLevel: "M",
      margin: 1,
    }).catch(() => {});
  }, [url]);

  return (
    <div className="space-y-4">
      <div className="space-y-1 rounded-xl border-2 border-foreground bg-background px-3 py-2.5 shadow-[2px_2px_0_0_var(--color-foreground)]">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Room ID</p>
        <p className="font-mono text-sm font-bold">{roomId}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs font-bold">
        <div className="rounded-xl border border-foreground/20 bg-secondary/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Participants</p>
          <p>
            {participantCount} of {MAX_PARTICIPANTS}
          </p>
        </div>
        <div className="rounded-xl border border-foreground/20 bg-secondary/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Connection</p>
          <ConnectionStatus status={status} />
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-foreground/30 bg-secondary/30 p-4">
        <div className="rounded-xl border-2 border-foreground bg-white p-2.5 shadow-[3px_3px_0_0_var(--color-foreground)]">
          <canvas ref={qrRef} />
        </div>
        <p className="text-center text-[11px] font-medium text-muted-foreground">
          Scan to open the join screen.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={onCopyRoomId} className={`${chipButtonClass} justify-center py-2.5`}>
          <Copy className="h-3.5 w-3.5" /> Room ID
        </button>
        <button type="button" onClick={onCopyInvite} className={`${chipButtonClass} justify-center py-2.5`}>
          <Copy className="h-3.5 w-3.5" /> Invite
        </button>
        <button type="button" onClick={onShare} className={`${chipButtonClass} justify-center py-2.5`}>
          <Share2 className="h-3.5 w-3.5" /> Share
        </button>
      </div>

      <button
        type="button"
        onClick={onClearHistory}
        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground"
      >
        <Trash2 className="h-3 w-3" /> Clear local history
      </button>

      <div className="flex items-start gap-2.5 rounded-xl border border-foreground/20 bg-secondary/30 px-3 py-2.5">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-[11px] font-medium leading-relaxed text-muted-foreground">
          Your password stays private and is never saved. Send it separately from the room link.
        </p>
      </div>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-foreground/40 p-4 sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-extrabold tracking-tight">{title}</p>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="space-y-4 rounded-2xl border-2 border-foreground bg-card p-6 shadow-[4px_4px_0_0_var(--color-foreground)]">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-foreground bg-primary/15">
          {icon}
        </span>
        <p className="text-base font-bold">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function PrivacyBadge() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-foreground/20 bg-secondary/30 px-3 py-2.5">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-xs font-bold">Temporary by design</p>
        <p className="text-[11px] font-medium leading-relaxed text-muted-foreground">
          Messages are exchanged between connected browsers. Chat history is stored temporarily on your device
          and cleared when you leave.
        </p>
      </div>
    </div>
  );
}