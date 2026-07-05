import { useSupportPromptStore } from "@/lib/support-prompt-store";

export function useSupportPrompt() {
  const showSupportPrompt = useSupportPromptStore((s) => s.open);
  return { showSupportPrompt };
}