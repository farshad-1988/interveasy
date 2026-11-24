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
import { CreateTaskDto, TaskQueryDto, UpdateTaskDto } from './dto/task.dto';

const TASK_SORT_FIELDS = new Set(['createdAt', 'title', 'order', 'updatedAt']);

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTaskDto) {
    await this.ensureModuleExists(dto.moduleId);
    try {
      return await this.prisma.task.create({
        data: dto,
      });
    } catch (error) {
      this.handlePrisma(error);
      throw error;
    }
  }

  async findAll(
    query: TaskQueryDto,
  ): Promise<PaginatedResponse<Prisma.TaskGetPayload<object>>> {
    const { page, limit, search, sortBy, sortOrder, moduleId } = query;
    const where: Prisma.TaskWhereInput = {};
    if (moduleId) where.moduleId = moduleId;
    if (search) where.title = { contains: search, mode: 'insensitive' };
    const orderField =
      sortBy && TASK_SORT_FIELDS.has(sortBy) ? sortBy : 'order';
    const [total, data] = await this.prisma.$transaction([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        orderBy: {
          [orderField]: sortOrder,
        },
        ...getSkipTake(page, limit),
      }),
    ]);
    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async findByModule(moduleId: string) {
    await this.ensureModuleExists(moduleId);
    return this.prisma.task.findMany({
      where: { moduleId },
      orderBy: { order: 'asc' },
    });
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { module: { select: { id: true, programId: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async update(id: string, dto: UpdateTaskDto) {
    await this.ensureExists(id);
    try {
      return await this.prisma.task.update({
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
      where: { taskId: id },
    });
    if (progressCount > 0) {
      throw new ConflictException(
        `Cannot delete task: ${progressCount} user progress record(s) depend on this task. Reset progress first.`,
      );
    }
    await this.prisma.task.delete({ where: { id } });
    return { deleted: true, id };
  }

  private async ensureExists(id: string) {
    const t = await this.prisma.task.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Task not found');
    return t;
  }

  private async ensureModuleExists(moduleId: string) {
    const m = await this.prisma.module.findUnique({ where: { id: moduleId } });
    if (!m) throw new NotFoundException('Module not found');
  }

  private handlePrisma(error: unknown): never | void {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') throw new NotFoundException('Task not found');
    }
  }
}
