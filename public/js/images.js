// Client-side image validation + compression. Produces a display image (max 1600px) and a small thumbnail (max 480px).
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4.5 * 1024 * 1024;

export async function sniffType(file) {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
const encode = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));

async function resize(bitmap, max, quality) {
  const s = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * s)), h = Math.max(1, Math.round(bitmap.height * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bitmap, 0, 0, w, h);
  let blob = await encode(c, 'image/webp', quality), ext = 'webp';
  if (!blob || blob.type !== 'image/webp') { blob = await encode(c, 'image/jpeg', quality); ext = 'jpg'; }
  return { blob, ext };
}

/** @returns {{full:{blob,ext}, thumb:{blob,ext}}}  throws Error with a user-facing code: 'type' | 'size' | 'decode' */
export async function processImage(file) {
  if (file.size > MAX_INPUT_BYTES) throw new Error('size');
  if (!(await sniffType(file))) throw new Error('type');
  let bitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { try { bitmap = await createImageBitmap(file); } catch { throw new Error('decode'); } }
  let full = await resize(bitmap, 1600, 0.82);
  if (full.blob.size > MAX_OUTPUT_BYTES) full = await resize(bitmap, 1400, 0.7);
  if (full.blob.size > MAX_OUTPUT_BYTES) throw new Error('size');
  const thumb = await resize(bitmap, 480, 0.75);
  bitmap.close?.();
  return { full, thumb };
}
