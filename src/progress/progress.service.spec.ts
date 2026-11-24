import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EnrollmentStatus, Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressService } from './progress.service';

describe('ProgressService', () => {
  let service: ProgressService;
  const prisma: any = {
    task: { findUnique: jest.fn(), count: jest.fn() },
    enrollment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    progress: { upsert: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    program: { findUnique: jest.fn() },
    module: { findUnique: jest.fn() },
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
    prisma.$transaction.mockImplementation((fn: unknown): Promise<unknown> =>
      Promise.resolve((fn as (tx: unknown) => unknown)(prisma)),
    );
    const module = await Test.createTestingModule({
      providers: [
        ProgressService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ProgressService);
  });

  it('marks task completed and recalculates enrollment', async () => {
    prisma.task.findUnique.mockResolvedValue({
      id: 't1',
      module: { programId: 'p1' },
    });
    prisma.enrollment.findUnique.mockResolvedValue({
      id: 'e1',
      userId: 'u1',
      programId: 'p1',
      status: EnrollmentStatus.ACTIVE,
    });
    prisma.progress.upsert.mockResolvedValue({
      id: 'pr1',
      userId: 'u1',
      taskId: 't1',
      isCompleted: true,
    });
    prisma.task.count.mockResolvedValue(2);
    prisma.progress.count.mockResolvedValue(2);
    prisma.enrollment.update.mockResolvedValue({});

    const res = await service.markCompleted(user, 't1');
    expect(res.isCompleted).toBe(true);
    expect(prisma.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: EnrollmentStatus.COMPLETED },
      }),
    );
  });

  it('rejects completion when not enrolled', async () => {
    prisma.task.findUnique.mockResolvedValue({
      id: 't1',
      module: { programId: 'p1' },
    });
    prisma.enrollment.findUnique.mockResolvedValue(null);
    await expect(service.markCompleted(user, 't1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('calculates program progress with zero tasks safely', async () => {
    prisma.enrollment.findUnique.mockResolvedValue({
      id: 'e1',
      userId: 'u1',
      programId: 'p1',
      status: EnrollmentStatus.ACTIVE,
    });
    prisma.program.findUnique.mockResolvedValue({ id: 'p1', modules: [] });
    const res = await service.getProgramProgress(user, 'p1');
    expect(res.totalTasks).toBe(0);
    expect(res.completionPercentage).toBe(0);
  });

  it('calculates program completion percentage accurately', async () => {
    prisma.enrollment.findUnique.mockResolvedValue({
      id: 'e1',
      userId: 'u1',
      programId: 'p1',
      status: EnrollmentStatus.ACTIVE,
    });
    prisma.program.findUnique.mockResolvedValue({
      id: 'p1',
      modules: [
        {
          id: 'm1',
          title: 'M1',
          tasks: [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }],
        },
      ],
    });
    prisma.progress.findMany.mockResolvedValue([
      { taskId: 't1', isCompleted: true, completedAt: new Date() },
      { taskId: 't2', isCompleted: true, completedAt: new Date() },
      { taskId: 't3', isCompleted: false, completedAt: null },
    ]);
    const res: any = await service.getProgramProgress(user, 'p1');
    expect(res.totalTasks).toBe(4);
    expect(res.completedTasks).toBe(2);
    expect(res.completionPercentage).toBe(50);
  });

  it('throws for missing task', async () => {
    prisma.task.findUnique.mockResolvedValue(null);
    await expect(service.markCompleted(user, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
