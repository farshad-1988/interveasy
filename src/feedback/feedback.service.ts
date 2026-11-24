import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Feedback,
  FeedbackCategory,
  Prisma,
  Role,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  buildPaginationMeta,
  getSkipTake,
  PaginatedResponse,
} from '../common/utils/pagination.util';
import {
  AdminFeedbackQueryDto,
  CreateFeedbackDto,
  FeedbackAnalyticsQueryDto,
  FeedbackQueryDto,
  UpdateFeedbackDto,
} from './dto/feedback.dto';

export interface PerformanceStats {
  averageScore: number;
  totalFeedback: number;
  minScore: number;
  maxScore: number;
}

export interface CategoryPerformance extends PerformanceStats {
  category: FeedbackCategory;
}

export interface UserPerformanceReport {
  overall: PerformanceStats;
  byCategory: CategoryPerformance[];
}

export interface TrendDataPoint {
  period: string;
  count: number;
  avgScore: number;
}

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async createFeedback(
    user: AuthenticatedUser,
    interviewId: string,
    dto: CreateFeedbackDto,
  ): Promise<Feedback> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      select: { id: true, userId: true, interviewerId: true, status: true },
    });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    const isCandidate = user.userId === interview.userId;
    const isInterviewer = user.userId === interview.interviewerId;
    const isAdmin = user.role === Role.ADMIN;

    if (!isCandidate && !isInterviewer && !isAdmin) {
      throw new ForbiddenException(
        'Only interview participants can submit feedback',
      );
    }

    // Ensure subject is a valid participant of this interview
    const isValidSubject =
      dto.subjectId === interview.userId ||
      dto.subjectId === interview.interviewerId;

    if (!isValidSubject) {
      throw new BadRequestException(
        'Feedback subject must be a participant in this interview',
      );
    }

    // Prevent self-feedback
    if (user.userId === dto.subjectId) {
      throw new BadRequestException('Self-feedback is not permitted');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Enforce duplicate policy: 1 feedback per author + interview + category
        const existing = await tx.feedback.findUnique({
          where: {
            authorId_interviewId_category: {
              authorId: user.userId,
              interviewId,
              category: dto.category,
            },
          },
          select: { id: true },
        });

        if (existing) {
          throw new ConflictException(
            `Feedback for category ${dto.category} has already been submitted for this interview`,
          );
        }

        return await tx.feedback.create({
          data: {
            authorId: user.userId,
            subjectId: dto.subjectId,
            interviewId,
            category: dto.category,
            score: dto.score,
            comment: dto.comment,
          },
          include: {
            author: { select: { id: true, name: true, email: true } },
            subject: { select: { id: true, name: true, email: true } },
            interview: { select: { id: true, title: true, startAt: true } },
          },
        });
      });
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Feedback for category ${dto.category} has already been submitted for this interview`,
        );
      }
      throw error;
    }
  }

  async getInterviewFeedback(
    user: AuthenticatedUser,
    interviewId: string,
  ): Promise<Feedback[]> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      select: { id: true, userId: true, interviewerId: true },
    });
    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    const isParticipant =
      user.userId === interview.userId ||
      user.userId === interview.interviewerId;
    if (!isParticipant && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Access denied to this interview feedback');
    }

    return this.prisma.feedback.findMany({
      where: { interviewId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, name: true, email: true } },
        subject: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async getAllFeedback(
    query: AdminFeedbackQueryDto,
  ): Promise<PaginatedResponse<Feedback>> {
    const { skip, take } = getSkipTake(query.page, query.limit);
    const where: Prisma.FeedbackWhereInput = {
      ...(query.authorId ? { authorId: query.authorId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.interviewId ? { interviewId: query.interviewId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const orderBy = { [sortBy]: sortOrder };

    const [total, data] = await Promise.all([
      this.prisma.feedback.count({ where }),
      this.prisma.feedback.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          author: { select: { id: true, name: true, email: true } },
          subject: { select: { id: true, name: true, email: true } },
          interview: {
            select: { id: true, title: true, startAt: true, endAt: true },
          },
        },
      }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  }

  async getFeedbackById(
    user: AuthenticatedUser,
    id: string,
  ): Promise<Feedback> {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, email: true } },
        subject: { select: { id: true, name: true, email: true } },
        interview: {
          select: { id: true, title: true, startAt: true, endAt: true },
        },
      },
    });
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    const isParty =
      feedback.authorId === user.userId || feedback.subjectId === user.userId;
    if (!isParty && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Access denied to this feedback');
    }

    return feedback;
  }

  async updateFeedback(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateFeedbackDto,
  ): Promise<Feedback> {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id },
    });
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    if (feedback.authorId !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Only the author or admin can update feedback',
      );
    }

    return this.prisma.feedback.update({
      where: { id },
      data: {
        ...(dto.score !== undefined ? { score: dto.score } : {}),
        ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        subject: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async deleteFeedback(
    user: AuthenticatedUser,
    id: string,
  ): Promise<{ deleted: boolean; id: string }> {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id },
    });
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    if (feedback.authorId !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Only the author or admin can delete feedback',
      );
    }

    await this.prisma.feedback.delete({ where: { id } });
    return { deleted: true, id };
  }

  async getMyFeedback(
    user: AuthenticatedUser,
    query: FeedbackQueryDto,
  ): Promise<PaginatedResponse<Feedback>> {
    const { skip, take } = getSkipTake(query.page, query.limit);

    const where: Prisma.FeedbackWhereInput = {
      subjectId: user.userId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const orderBy = { [sortBy]: sortOrder };

    const [total, data] = await Promise.all([
      this.prisma.feedback.count({ where }),
      this.prisma.feedback.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          author: { select: { id: true, name: true, email: true } },
          interview: {
            select: { id: true, title: true, startAt: true, endAt: true },
          },
        },
      }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  }

  async getMyPerformance(
    user: AuthenticatedUser,
  ): Promise<UserPerformanceReport> {
    const where: Prisma.FeedbackWhereInput = { subjectId: user.userId };

    const [overallAgg, categoryAgg] = await Promise.all([
      this.prisma.feedback.aggregate({
        where,
        _avg: { score: true },
        _count: { id: true },
        _min: { score: true },
        _max: { score: true },
      }),
      this.prisma.feedback.groupBy({
        by: ['category'],
        where,
        _avg: { score: true },
        _count: { id: true },
        _min: { score: true },
        _max: { score: true },
      }),
    ]);

    const totalFeedback = overallAgg._count.id;
    const averageScore = overallAgg._avg.score
      ? Number(overallAgg._avg.score.toFixed(2))
      : 0;
    const minScore = overallAgg._min.score ?? 0;
    const maxScore = overallAgg._max.score ?? 0;

    const byCategory: CategoryPerformance[] = categoryAgg.map((cat) => ({
      category: cat.category,
      totalFeedback: cat._count.id,
      averageScore: cat._avg.score ? Number(cat._avg.score.toFixed(2)) : 0,
      minScore: cat._min.score ?? 0,
      maxScore: cat._max.score ?? 0,
    }));

    return {
      overall: {
        averageScore,
        totalFeedback,
        minScore,
        maxScore,
      },
      byCategory,
    };
  }

  async getFeedbackByCategory(
    query: FeedbackAnalyticsQueryDto,
  ): Promise<CategoryPerformance[]> {
    const where: Prisma.FeedbackWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const grouped = await this.prisma.feedback.groupBy({
      by: ['category'],
      where,
      _avg: { score: true },
      _count: { id: true },
      _min: { score: true },
      _max: { score: true },
    });

    return grouped.map((item) => ({
      category: item.category,
      totalFeedback: item._count.id,
      averageScore: item._avg.score ? Number(item._avg.score.toFixed(2)) : 0,
      minScore: item._min.score ?? 0,
      maxScore: item._max.score ?? 0,
    }));
  }

  async getAverageScores(query: FeedbackAnalyticsQueryDto) {
    const where: Prisma.FeedbackWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [overall, byCategory] = await Promise.all([
      this.prisma.feedback.aggregate({
        where,
        _avg: { score: true },
        _count: { id: true },
        _min: { score: true },
        _max: { score: true },
      }),
      this.getFeedbackByCategory(query),
    ]);

    return {
      overall: {
        averageScore: overall._avg.score
          ? Number(overall._avg.score.toFixed(2))
          : 0,
        totalFeedback: overall._count.id,
        minScore: overall._min.score ?? 0,
        maxScore: overall._max.score ?? 0,
      },
      byCategory,
    };
  }

  async getTrends(query: FeedbackAnalyticsQueryDto): Promise<TrendDataPoint[]> {
    const fromDate = query.from ? new Date(query.from) : null;
    const toDate = query.to ? new Date(query.to) : null;

    try {
      const rawTrends = await this.prisma.$queryRaw<
        Array<{
          period: Date | string;
          count: number | bigint;
          avgScore: number | string;
        }>
      >`
        SELECT
          DATE_TRUNC('month', "createdAt")::text AS period,
          COUNT(id)::int AS count,
          ROUND(AVG(score)::numeric, 2)::float AS "avgScore"
        FROM "Feedback"
        WHERE (${fromDate}::timestamp IS NULL OR "createdAt" >= ${fromDate}::timestamp)
          AND (${toDate}::timestamp IS NULL OR "createdAt" <= ${toDate}::timestamp)
          AND (${query.category ?? null}::"FeedbackCategory" IS NULL OR "category" = ${query.category ?? null}::"FeedbackCategory")
        GROUP BY DATE_TRUNC('month', "createdAt")
        ORDER BY period ASC;
      `;

      return rawTrends.map((t) => ({
        period:
          typeof t.period === 'string'
            ? t.period
            : new Date(t.period).toISOString(),
        count: Number(t.count),
        avgScore: Number(t.avgScore),
      }));
    } catch {
      // Fallback for in-memory / non-PostgreSQL testing mocks
      const records = await this.prisma.feedback.findMany({
        where: {
          ...(query.category ? { category: query.category } : {}),
          ...(fromDate || toDate
            ? {
                createdAt: {
                  ...(fromDate ? { gte: fromDate } : {}),
                  ...(toDate ? { lte: toDate } : {}),
                },
              }
            : {}),
        },
        select: { createdAt: true, score: true },
        orderBy: { createdAt: 'asc' },
      });

      const grouped = new Map<string, { count: number; sum: number }>();
      for (const r of records) {
        const key = r.createdAt.toISOString().slice(0, 7) + '-01';
        const curr = grouped.get(key) ?? { count: 0, sum: 0 };
        curr.count += 1;
        curr.sum += r.score;
        grouped.set(key, curr);
      }

      return Array.from(grouped.entries()).map(([period, data]) => ({
        period,
        count: data.count,
        avgScore: Number((data.sum / data.count).toFixed(2)),
      }));
    }
  }
}
