import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPaginationMeta,
  getSkipTake,
  PaginatedResponse,
} from '../common/utils/pagination.util';
import { CreateProgramDto } from './dto/create-program.dto';
import { ProgramQueryDto } from './dto/program-query.dto';
import { UpdateProgramDto } from './dto/update-program.dto';

const PROGRAM_SORT_FIELDS = new Set([
  'createdAt',
  'title',
  'slug',
  'updatedAt',
]);

@Injectable()
export class ProgramsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProgramDto) {
    try {
      return await this.prisma.program.create({ data: dto });
    } catch (error) {
      this.handlePrisma(error);
      throw error;
    }
  }

  async findAll(
    query: ProgramQueryDto,
  ): Promise<PaginatedResponse<Prisma.ProgramGetPayload<object>>> {
    const { page, limit, search, sortBy, sortOrder } = query;
    const where: Prisma.ProgramWhereInput = {};
    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }
    const orderField =
      sortBy && PROGRAM_SORT_FIELDS.has(sortBy) ? sortBy : 'createdAt';
    const [total, data] = await this.prisma.$transaction([
      this.prisma.program.count({ where }),
      this.prisma.program.findMany({
        where,
        orderBy: {
          [orderField]: sortOrder,
        },
        ...getSkipTake(page, limit),
      }),
    ]);
    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(idOrSlug: string) {
    const program = await this.prisma.program.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        modules: {
          orderBy: { order: 'asc' },
          include: {
            tasks: { orderBy: { order: 'asc' } },
          },
        },
      },
    });
    if (!program) throw new NotFoundException('Program not found');
    return program;
  }

  async update(id: string, dto: UpdateProgramDto) {
    await this.ensureExists(id);
    try {
      return await this.prisma.program.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      this.handlePrisma(error);
      throw error;
    }
  }

  async remove(id: string) {
    await this.ensureExists(id);
    const activeEnrollments = await this.prisma.enrollment.count({
      where: { programId: id, status: EnrollmentStatus.ACTIVE },
    });
    if (activeEnrollments > 0) {
      throw new ConflictException(
        `Cannot delete program with ${activeEnrollments} active enrollment(s). Cancel or complete them first, or deactivate the program.`,
      );
    }
    await this.prisma.program.delete({ where: { id } });
    return { deleted: true, id };
  }

  async ensureExists(id: string) {
    const exists = await this.prisma.program.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Program not found');
    return exists;
  }

  private handlePrisma(error: unknown): never | void {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('Program with this slug already exists');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Program not found');
      }
    }
  }
}
