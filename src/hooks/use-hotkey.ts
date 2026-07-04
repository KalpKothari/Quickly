import { useEffect } from "react";

export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void) {
  useEffect(() => {
    const parts = combo.toLowerCase().split("+");
    const key = parts.pop()!;
    const wantMeta = parts.includes("mod") || parts.includes("cmd") || parts.includes("ctrl");
    const wantShift = parts.includes("shift");
    const listener = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key) return;
      if (wantMeta && !(e.metaKey || e.ctrlKey)) return;
      if (wantShift && !e.shiftKey) return;
      handler(e);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [combo, handler]);
}