import { randomBytes } from 'crypto';
import type { CookieOptions, Response } from 'express';
import type { ConfigService } from '@nestjs/config';

import { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME } from './auth.constants';

export function getCookieOptions(
  configService: ConfigService,
  maxAgeMs: number,
): CookieOptions {
  const sameSite =
    configService.get<'lax' | 'strict' | 'none'>('COOKIE_SAMESITE') ?? 'lax';
  const secure =
    configService.get<boolean>('COOKIE_SECURE') ??
    configService.get('NODE_ENV') === 'production';

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/auth',
    maxAge: maxAgeMs,
  };
}

export function readCookie(cookies: unknown, name: string): string | undefined {
  if (!cookies || typeof cookies !== 'object') {
    return undefined;
  }

  const value = (cookies as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

export function setAuthCookies(
  response: Response,
  refreshToken: string,
  maxAgeMs: number,
  configService: ConfigService,
) {
  const options = getCookieOptions(configService, maxAgeMs);
  response.cookie(AUTH_COOKIE_NAME, refreshToken, options);

  const csrfToken = randomBytes(32).toString('base64url');
  response.cookie(CSRF_COOKIE_NAME, csrfToken, {
    ...options,
    httpOnly: false,
  });

  return csrfToken;
}

export function clearAuthCookies(
  response: Response,
  configService: ConfigService,
) {
  const options = getCookieOptions(configService, 0);
  response.clearCookie(AUTH_COOKIE_NAME, options);
  response.clearCookie(CSRF_COOKIE_NAME, {
    ...options,
    httpOnly: false,
  });
}
