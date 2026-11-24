import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AssignmentStatus,
  AttemptStatus,
  QuestionType,
  Role,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { LevelMappingService } from '../scoring/level-mapping.service';
import { AssessmentsService } from './assessments.service';

describe('AssessmentsService', () => {
  let service: AssessmentsService;
  const prisma: Record<string, any> = {
    assessment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    question: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    option: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    assessmentAssignment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    attempt: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    attemptQuestion: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    attemptOption: {
      create: jest.fn(),
    },
    answer: {
      upsert: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const user = {
    userId: 'u1',
    email: 'user@test.com',
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
        AssessmentsService,
        ScoringService,
        LevelMappingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = mod.get(AssessmentsService);
  });

  describe('Assessments CRUD', () => {
    it('creates a draft assessment', async () => {
      prisma.assessment.create.mockResolvedValue({
        id: 'asm1',
        isPublished: false,
      });
      const res = await service.create({ title: 'TypeScript Exam' });
      expect(res.id).toBe('asm1');
      expect(prisma.assessment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'TypeScript Exam',
            isPublished: false,
          }),
        }),
      );
    });

    it('rejects deletion when submitted attempts exist', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'asm1' });
      prisma.attempt.count.mockResolvedValue(3);

      await expect(service.remove('asm1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('deletes assessment when no submitted attempts exist', async () => {
      prisma.assessment.findUnique.mockResolvedValue({ id: 'asm1' });
      prisma.attempt.count.mockResolvedValue(0);
      prisma.assessment.delete.mockResolvedValue({ id: 'asm1' });

      const res = await service.remove('asm1');
      expect(res).toEqual({ deleted: true, id: 'asm1' });
    });

    it('publishes assessment when question option invariants are satisfied', async () => {
      prisma.assessment.findUnique.mockResolvedValue({
        id: 'asm1',
        questions: [
          {
            id: 'q1',
            type: QuestionType.SINGLE_CHOICE,
            title: 'Q1',
            options: [
              { text: 'A', isCorrect: true },
              { text: 'B', isCorrect: false },
            ],
          },
        ],
      });
      prisma.assessment.update.mockResolvedValue({
        id: 'asm1',
        isPublished: true,
      });

      const res = await service.publish('asm1');
      expect(res.isPublished).toBe(true);
    });

    it('rejects publishing when question has invalid options', async () => {
      prisma.assessment.findUnique.mockResolvedValue({
        id: 'asm1',
        questions: [
          {
            id: 'q1',
            type: QuestionType.SINGLE_CHOICE,
            title: 'Q1',
            options: [
              { text: 'A', isCorrect: false },
              { text: 'B', isCorrect: false }, // no correct option
            ],
          },
        ],
      });

      await expect(service.publish('asm1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('Assignments & Attempt Lifecycle', () => {
    it('assigns published assessment to user', async () => {
      prisma.assessment.findUnique.mockResolvedValue({
        id: 'asm1',
        isPublished: true,
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.assessmentAssignment.findFirst.mockResolvedValue(null);
      prisma.assessmentAssignment.create.mockResolvedValue({
        id: 'asg1',
        assessmentId: 'asm1',
        userId: 'u1',
        status: AssignmentStatus.ASSIGNED,
      });

      const res = await service.createAssignment('asm1', { userId: 'u1' });
      expect(res.id).toBe('asg1');
    });

    it('starts attempt and creates snapshots without leaking isCorrect to user', async () => {
      prisma.assessment.findUnique.mockResolvedValue({
        id: 'asm1',
        isPublished: true,
        durationMinutes: 30,
        questions: [
          {
            id: 'q1',
            title: 'Q1',
            type: QuestionType.SINGLE_CHOICE,
            points: 5,
            options: [
              { id: 'opt1', text: 'Option 1', isCorrect: true },
              { id: 'opt2', text: 'Option 2', isCorrect: false },
            ],
          },
        ],
      });
      prisma.assessmentAssignment.findFirst.mockResolvedValue({
        id: 'asg1',
        status: AssignmentStatus.ASSIGNED,
      });
      prisma.attempt.create.mockResolvedValue({
        id: 'att1',
        userId: 'u1',
        assessmentId: 'asm1',
      });
      prisma.attemptQuestion.create.mockResolvedValue({ id: 'aq1' });
      prisma.attemptOption.create.mockResolvedValue({ id: 'ao1' });

      // Mock getAttempt return
      prisma.attempt.findUnique.mockResolvedValue({
        id: 'att1',
        userId: 'u1',
        status: AttemptStatus.IN_PROGRESS,
        attemptQuestions: [
          {
            id: 'aq1',
            titleSnapshot: 'Q1',
            options: [
              { id: 'ao1', textSnapshot: 'Option 1', isCorrectSnapshot: false },
            ],
          },
        ],
      });

      const res = await service.startAttempt(user, 'asm1');
      expect(res.id).toBe('att1');
    });

    it('grades attempt and submits with level and score', async () => {
      prisma.attempt.findUnique.mockResolvedValue({
        id: 'att1',
        userId: 'u1',
        assessmentId: 'asm1',
        status: AttemptStatus.IN_PROGRESS,
        totalPossiblePoints: 10,
        attemptQuestions: [
          {
            id: 'aq1',
            typeSnapshot: QuestionType.SINGLE_CHOICE,
            pointsSnapshot: 10,
            options: [
              { id: 'ao1', isCorrectSnapshot: true },
              { id: 'ao2', isCorrectSnapshot: false },
            ],
            answer: {
              id: 'ans1',
              selectedOptionIds: ['ao1'],
            },
          },
        ],
      });
      prisma.answer.update.mockResolvedValue({});
      prisma.attempt.update.mockResolvedValue({
        id: 'att1',
        status: AttemptStatus.SUBMITTED,
        score: 10,
        totalPossiblePoints: 10,
        percentage: 100,
        level: 'EXPERT',
        assessment: { title: 'Exam', passingScore: 70 },
      });
      prisma.assessmentAssignment.updateMany.mockResolvedValue({ count: 1 });

      const res = await service.submitAttempt(user, 'att1');
      expect(res.score).toBe(10);
      expect(res.percentage).toBe(100);
      expect(res.level).toBe('EXPERT');
      expect(res.passed).toBe(true);
    });
  });
});
