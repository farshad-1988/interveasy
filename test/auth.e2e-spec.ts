import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request, { type Response as SuperTestResponse } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME } from '../src/auth/auth.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashRefreshToken } from '../src/auth/utils/token.util';

function getSetCookieHeaders(headers: SuperTestResponse['headers']): string[] {
  const cookies = headers['set-cookie'];

  if (Array.isArray(cookies)) {
    return cookies;
  }

  if (typeof cookies === 'string' && cookies.length > 0) {
    return [cookies];
  }

  return [];
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const uniqueEmail = `auth-${Date.now()}@test.com`;
  const password = 'Password1';

  beforeAll(async () => {
    process.env.DISABLE_AUTH_THROTTLE = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    delete process.env.DISABLE_AUTH_THROTTLE;
    const user = await prisma.user.findUnique({
      where: { email: uniqueEmail },
    });
    if (user) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await app.close();
  });

  it('registers a user and stores a hashed password', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: uniqueEmail, password, name: 'Auth User' })
      .expect(201);

    expect(response.body.user.email).toBe(uniqueEmail);
    expect(response.body.user.password).toBeUndefined();

    const stored = await prisma.user.findUnique({
      where: { email: uniqueEmail },
    });
    expect(stored?.password).toBeDefined();
    expect(stored?.password).not.toBe(password);
  });

  it('rejects a duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: uniqueEmail, password })
      .expect(409);
  });

  it('rejects an invalid email', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password })
      .expect(400);
  });

  it('rejects a missing or short password', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: `short-${Date.now()}@test.com` })
      .expect(400);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: `short-${Date.now()}@test.com`, password: 'short' })
      .expect(400);
  });

  it('logs in, creates a hashed session, and sets secure cookies', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('User-Agent', 'e2e-agent')
      .set('x-device-info', 'e2e-device')
      .send({ email: uniqueEmail, password })
      .expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toBeUndefined();
    expect(response.body.user.password).toBeUndefined();

    const cookies = getSetCookieHeaders(response.headers);
    const cookieHeader = cookies.join(';');
    expect(cookieHeader).toContain(`${AUTH_COOKIE_NAME}=`);
    expect(cookieHeader.toLowerCase()).toContain('httponly');
    expect(cookieHeader.toLowerCase()).toContain('samesite=lax');
    expect(cookieHeader.toLowerCase()).toContain('path=/auth');

    const refreshCookie = cookies.find((cookie) =>
      cookie.startsWith(`${AUTH_COOKIE_NAME}=`),
    );
    const refreshToken = refreshCookie
      ?.split(';')[0]
      ?.slice(`${AUTH_COOKIE_NAME}=`.length);

    const user = await prisma.user.findUnique({
      where: { email: uniqueEmail },
    });
    const sessions = await prisma.session.findMany({
      where: { userId: user?.id },
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0].hashedRefreshToken).toBe(
      hashRefreshToken(refreshToken ?? ''),
    );
    expect(sessions[0].hashedRefreshToken).not.toBe(refreshToken);
    expect(sessions[0].userAgent).toBe('e2e-agent');
  });

  it('rejects incorrect passwords and unknown emails with the same status', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: uniqueEmail, password: 'WrongPass' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'missing-user@test.com', password })
      .expect(401);
  });

  it('refreshes tokens, rotates the cookie, and rejects reuse', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: uniqueEmail, password })
      .expect(200);

    const firstCookies = getSetCookieHeaders(login.headers);
    const csrfToken = login.body.csrfToken as string;

    const refresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', firstCookies)
      .set('x-csrf-token', csrfToken)
      .expect(200);

    expect(refresh.body.accessToken).toEqual(expect.any(String));
    expect(refresh.body.accessToken).not.toBe(login.body.accessToken);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', firstCookies)
      .set('x-csrf-token', csrfToken)
      .expect(401);
  });

  it('rejects refresh without a valid CSRF token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: uniqueEmail, password })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', getSetCookieHeaders(login.headers))
      .expect(403);
  });

  it('rejects an invalid refresh token', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [
        `${AUTH_COOKIE_NAME}=not-a-token`,
        `${CSRF_COOKIE_NAME}=csrf`,
      ])
      .set('x-csrf-token', 'csrf')
      .expect(401);
  });

  it('rejects a JWT with an invalid signature', async () => {
    const [header, payload] = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: uniqueEmail, password })
        .expect(200)
    ).body.accessToken.split('.');

    await request(app.getHttpServer())
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${header}.${payload}.invalid-signature`)
      .expect(401);
  });

  it('lists sessions and revokes the current session', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: uniqueEmail, password })
      .expect(200);

    const sessions = await request(app.getHttpServer())
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(
      sessions.body.some((session: { current: boolean }) => session.current),
    ).toBe(true);
    expect(
      sessions.body.every(
        (session: { hashedRefreshToken?: string }) =>
          !session.hashedRefreshToken,
      ),
    ).toBe(true);

    const currentId = sessions.body.find(
      (session: { current: boolean }) => session.current,
    ).id;

    await request(app.getHttpServer())
      .delete(`/auth/sessions/${currentId}`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', getSetCookieHeaders(login.headers))
      .set('x-csrf-token', login.body.csrfToken)
      .expect(401);
  });
});
