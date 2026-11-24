import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Auth rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    delete process.env.DISABLE_AUTH_THROTTLE;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('rate limits repeated login attempts', async () => {
    const attempts = Array.from({ length: 6 }, () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'rate-limit@test.com', password: 'WrongPass' }),
    );

    const results = await Promise.all(attempts);
    expect(results.some((result) => result.status === 429)).toBe(true);
  });
});
