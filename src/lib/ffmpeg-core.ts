import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

const CORE_VERSION = "0.12.6";
const BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function getMaxFileSizeBytes(): number {
  return isMobileDevice() ? 150 * 1024 * 1024 : 300 * 1024 * 1024;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    if (onLog) {
      ffmpeg.on("log", ({ message }) => onLog(message));
    }

    const coreURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, "text/javascript");
    const wasmURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, "application/wasm");

    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}

export { fetchFile };

// Extracts a clean extension from a filename, defaulting sensibly.
export function getExtension(filename: string, fallback = "mp4"): string {
  const match = filename.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : fallback;
}

export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read this video's metadata."));
    };
  });
}

export function formatTimecode(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const parts = h > 0 ? [h, m, s] : [m, s];
  return parts.map((p, i) => (i === 0 ? String(p) : String(p).padStart(2, "0"))).join(":");
}

export function getVideoMetadata(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read this video's metadata."));
    };
  });
}

// libx264 requires even width/height — round down to the nearest even number.
export function toEven(n: number): number {
  return Math.max(2, Math.floor(n / 2) * 2);
}

export interface ClipMeta {
  duration: number;
  width: number;
  height: number;
}

export interface Transition {
  type:
    | "cut"
    | "fade"
    | "fadeblack"
    | "wipeleft"
    | "wiperight"
    | "slideup"
    | "slidedown"
    | "dissolve"
    // Native ffmpeg `xfade` transitions — same pass-through mechanism as the ones above,
    // just more of the built-in catalog exposed. "zoomin" is a real xfade effect; the
    // others are the closest genuine xfade transitions to a "zoom out" / "pop" feel,
    // since xfade has no transition literally named that.
    | "zoomin"
    | "circleopen"
    | "circleclose"
    | "radial"
    | "pixelize";
  duration: number; // seconds; ignored (forced to 0.05) when type is "cut"
}

const TARGET_FPS = 30;

// Builds the filter_complex graph for merging N clips with per-junction transitions.
// Normalizes every clip to clip[0]'s resolution + a fixed fps, since xfade/acrossfade
// require matching dimensions and frame rate across all inputs.
export function buildMergeFilterComplex(
  clips: ClipMeta[],
  transitions: Transition[], // length must be clips.length - 1
): { filterComplex: string; videoOut: string; audioOut: string } {
  const w = toEven(clips[0].width);
  const h = toEven(clips[0].height);

  const preprocessed: string[] = [];
  const audioPre: string[] = [];

  clips.forEach((_, i) => {
    preprocessed.push(
      `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${TARGET_FPS}[v${i}pre]`,
    );
    audioPre.push(`[${i}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}pre]`);
  });

  const videoChain: string[] = [];
  const audioChain: string[] = [];

  let currentVLabel = "v0pre";
  let currentALabel = "a0pre";
  let cumulativeDuration = clips[0].duration;

  for (let i = 1; i < clips.length; i++) {
    const t = transitions[i - 1];
    const dur = t.type === "cut" ? 0.05 : t.duration;
    const xfadeType = t.type === "cut" ? "fade" : t.type;
    const offset = Math.max(0, cumulativeDuration - dur);

    const nextVLabel = `v${i}pre`;
    const nextALabel = `a${i}pre`;
    const outVLabel = `vchain${i}`;
    const outALabel = `achain${i}`;

    videoChain.push(
      `[${currentVLabel}][${nextVLabel}]xfade=transition=${xfadeType}:duration=${dur}:offset=${offset.toFixed(3)}[${outVLabel}]`,
    );
    audioChain.push(`[${currentALabel}][${nextALabel}]acrossfade=d=${dur}[${outALabel}]`);

    currentVLabel = outVLabel;
    currentALabel = outALabel;
    cumulativeDuration = cumulativeDuration + clips[i].duration - dur;
  }

  const filterComplex = [...preprocessed, ...audioPre, ...videoChain, ...audioChain].join(";");

  return { filterComplex, videoOut: currentVLabel, audioOut: currentALabel };
}

// atempo only accepts 0.5–2.0 per instance; chain multiple for values outside that range.
export function buildAtempoChain(speed: number): string {
  if (speed >= 0.5 && speed <= 2.0) return `atempo=${speed}`;
  const filters: string[] = [];
  let remaining = speed;
  if (remaining > 2.0) {
    while (remaining > 2.0) {
      filters.push("atempo=2.0");
      remaining /= 2.0;
    }
    filters.push(`atempo=${remaining.toFixed(4)}`);
  } else {
    while (remaining < 0.5) {
      filters.push("atempo=0.5");
      remaining /= 0.5;
    }
    filters.push(`atempo=${remaining.toFixed(4)}`);
  }
  return filters.join(",");
}