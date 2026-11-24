import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, Role } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPaginationMeta,
  getSkipTake,
  PaginatedResponse,
} from '../common/utils/pagination.util';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  CreateEnrollmentDto,
  EnrollmentQueryDto,
  UpdateEnrollmentStatusDto,
} from './dto/enrollment.dto';

const ENROLLMENT_SORT_FIELDS = new Set(['enrolledAt', 'status']);

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async enroll(user: AuthenticatedUser, dto: CreateEnrollmentDto) {
    const program = await this.prisma.program.findUnique({
      where: { id: dto.programId },
    });
    if (!program) throw new NotFoundException('Program not found');
    if (!program.isActive) {
      throw new BadRequestException('Cannot enroll in an inactive program');
    }

    try {
      return await this.prisma.enrollment.create({
        data: {
          userId: user.userId,
          programId: dto.programId,
          status: EnrollmentStatus.ACTIVE,
        },
        include: { program: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Already enrolled in this program');
        }
        if (error.code === 'P2003') {
          throw new NotFoundException('Program not found');
        }
      }
      throw error;
    }
  }

  async findMine(user: AuthenticatedUser, query: EnrollmentQueryDto) {
    return this.findAllForUser(user.userId, query, false);
  }

  async findAll(
    user: AuthenticatedUser,
    query: EnrollmentQueryDto,
  ): Promise<PaginatedResponse<Prisma.EnrollmentGetPayload<object>>> {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Access denied');
    }
    const targetUserId = query.userId;
    return this.findAllForUser(targetUserId, query, true);
  }

  private async findAllForUser(
    userId: string | undefined,
    query: EnrollmentQueryDto,
    isAdmin: boolean,
  ): Promise<PaginatedResponse<Prisma.EnrollmentGetPayload<object>>> {
    const { page, limit, sortBy, sortOrder, programId, status } = query;
    const where: Prisma.EnrollmentWhereInput = {};
    if (userId) where.userId = userId;
    if (!isAdmin && !userId) {
      throw new BadRequestException('User context required');
    }
    if (programId) where.programId = programId;
    if (status) where.status = status;
    const orderField =
      sortBy && ENROLLMENT_SORT_FIELDS.has(sortBy) ? sortBy : 'enrolledAt';
    const [total, data] = await this.prisma.$transaction([
      this.prisma.enrollment.count({ where }),
      this.prisma.enrollment.findMany({
        where,
        orderBy: {
          [orderField]: sortOrder,
        },
        include: {
          program: {
            select: { id: true, title: true, slug: true, isActive: true },
          },
        },
        ...getSkipTake(page, limit),
      }),
    ]);
    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id },
      include: {
        program: {
          include: {
            modules: {
              orderBy: { order: 'asc' },
              include: { tasks: { orderBy: { order: 'asc' } } },
            },
          },
        },
      },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    if (user.role !== Role.ADMIN && enrollment.userId !== user.userId) {
      throw new ForbiddenException('Access denied');
    }
    return enrollment;
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    if (user.role !== Role.ADMIN && enrollment.userId !== user.userId) {
      throw new ForbiddenException('Access denied');
    }
    if (enrollment.status === EnrollmentStatus.CANCELLED) {
      return enrollment;
    }
    return this.prisma.enrollment.update({
      where: { id },
      data: { status: EnrollmentStatus.CANCELLED },
    });
  }

  async updateStatus(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateEnrollmentStatusDto,
  ) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Admin access required to modify enrollment status',
      );
    }
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    return this.prisma.enrollment.update({
      where: { id },
      data: { status: dto.status },
      include: {
        program: {
          select: { id: true, title: true, slug: true, isActive: true },
        },
      },
    });
  }

  async deletePermanent(user: AuthenticatedUser, id: string) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Admin access required to permanently delete enrollments',
      );
    }
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    await this.prisma.enrollment.delete({ where: { id } });
    return { deleted: true, id };
  }
}
