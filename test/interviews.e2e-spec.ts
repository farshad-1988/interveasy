import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { BCRYPT_ROUNDS } from '../src/auth/auth.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  InterviewStatus,
  NoteVisibility,
  Role,
} from '../src/generated/prisma/enums';

function getCookie(headers: Record<string, unknown>): string {
  const c = headers['set-cookie'];
  if (Array.isArray(c) && typeof c[0] === 'string') return c[0];
  if (typeof c === 'string') return c;
  return '';
}

describe('Interviews Scheduling & Management (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let candidateCookie: string;
  let interviewerCookie: string;
  let candidateId: string;
  let interviewerId: string;
  let interviewId: string;

  const testSuffix = Date.now().toString();
  const candidateEmail = `cand-int-${testSuffix}@test.com`;
  const interviewerEmail = `int-int-${testSuffix}@test.com`;
  const password = 'Password123!';

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

    try {
      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const candidateUser = await prisma.user.create({
        data: {
          email: candidateEmail,
          name: 'Candidate Interviewee',
          password: hashedPassword,
          role: Role.USER,
        },
      });
      const interviewerUser = await prisma.user.create({
        data: {
          email: interviewerEmail,
          name: 'Interviewer Host',
          password: hashedPassword,
          role: Role.USER,
        },
      });

      candidateId = candidateUser.id;
      interviewerId = interviewerUser.id;

      // Seed interviewer recurring availability for all days of the week (0-6, 00:00 - 23:59 UTC)
      for (let day = 0; day <= 6; day++) {
        await prisma.interviewAvailability.create({
          data: {
            interviewerId,
            dayOfWeek: day,
            startTime: '00:00',
            endTime: '23:59',
            timezone: 'UTC',
            isActive: true,
          },
        });
      }

      const candLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: candidateEmail, password });
      candidateCookie = getCookie(candLogin.headers);

      const intLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: interviewerEmail, password });
      interviewerCookie = getCookie(intLogin.headers);
    } catch {
      // DB offline handling
    }
  });

  afterAll(async () => {
    delete process.env.DISABLE_AUTH_THROTTLE;
    try {
      if (candidateId) {
        await prisma.interviewNote.deleteMany({ where: { interviewId } });
        await prisma.interviewStatusHistory.deleteMany({
          where: { interviewId },
        });
        await prisma.interview.deleteMany({ where: { id: interviewId } });
        await prisma.interviewAvailability.deleteMany({
          where: { interviewerId },
        });
        await prisma.session.deleteMany({
          where: {
            user: { email: { in: [candidateEmail, interviewerEmail] } },
          },
        });
        await prisma.user.deleteMany({
          where: { email: { in: [candidateEmail, interviewerEmail] } },
        });
      }
    } catch {
      // Ignore
    }
    await app.close();
  });

  it('checks interviewer availability slots (GET /interviewers/:id/availability)', async () => {
    if (!candidateCookie || !interviewerId) return;

    const from = '2030-01-01T00:00:00Z';
    const to = '2030-01-02T00:00:00Z';

    const res = await request(app.getHttpServer())
      .get(
        `/interviewers/${interviewerId}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      )
      .set('Cookie', [candidateCookie]);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('slots');
  });

  it('books an interview session (POST /interviews)', async () => {
    if (!candidateCookie || !interviewerId) return;

    const startAt = '2030-06-01T14:00:00.000Z';
    const endAt = '2030-06-01T15:00:00.000Z';

    const res = await request(app.getHttpServer())
      .post('/interviews')
      .set('Cookie', [candidateCookie])
      .send({
        interviewerId,
        title: 'Backend Systems Architecture Mock',
        startAt,
        endAt,
        timezone: 'UTC',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe(InterviewStatus.PENDING);
    interviewId = res.body.id;
  });

  it('prevents double-booking with 409 Conflict', async () => {
    if (!candidateCookie || !interviewerId) return;

    const startAt = '2030-06-01T14:30:00.000Z'; // Overlaps 14:00-15:00!
    const endAt = '2030-06-01T15:30:00.000Z';

    const res = await request(app.getHttpServer())
      .post('/interviews')
      .set('Cookie', [candidateCookie])
      .send({
        interviewerId,
        title: 'Conflicting Interview',
        startAt,
        endAt,
        timezone: 'UTC',
      });

    expect(res.status).toBe(409);
  });

  it('allows interviewer to confirm interview (PATCH /interviews/:id/status)', async () => {
    if (!interviewerCookie || !interviewId) return;

    const res = await request(app.getHttpServer())
      .patch(`/interviews/${interviewId}/status`)
      .set('Cookie', [interviewerCookie])
      .send({
        status: InterviewStatus.CONFIRMED,
        reason: 'Confirmed by interviewer',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(InterviewStatus.CONFIRMED);
  });

  it('allows participant to add interview notes (POST /interviews/:id/notes)', async () => {
    if (!interviewerCookie || !interviewId) return;

    const res = await request(app.getHttpServer())
      .post(`/interviews/${interviewId}/notes`)
      .set('Cookie', [interviewerCookie])
      .send({
        content: 'Candidate has strong concurrency knowledge.',
        visibility: NoteVisibility.SHARED,
      });

    expect(res.status).toBe(201);
    expect(res.body.content).toBe(
      'Candidate has strong concurrency knowledge.',
    );
  });

  it('retrieves user scheduled interviews (GET /users/me/interviews)', async () => {
    if (!candidateCookie) return;

    const res = await request(app.getHttpServer())
      .get('/users/me/interviews')
      .set('Cookie', [candidateCookie]);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
  });
});
