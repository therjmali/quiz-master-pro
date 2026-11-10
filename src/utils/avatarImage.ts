/**
 * Profile photo handling that works fully offline (no upload server): the picked image is centre-cropped to a
 * square, shrunk and stored as a small JPEG data URL inside the profile.
 */
export const AVATAR_SIZE = 256;
export const AVATAR_MAX_INPUT_BYTES = 12 * 1024 * 1024;

/** Largest centred square inside a w x h image: { sx, sy, side }. */
export function squareCrop(w: number, h: number): { sx: number; sy: number; side: number } {
  const side = Math.max(1, Math.min(w, h));
  return { sx: Math.max(0, Math.floor((w - side) / 2)), sy: Math.max(0, Math.floor((h - side) / 2)), side };
}

export class AvatarError extends Error {}

export function validateAvatarFile(file: { type: string; size: number }): void {
  if (!/^image\/(png|jpe?g|webp|gif|bmp|heic|heif|avif)$/i.test(file.type)) throw new AvatarError('Please choose a photo (JPG, PNG or WebP).');
  if (file.size > AVATAR_MAX_INPUT_BYTES) throw new AvatarError('That photo is too large - choose one under 12 MB.');
}

/** Browser only. Returns a data URL such as "data:image/jpeg;base64,...". */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  validateAvatarFile(file);
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch { throw new AvatarError('That image could not be read. Try a JPG or PNG.'); }
  try {
    const { sx, sy, side } = squareCrop(bmp.width, bmp.height);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE; canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new AvatarError('Your browser could not process the photo.');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.drawImage(bmp, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally { bmp.close?.(); }
}
