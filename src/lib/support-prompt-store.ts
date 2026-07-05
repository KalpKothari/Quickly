import { create } from "zustand";

const SESSION_DISMISS_KEY = "qk_support_dismissed";

interface SupportPromptState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  dismissForSession: () => void;
}

function isDismissedThisSession(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
}

export const useSupportPromptStore = create<SupportPromptState>((set) => ({
  isOpen: false,

  // Called by showSupportPrompt() after a successful download/result.
  // No-ops silently if the user already closed it with ✕ this session.
  open: () => {
    if (isDismissedThisSession()) return;
    set({ isOpen: true });
  },

  // "Do Later" — just hides it, does NOT write to sessionStorage,
  // so it shows again on the next eligible download.
  close: () => set({ isOpen: false }),

  // "✕" or Escape/click-outside — permanently hides it for this
  // browser session only. sessionStorage clears itself when the tab/browser closes.
  dismissForSession: () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    }
    set({ isOpen: false });
  },
}));