import jpeg from "jpeg-js";
import { PNG } from "pngjs";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db-types";

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

export function decodeImage(bytes: Uint8Array): RasterImage {
  // Content sniffing — filenames and content types lie.
  const isPng =
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (isPng) {
    const png = PNG.sync.read(Buffer.from(bytes));
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
  }
  const decoded = jpeg.decode(Buffer.from(bytes), { useTArray: true, formatAsRGBA: true });
  return { width: decoded.width, height: decoded.height, data: new Uint8Array(decoded.data) };
}
