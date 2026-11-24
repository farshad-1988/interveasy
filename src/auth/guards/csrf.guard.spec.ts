import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../auth.constants';
import { CsrfGuard } from './csrf.guard';

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  const createContext = (cookie?: string, header?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          cookies: cookie ? { [CSRF_COOKIE_NAME]: cookie } : {},
          header: (name: string) =>
            name.toLowerCase() === CSRF_HEADER_NAME ? header : undefined,
        }),
      }),
    }) as ExecutionContext;

  it('accepts matching CSRF cookie and header values', () => {
    expect(guard.canActivate(createContext('token-value', 'token-value'))).toBe(
      true,
    );
  });

  it('rejects missing or mismatched CSRF tokens', () => {
    expect(() => guard.canActivate(createContext(undefined, 'token'))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(createContext('token', undefined))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(createContext('one', 'two'))).toThrow(
      ForbiddenException,
    );
  });
});
