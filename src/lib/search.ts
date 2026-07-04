import Fuse from "fuse.js";
import { TOOLS, type Tool } from "./tools";

let fuse: Fuse<Tool> | null = null;

function getFuse() {
  if (!fuse) {
    fuse = new Fuse(TOOLS, {
      keys: [
        { name: "name", weight: 0.6 },
        { name: "description", weight: 0.2 },
        { name: "keywords", weight: 0.2 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
    });
  }
  return fuse;
}

export function searchTools(q: string, limit = 8): Tool[] {
  const query = q.trim();
  if (!query) return [];
  return getFuse().search(query, { limit }).map((r) => r.item);
}