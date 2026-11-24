import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AUTH_COOKIE_NAME } from './auth.constants';
import { clearAuthCookies, readCookie, setAuthCookies } from './auth.cookies';
import { CurrentUser } from './decorators/current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CsrfGuard } from './guards/csrf.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedUser } from './types/auth.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(@Body() registerDto: RegisterDto) {
    const user = await this.authService.register(registerDto);
    return { user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, tokens } = await this.authService.login(
      loginDto,
      this.getRequestContext(request),
    );

    const csrfToken = setAuthCookies(
      response,
      tokens.refreshToken,
      tokens.refreshTokenMaxAgeMs,
      this.configService,
    );

    return {
      user,
      accessToken: tokens.accessToken,
      tokenType: 'Bearer',
      expiresIn: tokens.accessTokenExpiresIn,
      csrfToken,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const tokens = await this.authService.refresh(
      this.getRefreshToken(request),
    );
    const csrfToken = setAuthCookies(
      response,
      tokens.refreshToken,
      tokens.refreshTokenMaxAgeMs,
      this.configService,
    );

    return {
      accessToken: tokens.accessToken,
      tokenType: 'Bearer',
      expiresIn: tokens.accessTokenExpiresIn,
      csrfToken,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(this.getRefreshToken(request));
    clearAuthCookies(response, this.configService);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listSessions(user.userId, user.sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) sessionId: string,
  ) {
    await this.authService.revokeSession(user.userId, sessionId);
  }

  private getRefreshToken(request: Request): string | undefined {
    return readCookie(request.cookies, AUTH_COOKIE_NAME);
  }

  private getRequestContext(request: Request) {
    const deviceHeader = request.header('x-device-info');

    return {
      userAgent: request.header('user-agent'),
      ipAddress: request.ip,
      deviceInfo: deviceHeader,
    };
  }
}
