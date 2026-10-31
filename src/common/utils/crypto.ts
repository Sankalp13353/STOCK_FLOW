import crypto from 'crypto';

export function hashPayload(payload: unknown): string {
  const json = JSON.stringify(payload, Object.keys(payload as object || {}).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}

