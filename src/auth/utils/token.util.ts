import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const REFRESH_TOKEN_BYTES = 32;

export function generateRefreshTokenSecret(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

export function buildRefreshToken(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}

export function parseRefreshToken(
  token: string,
): { sessionId: string; secret: string } | null {
  const separatorIndex = token.indexOf('.');

  if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
    return null;
  }

  const sessionId = token.slice(0, separatorIndex);
  const secret = token.slice(separatorIndex + 1);

  if (!sessionId || !secret) {
    return null;
  }

  return { sessionId, secret };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenHashesMatch(
  providedToken: string,
  storedHash: string,
): boolean {
  const providedHash = hashRefreshToken(providedToken);
  const providedBuffer = Buffer.from(providedHash, 'hex');
  const storedBuffer = Buffer.from(storedHash, 'hex');

  if (providedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, storedBuffer);
}
