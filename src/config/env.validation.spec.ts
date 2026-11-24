import 'reflect-metadata';
import { validate } from './env.validation';

describe('env.validation', () => {
  const validConfig = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_SECRET: 'x'.repeat(32),
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    COOKIE_SECURE: false,
    COOKIE_SAMESITE: 'lax',
  };

  it('validates a valid configuration', () => {
    const result = validate(validConfig);
    expect(result.DATABASE_URL).toBe(validConfig.DATABASE_URL);
    expect(result.JWT_SECRET).toBe(validConfig.JWT_SECRET);
    expect(result.JWT_ACCESS_EXPIRES_IN).toBe('15m');
    expect(result.JWT_REFRESH_EXPIRES_IN).toBe('7d');
  });

  it('throws an error if DATABASE_URL is missing', () => {
    const incomplete = { ...validConfig } as Record<string, unknown>;
    delete incomplete.DATABASE_URL;
    expect(() => validate(incomplete)).toThrow('Invalid environment variables');
  });

  it('throws an error if JWT_SECRET is shorter than 32 characters', () => {
    expect(() =>
      validate({
        ...validConfig,
        JWT_SECRET: 'short-secret',
      }),
    ).toThrow('JWT_SECRET must be at least 32 characters');
  });

  it('throws an error if JWT_ACCESS_EXPIRES_IN is greater than 1 hour', () => {
    expect(() =>
      validate({
        ...validConfig,
        JWT_ACCESS_EXPIRES_IN: '2h',
      }),
    ).toThrow('JWT_ACCESS_EXPIRES_IN must be 1 hour or less');
  });

  it('throws an error if JWT_REFRESH_EXPIRES_IN is greater than 30 days', () => {
    expect(() =>
      validate({
        ...validConfig,
        JWT_REFRESH_EXPIRES_IN: '31d',
      }),
    ).toThrow('JWT_REFRESH_EXPIRES_IN must be 30 days or less');
  });

  it('throws an error if JWT_REFRESH_EXPIRES_IN is less than or equal to JWT_ACCESS_EXPIRES_IN', () => {
    expect(() =>
      validate({
        ...validConfig,
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '10m',
      }),
    ).toThrow(
      'JWT_REFRESH_EXPIRES_IN must be greater than JWT_ACCESS_EXPIRES_IN',
    );
  });

  it('throws an error if COOKIE_SAMESITE is none without COOKIE_SECURE', () => {
    expect(() =>
      validate({
        ...validConfig,
        COOKIE_SAMESITE: 'none',
        COOKIE_SECURE: false,
      }),
    ).toThrow('COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
  });

  it('accepts COOKIE_SAMESITE=none with COOKIE_SECURE=true', () => {
    const result = validate({
      ...validConfig,
      COOKIE_SAMESITE: 'none',
      COOKIE_SECURE: true,
    });
    expect(result.COOKIE_SAMESITE).toBe('none');
    expect(result.COOKIE_SECURE).toBe(true);
  });
});
