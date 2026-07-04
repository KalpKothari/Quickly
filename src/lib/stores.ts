import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CategoryId } from "./tools";

export type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "light",
      toggle: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
      set: (t) => set({ theme: t }),
    }),
    { name: "quickly-theme" },
  ),
);

export interface RecentEntry {
  toolSlug: string;
  toolName: string;
  category: CategoryId;
  fileName?: string;
  meta?: string;
  at: number;
}

interface RecentState {
  byCategory: Partial<Record<CategoryId, RecentEntry[]>>;
  recentTools: string[];
  addProcessed: (entry: RecentEntry) => void;
  markUsed: (slug: string) => void;
  clear: () => void;
}

export const useRecent = create<RecentState>()(
  persist(
    (set) => ({
      byCategory: {},
      recentTools: [],
      addProcessed: (entry) =>
        set((s) => {
          const prev = s.byCategory[entry.category] ?? [];
          const next = [entry, ...prev.filter((e) => e.fileName !== entry.fileName)].slice(0, 2);
          return { byCategory: { ...s.byCategory, [entry.category]: next } };
        }),
      markUsed: (slug) =>
        set((s) => ({
          recentTools: [slug, ...s.recentTools.filter((x) => x !== slug)].slice(0, 8),
        })),
      clear: () => set({ byCategory: {}, recentTools: [] }),
    }),
    { name: "quickly-recent" },
  ),
);