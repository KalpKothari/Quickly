export async function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = reject;
    img.src = url;
  });
}
export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", q = 0.92): Promise<Blob> {
  return new Promise((r) => canvas.toBlob((b) => r(b!), type, q));
}
