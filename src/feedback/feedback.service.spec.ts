import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FeedbackCategory, Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { FeedbackService } from './feedback.service';

describe('FeedbackService', () => {
  let service: FeedbackService;
  const prisma: Record<string, any> = {
    interview: {
      findUnique: jest.fn(),
    },
    feedback: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };

  const candidate = {
    userId: 'u-cand',
    email: 'c@test.com',
    role: Role.USER,
    sessionId: 's1',
  };

  const interviewer = {
    userId: 'u-int',
    email: 'i@test.com',
    role: Role.USER,
    sessionId: 's2',
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
        FeedbackService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = mod.get(FeedbackService);
  });

  describe('createFeedback', () => {
    it('creates feedback when interviewer evaluates candidate', async () => {
      prisma.interview.findUnique.mockResolvedValue({
        id: 'i1',
        userId: 'u-cand',
        interviewerId: 'u-int',
        status: 'COMPLETED',
      });
      prisma.feedback.findUnique.mockResolvedValue(null);
      prisma.feedback.create.mockResolvedValue({
        id: 'f1',
        authorId: 'u-int',
        subjectId: 'u-cand',
        category: FeedbackCategory.TECHNICAL,
        score: 5,
        comment: 'Excellent understanding',
      });

      const res = await service.createFeedback(interviewer, 'i1', {
        subjectId: 'u-cand',
        category: FeedbackCategory.TECHNICAL,
        score: 5,
        comment: 'Excellent understanding',
      });

      expect(res.id).toBe('f1');
      expect(prisma.feedback.create).toHaveBeenCalled();
    });

    it('rejects feedback with 404 if interview does not exist', async () => {
      prisma.interview.findUnique.mockResolvedValue(null);

      await expect(
        service.createFeedback(interviewer, 'non-existent', {
          subjectId: 'u-cand',
          category: FeedbackCategory.TECHNICAL,
          score: 4,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects non-participant with 403 Forbidden', async () => {
      prisma.interview.findUnique.mockResolvedValue({
        id: 'i1',
        userId: 'u-cand',
        interviewerId: 'u-int',
      });

      const bystander = {
        userId: 'u-other',
        email: 'other@test.com',
        role: Role.USER,
        sessionId: 's4',
      };

      await expect(
        service.createFeedback(bystander, 'i1', {
          subjectId: 'u-cand',
          category: FeedbackCategory.TECHNICAL,
          score: 3,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects self-feedback with 400 BadRequest', async () => {
      prisma.interview.findUnique.mockResolvedValue({
        id: 'i1',
        userId: 'u-cand',
        interviewerId: 'u-int',
      });

      await expect(
        service.createFeedback(candidate, 'i1', {
          subjectId: 'u-cand', // Self
          category: FeedbackCategory.COMMUNICATION,
          score: 5,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects evaluation of an outsider subject with 400 BadRequest', async () => {
      prisma.interview.findUnique.mockResolvedValue({
        id: 'i1',
        userId: 'u-cand',
        interviewerId: 'u-int',
      });

      await expect(
        service.createFeedback(interviewer, 'i1', {
          subjectId: 'u-stranger',
          category: FeedbackCategory.PROBLEM_SOLVING,
          score: 4,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate feedback for the same category with 409 Conflict', async () => {
      prisma.interview.findUnique.mockResolvedValue({
        id: 'i1',
        userId: 'u-cand',
        interviewerId: 'u-int',
      });
      prisma.feedback.findUnique.mockResolvedValue({ id: 'existing-f' });

      await expect(
        service.createFeedback(interviewer, 'i1', {
          subjectId: 'u-cand',
          category: FeedbackCategory.TECHNICAL,
          score: 4,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('getMyFeedback', () => {
    it('returns paginated feedback for current user', async () => {
      prisma.feedback.count.mockResolvedValue(1);
      prisma.feedback.findMany.mockResolvedValue([
        {
          id: 'f1',
          subjectId: 'u-cand',
          score: 4,
          category: FeedbackCategory.COMMUNICATION,
        },
      ]);

      const res = await service.getMyFeedback(candidate, {
        page: 1,
        limit: 10,
        sortOrder: 'desc',
      });

      expect(res.data).toHaveLength(1);
      expect(res.meta.total).toBe(1);
      expect(res.meta.page).toBe(1);
    });
  });

  describe('getMyPerformance', () => {
    it('returns calculated performance statistics', async () => {
      prisma.feedback.aggregate.mockResolvedValue({
        _count: { id: 2 },
        _avg: { score: 4.5 },
        _min: { score: 4 },
        _max: { score: 5 },
      });
      prisma.feedback.groupBy.mockResolvedValue([
        {
          category: FeedbackCategory.TECHNICAL,
          _count: { id: 1 },
          _avg: { score: 5.0 },
          _min: { score: 5 },
          _max: { score: 5 },
        },
        {
          category: FeedbackCategory.COMMUNICATION,
          _count: { id: 1 },
          _avg: { score: 4.0 },
          _min: { score: 4 },
          _max: { score: 4 },
        },
      ]);

      const res = await service.getMyPerformance(candidate);

      expect(res.overall.averageScore).toBe(4.5);
      expect(res.overall.totalFeedback).toBe(2);
      expect(res.byCategory).toHaveLength(2);
      expect(res.byCategory[0].category).toBe(FeedbackCategory.TECHNICAL);
      expect(res.byCategory[0].averageScore).toBe(5.0);
    });

    it('returns zeroed metrics when user has no feedback', async () => {
      prisma.feedback.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _avg: { score: null },
        _min: { score: null },
        _max: { score: null },
      });
      prisma.feedback.groupBy.mockResolvedValue([]);

      const res = await service.getMyPerformance(candidate);

      expect(res.overall.averageScore).toBe(0);
      expect(res.overall.totalFeedback).toBe(0);
      expect(res.overall.minScore).toBe(0);
      expect(res.byCategory).toEqual([]);
    });
  });

  describe('Admin Analytics', () => {
    it('aggregates feedback by category', async () => {
      prisma.feedback.groupBy.mockResolvedValue([
        {
          category: FeedbackCategory.OVERALL,
          _count: { id: 10 },
          _avg: { score: 4.2 },
          _min: { score: 2 },
          _max: { score: 5 },
        },
      ]);

      const res = await service.getFeedbackByCategory({});
      expect(res).toHaveLength(1);
      expect(res[0].averageScore).toBe(4.2);
    });

    it('retrieves average scores breakdown', async () => {
      prisma.feedback.aggregate.mockResolvedValue({
        _count: { id: 15 },
        _avg: { score: 4.1 },
        _min: { score: 1 },
        _max: { score: 5 },
      });
      prisma.feedback.groupBy.mockResolvedValue([]);

      const res = await service.getAverageScores({});
      expect(res.overall.totalFeedback).toBe(15);
      expect(res.overall.averageScore).toBe(4.1);
    });

    it('returns trends via raw SQL or fallback', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { period: '2026-11-01', count: 5, avgScore: 4.2 },
      ]);

      const res = await service.getTrends({});
      expect(res).toHaveLength(1);
      expect(res[0].count).toBe(5);
      expect(res[0].avgScore).toBe(4.2);
    });
  });

  describe('CRUD operations for Feedback', () => {
    it('getInterviewFeedback returns feedback for participants', async () => {
      prisma.interview.findUnique.mockResolvedValue({
        id: 'i1',
        userId: 'u-cand',
        interviewerId: 'u-int',
      });
      prisma.feedback.findMany.mockResolvedValue([{ id: 'f1', score: 4 }]);

      const res = await service.getInterviewFeedback(candidate, 'i1');
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('f1');
    });

    it('getAllFeedback returns paginated feedback for admin', async () => {
      prisma.feedback.count.mockResolvedValue(1);
      prisma.feedback.findMany.mockResolvedValue([{ id: 'f1' }]);

      const res = await service.getAllFeedback({});
      expect(res.data).toHaveLength(1);
      expect(res.meta.total).toBe(1);
    });

    it('getFeedbackById returns feedback for author or subject', async () => {
      prisma.feedback.findUnique.mockResolvedValue({
        id: 'f1',
        authorId: 'u-cand',
        subjectId: 'u-int',
      });

      const res = await service.getFeedbackById(candidate, 'f1');
      expect(res.id).toBe('f1');
    });

    it('updateFeedback allows author to update score and comment', async () => {
      prisma.feedback.findUnique.mockResolvedValue({
        id: 'f1',
        authorId: 'u-cand',
      });
      prisma.feedback.update.mockResolvedValue({
        id: 'f1',
        score: 5,
        comment: 'Updated',
      });

      const res = await service.updateFeedback(candidate, 'f1', {
        score: 5,
        comment: 'Updated',
      });
      expect(res.score).toBe(5);
    });

    it('deleteFeedback allows author or admin to delete feedback', async () => {
      prisma.feedback.findUnique.mockResolvedValue({
        id: 'f1',
        authorId: 'u-cand',
      });
      prisma.feedback.delete.mockResolvedValue({ id: 'f1' });

      const res = await service.deleteFeedback(candidate, 'f1');
      expect(res).toEqual({ deleted: true, id: 'f1' });
    });
  });
});
