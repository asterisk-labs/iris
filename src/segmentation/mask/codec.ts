/**
 * Wire format for /segmentation/save_mask and /segmentation/load_mask:
 *
 *   254 | final mask (n bytes) | user mask (n bytes) | 254
 *
 * Both masks are row-major, n = width * height.
 */

const MAGIC = 254;

export function encodeMasks(final: Uint8Array, user: Uint8Array): Uint8Array {
  if (final.length !== user.length) {
    throw new Error('Final and user masks differ in length');
  }
  const n = final.length;
  const data = new Uint8Array(2 * n + 2);
  data[0] = MAGIC;
  data.set(final, 1);
  data.set(user, n + 1);
  data[2 * n + 1] = MAGIC;
  return data;
}

export function decodeMasks(data: Uint8Array, n: number): { final: Uint8Array; user: Uint8Array } {
  if (data.length !== 2 * n + 2) {
    throw new Error(`Mask data has ${data.length} bytes, expected ${2 * n + 2} for ${n} pixels`);
  }
  if (data[0] !== MAGIC || data[data.length - 1] !== MAGIC) {
    throw new Error('Mask data is corrupt (bad start or end marker)');
  }
  return {
    final: data.slice(1, n + 1),
    user: data.slice(n + 1, 2 * n + 1),
  };
}
