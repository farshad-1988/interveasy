import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InterviewStatus, Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { InterviewsService } from './interviews.service';

describe('InterviewsService', () => {
  let service: InterviewsService;
  const prisma: Record<string, any> = {
    user: { findUnique: jest.fn() },
    assessment: { findUnique: jest.fn() },
    interviewNote: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    interviewAvailability: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    interviewStatusHistory: { create: jest.fn() },
    interview: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const candidate = {
    userId: 'u-cand',
    email: 'c@test.com',
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
    const mod = await Test.createTestingModule({
      providers: [
        InterviewsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = mod.get(InterviewsService);
  });

  it('creates a valid interview booking (PENDING) and records history', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u-int' });
    prisma.assessment.findUnique.mockResolvedValue(null);
    prisma.interviewAvailability.findMany.mockResolvedValue([
      {
        id: 'a1',
        interviewerId: 'u-int',
        dayOfWeek: 2,
        startTime: '09:00',
        endTime: '17:00',
        timezone: 'UTC',
        isActive: true,
      },
    ]);
    prisma.interview.findMany.mockResolvedValue([]);
    prisma.interview.create.mockResolvedValue({
      id: 'i1',
      status: InterviewStatus.PENDING,
    });
    prisma.interviewStatusHistory.create.mockResolvedValue({});

    const res = await service.create(candidate, {
      interviewerId: 'u-int',
      title: 'Interview',
      startAt: '2030-11-12T10:00:00.000Z',
      endAt: '2030-11-12T10:30:00.000Z',
      timezone: 'UTC',
    });

    expect(res.id).toBe('i1');
    expect(prisma.interview.create).toHaveBeenCalled();
    expect(prisma.interviewStatusHistory.create).toHaveBeenCalled();
  });

  it('rejects overlapping interview with 409 Conflict', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u-int' });
    prisma.interviewAvailability.findMany.mockResolvedValue([
      {
        id: 'a1',
        interviewerId: 'u-int',
        dayOfWeek: 2,
        startTime: '09:00',
        endTime: '17:00',
        timezone: 'UTC',
        isActive: true,
      },
    ]);
    prisma.interview.findMany.mockResolvedValue([{ id: 'existing' }]);
    await expect(
      service.create(candidate, {
        interviewerId: 'u-int',
        title: 'Interview',
        startAt: '2030-11-12T10:00:00.000Z',
        endAt: '2030-11-12T10:30:00.000Z',
        timezone: 'UTC',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects booking in the past', async () => {
    await expect(
      service.create(candidate, {
        interviewerId: 'u-int',
        title: 'Interview',
        startAt: '2000-01-01T10:00:00.000Z',
        endAt: '2000-01-01T10:30:00.000Z',
        timezone: 'UTC',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid timezone', async () => {
    await expect(
      service.create(candidate, {
        interviewerId: 'u-int',
        title: 'Interview',
        startAt: '2030-11-12T10:00:00.000Z',
        endAt: '2030-11-12T10:30:00.000Z',
        timezone: 'Mars/Phobos',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces status transition validity and actor permissions', async () => {
    prisma.interview.findUnique.mockResolvedValue({
      id: 'i1',
      userId: 'u-cand',
      interviewerId: 'u-int',
      status: InterviewStatus.PENDING,
      startAt: new Date(),
      endAt: new Date(),
    });
    await expect(
      service.updateStatus(candidate, 'i1', {
        status: InterviewStatus.COMPLETED,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.interview.findUnique.mockResolvedValue({
      id: 'i1',
      userId: 'u-cand',
      interviewerId: 'u-int',
      status: InterviewStatus.PENDING,
      startAt: new Date(),
      endAt: new Date(),
    });
    await expect(
      service.updateStatus(candidate, 'i1', {
        status: InterviewStatus.CONFIRMED,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows interviewer to confirm pending interview', async () => {
    const interviewer = {
      userId: 'u-int',
      email: 'i@test.com',
      role: Role.USER,
      sessionId: 's2',
    };
    prisma.interview.findUnique.mockResolvedValue({
      id: 'i1',
      userId: 'u-cand',
      interviewerId: 'u-int',
      status: InterviewStatus.PENDING,
      startAt: new Date('2030-11-12T10:00:00Z'),
      endAt: new Date('2030-11-12T10:30:00Z'),
    });
    prisma.interview.findMany.mockResolvedValue([]);
    prisma.interview.update.mockResolvedValue({
      id: 'i1',
      status: InterviewStatus.CONFIRMED,
    });
    prisma.interviewStatusHistory.create.mockResolvedValue({});
    const res = await service.updateStatus(interviewer, 'i1', {
      status: InterviewStatus.CONFIRMED,
    });
    expect((res as { status: string }).status).toBe(InterviewStatus.CONFIRMED);
  });

  describe('findAll', () => {
    it('returns paginated interviews for admin', async () => {
      prisma.interview.count.mockResolvedValue(1);
      prisma.interview.findMany.mockResolvedValue([{ id: 'i1' }]);

      const res = await service.findAll({});
      expect(res.data).toHaveLength(1);
      expect(res.meta.total).toBe(1);
    });
  });

  describe('update', () => {
    it('allows participant to update interview details', async () => {
      prisma.interview.findUnique.mockResolvedValue({
        id: 'i1',
        userId: 'u-cand',
        interviewerId: 'u-int',
        status: InterviewStatus.PENDING,
        startAt: new Date('2030-11-12T10:00:00Z'),
        endAt: new Date('2030-11-12T10:30:00Z'),
        timezone: 'UTC',
      });
      prisma.interview.update.mockResolvedValue({
        id: 'i1',
        title: 'New Title',
      });

      const res = await service.update(candidate, 'i1', { title: 'New Title' });
      expect((res as { title: string }).title).toBe('New Title');
    });

    it('rejects modifying completed interview', async () => {
      prisma.interview.findUnique.mockResolvedValue({
        id: 'i1',
        userId: 'u-cand',
        interviewerId: 'u-int',
        status: InterviewStatus.COMPLETED,
        startAt: new Date(),
        endAt: new Date(),
      });

      await expect(
        service.update(candidate, 'i1', { title: 'New Title' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('allows participant or admin to delete interview', async () => {
      prisma.interview.findUnique.mockResolvedValue({
        id: 'i1',
        userId: 'u-cand',
        interviewerId: 'u-int',
        status: InterviewStatus.PENDING,
      });
      prisma.interview.delete.mockResolvedValue({ id: 'i1' });

      const res = await service.remove(candidate, 'i1');
      expect(res).toEqual({ deleted: true, id: 'i1' });
    });

    it('rejects deleting completed interview with 409', async () => {
      prisma.interview.findUnique.mockResolvedValue({
        id: 'i1',
        userId: 'u-cand',
        interviewerId: 'u-int',
        status: InterviewStatus.COMPLETED,
      });

      await expect(service.remove(candidate, 'i1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('notes CRUD', () => {
    it('lists and filters notes based on visibility', async () => {
      prisma.interview.findUnique.mockResolvedValue({
        id: 'i1',
        userId: 'u-cand',
        interviewerId: 'u-int',
      });
      prisma.interviewNote.findMany.mockResolvedValue([
        { id: 'n1', visibility: 'SHARED', authorId: 'u-int' },
        { id: 'n2', visibility: 'PRIVATE', authorId: 'u-int' },
        { id: 'n3', visibility: 'PRIVATE', authorId: 'u-cand' },
      ]);

      const notes = await service.listNotes(candidate, 'i1');
      // Candidate sees n1 (SHARED) and n3 (own PRIVATE)
      expect(notes).toHaveLength(2);
      expect(notes.map((n) => (n as { id: string }).id)).toEqual(['n1', 'n3']);
    });

    it('updates note by author', async () => {
      prisma.interviewNote.findFirst.mockResolvedValue({
        id: 'n1',
        authorId: 'u-cand',
      });
      prisma.interviewNote.update.mockResolvedValue({
        id: 'n1',
        content: 'Updated note',
      });

      const res = await service.updateNote(candidate, 'i1', 'n1', {
        content: 'Updated note',
      });
      expect(res.content).toBe('Updated note');
    });

    it('deletes note by author', async () => {
      prisma.interviewNote.findFirst.mockResolvedValue({
        id: 'n1',
        authorId: 'u-cand',
      });
      prisma.interviewNote.delete = jest.fn().mockResolvedValue({ id: 'n1' });

      const res = await service.deleteNote(candidate, 'i1', 'n1');
      expect(res).toEqual({ deleted: true, id: 'n1' });
    });
  });

  describe('availability CRUD', () => {
    it('returns availability by ID for owner', async () => {
      prisma.interviewAvailability.findUnique = jest.fn().mockResolvedValue({
        id: 'a1',
        interviewerId: 'u-cand',
      });

      const res = await service.getAvailabilityById(candidate, 'a1');
      expect(res.id).toBe('a1');
    });
  });
});
