const MAX_SIDE = 2048;
const MAX_PIXELS = MAX_SIDE * MAX_SIDE;
const MAX_BYTES = 3.2 * 1024 * 1024;
const MAX_SOURCE_SIDE = 12000;
const MAX_SOURCE_PIXELS = 80_000_000;

export class ArtworkRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtworkRejected";
  }
}

export interface PreparedArtwork {
  src: string;
  width: number;
  height: number;
  bytes: number;
  original: { width: number; height: number; bytes: number };
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ArtworkRejected("无法读取图片文件"));
    reader.readAsDataURL(file);
  });
}

function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ArtworkRejected("图片已损坏或格式无法解析"));
    img.src = src;
  });
}

/**
 * Validate and normalise an imported picture before it enters the session.
 *
 * A rejected file throws `ArtworkRejected`; callers keep the current artwork
 * untouched. Big pictures are resampled to a bounded texture budget so neither
 * the GPU texture nor the in-session data URL grows without limit.
 */
export async function prepareArtwork(file: File): Promise<PreparedArtwork> {
  if (!file || file.size === 0) throw new ArtworkRejected("文件为空，已跳过");
  if (!file.type.startsWith("image/"))
    throw new ArtworkRejected("不是可识别的图片文件");
  if (file.size > 200 * 1024 * 1024)
    throw new ArtworkRejected("图片文件过大，已跳过");

  const dataUrl = await readAsDataUrl(file);
  const img = await decode(dataUrl);
  const w = img.naturalWidth,
    h = img.naturalHeight;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 2 || h < 2)
    throw new ArtworkRejected("图片尺寸异常，已跳过");
  if (w > MAX_SOURCE_SIDE || h > MAX_SOURCE_SIDE || w * h > MAX_SOURCE_PIXELS)
    throw new ArtworkRejected("图片尺寸超出可用范围，已跳过");

  const original = { width: w, height: h, bytes: file.size };
  const ratio = Math.min(1, MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
  if (ratio >= 0.999 && file.size <= MAX_BYTES)
    return { src: dataUrl, width: w, height: h, bytes: file.size, original };

  const tw = Math.max(2, Math.round(w * ratio)),
    th = Math.max(2, Math.round(h * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ArtworkRejected("浏览器无法处理这张图片");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, tw, th);
  let src = canvas.toDataURL("image/webp", 0.88);
  if (!src.startsWith("data:image/webp")) src = canvas.toDataURL("image/jpeg", 0.9);
  if (!src || src.length < 64) throw new ArtworkRejected("图片解码失败，已跳过");
  const bytes = Math.round((src.length - src.indexOf(",") - 1) * 0.75);
  if (bytes > MAX_BYTES * 2) throw new ArtworkRejected("图片压缩后仍超出存储限制");
  return { src, width: tw, height: th, bytes, original };
}
