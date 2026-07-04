import { useCallback, useEffect, useRef, useState } from "react";

export interface CropRect {
  x: number; // percent 0-100
  y: number;
  w: number;
  h: number;
}

interface CropBoxProps {
  aspect: number | null; // width/height ratio, or null for free
  value: CropRect;
  onChange: (rect: CropRect) => void;
}

type Handle = "move" | "nw" | "ne" | "sw" | "se";
type ResizeHandle = Exclude<Handle, "move">;

export default function CropBox({
  aspect,
  value,
  onChange,
}: CropBoxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Handle | null>(null);

  const dragOrigin = useRef<{
    x: number;
    y: number;
    rect: CropRect;
  } | null>(null);

  const clampRect = useCallback((rect: CropRect): CropRect => {
    let { x, y, w, h } = rect;

    w = Math.max(5, Math.min(100, w));
    h = Math.max(5, Math.min(100, h));

    x = Math.max(0, Math.min(100 - w, x));
    y = Math.max(0, Math.min(100 - h, y));

    return { x, y, w, h };
  }, []);

  const applyAspect = useCallback(
    (
      rect: CropRect,
      anchor: Handle,
      containerAspect: number
    ): CropRect => {
      if (aspect === null) return rect;

      const targetPctAspect = aspect / containerAspect;

      let { x, y, w, h } = rect;

      h = w / targetPctAspect;

      if (anchor === "nw" || anchor === "ne") {
        y = rect.y + rect.h - h;
      }

      return { x, y, w, h };
    },
    [aspect]
  );

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!dragging || !dragOrigin.current || !containerRef.current) return;

      const bounds = containerRef.current.getBoundingClientRect();

      const dxPct =
        ((clientX - dragOrigin.current.x) / bounds.width) * 100;

      const dyPct =
        ((clientY - dragOrigin.current.y) / bounds.height) * 100;

      const orig = dragOrigin.current.rect;

      const containerAspect = bounds.width / bounds.height;

      let next: CropRect = { ...orig };

      switch (dragging) {
        case "move":
          next = {
            ...orig,
            x: orig.x + dxPct,
            y: orig.y + dyPct,
          };
          break;

        case "se":
          next = {
            ...orig,
            w: orig.w + dxPct,
            h: orig.h + dyPct,
          };
          next = applyAspect(next, "se", containerAspect);
          break;

        case "sw":
          next = {
            x: orig.x + dxPct,
            y: orig.y,
            w: orig.w - dxPct,
            h: orig.h + dyPct,
          };
          next = applyAspect(next, "sw", containerAspect);
          break;

        case "ne":
          next = {
            x: orig.x,
            y: orig.y + dyPct,
            w: orig.w + dxPct,
            h: orig.h - dyPct,
          };
          next = applyAspect(next, "ne", containerAspect);
          break;

        case "nw":
          next = {
            x: orig.x + dxPct,
            y: orig.y + dyPct,
            w: orig.w - dxPct,
            h: orig.h - dyPct,
          };
          next = applyAspect(next, "nw", containerAspect);
          break;
      }

      onChange(clampRect(next));
    },
    [dragging, applyAspect, clampRect, onChange]
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) =>
      handlePointerMove(e.clientX, e.clientY);

    const onUp = () => {
      setDragging(null);
      dragOrigin.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, handlePointerMove]);

  const startDrag =
    (handle: Handle) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      dragOrigin.current = {
        x: e.clientX,
        y: e.clientY,
        rect: value,
      };

      setDragging(handle);
    };

  const handles: ResizeHandle[] = [
    "nw",
    "ne",
    "sw",
    "se",
  ];

  const handlePositions: Record<ResizeHandle, string> = {
    nw: "top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
    ne: "top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
    sw: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
    se: "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  };

  return (
    <div ref={containerRef} className="absolute inset-0">
      <div
        className="absolute inset-0 bg-black/50"
        style={{
          clipPath: `polygon(
            0% 0%,
            0% 100%,
            ${value.x}% 100%,
            ${value.x}% ${value.y}%,
            ${value.x + value.w}% ${value.y}%,
            ${value.x + value.w}% ${value.y + value.h}%,
            ${value.x}% ${value.y + value.h}%,
            ${value.x}% 100%,
            100% 100%,
            100% 0%
          )`,
        }}
      />

      <div
        onPointerDown={startDrag("move")}
        className="absolute cursor-move border-2 border-primary shadow-[3px_3px_0_0_var(--color-foreground)] touch-none"
        style={{
          left: `${value.x}%`,
          top: `${value.y}%`,
          width: `${value.w}%`,
          height: `${value.h}%`,
        }}
      >
        {handles.map((h) => (
          <div
            key={h}
            onPointerDown={startDrag(h)}
            className={`absolute h-4 w-4 rounded-full border-2 border-foreground bg-primary shadow-[2px_2px_0_0_var(--color-foreground)] transition-transform hover:scale-110 touch-none ${handlePositions[h]}`}
          />
        ))}
      </div>
    </div>
  );
}