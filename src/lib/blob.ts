import type { FileData } from "@ffmpeg/ffmpeg";

export function fileDataToBlob(data: FileData, mime: string): Blob {
  if (typeof data === "string") {
    return new Blob([data], { type: mime });
  }

  // Allocate a completely new ArrayBuffer
  const copy = new Uint8Array(data.length);
  copy.set(data);

  return new Blob([copy.buffer.slice(0)], {
    type: mime,
  });
}

export function uint8ArrayToBlob(
  data: Uint8Array,
  mime: string,
): Blob {
  // Force a copy backed by a fresh ArrayBuffer
  const copy = new Uint8Array(data.length);
  copy.set(data);

  return new Blob([copy], {
    type: mime,
  });
}