import { createHash } from 'node:crypto';

// Upload gambar slot pajangan ke Cloudinary (tanpa SDK, REST mentah).
// Pola sama seperti src/services/cloudinaryService.js di repo bot.
// Env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
//      opsional CLOUDINARY_FOLDER (default 'animein/custom').

export const DEFAULT_CUSTOM_FOLDER = 'animein/custom';
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_UPLOAD_MIME = ['image/jpeg', 'image/png', 'image/webp'];

export function loadCloudinaryEnv(env = process.env) {
  const cloudName = String(env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(env.CLOUDINARY_API_SECRET || '').trim();
  const folder = String(env.CLOUDINARY_FOLDER || DEFAULT_CUSTOM_FOLDER).trim() || DEFAULT_CUSTOM_FOLDER;
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret, folder };
}

export function slugifyName(name) {
  return (
    String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'card'
  );
}

// Signature signed-upload: SHA1 dari "k=v&k=v..." (urut abjad,
// tanpa file/api_key/resource_type/cloud_name) + api_secret.
export function signUploadParams(params, apiSecret) {
  const payload = Object.keys(params)
    .filter((k) => !['file', 'api_key', 'resource_type', 'cloud_name'].includes(k))
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1').update(payload + apiSecret).digest('hex');
}

export async function uploadImageBuffer(buffer, publicId, mime, cfg, fetchImpl = fetch) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    folder: cfg.folder,
    overwrite: 'true',
    public_id: publicId,
    timestamp: String(timestamp),
    unique_filename: 'false',
  };
  const signature = signUploadParams(params, cfg.apiSecret);
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime || 'image/jpeg' }), `${publicId}.jpg`);
  form.append('api_key', cfg.apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', cfg.folder);
  form.append('overwrite', 'true');
  form.append('public_id', publicId);
  form.append('unique_filename', 'false');

  const url = `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`;
  const res = await fetchImpl(url, { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Cloudinary upload HTTP ${res.status}: ${body.slice(0, 160)}`);
  }
  const json = await res.json();
  if (!json?.secure_url) throw new Error('Cloudinary: secure_url kosong di respons.');
  return { secureUrl: String(json.secure_url), publicId: String(json.public_id || publicId) };
}

// Upload 1 gambar slot custom milik user. Return { secureUrl }.
export async function uploadSlotImage(buffer, userId, mime) {
  const cfg = loadCloudinaryEnv();
  if (!cfg) throw new Error('Cloudinary belum dikonfigurasi (cek env).');
  const safeUser = slugifyName(`u-${userId}`).slice(0, 24);
  const publicId = `slot-${safeUser}-${Date.now()}`;
  return uploadImageBuffer(buffer, publicId, mime, cfg);
}
