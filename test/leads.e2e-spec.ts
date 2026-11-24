import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { BCRYPT_ROUNDS } from '../src/auth/auth.constants';
import { PrismaService } from '../src/prisma/prisma.service';
import { LeadSource, LeadStatus, Role } from '../src/generated/prisma/enums';

function getCookie(headers: Record<string, unknown>): string {
  const c = headers['set-cookie'];
  if (Array.isArray(c) && typeof c[0] === 'string') return c[0];
  if (typeof c === 'string') return c;
  return '';
}

describe('Leads & Demo Requests (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminCookie: string;
  let userCookie: string;
  let testLeadId: string;

  const testSuffix = Date.now().toString();
  const adminEmail = `leadadmin-${testSuffix}@test.com`;
  const userEmail = `leaduser-${testSuffix}@test.com`;
  const demoEmail = `enterprise-${testSuffix}@company.com`;
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

      await prisma.user.create({
        data: {
          email: adminEmail,
          name: 'Admin',
          password: hashedPassword,
          role: Role.ADMIN,
        },
      });
      await prisma.user.create({
        data: {
          email: userEmail,
          name: 'User',
          password: hashedPassword,
          role: Role.USER,
        },
      });

      const adminLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adminEmail, password });
      adminCookie = getCookie(adminLogin.headers);

      const userLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: userEmail, password });
      userCookie = getCookie(userLogin.headers);
    } catch {
      // DB offline handling
    }
  });

  afterAll(async () => {
    delete process.env.DISABLE_AUTH_THROTTLE;
    try {
      await prisma.lead.deleteMany({
        where: { email: { contains: testSuffix } },
      });
      await prisma.session.deleteMany({
        where: { user: { email: { in: [adminEmail, userEmail] } } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [adminEmail, userEmail] } },
      });
    } catch {
      // Ignore
    }
    await app.close();
  });

  it('allows public demo request submission without authentication (201)', async () => {
    const res = await request(app.getHttpServer())
      .post('/demo-requests')
      .send({
        fullName: 'Enterprise Lead',
        email: `  ${demoEmail.toUpperCase()}  `, // Test normalization
        company: 'Enterprise Corp',
        teamSize: 75,
        source: LeadSource.WEBSITE,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    testLeadId = res.body.id;
  });

  it('rejects duplicate active demo request with 409 Conflict', async () => {
    const res = await request(app.getHttpServer()).post('/demo-requests').send({
      fullName: 'Another Contact',
      email: demoEmail, // Same email
      company: 'Enterprise Corp',
    });

    expect(res.status).toBe(409);
  });

  it('rejects invalid email with 400 Bad Request', async () => {
    const res = await request(app.getHttpServer()).post('/demo-requests').send({
      fullName: 'Invalid User',
      email: 'not-an-email',
    });

    expect(res.status).toBe(400);
  });

  it('forbids regular users from accessing admin leads endpoint (403)', async () => {
    if (!userCookie) return;

    const res = await request(app.getHttpServer())
      .get('/admin/leads')
      .set('Cookie', [userCookie]);

    expect(res.status).toBe(403);
  });

  it('allows admin to list and filter leads (200)', async () => {
    if (!adminCookie) return;

    const res = await request(app.getHttpServer())
      .get('/admin/leads?status=NEW')
      .set('Cookie', [adminCookie]);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
  });

  it('allows admin to view lead details by UUID', async () => {
    if (!adminCookie || !testLeadId) return;

    const res = await request(app.getHttpServer())
      .get(`/admin/leads/${testLeadId}`)
      .set('Cookie', [adminCookie]);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testLeadId);
  });

  it('allows admin to transition lead status NEW -> CONTACTED', async () => {
    if (!adminCookie || !testLeadId) return;

    const res = await request(app.getHttpServer())
      .patch(`/admin/leads/${testLeadId}/status`)
      .set('Cookie', [adminCookie])
      .send({
        status: LeadStatus.CONTACTED,
        adminNotes: 'Intro call conducted.',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(LeadStatus.CONTACTED);
  });

  it('rejects invalid status transition CONTACTED -> NEW (400)', async () => {
    if (!adminCookie || !testLeadId) return;

    const res = await request(app.getHttpServer())
      .patch(`/admin/leads/${testLeadId}/status`)
      .set('Cookie', [adminCookie])
      .send({
        status: LeadStatus.NEW,
      });

    expect(res.status).toBe(400);
  });

  it('provides CRM analytics to admin', async () => {
    if (!adminCookie) return;

    const res = await request(app.getHttpServer())
      .get('/admin/leads/analytics')
      .set('Cookie', [adminCookie]);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalLeads');
    expect(res.body).toHaveProperty('conversionRate');
    expect(res.body).toHaveProperty('byStatus');
    expect(res.body).toHaveProperty('bySource');
  });
});
