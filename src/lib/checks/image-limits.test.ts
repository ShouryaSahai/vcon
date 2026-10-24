import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";

import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  ImageRejectedError,
  assertImageSafe,
  probeImageSize,
} from "./image-limits";

function pngWithDimensions(width: number, height: number): Uint8Array {
  // Signature + IHDR header only — enough to exercise the header probe.
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); // IHDR data length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function jpegWithDimensions(width: number, height: number): Uint8Array {
  // SOI + APP0 + SOF0 (precision 8, height, width) + EOI.
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

describe("image-limits (decompression-bomb guards)", () => {
  it("probes PNG dimensions from the IHDR header without decoding", () => {
    const bytes = pngWithDimensions(50000, 50000);
    expect(bytes.length).toBe(33); // 33 bytes — a true bomb
    expect(probeImageSize(bytes)).toEqual({ width: 50000, height: 50000 });
  });

  it("rejects a tiny PNG declaring huge dimensions (dimension cap)", () => {
    const bytes = pngWithDimensions(50000, 50000);
    try {
      assertImageSafe(bytes);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ImageRejectedError);
      const rejected = error as ImageRejectedError;
      expect(rejected.reason).toBe("dimension_too_large");
      expect(rejected.width).toBe(50000);
      expect(rejected.height).toBe(50000);
    }
  });

  it("rejects a JPEG bomb via the SOF header (pixel cap when sides are legal)", () => {
    // 12000 per side is at the per-side cap, but 12000 × 12000 = 144 MP > 30 MP.
    const bytes = jpegWithDimensions(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION);
    try {
      assertImageSafe(bytes);
      expect.unreachable();
    } catch (error) {
      expect((error as ImageRejectedError).reason).toBe("too_many_pixels");
    }
  });

  it("rejects JPEGs wider than the per-side cap", () => {
    const bytes = jpegWithDimensions(40000, 100);
    try {
      assertImageSafe(bytes);
      expect.unreachable();
    } catch (error) {
      expect((error as ImageRejectedError).reason).toBe("dimension_too_large");
      expect((error as ImageRejectedError).width).toBe(40000);
    }
  });

  it("rejects oversized files by bytes before reading any header", () => {
    const bytes = new Uint8Array(MAX_IMAGE_BYTES + 1);
    bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
    try {
      assertImageSafe(bytes);
      expect.unreachable();
    } catch (error) {
      expect((error as ImageRejectedError).reason).toBe("too_large_bytes");
    }
  });

  it("accepts a small, honest image", () => {
    const bytes = pngWithDimensions(1200, 900);
    expect(assertImageSafe(bytes)).toEqual({ width: 1200, height: 900 });
  });

  it("treats headerless/truncated data as passable to the decoder (which then errors)", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(assertImageSafe(bytes)).toBeNull();
  });

  it("accepts a real small PNG end-to-end after the guards", () => {
    const p = new PNG({ width: 2, height: 2 });
    for (let i = 0; i < 4; i++) {
      p.data[i * 4] = 200;
      p.data[i * 4 + 1] = 100;
      p.data[i * 4 + 2] = 50;
      p.data[i * 4 + 3] = 255;
    }
    const bytes = new Uint8Array(PNG.sync.write(p));
    expect(assertImageSafe(bytes)).toEqual({ width: 2, height: 2 });
  });
});
