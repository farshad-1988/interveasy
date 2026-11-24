import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import {
  FeedbackCategory,
  InterviewStatus,
  LeadSource,
  LeadStatus,
  PrismaClient,
  Role,
  User,
} from '../src/generated/prisma/client';
import { BCRYPT_ROUNDS } from '../src/auth/auth.constants';
import {
  buildRefreshToken,
  generateRefreshTokenSecret,
  hashRefreshToken,
} from '../src/auth/utils/token.util';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const hashedPassword = await bcrypt.hash('Test@123456', BCRYPT_ROUNDS);

  const users = [
    {
      email: 'admin@test.com',
      name: 'Admin User',
      password: hashedPassword,
      role: Role.ADMIN,
    },
    {
      email: 'john@test.com',
      name: 'John Doe',
      password: hashedPassword,
      role: Role.USER,
    },
    {
      email: 'jane@test.com',
      name: 'Jane Doe',
      password: hashedPassword,
      role: Role.USER,
    },
  ];

  const upsertedUsers: User[] = [];

  for (const user of users) {
    const record = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        password: user.password,
        role: user.role,
      },
      create: user,
    });
    upsertedUsers.push(record);
  }

  const john = upsertedUsers.find((user) => user.email === 'john@test.com');
  const jane = upsertedUsers.find((user) => user.email === 'jane@test.com');
  const admin = upsertedUsers.find((user) => user.email === 'admin@test.com');

  if (john) {
    await prisma.session.deleteMany({
      where: { userId: john.id },
    });

    const sessionId = crypto.randomUUID();
    const refreshToken = buildRefreshToken(
      sessionId,
      generateRefreshTokenSecret(),
    );

    await prisma.session.create({
      data: {
        id: sessionId,
        userId: john.id,
        hashedRefreshToken: hashRefreshToken(refreshToken),
        deviceInfo: 'Seeded Chrome on Windows',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ipAddress: '127.0.0.1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // Seed Interview Availability for Jane (Tuesdays & Thursdays)
  if (jane) {
    await prisma.interviewAvailability.deleteMany({
      where: { interviewerId: jane.id },
    });

    await prisma.interviewAvailability.createMany({
      data: [
        {
          interviewerId: jane.id,
          dayOfWeek: 2, // Tuesday
          startTime: '09:00',
          endTime: '17:00',
          timezone: 'UTC',
          isActive: true,
        },
        {
          interviewerId: jane.id,
          dayOfWeek: 4, // Thursday
          startTime: '10:00',
          endTime: '16:00',
          timezone: 'UTC',
          isActive: true,
        },
      ],
    });
  }

  // Seed Completed Interview & Feedback
  if (john && jane) {
    const existingInterview = await prisma.interview.findFirst({
      where: { userId: john.id, interviewerId: jane.id },
    });

    let interviewId = existingInterview?.id;

    if (!existingInterview) {
      const interview = await prisma.interview.create({
        data: {
          userId: john.id,
          interviewerId: jane.id,
          title: 'Full Stack NestJS & Systems Mock Interview',
          description: 'Practice session on backend architecture, DB optimization, and concurrency.',
          startAt: new Date('2026-11-10T10:00:00Z'),
          endAt: new Date('2026-11-10T11:00:00Z'),
          timezone: 'UTC',
          status: InterviewStatus.COMPLETED,
          meetingUrl: 'https://meet.interveasy.dev/room-seeded-101',
        },
      });
      interviewId = interview.id;
    }

    if (interviewId) {
      // Upsert Feedback records
      const feedbacks = [
        {
          authorId: jane.id,
          subjectId: john.id,
          interviewId,
          category: FeedbackCategory.TECHNICAL,
          score: 5,
          comment: 'Excellent architectural reasoning and deep knowledge of PostgreSQL transactions.',
        },
        {
          authorId: jane.id,
          subjectId: john.id,
          interviewId,
          category: FeedbackCategory.COMMUNICATION,
          score: 4,
          comment: 'Very clear explanations, structured responses, and proactive clarifications.',
        },
        {
          authorId: jane.id,
          subjectId: john.id,
          interviewId,
          category: FeedbackCategory.PROBLEM_SOLVING,
          score: 5,
          comment: 'Approached edge cases methodically and designed scalable solutions under pressure.',
        },
      ];

      for (const fb of feedbacks) {
        await prisma.feedback.upsert({
          where: {
            authorId_interviewId_category: {
              authorId: fb.authorId,
              interviewId: fb.interviewId,
              category: fb.category,
            },
          },
          update: { score: fb.score, comment: fb.comment },
          create: fb,
        });
      }
    }
  }

  // Seed Leads (CRM)
  const sampleLeads = [
    {
      fullName: 'Sarah Connor',
      email: 'sarah@skynet-defense.com',
      phone: '+1-555-0101',
      company: 'Cyberdyne Systems',
      jobTitle: 'Head of Talent',
      teamSize: 120,
      message: 'Looking for a platform to evaluate 50 backend candidates monthly.',
      status: LeadStatus.QUALIFIED,
      source: LeadSource.WEBSITE,
      assignedToId: admin?.id,
      adminNotes: 'High priority lead. Demo scheduled.',
    },
    {
      fullName: 'Bruce Wayne',
      email: 'bruce@wayne-enterprises.com',
      phone: '+1-555-0102',
      company: 'Wayne Enterprises',
      jobTitle: 'CTO',
      teamSize: 500,
      message: 'Need enterprise-grade mock interview analytics for internal mobility.',
      status: LeadStatus.CONVERTED,
      source: LeadSource.REFERRAL,
      assignedToId: admin?.id,
      adminNotes: 'Contract signed for annual enterprise plan.',
    },
    {
      fullName: 'Peter Parker',
      email: 'peter@dailybugle.com',
      phone: '+1-555-0103',
      company: 'Daily Bugle Tech',
      jobTitle: 'Lead Developer',
      teamSize: 15,
      message: 'Interested in small team trial.',
      status: LeadStatus.NEW,
      source: LeadSource.DIRECT,
    },
    {
      fullName: 'Diana Prince',
      email: 'diana@themyscira-labs.io',
      company: 'Themyscira Labs',
      jobTitle: 'Engineering Director',
      teamSize: 45,
      status: LeadStatus.CONTACTED,
      source: LeadSource.EMAIL_CAMPAIGN,
      assignedToId: admin?.id,
    },
  ];

  for (const lead of sampleLeads) {
    const existingLead = await prisma.lead.findFirst({
      where: { email: lead.email },
    });
    if (!existingLead) {
      await prisma.lead.create({ data: lead });
    }
  }

  console.log('Users, sessions, availability, interviews, feedback, and leads seeded successfully!');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
