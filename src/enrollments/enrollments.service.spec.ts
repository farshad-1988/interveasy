import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EnrollmentStatus, Role } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollmentsService } from './enrollments.service';

describe('EnrollmentsService', () => {
  let service: EnrollmentsService;
  const prisma: any = {
    program: { findUnique: jest.fn() },
    enrollment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const user = {
    userId: 'u1',
    email: 'u@test.com',
    role: Role.USER,
    sessionId: 's1',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((arg: unknown): Promise<unknown> => {
      if (typeof arg === 'function') {
        return Promise.resolve((arg as (tx: unknown) => unknown)(prisma));
      }
      return Promise.all(arg as Promise<unknown>[]);
    });
    const module = await Test.createTestingModule({
      providers: [
        EnrollmentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(EnrollmentsService);
  });

  it('enrolls in active program', async () => {
    prisma.program.findUnique.mockResolvedValue({ id: 'p1', isActive: true });
    prisma.enrollment.create.mockResolvedValue({
      id: 'e1',
      userId: 'u1',
      programId: 'p1',
      status: EnrollmentStatus.ACTIVE,
    });
    const res = await service.enroll(user, { programId: 'p1' });
    expect(res.id).toBe('e1');
  });

  it('rejects enrollment in inactive program', async () => {
    prisma.program.findUnique.mockResolvedValue({ id: 'p1', isActive: false });
    await expect(
      service.enroll(user, { programId: 'p1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps duplicate enrollment to 409', async () => {
    prisma.program.findUnique.mockResolvedValue({ id: 'p1', isActive: true });
    prisma.enrollment.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '7.10.1',
      }),
    );
    await expect(
      service.enroll(user, { programId: 'p1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws not found for missing program', async () => {
    prisma.program.findUnique.mockResolvedValue(null);
    await expect(
      service.enroll(user, { programId: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
