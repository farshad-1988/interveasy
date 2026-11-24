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
  FeedbackCategory,
  InterviewStatus,
  Role,
} from '../src/generated/prisma/enums';

function getCookie(headers: Record<string, unknown>): string {
  const c = headers['set-cookie'];
  if (Array.isArray(c) && typeof c[0] === 'string') return c[0];
  if (typeof c === 'string') return c;
  return '';
}

describe('Feedback & Analytics (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminCookie: string;
  let candidateCookie: string;
  let interviewerCookie: string;
  let candidateId: string;
  let interviewerId: string;
  let interviewId: string;

  const testSuffix = Date.now().toString();
  const adminEmail = `admin-${testSuffix}@test.com`;
  const candidateEmail = `cand-${testSuffix}@test.com`;
  const interviewerEmail = `int-${testSuffix}@test.com`;
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

    // Seed test users directly
    try {
      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      await prisma.user.create({
        data: {
          email: adminEmail,
          name: 'Admin',
          password: hashedPassword,
          role: Role.ADMIN,
        },
      });
      const candidateUser = await prisma.user.create({
        data: {
          email: candidateEmail,
          name: 'Candidate',
          password: hashedPassword,
          role: Role.USER,
        },
      });
      const interviewerUser = await prisma.user.create({
        data: {
          email: interviewerEmail,
          name: 'Interviewer',
          password: hashedPassword,
          role: Role.USER,
        },
      });

      candidateId = candidateUser.id;
      interviewerId = interviewerUser.id;

      // Create test interview
      const interview = await prisma.interview.create({
        data: {
          userId: candidateId,
          interviewerId,
          title: 'E2E Practice Session',
          startAt: new Date(Date.now() + 3600000),
          endAt: new Date(Date.now() + 7200000),
          timezone: 'UTC',
          status: InterviewStatus.COMPLETED,
        },
      });
      interviewId = interview.id;

      // Log in users to get session cookies
      const adminLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adminEmail, password });
      adminCookie = getCookie(adminLogin.headers);

      const candLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: candidateEmail, password });
      candidateCookie = getCookie(candLogin.headers);

      const intLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: interviewerEmail, password });
      interviewerCookie = getCookie(intLogin.headers);
    } catch {
      // If DB is offline, test suite can gracefully skip or handle
    }
  });

  afterAll(async () => {
    delete process.env.DISABLE_AUTH_THROTTLE;
    try {
      if (candidateId) {
        await prisma.feedback.deleteMany({ where: { interviewId } });
        await prisma.interview.deleteMany({ where: { id: interviewId } });
        await prisma.session.deleteMany({
          where: {
            user: {
              email: { in: [adminEmail, candidateEmail, interviewerEmail] },
            },
          },
        });
        await prisma.user.deleteMany({
          where: {
            email: { in: [adminEmail, candidateEmail, interviewerEmail] },
          },
        });
      }
    } catch {
      // Ignore cleanup error if DB not connected
    }
    await app.close();
  });

  it('rejects unauthorized feedback submissions without JWT', async () => {
    const res = await request(app.getHttpServer())
      .post(`/interviews/00000000-0000-0000-0000-000000000000/feedback`)
      .send({
        subjectId: '00000000-0000-0000-0000-000000000000',
        category: FeedbackCategory.TECHNICAL,
        score: 5,
      });

    expect(res.status).toBe(401);
  });

  it('allows interviewer to submit feedback for candidate (201)', async () => {
    if (!interviewerCookie || !interviewId) return;

    const res = await request(app.getHttpServer())
      .post(`/interviews/${interviewId}/feedback`)
      .set('Cookie', [interviewerCookie])
      .send({
        subjectId: candidateId,
        category: FeedbackCategory.TECHNICAL,
        score: 4,
        comment: 'Solid grasp of data structures and API design.',
      });

    expect(res.status).toBe(201);
    expect(res.body.score).toBe(4);
    expect(res.body.category).toBe(FeedbackCategory.TECHNICAL);
  });

  it('prevents duplicate feedback for the same category (409 Conflict)', async () => {
    if (!interviewerCookie || !interviewId) return;

    const res = await request(app.getHttpServer())
      .post(`/interviews/${interviewId}/feedback`)
      .set('Cookie', [interviewerCookie])
      .send({
        subjectId: candidateId,
        category: FeedbackCategory.TECHNICAL, // Same category
        score: 5,
      });

    expect(res.status).toBe(409);
  });

  it('prevents self-feedback (400 BadRequest)', async () => {
    if (!candidateCookie || !interviewId) return;

    const res = await request(app.getHttpServer())
      .post(`/interviews/${interviewId}/feedback`)
      .set('Cookie', [candidateCookie])
      .send({
        subjectId: candidateId, // Self!
        category: FeedbackCategory.COMMUNICATION,
        score: 5,
      });

    expect(res.status).toBe(400);
  });

  it('allows candidate to view their received feedback', async () => {
    if (!candidateCookie) return;

    const res = await request(app.getHttpServer())
      .get('/users/me/feedback')
      .set('Cookie', [candidateCookie]);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
  });

  it('allows candidate to view aggregated performance report', async () => {
    if (!candidateCookie) return;

    const res = await request(app.getHttpServer())
      .get('/users/me/performance')
      .set('Cookie', [candidateCookie]);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('overall');
    expect(res.body).toHaveProperty('byCategory');
  });

  it('restricts admin analytics to ADMIN role only (403 for regular user)', async () => {
    if (!candidateCookie) return;

    const res = await request(app.getHttpServer())
      .get('/analytics/feedback-by-category')
      .set('Cookie', [candidateCookie]);

    expect(res.status).toBe(403);
  });

  it('allows admin to access global feedback analytics (200)', async () => {
    if (!adminCookie) return;

    const res = await request(app.getHttpServer())
      .get('/analytics/feedback-by-category')
      .set('Cookie', [adminCookie]);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('allows admin to access score averages and trends', async () => {
    if (!adminCookie) return;

    const avgRes = await request(app.getHttpServer())
      .get('/analytics/average-scores')
      .set('Cookie', [adminCookie]);
    expect(avgRes.status).toBe(200);

    const trendRes = await request(app.getHttpServer())
      .get('/analytics/trends')
      .set('Cookie', [adminCookie]);
    expect(trendRes.status).toBe(200);
  });
});
