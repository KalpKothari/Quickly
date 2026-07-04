// Core Web Audio helpers shared by all audio tools.

let sharedCtx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!sharedCtx) sharedCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return sharedCtx;
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = getCtx();
  // decodeAudioData detaches the buffer in some browsers, so pass a copy.
  return ctx.decodeAudioData(arrayBuffer.slice(0));
}

export function fileToPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

export function trimBuffer(buffer: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
  const ctx = getCtx();
  const sampleRate = buffer.sampleRate;
  const start = Math.max(0, Math.floor(startSec * sampleRate));
  const end = Math.min(buffer.length, Math.floor(endSec * sampleRate));
  const length = Math.max(1, end - start);
  const out = ctx.createBuffer(buffer.numberOfChannels, length, sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    out.copyToChannel(buffer.getChannelData(ch).subarray(start, end), ch);
  }
  return out;
}

// Sequential fade + gap merge: each clip fades out at its tail (except the last),
// fades in at its head (except the first), with a short silence gap between clips.
// No overlapping addition — avoids clipping/volume-doubling entirely.
export function mergeBuffersWithFades(
  buffers: AudioBuffer[],
  fadeSec: number = 1.2,
  gapSec: number = 0.3,
): AudioBuffer {
  const ctx = getCtx();
  const sampleRate = buffers[0].sampleRate;
  const numberOfChannels = Math.max(...buffers.map((b) => b.numberOfChannels));

  // Clamp fade so it never exceeds half of any individual clip's length.
  const safeFadeSec = Math.min(
    fadeSec,
    ...buffers.map((b) => (b.length / sampleRate) / 2),
  );

  const fadedBuffers = buffers.map((buf, i) => {
    let result = buf;
    if (i !== 0) result = applyFade(result, safeFadeSec, "in");
    if (i !== buffers.length - 1) result = applyFade(result, safeFadeSec, "out");
    return result;
  });

  const gapSamples = Math.max(0, Math.floor(gapSec * sampleRate));
  const totalLength =
    fadedBuffers.reduce((sum, b) => sum + b.length, 0) + gapSamples * (buffers.length - 1);

  const out = ctx.createBuffer(numberOfChannels, totalLength, sampleRate);

  for (let ch = 0; ch < numberOfChannels; ch++) {
    const outData = out.getChannelData(ch);
    let writeOffset = 0;
    for (let i = 0; i < fadedBuffers.length; i++) {
      const buf = fadedBuffers[i];
      const src = ch < buf.numberOfChannels ? buf.getChannelData(ch) : buf.getChannelData(0);
      outData.set(src, writeOffset);
      writeOffset += src.length;
      if (i !== fadedBuffers.length - 1) {
        writeOffset += gapSamples; // silence — buffer is zero-initialized by default
      }
    }
  }

  return out;
}

export function applyVolume(buffer: AudioBuffer, gain: number): AudioBuffer {
  const ctx = getCtx();
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < src.length; i++) {
      dst[i] = Math.max(-1, Math.min(1, src[i] * gain));
    }
  }
  return out;
}

export function applyFade(buffer: AudioBuffer, durationSec: number, direction: "in" | "out"): AudioBuffer {
  const ctx = getCtx();
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const fadeSamples = Math.min(buffer.length, Math.floor(durationSec * buffer.sampleRate));

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    dst.set(src);
    for (let i = 0; i < fadeSamples; i++) {
      const progress = i / fadeSamples;
      const idx = direction === "in" ? i : buffer.length - fadeSamples + i;
      const factor = direction === "in" ? progress : 1 - progress;
      dst[idx] = src[idx] * factor;
    }
  }
  return out;
}

// Encodes an AudioBuffer to a 16-bit PCM WAV Blob — no external deps.
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrBuf = new ArrayBuffer(bufferSize);
  const view = new DataView(arrBuf);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrBuf], { type: "audio/wav" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}