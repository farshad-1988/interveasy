import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../auth.constants';
import { readCookie } from '../auth.cookies';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const cookieToken = readCookie(request.cookies, CSRF_COOKIE_NAME);
    const headerToken = request.header(CSRF_HEADER_NAME);

    if (
      typeof cookieToken !== 'string' ||
      typeof headerToken !== 'string' ||
      cookieToken.length === 0 ||
      headerToken.length === 0
    ) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    const cookieBuffer = Buffer.from(cookieToken);
    const headerBuffer = Buffer.from(headerToken);

    if (
      cookieBuffer.length !== headerBuffer.length ||
      !timingSafeEqual(cookieBuffer, headerBuffer)
    ) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }
}
