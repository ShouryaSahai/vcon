/**
 * Image upload guards — pure functions, no decoder dependencies, so both the
 * browser (pre-upload check) and the check pipeline (pre-decode check) share
 * the same limits. Defense in depth against "decompression bomb" style
 * uploads: a few KB of PNG/JPEG declaring e.g. 100000×100000 would make the
 * decoder allocate gigabytes before the first pixel is checked.
 */

/** Hard cap on stored image bytes (also enforced by the storage bucket). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
/** Hard cap on decoded pixels (width × height). */
export const MAX_IMAGE_PIXELS = 30 * 1024 * 1024; // 30 MP
/** Hard cap on either dimension. */
export const MAX_IMAGE_DIMENSION = 12_000; // px per side

export type ImageGuardReason =
  | "too_large_bytes"
  | "too_many_pixels"
  | "dimension_too_large";

export class ImageRejectedError extends Error {
  reason: ImageGuardReason;
  width?: number;
  height?: number;
  bytes?: number;

  constructor(
    reason: ImageGuardReason,
    detail: { width?: number; height?: number; bytes?: number },
    message: string,
  ) {
    super(message);
    this.name = "ImageRejectedError";
    this.reason = reason;
    Object.assign(this, detail);
  }
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export type ImageKind = "png" | "jpeg";

/** Content sniffing — filenames and content types lie. */
export function sniffImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 8) {
    const isPng =
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (isPng) return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  return null;
}

/** PNG IHDR: signature(8) + length(4) + "IHDR"(4) → width 16–19, height 20–23 (big-endian). */
export function pngHeaderSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (sniffImageKind(bytes) !== "png" || bytes.length < 24) return null;
  const type = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (type !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * JPEG: scan markers until an SOFn (frame header) carries the dimensions.
 * SOFn always precedes scan data; scanning is bounded to the first 64 KB.
 */
export function jpegHeaderSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (sniffImageKind(bytes) !== "jpeg") return null;
  const limit = Math.min(bytes.length, 64 * 1024);
  let i = 2;
  while (i + 9 < limit) {
    if (bytes[i] !== 0xff) return null; // corrupt marker stream
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // standalone markers
      continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) return null;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    i += 2 + length;
  }
  return null;
}

/** Header-declared dimensions, without decoding any pixels. */
export function probeImageSize(bytes: Uint8Array): { width: number; height: number } | null {
  return pngHeaderSize(bytes) ?? jpegHeaderSize(bytes);
}

/**
 * Full guard: throws ImageRejectedError when the image must not be decoded.
 * Callers (the check pipeline) translate this into a needs_human finding.
 */
export function assertImageSafe(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new ImageRejectedError(
      "too_large_bytes",
      { bytes: bytes.length },
      `Image is ${formatBytes(bytes.length)} — the limit is ${formatBytes(MAX_IMAGE_BYTES)}.`,
    );
  }
  const size = probeImageSize(bytes);
  if (size) {
    if (size.width > MAX_IMAGE_DIMENSION || size.height > MAX_IMAGE_DIMENSION) {
      throw new ImageRejectedError(
        "dimension_too_large",
        size,
        `Image is ${size.width}×${size.height} px — the limit is ${MAX_IMAGE_DIMENSION.toLocaleString("en-IN")} px per side.`,
      );
    }
    if (size.width * size.height > MAX_IMAGE_PIXELS) {
      throw new ImageRejectedError(
        "too_many_pixels",
        size,
        `Image decodes to ${(size.width * size.height / 1_000_000).toFixed(0)} MP — the limit is ${MAX_IMAGE_PIXELS / 1_000_000} MP.`,
      );
    }
  }
  return size;
}
