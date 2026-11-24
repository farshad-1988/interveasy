import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { hashRefreshToken } from './utils/token.util';

describe('AuthService', () => {
  let service: AuthService;
  const prisma = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('access-token'),
  };
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        JWT_SECRET: 'x'.repeat(32),
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
      };
      return values[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('creates a user with a hashed password', async () => {
      prisma.user.create.mockImplementation(async ({ data }) => ({
        id: 'user-1',
        email: data.email,
        name: data.name,
      }));

      const result = await service.register({
        email: '  New.User@Test.com ',
        password: 'Password1',
        name: 'New User',
      });

      const createArg = prisma.user.create.mock.calls[0][0];
      expect(createArg.data.email).toBe('new.user@test.com');
      expect(createArg.data.password).not.toBe('Password1');
      expect(await bcrypt.compare('Password1', createArg.data.password)).toBe(
        true,
      );
      expect(result).toEqual({
        id: 'user-1',
        email: 'new.user@test.com',
        name: 'New User',
      });
    });

    it('maps duplicate emails to a conflict error', async () => {
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.10.1',
        }),
      );

      await expect(
        service.register({
          email: 'admin@test.com',
          password: 'Password1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    const password = 'Password1';

    it('creates a session and returns tokens for valid credentials', async () => {
      const passwordHash = await bcrypt.hash(password, 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'john@test.com',
        name: 'John',
        password: passwordHash,
        role: 'USER',
      });
      prisma.session.create.mockResolvedValue({});

      const result = await service.login(
        { email: 'john@test.com', password },
        { userAgent: 'jest', ipAddress: '127.0.0.1', deviceInfo: 'test' },
      );

      expect(result.user.email).toBe('john@test.com');
      expect(result.tokens.accessToken).toBe('access-token');
      expect(result.tokens.refreshToken).toContain('.');
      expect(prisma.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            hashedRefreshToken: hashRefreshToken(result.tokens.refreshToken),
            userAgent: 'jest',
            ipAddress: '127.0.0.1',
          }),
        }),
      );
    });

    it('rejects an incorrect password with a generic error', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'john@test.com',
        password: await bcrypt.hash(password, 4),
        role: 'USER',
      });

      await expect(
        service.login({ email: 'john@test.com', password: 'WrongPass' }, {}),
      ).rejects.toThrow('Invalid credentials');
    });

    it('rejects a nonexistent email with the same generic error', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'missing@test.com', password }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    const sessionId = '11111111-1111-1111-1111-111111111111';
    const refreshToken = `${sessionId}.secret-token`;

    it('rotates the refresh token atomically', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: sessionId,
        hashedRefreshToken: hashRefreshToken(refreshToken),
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 'user-1', email: 'john@test.com', role: 'USER' },
      });
      prisma.session.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.refresh(refreshToken);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).not.toBe(refreshToken);
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: sessionId,
            hashedRefreshToken: hashRefreshToken(refreshToken),
          }),
        }),
      );
    });

    it('rejects the previous token after a successful rotation', async () => {
      prisma.session.findUnique
        .mockResolvedValueOnce({
          id: sessionId,
          hashedRefreshToken: hashRefreshToken(refreshToken),
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          user: { id: 'user-1', email: 'john@test.com', role: 'USER' },
        })
        .mockResolvedValueOnce({
          id: sessionId,
          hashedRefreshToken: hashRefreshToken(`${sessionId}.rotated`),
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          user: { id: 'user-1', email: 'john@test.com', role: 'USER' },
        });
      prisma.session.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });

      await service.refresh(refreshToken);

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('revokes the session on refresh token reuse', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: sessionId,
        hashedRefreshToken: hashRefreshToken(`${sessionId}.other-secret`),
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 'user-1', email: 'john@test.com', role: 'USER' },
      });
      prisma.session.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sessionId, revokedAt: null },
          data: expect.objectContaining({
            revokedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('rejects expired sessions', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: sessionId,
        hashedRefreshToken: hashRefreshToken(refreshToken),
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: { id: 'user-1', email: 'john@test.com', role: 'USER' },
      });
      prisma.session.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects revoked or missing sessions', async () => {
      prisma.session.findUnique.mockResolvedValue(null);
      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      prisma.session.findUnique.mockResolvedValue({
        id: sessionId,
        hashedRefreshToken: hashRefreshToken(refreshToken),
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 'user-1', email: 'john@test.com', role: 'USER' },
      });
      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('treats concurrent refresh as reuse and revokes the session', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: sessionId,
        hashedRefreshToken: hashRefreshToken(refreshToken),
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 'user-1', email: 'john@test.com', role: 'USER' },
      });
      prisma.session.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects malformed refresh tokens', async () => {
      await expect(service.refresh('not-a-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
