export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function getMaxDocSizeBytes(): number {
  return isMobileDevice() ? 80 * 1024 * 1024 : 150 * 1024 * 1024;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Friendly error mapping — surfaces specific causes instead of raw exceptions.
export function toFriendlyError(e: unknown, context: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();

  if (lower.includes("password") || lower.includes("encrypted")) {
    return "This file is password-protected. Please remove the password and try again.";
  }
  if (lower.includes("corrupt") || lower.includes("invalid") || lower.includes("malformed")) {
    return "This file appears to be corrupted or isn't a valid document. Try re-saving it and uploading again.";
  }
  if (lower.includes("memory") || lower.includes("allocation")) {
    return "This file is too large or complex for your browser to process. Try a smaller document.";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "Couldn't load a required component. Check your connection and try again.";
  }
  return `Something went wrong while ${context}. The file may be in an unsupported format or version.`;
}