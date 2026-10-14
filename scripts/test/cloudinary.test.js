import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  signUploadParams, slugifyName, loadCloudinaryEnv,
  MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_MIME,
} from '../../src/lib/cloudinary.js';

describe('cloudinary sign', () => {
  it('deterministik + abaikan file/api_key', () => {
    const a = signUploadParams({ folder: 'x', timestamp: '1', public_id: 'p' }, 'secret');
    const b = signUploadParams({ public_id: 'p', folder: 'x', timestamp: '1' }, 'secret');
    assert.equal(a, b, 'urutan key tidak pengaruh');
    const c = signUploadParams({ folder: 'x', timestamp: '1', public_id: 'p', file: 'bin', api_key: 'k' }, 'secret');
    assert.equal(a, c, 'file/api_key tidak ikut signature');
    assert.match(a, /^[0-9a-f]{40}$/, 'SHA1 hex 40 char');
    assert.notEqual(
      signUploadParams({ folder: 'x', timestamp: '1', public_id: 'p' }, 'secret2'),
      a,
    );
  });
  it('slug stabil + batas upload 5MB JPG/PNG/WebP', () => {
    assert.equal(slugifyName('Gojo Satoru'), 'gojo-satoru');
    assert.equal(MAX_UPLOAD_BYTES, 5 * 1024 * 1024);
    assert.deepEqual([...ALLOWED_UPLOAD_MIME].sort(), ['image/jpeg', 'image/png', 'image/webp']);
    assert.equal(loadCloudinaryEnv({}), null);
    assert.ok(loadCloudinaryEnv({ CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' }));
  });
});
