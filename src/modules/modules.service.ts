import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPaginationMeta,
  getSkipTake,
  PaginatedResponse,
} from '../common/utils/pagination.util';
import {
  CreateModuleDto,
  ModuleQueryDto,
  UpdateModuleDto,
} from './dto/module.dto';

const MODULE_SORT_FIELDS = new Set([
  'createdAt',
  'title',
  'order',
  'updatedAt',
]);

@Injectable()
export class ModulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateModuleDto) {
    await this.ensureProgramExists(dto.programId);
    try {
      return await this.prisma.module.create({
        data: dto,
      });
    } catch (error) {
      this.handlePrisma(error);
      throw error;
    }
  }

  async findAll(
    query: ModuleQueryDto,
  ): Promise<PaginatedResponse<Prisma.ModuleGetPayload<object>>> {
    const { page, limit, search, sortBy, sortOrder, programId } = query;
    const where: Prisma.ModuleWhereInput = {};
    if (programId) where.programId = programId;
    if (search) where.title = { contains: search, mode: 'insensitive' };
    const orderField =
      sortBy && MODULE_SORT_FIELDS.has(sortBy) ? sortBy : 'order';
    const [total, data] = await this.prisma.$transaction([
      this.prisma.module.count({ where }),
      this.prisma.module.findMany({
        where,
        orderBy: {
          [orderField]: sortOrder,
        },
        ...getSkipTake(page, limit),
      }),
    ]);
    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async findByProgram(programId: string) {
    await this.ensureProgramExists(programId);
    return this.prisma.module.findMany({
      where: { programId },
      orderBy: { order: 'asc' },
      include: { tasks: { orderBy: { order: 'asc' } } },
    });
  }

  async findOne(id: string) {
    const mod = await this.prisma.module.findUnique({
      where: { id },
      include: { tasks: { orderBy: { order: 'asc' } } },
    });
    if (!mod) throw new NotFoundException('Module not found');
    return mod;
  }

  async update(id: string, dto: UpdateModuleDto) {
    await this.ensureExists(id);
    try {
      return await this.prisma.module.update({
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
    const progressCount = await this.prisma.progress.count({
      where: { task: { moduleId: id } },
    });
    if (progressCount > 0) {
      throw new ConflictException(
        `Cannot delete module: ${progressCount} user progress record(s) depend on tasks in this module.`,
      );
    }
    await this.prisma.module.delete({ where: { id } });
    return { deleted: true, id };
  }

  private async ensureExists(id: string) {
    const m = await this.prisma.module.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Module not found');
    return m;
  }

  private async ensureProgramExists(programId: string) {
    const p = await this.prisma.program.findUnique({
      where: { id: programId },
    });
    if (!p) throw new NotFoundException('Program not found');
  }

  private handlePrisma(error: unknown): never | void {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025')
        throw new NotFoundException('Module not found');
    }
  }
}
