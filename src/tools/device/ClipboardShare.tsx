/**
 * ClipboardShare.tsx — Quickly Clipboard Share
 *
 * Architecture:
 * - Same P2P room layer as Chat: deterministic slot peer IDs, SHA-256 room credential,
 *   full mesh over WebRTC DataChannels, 1-hop relay, dedupe by item id
 * - Clipboard in:  document paste event (no permission) / readText() where supported / type-to-send
 * - Clipboard out: explicit Copy tap (browsers require a user gesture — never automatic)
 * - Smart actions: URL, phone, email and address are detected and given the right action
 * - Items auto-clear after 1 hour unless pinned; pins are local, never transmitted
 * - iOS-safe: bfcache-aware unload, touch-aware paste hint, WebKit clipboard fallback
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Peer, { type DataConnection } from "peerjs";
import { PEER_CONFIG } from "./webrtc";
import {
  ClipboardList,
  Clipboard,
  ClipboardPaste,
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
  ArrowUpRight,
  Users,
  Pin,
  PinOff,
  Phone,
  Mail,
  MapPin,
  Link2,
  ExternalLink,
  KeyRound,
  Radio,
  UserRound,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_PARTICIPANTS = 8;
const PROTOCOL_VERSION = 1;

const MAX_CLIP_LENGTH = 5000;
const MAX_NAME_LENGTH = 24;
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 64;

const MAX_ITEMS = 100;
const MAX_HISTORY_SYNC = 50;

const CLIP_TTL_MS = 60 * 60 * 1000; // pinned items ignore this
const SWEEP_INTERVAL_MS = 30_000;
const DUPLICATE_WINDOW_MS = 30_000;

const SEND_WINDOW_MS = 10_000;
const SEND_WINDOW_MAX = 12;
const RECV_WINDOW_MAX = 40;

const SLOT_CLAIM_TIMEOUT_MS = 9000;
const ROOM_PROBE_MS = 9000;
const HEARTBEAT_MS = 15_000;
const PEER_STALE_MS = 45_000;

const STORE_PREFIX = "quickly:clipboard:";
const SESSION_KEY = "quickly:clipboard-session";
const STORE_TTL_MS = 24 * 60 * 60 * 1000;

const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen = "landing" | "create" | "join" | "room";
type ConnStatus = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";
type RoomMode = "create" | "join" | "rejoin";
type ClipKind = "url" | "email" | "phone" | "address" | "text";
type ShareResult = "sent" | "empty" | "duplicate" | "rate-limited";

interface ClipItem {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  pinned?: boolean; // local only — never sent over the wire
}

interface OpenRequest {
  id: string;
  senderName: string;
  url: string;
  timestamp: number;
}

interface Participant {
  peerId: string;
  name: string;
  slot: number;
  lastSeen: number;
}

interface RoomError {
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

/** qkclip- keeps Clipboard rooms in a different namespace from Chat's qkchat- rooms. */
function slotPeerId(core: string, slot: number) {
  return `qkclip-${core.toLowerCase()}-${slot}`;
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

function isTouchDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return navigator.maxTouchPoints > 0 || "ontouchstart" in window;
}

async function deriveAuthToken(roomId: string, password: string) {
  const data = new TextEncoder().encode(`quickly-clipboard:v${PROTOCOL_VERSION}:${roomId}:${password}`);
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

function relativeTime(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)} hr ago`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function inviteUrl(roomId: string) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/tool/clipboard-share?room=${encodeURIComponent(roomId)}`;
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

function canReadClipboard() {
  return typeof navigator !== "undefined" && !!navigator.clipboard?.readText;
}

// ─── Smart actions ────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const URL_RE = /^(https?:\/\/|www\.)[^\s]+$/i;
const PHONE_CHARSET_RE = /^[+]?[\d][\d\s\-().]{5,20}$/;
const ADDRESS_HINT_RE =
  /\b(road|rd|street|st|lane|ln|marg|nagar|colony|sector|block|floor|apartment|apt|house|plot|near|opp|building|tower|avenue|ave|circle|chowk)\b/i;
const PIN_RE = /\b\d{6}\b/;

/**
 * Order matters: email and URL are checked before phone, and the phone branch
 * demands 7-15 digits so a 6-digit OTP never gets offered as a phone number.
 */
function detectKind(raw: string): ClipKind {
  const text = raw.trim();
  if (!text) return "text";

  if (text.includes("\n")) {
    return ADDRESS_HINT_RE.test(text) || PIN_RE.test(text) ? "address" : "text";
  }
  if (EMAIL_RE.test(text)) return "email";
  if (URL_RE.test(text)) return "url";

  const digits = text.replace(/[^\d]/g, "");
  if (PHONE_CHARSET_RE.test(text) && digits.length >= 7 && digits.length <= 15) return "phone";

  if (text.includes(",") && (PIN_RE.test(text) || ADDRESS_HINT_RE.test(text))) return "address";
  return "text";
}

/** Only http/https survive. javascript:, data:, file: and friends return null. */
function safeHttpUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function telHref(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

function mailHref(raw: string) {
  const email = raw.trim();
  return EMAIL_RE.test(email) ? `mailto:${encodeURIComponent(email)}` : null;
}

function mapsHref(raw: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(raw.trim().slice(0, 300))}`;
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// ─── Storage (local convenience cache only) ───────────────────────────────────

function storeKey(roomId: string) {
  return `${STORE_PREFIX}${roomId}`;
}

function loadItems(roomId: string): ClipItem[] {
  try {
    const raw = localStorage.getItem(storeKey(roomId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { items?: unknown; lastUpdated?: number } | null;
    if (!parsed || !Array.isArray(parsed.items)) return [];
    if (typeof parsed.lastUpdated === "number" && Date.now() - parsed.lastUpdated > STORE_TTL_MS) {
      localStorage.removeItem(storeKey(roomId));
      return [];
    }
    return (parsed.items as unknown[])
      .map((i) => sanitizeItem(i, "cache", true))
      .filter((i): i is ClipItem => i !== null)
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function saveItems(roomId: string, items: ClipItem[]) {
  try {
    localStorage.setItem(
      storeKey(roomId),
      JSON.stringify({ roomId, items: items.slice(0, MAX_ITEMS), lastUpdated: Date.now() })
    );
  } catch {
    /* quota exceeded or storage disabled — the tool keeps working from memory */
  }
}

function removeItems(roomId: string) {
  try {
    localStorage.removeItem(storeKey(roomId));
  } catch {
    /* ignore */
  }
}

function pruneStaleStores() {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORE_PREFIX)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        if (!parsed || typeof parsed.lastUpdated !== "number") doomed.push(key);
        else if (Date.now() - parsed.lastUpdated > STORE_TTL_MS) doomed.push(key);
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
    if (typeof parsed.lastUpdated !== "number" || Date.now() - parsed.lastUpdated > STORE_TTL_MS) {
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

// ─── Payload validation (peer data is untrusted) ──────────────────────────────

function sanitizeItem(raw: any, fallbackSender: string, allowPinned = false): ClipItem | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.text !== "string") return null;

  const text = raw.text.slice(0, MAX_CLIP_LENGTH);
  if (!text.trim()) return null;

  let timestamp =
    typeof raw.timestamp === "number" && Number.isFinite(raw.timestamp) ? raw.timestamp : Date.now();
  const now = Date.now();
  if (timestamp > now + 5 * 60 * 1000 || timestamp < now - STORE_TTL_MS * 7) timestamp = now;

  return {
    id: raw.id.slice(0, 64),
    senderId: typeof raw.senderId === "string" && raw.senderId ? raw.senderId.slice(0, 64) : fallbackSender,
    senderName: cleanName(raw.senderName),
    text,
    timestamp,
    pinned: allowPinned ? raw.pinned === true : false,
  };
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

// ─── Slot claiming ────────────────────────────────────────────────────────────

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
        resolve({ fatal: "This browser doesn't support the connection this tool needs." });
      else resolve({ fatal: "We couldn't reach the connection service. Check your network and try again." });
    });
  });
}

// ─── Room hook ────────────────────────────────────────────────────────────────

function useClipboardRoom() {
  const [status, setStatus] = useState<ConnStatus>("idle");
  const [inRoom, setInRoom] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [myName, setMyName] = useState("");
  const [myPeerId, setMyPeerId] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [items, setItems] = useState<ClipItem[]>([]);
  const [openRequest, setOpenRequest] = useState<OpenRequest | null>(null);
  const [joinError, setJoinError] = useState<RoomError | null>(null);

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

  const itemsRef = useRef<ClipItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const outWindowRef = useRef<number[]>([]);
  const inWindowRef = useRef<Map<string, number[]>>(new Map());

  const leavingRef = useRef(false);
  const inRoomRef = useRef(false);
  const pendingEntryRef = useRef(false);
  const probeTimerRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const sweepRef = useRef<number | null>(null);
  const persistTimerRef = useRef<number | null>(null);

  // ── persistence ────────────────────────────────────────────────────────────

  const flushPersist = useCallback(() => {
    if (persistTimerRef.current !== null) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (roomIdRef.current) saveItems(roomIdRef.current, itemsRef.current);
  }, []);

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current !== null) return;
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      if (roomIdRef.current) saveItems(roomIdRef.current, itemsRef.current);
    }, 600);
  }, []);

  const commitItems = useCallback(
    (next: ClipItem[]) => {
      const trimmed = [...next]
        .sort((a, b) => b.timestamp - a.timestamp || (a.id < b.id ? 1 : -1))
        .slice(0, MAX_ITEMS);
      itemsRef.current = trimmed;
      setItems(trimmed);
      schedulePersist();
    },
    [schedulePersist]
  );

  const addItems = useCallback(
    (incoming: ClipItem[]) => {
      const fresh = incoming.filter((i) => !seenIdsRef.current.has(i.id));
      if (!fresh.length) return [];
      fresh.forEach((i) => seenIdsRef.current.add(i.id));
      commitItems([...itemsRef.current, ...fresh]);
      return fresh;
    },
    [commitItems]
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
    if (sweepRef.current !== null) {
      clearInterval(sweepRef.current);
      sweepRef.current = null;
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

  const abortJoin = useCallback(
    (err: RoomError) => {
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

          if (!historyAskedRef.current) {
            historyAskedRef.current = true;
            safeSend(conn, { type: "history-request" });
          }
          return;
        }

        case "auth-failed":
          abortJoin({
            title: "That password didn't match",
            detail: "Check the room password on your other device, then try again.",
            canRetry: false,
          });
          return;

        case "clip-item": {
          touch();
          const item = sanitizeItem(raw, from);
          if (!item) return;
          const added = addItems([item]);
          if (added.length && !raw.hops) broadcast({ type: "clip-item", ...item, hops: 1 }, from);
          return;
        }

        case "clip-open": {
          touch();
          const url = typeof raw.url === "string" ? safeHttpUrl(raw.url) : null;
          if (!url) return; // non-http schemes are dropped before the banner exists
          setOpenRequest({
            id: typeof raw.id === "string" ? raw.id.slice(0, 64) : randomId(),
            senderName: cleanName(raw.senderName),
            url,
            timestamp: Date.now(),
          });
          return;
        }

        case "history-request": {
          touch();
          if (historyServedRef.current.has(from)) return;
          historyServedRef.current.add(from);
          safeSend(conn, {
            type: "history-response",
            // pinned is a local preference — build the payload field by field
            items: itemsRef.current.slice(0, MAX_HISTORY_SYNC).map((i) => ({
              id: i.id,
              senderId: i.senderId,
              senderName: i.senderName,
              text: i.text,
              timestamp: i.timestamp,
            })),
          });
          return;
        }

        case "history-response": {
          touch();
          if (!Array.isArray(raw.items)) return;
          addItems(
            raw.items
              .slice(0, MAX_HISTORY_SYNC)
              .map((i: unknown) => sanitizeItem(i, from))
              .filter((i: ClipItem | null): i is ClipItem => i !== null)
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
    [abortJoin, addItems, allowIncoming, broadcast, dropPeer, enterRoom, upsertParticipant]
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

        // Both sides dial each other; the link opened by the smaller peer id wins.
        // Both ends compute the same answer, so exactly one survives.
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

  const startTimers = useCallback(() => {
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

    // Auto-clear: unpinned items expire, pinned ones survive.
    if (sweepRef.current !== null) clearInterval(sweepRef.current);
    sweepRef.current = window.setInterval(() => {
      const now = Date.now();
      const kept = itemsRef.current.filter((i) => i.pinned || now - i.timestamp < CLIP_TTL_MS);
      if (kept.length !== itemsRef.current.length) commitItems(kept);
    }, SWEEP_INTERVAL_MS);
  }, [broadcast, commitItems, dropPeer]);

  // ── entry point ────────────────────────────────────────────────────────────

  const startRoom = useCallback(
    async (opts: {
      roomId: string;
      password: string;
      name: string;
      mode: RoomMode;
      keepItems?: boolean;
    }) => {
      if (!webrtcSupported()) {
        setJoinError({
          title: "This browser can't run Clipboard Share",
          detail:
            "It needs a browser with WebRTC data channels. Try the latest Chrome, Edge, Safari, or Firefox.",
          canRetry: false,
        });
        return false;
      }
      if (!hasSecureCrypto()) {
        setJoinError({
          title: "Secure features unavailable",
          detail:
            "A secure (HTTPS) connection is required to protect the room password. Open Quickly over HTTPS.",
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
      setOpenRequest(null);

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
            rid = generateRoomId(); // slot 0 taken — pick a different room id
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
              detail: `Rooms are limited to ${MAX_PARTICIPANTS} devices. Ask someone to leave, or start a new room.`,
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
          detail: "Your browser blocked the secure hashing this tool needs. Try again, or use another browser.",
          canRetry: true,
        });
        return false;
      }

      const seed = opts.keepItems ? itemsRef.current : loadItems(rid);
      itemsRef.current = seed;
      seenIdsRef.current = new Set(seed.map((i) => i.id));
      setItems(seed);

      activePeer.on("connection", (conn) => wireConn(conn, false));

      activePeer.on("error", (err: any) => {
        if (err?.type === "peer-unavailable") return; // empty slot — this is how we probe a room
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
      startTimers();

      if (opts.mode === "join") {
        // Hold on the connecting screen until someone answers, so a wrong room id
        // never drops the user into an empty-looking room.
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
                "No device is in this room. It may have expired, or your other device left. Check the room ID.",
              canRetry: false,
            });
          } else {
            abortJoin({
              title: "We couldn't establish the connection",
              detail:
                "The room exists but we couldn't reach your other device. Check your network connection and try again.",
              canRetry: true,
            });
          }
        }, ROOM_PROBE_MS);
      } else {
        enterRoom();
      }

      return true;
    },
    [abortJoin, enterRoom, startTimers, teardown, wireConn]
  );

  // ── actions ────────────────────────────────────────────────────────────────

  const shareText = useCallback(
    (raw: string): ShareResult => {
      const text = raw.replace(/\s+$/g, "").slice(0, MAX_CLIP_LENGTH);
      if (!text.trim()) return "empty";

      // Identical text shared moments ago is almost always an accidental second paste.
      const now = Date.now();
      const dupe = itemsRef.current.find((i) => i.text === text && now - i.timestamp < DUPLICATE_WINDOW_MS);
      if (dupe) return "duplicate";

      if (!allowOutgoing()) return "rate-limited";

      const item: ClipItem = {
        id: randomId(),
        senderId: myIdRef.current,
        senderName: nameRef.current,
        text,
        timestamp: now,
      };
      addItems([item]);
      broadcast({ type: "clip-item", ...item });
      return "sent";
    },
    [addItems, allowOutgoing, broadcast]
  );

  const pushOpen = useCallback(
    (rawUrl: string) => {
      const url = safeHttpUrl(rawUrl);
      if (!url) return false;
      if (!allowOutgoing()) return false;
      broadcast({
        type: "clip-open",
        id: randomId(),
        senderId: myIdRef.current,
        senderName: nameRef.current,
        url,
        timestamp: Date.now(),
      });
      return true;
    },
    [allowOutgoing, broadcast]
  );

  const togglePin = useCallback(
    (id: string) => {
      commitItems(itemsRef.current.map((i) => (i.id === id ? { ...i, pinned: !i.pinned } : i)));
    },
    [commitItems]
  );

  const removeItem = useCallback(
    (id: string) => {
      commitItems(itemsRef.current.filter((i) => i.id !== id));
    },
    [commitItems]
  );

  const clearLocal = useCallback(() => {
    commitItems(itemsRef.current.filter((i) => i.pinned));
  }, [commitItems]);

  const dismissOpenRequest = useCallback(() => setOpenRequest(null), []);

  const leave = useCallback(() => {
    const rid = roomIdRef.current;
    leavingRef.current = true;
    broadcast({ type: "peer-left", peerId: myIdRef.current });
    teardown();

    if (rid) removeItems(rid); // only this room's cache
    removeSession();

    itemsRef.current = [];
    seenIdsRef.current.clear();
    outWindowRef.current = [];
    roomIdRef.current = "";
    myIdRef.current = "";
    mySlotRef.current = -1;
    passwordRef.current = "";
    authTokenRef.current = "";

    setItems([]);
    setOpenRequest(null);
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
      keepItems: true,
    });
  }, [startRoom]);

  // ── browser lifecycle ──────────────────────────────────────────────────────

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

    // iOS pushes the page into bfcache when you switch apps and fires pagehide with
    // persisted=true. Tearing the peer down there would kill the room on app switch.
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
    items,
    openRequest,
    dismissOpenRequest,
    joinError,
    setJoinError,
    startRoom,
    shareText,
    pushOpen,
    togglePin,
    removeItem,
    clearLocal,
    leave,
    reconnect,
  };
}

type RoomApi = ReturnType<typeof useClipboardRoom>;

// ─── Toast ────────────────────────────────────────────────────────────────────

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

export default function ClipboardShare() {
  const room = useClipboardRoom();
  const { toast, notify } = useToast();

  const [screen, setScreen] = useState<Screen>("landing");
  const [prefillRoomId, setPrefillRoomId] = useState("");
  const [session, setSession] = useState<SessionHint | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(webrtcSupported() && hasSecureCrypto());
    pruneStaleStores();
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
    notify("You left. Local items cleared.");
  }, [notify, room]);

  if (!supported) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Hero />
        <StatusCard
          icon={<AlertTriangle className="h-7 w-7" />}
          title="Clipboard Share isn't available here"
          desc={
            webrtcSupported()
              ? "A secure (HTTPS) connection is required to protect your room password. Open Quickly over HTTPS and try again."
              : "This browser doesn't support the peer-to-peer data channels this tool needs. Try the latest Chrome, Edge, Safari, or Firefox."
          }
        />
      </div>
    );
  }

  if (room.inRoom && room.roomId) {
    return (
      <>
        <ClipboardRoom room={room} onLeave={handleLeave} notify={notify} />
        <Toast message={toast} />
      </>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-lg space-y-4">
        <Hero />
        {room.connecting ? (
          <ConnectingCard />
        ) : screen === "create" ? (
          <CreateRoomForm room={room} onBack={() => setScreen("landing")} />
        ) : screen === "join" ? (
          <JoinRoomForm room={room} initialRoomId={prefillRoomId} onBack={() => setScreen("landing")} />
        ) : (
          <Landing
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
            onForget={() => {
              if (session) removeItems(session.roomId);
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

// ─── Landing / forms ──────────────────────────────────────────────────────────

function Hero() {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)]">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary/15">
          <ClipboardList className="h-5 w-5" />
        </span>
        <div className="space-y-1">
          <h1 className="text-lg font-extrabold tracking-tight">Clipboard Share</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Send text &amp; links between your devices. No accounts, no uploads, nothing stored on a server.
          </p>
        </div>
      </div>
    </div>
  );
}

function Landing({
  session,
  onCreate,
  onJoin,
  onRejoin,
  onForget,
}: {
  session: SessionHint | null;
  onCreate: () => void;
  onJoin: () => void;
  onRejoin: (hint: SessionHint) => void;
  onForget: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-2xl border-2 border-foreground bg-card p-6 shadow-[4px_4px_0_0_var(--color-foreground)]">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Link your devices</p>
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
              Start here on your first device
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
              Enter the ID on your other device
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
            onClick={onForget}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="h-3 w-3" /> Forget this room and clear its local items
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
        <p className="text-center text-xs text-muted-foreground">Setting up a direct link between your devices.</p>
      </div>
    </div>
  );
}

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

function ErrorNotice({ error }: { error: RoomError | null }) {
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
      setLocalError("Give this device a name so you can tell them apart.");
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
          <label htmlFor="clip-create-name" className="block text-xs font-bold">
            Device name
          </label>
          <input
            id="clip-create-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Laptop, Phone, Work PC…"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="clip-create-password" className="block text-xs font-bold">
            Room password
          </label>
          <input
            id="clip-create-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={MAX_PASSWORD_LENGTH}
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            className={inputClass}
          />
          <p className="text-[11px] font-medium text-muted-foreground">
            Never sent to a server, and never included in the invite link.
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
      setLocalError("Give this device a name.");
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
          <label htmlFor="clip-join-room" className="block text-xs font-bold">
            Room ID
          </label>
          <input
            id="clip-join-room"
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
          <label htmlFor="clip-join-password" className="block text-xs font-bold">
            Room password
          </label>
          <input
            id="clip-join-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={MAX_PASSWORD_LENGTH}
            autoComplete="current-password"
            placeholder="Set on your other device"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="clip-join-name" className="block text-xs font-bold">
            Device name
          </label>
          <input
            id="clip-join-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Laptop, Phone, Work PC…"
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

// ─── Room ─────────────────────────────────────────────────────────────────────

function ClipboardRoom({
  room,
  onLeave,
  notify,
}: {
  room: RoomApi;
  onLeave: () => void;
  notify: (m: string) => void;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const roomId = room.roomId as string;
  const total = room.participants.length + 1;
  const connected = room.status === "connected" && room.participants.length > 0;

  const { shareText, pushOpen } = room;

  const report = useCallback(
    (result: ShareResult) => {
      if (result === "sent") notify("Shared to your other devices");
      else if (result === "duplicate") notify("Already shared just now");
      else if (result === "rate-limited") notify("Slow down a moment before sharing again");
    },
    [notify]
  );

  const handlePushOpen = useCallback(
    (url: string) => {
      notify(pushOpen(url) ? "Asked your other device to open it" : "Couldn't send that link");
    },
    [notify, pushOpen]
  );

  // Ctrl+V / ⌘+V anywhere on the page shares — no clipboard permission needed.
  // On iOS this only fires inside an editable element, which the composer handles.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      const text = e.clipboardData?.getData("text/plain");
      if (!text || !text.trim()) return;
      e.preventDefault();
      if (!connected) {
        notify("Not connected yet — waiting for your other device");
        return;
      }
      report(shareText(text));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [connected, notify, report, shareText]);

  const handleCopyRoomId = async () =>
    notify((await copyText(roomId)) ? "Room ID copied" : "Couldn't copy — copy it manually");

  const handleCopyInvite = async () =>
    notify((await copyText(inviteUrl(roomId))) ? "Invite link copied" : "Couldn't copy — copy it manually");

  const handleShare = async () => {
    const url = inviteUrl(roomId);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Quickly Clipboard Share", text: `Room: ${roomId}`, url });
        return;
      } catch {
        /* dismissed — fall through to copy */
      }
    }
    await handleCopyInvite();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_15rem]">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-foreground bg-card shadow-[4px_4px_0_0_var(--color-foreground)]">
          <RoomHeader
            roomId={roomId}
            status={room.status}
            participantCount={total}
            onShowParticipants={() => setShowParticipants(true)}
            onShowInfo={() => setShowInfo(true)}
            onLeave={() => setConfirmLeave(true)}
          />

          {room.status !== "connected" && (
            <ConnectionBanner status={room.status} onReconnect={room.reconnect} />
          )}

          {room.participants.length === 0 && room.status === "connected" && (
            <WaitingStrip roomId={roomId} onCopyRoomId={handleCopyRoomId} onCopyInvite={handleCopyInvite} />
          )}

          {room.openRequest && (
            <OpenRequestBanner request={room.openRequest} onDismiss={room.dismissOpenRequest} />
          )}

          <Composer
            disabled={!connected}
            disabledReason={
              room.status !== "connected"
                ? "Reconnecting — items will send once you're back."
                : "Waiting for your other device to join."
            }
            onShare={(text) => report(shareText(text))}
            onPushOpen={handlePushOpen}
            onReadFail={() => notify("Your browser blocked clipboard access — paste instead")}
          />

          <ItemList
            items={room.items}
            myPeerId={room.myPeerId}
            onCopy={async (text) =>
              notify((await copyText(text)) ? "Copied to clipboard" : "Couldn't copy — select the text manually")
            }
            onTogglePin={room.togglePin}
            onRemove={room.removeItem}
            onPushOpen={handlePushOpen}
          />
        </div>

        <aside className="hidden lg:block">
          <ParticipantPanel myName={room.myName} participants={room.participants} />
        </aside>
      </div>

      {showParticipants && (
        <Modal title="Devices" onClose={() => setShowParticipants(false)}>
          <ParticipantPanel myName={room.myName} participants={room.participants} bare />
        </Modal>
      )}

      {showInfo && (
        <Modal title="Room info" onClose={() => setShowInfo(false)}>
          <RoomInfo
            roomId={roomId}
            status={room.status}
            participantCount={total}
            pinnedCount={room.items.filter((i) => i.pinned).length}
            onCopyRoomId={handleCopyRoomId}
            onCopyInvite={handleCopyInvite}
            onShare={handleShare}
            onClearLocal={() => {
              room.clearLocal();
              notify("Cleared. Pinned items kept.");
            }}
          />
        </Modal>
      )}

      {confirmLeave && (
        <Modal title="Leave room" onClose={() => setConfirmLeave(false)}>
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              You'll disconnect from your other devices, and every item in this room - pinned included will be
              removed from this device. This can't be undone.
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

function RoomHeader({
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
          <ClipboardList className="h-4 w-4 shrink-0" />
          <h2 className="text-sm font-extrabold tracking-tight">Clipboard</h2>
          <span className="truncate font-mono text-xs font-bold text-muted-foreground">
            {shortRoomId(roomId)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <ConnectionStatus status={status} />
          <span className="text-[11px] font-medium text-muted-foreground">
            {participantCount} {participantCount === 1 ? "device" : "devices"}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <IconButton label="Devices" onClick={onShowParticipants} className="lg:hidden">
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
        {busy ? "Reconnecting…" : "We couldn't establish the connection. Check your network and try again."}
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
        <p className="text-xs font-bold">Waiting for your other device&hellip;</p>
      </div>
      <p className="font-mono text-sm font-bold">{roomId}</p>
      <p className="text-[11px] font-medium text-muted-foreground">
        Open this tool on your other device and join with the room ID and password.
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

/** Push & Open never navigates by itself — the receiver's tap is also the gesture browsers require. */
function OpenRequestBanner({ request, onDismiss }: { request: OpenRequest; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 border-b-2 border-foreground/20 bg-primary/10 px-4 py-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-background">
        <ExternalLink className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold">{request.senderName} wants to open a link</p>
        <p className="truncate text-[11px] font-medium text-muted-foreground">{hostOf(request.url)}</p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground [overflow-wrap:anywhere]">
          {request.url}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a
            href={request.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onDismiss}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-foreground bg-primary px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--color-foreground)]"
          >
            <ArrowUpRight className="h-3 w-3" /> Open link
          </a>
          <button type="button" onClick={onDismiss} className={chipButtonClass}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

function Composer({
  disabled,
  disabledReason,
  onShare,
  onPushOpen,
  onReadFail,
}: {
  disabled: boolean;
  disabledReason: string;
  onShare: (text: string) => void;
  onPushOpen: (url: string) => void;
  onReadFail: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [touch, setTouch] = useState(false);
  const [canRead, setCanRead] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTouch(isTouchDevice());
    setCanRead(canReadClipboard());
  }, []);

  const trimmed = value.trim();
  const detectedUrl = useMemo(() => (detectKind(trimmed) === "url" ? safeHttpUrl(trimmed) : null), [trimmed]);
  const remaining = MAX_CLIP_LENGTH - value.length;
  const showCounter = value.length > MAX_CLIP_LENGTH * 0.8;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const submit = () => {
    if (disabled || busy || !trimmed) return;
    setBusy(true);
    onShare(value);
    setValue("");
    setBusy(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const submitAndOpen = () => {
    if (disabled || busy || !detectedUrl) return;
    setBusy(true);
    onShare(value);
    onPushOpen(detectedUrl);
    setValue("");
    setBusy(false);
  };

  const readClipboard = async () => {
    if (!navigator.clipboard?.readText) {
      onReadFail();
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) return;
      setValue(text.slice(0, MAX_CLIP_LENGTH));
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch {
      onReadFail();
    }
  };

  return (
    <div className="space-y-2.5 border-b-2 border-foreground px-4 py-3">
      {disabled && <p className="text-[11px] font-bold text-muted-foreground">{disabledReason}</p>}

      <label htmlFor="clip-composer" className="sr-only">
        Text to share
      </label>
      <textarea
        id="clip-composer"
        ref={textareaRef}
        rows={2}
        value={value}
        disabled={disabled}
        maxLength={MAX_CLIP_LENGTH}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.shiftKey) return;
          if ((e.nativeEvent as unknown as { isComposing?: boolean }).isComposing) return;
          e.preventDefault();
          submit();
        }}
        enterKeyHint="send"
        placeholder={disabled ? "Not connected" : "Paste or type anything to send to your other devices"}
        className="max-h-[160px] min-h-[64px] w-full resize-none rounded-xl border-2 border-foreground bg-background px-3 py-2.5 text-sm font-medium shadow-[2px_2px_0_0_var(--color-foreground)] placeholder:font-normal placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !trimmed || busy}
          className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> Share
        </button>

        {detectedUrl && (
          <button type="button" onClick={submitAndOpen} disabled={disabled || busy} className={chipButtonClass}>
            <ArrowUpRight className="h-3 w-3" /> Share &amp; open there
          </button>
        )}

        {canRead && (
          <button type="button" onClick={readClipboard} disabled={disabled} className={chipButtonClass}>
            <ClipboardPaste className="h-3 w-3" /> Read clipboard
          </button>
        )}

        <span className="ml-auto text-[10px] font-bold text-muted-foreground">
          {showCounter
            ? `${remaining} left`
            : touch
              ? "Long-press the box to paste"
              : "Ctrl+V anywhere to share"}
        </span>
      </div>
    </div>
  );
}

// ─── Items ────────────────────────────────────────────────────────────────────

function ItemList({
  items,
  myPeerId,
  onCopy,
  onTogglePin,
  onRemove,
  onPushOpen,
}: {
  items: ClipItem[];
  myPeerId: string;
  onCopy: (text: string) => void;
  onTogglePin: (id: string) => void;
  onRemove: (id: string) => void;
  onPushOpen: (url: string) => void;
}) {
  const ordered = useMemo(() => {
    const pinned = items.filter((i) => i.pinned);
    const rest = items.filter((i) => !i.pinned);
    return [...pinned, ...rest];
  }, [items]);

  return (
    <div className="h-[46dvh] min-h-[240px] flex-1 space-y-2.5 overflow-y-auto overflow-x-hidden px-4 py-4 sm:h-[380px]">
      {ordered.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-foreground bg-primary/15">
            <Clipboard className="h-5 w-5" />
          </span>
          <p className="text-sm font-bold">Nothing shared yet</p>
          <p className="text-xs text-muted-foreground">Paste something to send it across.</p>
        </div>
      ) : (
        ordered.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            mine={item.senderId === myPeerId}
            onCopy={onCopy}
            onTogglePin={onTogglePin}
            onRemove={onRemove}
            onPushOpen={onPushOpen}
          />
        ))
      )}
    </div>
  );
}

function ItemCard({
  item,
  mine,
  onCopy,
  onTogglePin,
  onRemove,
  onPushOpen,
}: {
  item: ClipItem;
  mine: boolean;
  onCopy: (text: string) => void;
  onTogglePin: (id: string) => void;
  onRemove: (id: string) => void;
  onPushOpen: (url: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const kind = useMemo(() => detectKind(item.text), [item.text]);
  const url = kind === "url" ? safeHttpUrl(item.text) : null;
  const long = item.text.length > 220 || item.text.split("\n").length > 5;

  return (
    <div
      className={`space-y-2 rounded-xl border-2 border-foreground p-3 shadow-[2px_2px_0_0_var(--color-foreground)] ${
        item.pinned ? "bg-primary/10" : "bg-background"
      }`}
    >
      <div className="flex items-center gap-2">
        <KindBadge kind={kind} />
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-muted-foreground">
          {mine ? "You" : item.senderName} · {relativeTime(item.timestamp)}
        </span>
        {item.pinned && <Pin className="h-3 w-3 shrink-0" aria-label="Pinned" />}
        <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
          {formatTime(item.timestamp)}
        </span>
      </div>

      {/* Text node only — no dangerouslySetInnerHTML anywhere in this tool. */}
      <p
        className="whitespace-pre-wrap break-words text-sm font-medium [overflow-wrap:anywhere]"
        style={!expanded && long ? { maxHeight: "7.5rem", overflow: "hidden" } : undefined}
      >
        {item.text}
      </p>

      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] font-bold text-muted-foreground hover:text-foreground"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onCopy(item.text)} className={chipButtonClass}>
          <Copy className="h-3 w-3" /> Copy
        </button>

        <SmartAction kind={kind} text={item.text} url={url} />

        {url && (
          <button type="button" onClick={() => onPushOpen(url)} className={chipButtonClass}>
            <ArrowUpRight className="h-3 w-3" /> Open there
          </button>
        )}

        <button
          type="button"
          onClick={() => onTogglePin(item.id)}
          aria-pressed={!!item.pinned}
          className={chipButtonClass}
        >
          {item.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          {item.pinned ? "Unpin" : "Pin"}
        </button>

        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label="Remove from this device"
          className={`${chipButtonClass} ml-auto`}
        >
          <X className="h-3 w-3" /> Remove
        </button>
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: ClipKind }) {
  const map: Record<ClipKind, { label: string; icon: React.ReactNode }> = {
    url: { label: "Link", icon: <Link2 className="h-3 w-3" /> },
    email: { label: "Email", icon: <Mail className="h-3 w-3" /> },
    phone: { label: "Phone", icon: <Phone className="h-3 w-3" /> },
    address: { label: "Address", icon: <MapPin className="h-3 w-3" /> },
    text: { label: "Text", icon: <Clipboard className="h-3 w-3" /> },
  };
  const k = map[kind];
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-foreground/20 bg-secondary/40 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
      {k.icon}
      {k.label}
    </span>
  );
}

function SmartAction({ kind, text, url }: { kind: ClipKind; text: string; url: string | null }) {
  if (kind === "url" && url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={chipButtonClass}>
        <ExternalLink className="h-3 w-3" /> Open
      </a>
    );
  }

  if (kind === "phone") {
    const href = telHref(text);
    if (!href) return null;
    return (
      <a href={href} className={chipButtonClass}>
        <Phone className="h-3 w-3" /> Call
      </a>
    );
  }

  if (kind === "email") {
    const href = mailHref(text);
    if (!href) return null;
    return (
      <a href={href} className={chipButtonClass}>
        <Mail className="h-3 w-3" /> Mail
      </a>
    );
  }

  if (kind === "address") {
    return (
      <a href={mapsHref(text)} target="_blank" rel="noopener noreferrer" className={chipButtonClass}>
        <MapPin className="h-3 w-3" /> Maps
      </a>
    );
  }

  return null;
}

// ─── Devices / info / shared ──────────────────────────────────────────────────

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
      <ParticipantRow name={myName} suffix="This device" />
      {participants.map((p) => (
        <ParticipantRow key={p.peerId} name={p.name} />
      ))}
      {participants.length === 0 && (
        <p className="px-1 pt-1 text-[11px] font-medium text-muted-foreground">
          No other device connected yet.
        </p>
      )}
    </div>
  );

  if (bare) return rows;

  return (
    <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--color-foreground)]">
      <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> Devices ({participants.length + 1})
      </p>
      {rows}
      <p className="text-[10px] font-medium leading-relaxed text-muted-foreground">
        Up to {MAX_PARTICIPANTS} devices per room.
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

function RoomInfo({
  roomId,
  status,
  participantCount,
  pinnedCount,
  onCopyRoomId,
  onCopyInvite,
  onShare,
  onClearLocal,
}: {
  roomId: string;
  status: ConnStatus;
  participantCount: number;
  pinnedCount: number;
  onCopyRoomId: () => void;
  onCopyInvite: () => void;
  onShare: () => void;
  onClearLocal: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1 rounded-xl border-2 border-foreground bg-background px-3 py-2.5 shadow-[2px_2px_0_0_var(--color-foreground)]">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Room ID</p>
        <p className="font-mono text-sm font-bold">{roomId}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs font-bold">
        <div className="rounded-xl border border-foreground/20 bg-secondary/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Devices</p>
          <p>
            {participantCount} of {MAX_PARTICIPANTS}
          </p>
        </div>
        <div className="rounded-xl border border-foreground/20 bg-secondary/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Connection</p>
          <ConnectionStatus status={status} />
        </div>
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

      <div className="rounded-xl border border-foreground/20 bg-secondary/30 px-3 py-2.5">
        <p className="text-[11px] font-medium leading-relaxed text-muted-foreground">
          Items clear themselves after 1 hour. Pinned items stay until you unpin or leave.
          {pinnedCount > 0 && ` ${pinnedCount} pinned right now.`}
        </p>
      </div>

      <button
        type="button"
        onClick={onClearLocal}
        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground"
      >
        <Trash2 className="h-3 w-3" /> Clear unpinned items on this device
      </button>

      <div className="flex items-start gap-2.5 rounded-xl border border-foreground/20 bg-secondary/30 px-3 py-2.5">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-[11px] font-medium leading-relaxed text-muted-foreground">
          The room password is checked between devices and never stored. Share it separately from the room ID.
        </p>
      </div>
    </div>
  );
}

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
          Items are exchanged directly between your connected browsers, stored temporarily on your device, and
          cleared when you leave.
        </p>
      </div>
    </div>
  );
}
