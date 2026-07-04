import type { NormalizedSocialResponse, NormalizedSocialError, SocialPlatform, SocialType } from "@/providers/socialProvider";

export type SocialClientResult = NormalizedSocialResponse | NormalizedSocialError;

export async function callSocial(
  input: { platform: SocialPlatform; type: SocialType; url: string },
  signal?: AbortSignal,
): Promise<SocialClientResult> {
  const res = await fetch("/api/social", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  const data = (await res.json()) as SocialClientResult;
  return data;
}

export function formatTimestamp(seconds?: number): string {
  if (typeof seconds !== "number" || !isFinite(seconds)) return "";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export async function downloadRemote(url: string, filename: string) {
  // Try same-origin fetch to force save; fall back to a plain link if blocked by CORS.
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    return true;
  } catch {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return false;
  }
}