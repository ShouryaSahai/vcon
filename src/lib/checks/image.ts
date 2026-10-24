import jpeg from "jpeg-js";
import { PNG } from "pngjs";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db-types";

import { assertImageSafe, sniffImageKind, type ImageKind } from "./image-limits";
import type { RasterImage } from "./color";

/** Downloads an object from the content bucket with the caller's session (RLS applies). */
export async function downloadImage(
  supabase: SupabaseClient<Database>,
  path: string,
): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from("content").download(path);
  if (error || !data) {
    throw new Error(error?.message ?? "Could not download image for the colour check.");
  }
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Decode an uploaded image for the colour check, behind the safety guards
 * (byte cap + header dimension caps). A malicious "decompression bomb" —
 * a tiny file declaring huge dimensions — is rejected before the decoder can
 * allocate anything; the pipeline turns ImageRejectedError into an honest
 * needs_human finding instead of a crash.
 */
export function decodeImage(bytes: Uint8Array): RasterImage {
  assertImageSafe(bytes);

  const kind: ImageKind | null = sniffImageKind(bytes);
  if (kind === "png") {
    const png = PNG.sync.read(Buffer.from(bytes));
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
  }
  if (kind === "jpeg") {
    const decoded = jpeg.decode(Buffer.from(bytes), { useTArray: true, formatAsRGBA: true });
    return { width: decoded.width, height: decoded.height, data: new Uint8Array(decoded.data) };
  }
  throw new Error("Unsupported image format — only PNG and JPEG are checked for colour.");
}
