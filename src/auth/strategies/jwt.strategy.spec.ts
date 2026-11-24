import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const createConfigService = (secret?: string): ConfigService =>
    ({
      get: jest.fn((key: string) =>
        key === 'JWT_SECRET' ? secret : undefined,
      ),
    }) as unknown as ConfigService;

  it('throws an error if JWT_SECRET is not defined', () => {
    expect(() => new JwtStrategy(createConfigService(undefined))).toThrow(
      'JWT_SECRET is not defined',
    );
  });

  it('initializes successfully with valid JWT_SECRET', () => {
    const strategy = new JwtStrategy(
      createConfigService('a-very-long-secret-key-32-chars-long'),
    );
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    let strategy: JwtStrategy;

    beforeEach(() => {
      strategy = new JwtStrategy(
        createConfigService('a-very-long-secret-key-32-chars-long'),
      );
    });

    it('returns AuthenticatedUser when payload is complete', () => {
      const user = strategy.validate({
        sub: 'user-id-123',
        email: 'test@test.com',
        role: 'USER',
        sid: 'session-id-456',
        jti: 'jwt-id-789',
      });

      expect(user).toEqual({
        userId: 'user-id-123',
        email: 'test@test.com',
        role: 'USER',
        sessionId: 'session-id-456',
      });
    });

    it('throws UnauthorizedException when payload sub is missing', () => {
      expect(() =>
        strategy.validate({
          sub: '',
          email: 'test@test.com',
          role: 'USER',
          sid: 'session-id-456',
          jti: 'jwt-id-789',
        }),
      ).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when payload email is missing', () => {
      expect(() =>
        strategy.validate({
          sub: 'user-id-123',
          email: '',
          role: 'USER',
          sid: 'session-id-456',
          jti: 'jwt-id-789',
        }),
      ).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when payload sid is missing', () => {
      expect(() =>
        strategy.validate({
          sub: 'user-id-123',
          email: 'test@test.com',
          role: 'USER',
          sid: '',
          jti: 'jwt-id-789',
        }),
      ).toThrow(UnauthorizedException);
    });
  });
});
