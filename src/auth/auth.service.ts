import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BCRYPT_ROUNDS, JWT_ALGORITHM } from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type {
  AccessTokenPayload,
  AuthTokens,
  PublicUser,
  RequestContext,
} from './types/auth.types';
import { parseDurationToMs } from './utils/duration.util';
import {
  buildRefreshToken,
  generateRefreshTokenSecret,
  hashRefreshToken,
  parseRefreshToken,
  refreshTokenHashesMatch,
} from './utils/token.util';

// Precomputed bcrypt hash to mitigate timing attacks on non-existent users
const DUMMY_PASSWORD_HASH =
  '$2b$12$KixqInh3.qJ0mS0yGf1p/.eN8z3p1a2b3c4d5e6f7g8h9i0j1k2l.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  public async register(registerDto: RegisterDto): Promise<PublicUser> {
    const email = this.normalizeEmail(registerDto.email);
    const passwordHash = await bcrypt.hash(registerDto.password, BCRYPT_ROUNDS);

    try {
      return await this.prisma.user.create({
        data: {
          email,
          password: passwordHash,
          name: registerDto.name,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email is already registered');
      }

      throw error;
    }
  }

  public async login(
    loginDto: LoginDto,
    context: RequestContext,
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const email = this.normalizeEmail(loginDto.email);

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Constant-time execution guarantee against timing attacks
    const passwordHash = user?.password ?? DUMMY_PASSWORD_HASH;
    let isPasswordValid = false;

    try {
      isPasswordValid = await bcrypt.compare(loginDto.password, passwordHash);
    } catch {
      isPasswordValid = false;
    }

    if (!user || !isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.createSession(
      user.id,
      user.email,
      user.role,
      context,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      tokens,
    };
  }

  public async refresh(refreshToken: string | undefined): Promise<AuthTokens> {
    const parsed = this.requireParsedRefreshToken(refreshToken);
    const presentedToken = refreshToken as string;

    const session = await this.prisma.session.findUnique({
      where: { id: parsed.sessionId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!session || session.revokedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (session.expiresAt <= new Date()) {
      await this.revokeSessionById(session.id);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!refreshTokenHashesMatch(presentedToken, session.hashedRefreshToken)) {
      await this.revokeSessionById(session.id);
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.rotateSession(
      session.id,
      session.hashedRefreshToken,
      session.user.id,
      session.user.email,
      session.user.role,
    );
  }

  public async logout(refreshToken: string | undefined): Promise<void> {
    const parsed = parseRefreshToken(refreshToken ?? '');

    if (!parsed || !refreshToken) {
      return;
    }

    const session = await this.prisma.session.findUnique({
      where: { id: parsed.sessionId },
      select: {
        id: true,
        hashedRefreshToken: true,
        revokedAt: true,
      },
    });

    if (!session || session.revokedAt) {
      return;
    }

    if (refreshTokenHashesMatch(refreshToken, session.hashedRefreshToken)) {
      await this.revokeSessionById(session.id);
    }
  }

  public async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        deviceInfo: true,
        userAgent: true,
        ipAddress: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((session) => ({
      ...session,
      current: session.id === currentSessionId,
    }));
  }

  public async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        hashedRefreshToken: this.revokedTokenPlaceholder(),
      },
    });

    if (result.count === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  private async createSession(
    userId: string,
    email: string,
    role: string,
    context: RequestContext,
  ): Promise<AuthTokens> {
    const refreshExpiresIn = this.getRefreshExpiresIn();
    const refreshMaxAgeMs = parseDurationToMs(refreshExpiresIn);
    const expiresAt = new Date(Date.now() + refreshMaxAgeMs);
    const sessionId = randomUUID();
    const secret = generateRefreshTokenSecret();
    const refreshToken = buildRefreshToken(sessionId, secret);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        hashedRefreshToken: hashRefreshToken(refreshToken),
        deviceInfo: this.truncate(context.deviceInfo),
        userAgent: this.truncate(context.userAgent),
        ipAddress: this.truncate(context.ipAddress, 64),
        expiresAt,
      },
    });

    const accessToken = await this.signAccessToken({
      sub: userId,
      email,
      role,
      sid: sessionId,
      jti: randomUUID(),
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.getAccessExpiresIn(),
      refreshTokenMaxAgeMs: refreshMaxAgeMs,
    };
  }

  // Optimistic lock matching current hash to prevent concurrent token rotation race
  private async rotateSession(
    sessionId: string,
    currentHash: string,
    userId: string,
    email: string,
    role: string,
  ): Promise<AuthTokens> {
    const refreshExpiresIn = this.getRefreshExpiresIn();
    const refreshMaxAgeMs = parseDurationToMs(refreshExpiresIn);
    const secret = generateRefreshTokenSecret();
    const refreshToken = buildRefreshToken(sessionId, secret);
    const hashedRefreshToken = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + refreshMaxAgeMs);

    const rotated = await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        hashedRefreshToken: currentHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        hashedRefreshToken,
        expiresAt,
      },
    });

    if (rotated.count !== 1) {
      await this.revokeSessionById(sessionId);
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.signAccessToken({
      sub: userId,
      email,
      role,
      sid: sessionId,
      jti: randomUUID(),
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.getAccessExpiresIn(),
      refreshTokenMaxAgeMs: refreshMaxAgeMs,
    };
  }

  private async signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      algorithm: JWT_ALGORITHM,
      expiresIn: Math.floor(
        parseDurationToMs(this.getAccessExpiresIn()) / 1000,
      ),
      secret: this.getJwtSecret(),
    });
  }

  private async revokeSessionById(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: {
        revokedAt: new Date(),
        hashedRefreshToken: this.revokedTokenPlaceholder(),
      },
    });
  }

  private requireParsedRefreshToken(refreshToken: string | undefined) {
    const parsed = parseRefreshToken(refreshToken ?? '');

    if (!parsed || !refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return parsed;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private truncate(
    value: string | undefined,
    maxLength = 512,
  ): string | undefined {
    if (!value) {
      return undefined;
    }

    return value.slice(0, maxLength);
  }

  private getJwtSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('JWT_SECRET is not defined');
    }

    return secret;
  }

  private getAccessExpiresIn(): string {
    return this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
  }

  private getRefreshExpiresIn(): string {
    return this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
  }

  private revokedTokenPlaceholder(): string {
    return hashRefreshToken(`revoked.${generateRefreshTokenSecret()}`);
  }
}
