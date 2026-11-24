import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
    listSessions: jest.Mock;
    revokeSession: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      listSessions: jest.fn(),
      revokeSession: jest.fn(),
    };
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'COOKIE_SAMESITE') return 'lax';
        if (key === 'COOKIE_SECURE') return false;
        if (key === 'NODE_ENV') return 'test';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('registers a user', async () => {
      const user = { id: 'user-1', email: 'test@test.com', name: 'Test' };
      authService.register.mockResolvedValue(user);

      const result = await controller.register({
        email: 'test@test.com',
        password: 'Password1',
        name: 'Test',
      });

      expect(authService.register).toHaveBeenCalledWith({
        email: 'test@test.com',
        password: 'Password1',
        name: 'Test',
      });
      expect(result).toEqual({ user });
    });
  });

  describe('login', () => {
    it('authenticates user and returns tokens with cookies', async () => {
      const user = { id: 'user-1', email: 'test@test.com', name: 'Test' };
      const tokens = {
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        accessTokenExpiresIn: '15m',
        refreshTokenMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
      };
      authService.login.mockResolvedValue({ user, tokens });

      const mockRequest = {
        header: jest.fn().mockImplementation((name: string) => {
          if (name === 'x-device-info') return 'Chrome Windows';
          if (name === 'user-agent') return 'Jest/Agent';
          return undefined;
        }),
        ip: '127.0.0.1',
      } as unknown as Request;

      const cookieMock = jest.fn();
      const mockResponse = {
        cookie: cookieMock,
      } as unknown as Response;

      const result = await controller.login(
        { email: 'test@test.com', password: 'Password1' },
        mockRequest,
        mockResponse,
      );

      expect(authService.login).toHaveBeenCalledWith(
        { email: 'test@test.com', password: 'Password1' },
        {
          deviceInfo: 'Chrome Windows',
          userAgent: 'Jest/Agent',
          ipAddress: '127.0.0.1',
        },
      );
      expect(cookieMock).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        user,
        accessToken: 'access-123',
        tokenType: 'Bearer',
        expiresIn: '15m',
        csrfToken: expect.any(String),
      });
    });
  });

  describe('refresh', () => {
    it('refreshes token and updates cookies', async () => {
      const tokens = {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        accessTokenExpiresIn: '15m',
        refreshTokenMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
      };
      authService.refresh.mockResolvedValue(tokens);

      const mockRequest = {
        cookies: { refresh_token: 'old-refresh' },
      } as unknown as Request;

      const cookieMock = jest.fn();
      const mockResponse = {
        cookie: cookieMock,
      } as unknown as Response;

      const result = await controller.refresh(mockRequest, mockResponse);

      expect(authService.refresh).toHaveBeenCalledWith('old-refresh');
      expect(cookieMock).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        accessToken: 'new-access',
        tokenType: 'Bearer',
        expiresIn: '15m',
        csrfToken: expect.any(String),
      });
    });
  });

  describe('logout', () => {
    it('logs out and clears cookies', async () => {
      authService.logout.mockResolvedValue(undefined);

      const mockRequest = {
        cookies: { refresh_token: 'token-to-revoke' },
      } as unknown as Request;

      const clearCookieMock = jest.fn();
      const mockResponse = {
        clearCookie: clearCookieMock,
      } as unknown as Response;

      await controller.logout(mockRequest, mockResponse);

      expect(authService.logout).toHaveBeenCalledWith('token-to-revoke');
      expect(clearCookieMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('listSessions', () => {
    it('delegates to authService.listSessions', async () => {
      const sessions = [{ id: 's1', current: true }];
      authService.listSessions.mockResolvedValue(sessions);

      const result = await controller.listSessions({
        userId: 'u1',
        sessionId: 's1',
        email: 'test@test.com',
        role: 'USER',
      });

      expect(authService.listSessions).toHaveBeenCalledWith('u1', 's1');
      expect(result).toBe(sessions);
    });
  });

  describe('revokeSession', () => {
    it('delegates to authService.revokeSession', async () => {
      authService.revokeSession.mockResolvedValue(undefined);

      await controller.revokeSession(
        { userId: 'u1', sessionId: 's1', email: 'test@test.com', role: 'USER' },
        's2',
      );

      expect(authService.revokeSession).toHaveBeenCalledWith('u1', 's2');
    });
  });
});
