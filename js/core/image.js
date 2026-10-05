// Photo helpers for the menu editor: load, square-crop with zoom/offset, compress.
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('not_image'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad_image')); };
    img.src = url;
  });
}
export function loadImageUrl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('bad_image'));
    img.src = src;
  });
}

/** Geometry shared by the live preview and the export so they match exactly.
 *  zoom ≥ 1, ox/oy ∈ [-1, 1] (fraction of the overflow on each axis). */
export function coverRect(img, size, zoom = 1, ox = 0, oy = 0) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const scale = Math.max(size / w, size / h) * Math.max(1, zoom);
  const dw = w * scale, dh = h * scale;
  const ex = dw - size, ey = dh - size;
  return { x: -ex / 2 + (ox * ex) / 2, y: -ey / 2 + (oy * ey) / 2, w: dw, h: dh };
}
export function drawCover(ctx, img, size, zoom, ox, oy) {
  const r = coverRect(img, size, zoom, ox, oy);
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, r.x, r.y, r.w, r.h);
}

const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));
/** Export a square, compressed photo (WebP when supported, otherwise JPEG). */
export async function exportSquare(img, { size = 900, zoom = 1, ox = 0, oy = 0, quality = 0.82 } = {}) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const out = Math.min(size, Math.max(320, Math.round(Math.min(w, h) / Math.max(1, zoom))));
  const c = document.createElement('canvas');
  c.width = c.height = out;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, out, out);
  drawCover(ctx, img, out, zoom, ox, oy);
  let blob = await toBlob(c, 'image/webp', quality);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(c, 'image/jpeg', quality);
  return blob;
}
