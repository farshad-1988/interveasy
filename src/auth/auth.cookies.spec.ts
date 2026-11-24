import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import {
  clearAuthCookies,
  getCookieOptions,
  readCookie,
  setAuthCookies,
} from './auth.cookies';
import { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME } from './auth.constants';

describe('auth cookies', () => {
  const createMockConfigService = (
    values: Record<string, unknown> = {},
  ): ConfigService =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  describe('getCookieOptions', () => {
    it('returns options with default sameSite and secure from config', () => {
      const config = createMockConfigService({
        COOKIE_SAMESITE: 'strict',
        COOKIE_SECURE: true,
      });

      const options = getCookieOptions(config, 60000);

      expect(options).toEqual({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/auth',
        maxAge: 60000,
      });
    });

    it('falls back to defaults when config values are not set', () => {
      const config = createMockConfigService({
        NODE_ENV: 'production',
      });

      const options = getCookieOptions(config, 1000);

      expect(options.sameSite).toBe('lax');
      expect(options.secure).toBe(true);
      expect(options.httpOnly).toBe(true);
    });
  });

  describe('readCookie', () => {
    it('reads a valid cookie from cookie object', () => {
      expect(readCookie({ test_cookie: 'val123' }, 'test_cookie')).toBe(
        'val123',
      );
    });

    it('returns undefined when cookies is not an object or cookie missing', () => {
      expect(readCookie(null, 'test_cookie')).toBeUndefined();
      expect(readCookie(undefined, 'test_cookie')).toBeUndefined();
      expect(readCookie('invalid', 'test_cookie')).toBeUndefined();
      expect(readCookie({}, 'missing_cookie')).toBeUndefined();
      expect(readCookie({ test_cookie: 123 }, 'test_cookie')).toBeUndefined();
    });
  });

  describe('setAuthCookies', () => {
    it('sets both auth and csrf cookies on response', () => {
      const config = createMockConfigService({
        COOKIE_SAMESITE: 'lax',
        COOKIE_SECURE: false,
      });
      const cookieMock = jest.fn();
      const mockResponse = { cookie: cookieMock } as unknown as Response;

      const csrfToken = setAuthCookies(
        mockResponse,
        'refresh-token-val',
        3600000,
        config,
      );

      expect(csrfToken).toBeDefined();
      expect(typeof csrfToken).toBe('string');
      expect(cookieMock).toHaveBeenCalledTimes(2);
      expect(cookieMock).toHaveBeenCalledWith(
        AUTH_COOKIE_NAME,
        'refresh-token-val',
        expect.objectContaining({ httpOnly: true, maxAge: 3600000 }),
      );
      expect(cookieMock).toHaveBeenCalledWith(
        CSRF_COOKIE_NAME,
        csrfToken,
        expect.objectContaining({ httpOnly: false, maxAge: 3600000 }),
      );
    });
  });

  describe('clearAuthCookies', () => {
    it('clears both auth and csrf cookies', () => {
      const config = createMockConfigService();
      const clearCookieMock = jest.fn();
      const mockResponse = {
        clearCookie: clearCookieMock,
      } as unknown as Response;

      clearAuthCookies(mockResponse, config);

      expect(clearCookieMock).toHaveBeenCalledTimes(2);
      expect(clearCookieMock).toHaveBeenCalledWith(
        AUTH_COOKIE_NAME,
        expect.objectContaining({ httpOnly: true, maxAge: 0 }),
      );
      expect(clearCookieMock).toHaveBeenCalledWith(
        CSRF_COOKIE_NAME,
        expect.objectContaining({ httpOnly: false, maxAge: 0 }),
      );
    });
  });
});
