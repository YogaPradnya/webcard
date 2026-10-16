import { fetchJson } from '@/lib/fetchJson';

function newIdempotencyKey() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fallback */ }
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export async function postJson(path, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (!headers['Idempotency-Key']) headers['Idempotency-Key'] = newIdempotencyKey();
  return fetchJson(path, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
    ...opts,
    headers,
  });
}
