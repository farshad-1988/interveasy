import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, Role } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/auth.types';

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async markCompleted(user: AuthenticatedUser, taskId: string) {
    return this.setCompletion(user, taskId, true);
  }

  async markIncomplete(user: AuthenticatedUser, taskId: string) {
    return this.setCompletion(user, taskId, false);
  }

  private async setCompletion(
    user: AuthenticatedUser,
    taskId: string,
    isCompleted: boolean,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { module: { select: { programId: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_programId: {
          userId: user.userId,
          programId: task.module.programId,
        },
      },
    });
    if (!enrollment) {
      throw new ForbiddenException('Not enrolled in this program');
    }
    if (enrollment.status === EnrollmentStatus.CANCELLED) {
      throw new BadRequestException('Enrollment is cancelled');
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const progress = await tx.progress.upsert({
        where: { userId_taskId: { userId: user.userId, taskId } },
        update: {
          isCompleted,
          completedAt: isCompleted ? now : null,
        },
        create: {
          userId: user.userId,
          taskId,
          isCompleted,
          completedAt: isCompleted ? now : null,
        },
      });

      await this.recalculateEnrollmentStatus(
        tx,
        user.userId,
        task.module.programId,
        enrollment.status,
      );

      return progress;
    });

    return result;
  }

  async getProgramProgress(user: AuthenticatedUser, programId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_programId: { userId: user.userId, programId } },
    });
    if (!enrollment && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Not enrolled in this program');
    }

    const program = await this.prisma.program.findUnique({
      where: { id: programId },
      include: {
        modules: {
          orderBy: { order: 'asc' },
          include: { tasks: { orderBy: { order: 'asc' } } },
        },
      },
    });
    if (!program) throw new NotFoundException('Program not found');

    const taskIds = program.modules.flatMap((m) => m.tasks.map((t) => t.id));
    const totalTasks = taskIds.length;
    const progressRecords =
      totalTasks === 0
        ? []
        : await this.prisma.progress.findMany({
            where: { userId: user.userId, taskId: { in: taskIds } },
          });
    const completedSet = new Set(
      progressRecords.filter((p) => p.isCompleted).map((p) => p.taskId),
    );
    const completedTasks = completedSet.size;
    const completionPercentage =
      totalTasks === 0
        ? 0
        : Math.round((completedTasks / totalTasks) * 10000) / 100;

    const modules = program.modules.map((m) => {
      const mTaskIds = m.tasks.map((t) => t.id);
      const mCompleted = mTaskIds.filter((id) => completedSet.has(id)).length;
      const mTotal = mTaskIds.length;
      return {
        moduleId: m.id,
        title: m.title,
        totalTasks: mTotal,
        completedTasks: mCompleted,
        completionPercentage:
          mTotal === 0 ? 0 : Math.round((mCompleted / mTotal) * 10000) / 100,
        tasks: m.tasks.map((t) => ({
          ...t,
          isCompleted: completedSet.has(t.id),
          completedAt:
            progressRecords.find((p) => p.taskId === t.id)?.completedAt ?? null,
        })),
      };
    });

    return {
      programId,
      totalTasks,
      completedTasks,
      incompleteTasks: totalTasks - completedTasks,
      completionPercentage,
      modules,
    };
  }

  async getModuleProgress(user: AuthenticatedUser, moduleId: string) {
    const mod = await this.prisma.module.findUnique({
      where: { id: moduleId },
      include: {
        tasks: { orderBy: { order: 'asc' } },
        program: { select: { id: true } },
      },
    });
    if (!mod) throw new NotFoundException('Module not found');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_programId: { userId: user.userId, programId: mod.programId },
      },
    });
    if (!enrollment && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Not enrolled in this program');
    }

    const taskIds = mod.tasks.map((t) => t.id);
    const progressRecords =
      taskIds.length === 0
        ? []
        : await this.prisma.progress.findMany({
            where: { userId: user.userId, taskId: { in: taskIds } },
          });
    const completedSet = new Set(
      progressRecords.filter((p) => p.isCompleted).map((p) => p.taskId),
    );
    const totalTasks = taskIds.length;
    const completedTasks = completedSet.size;
    return {
      moduleId,
      programId: mod.programId,
      totalTasks,
      completedTasks,
      incompleteTasks: totalTasks - completedTasks,
      completionPercentage:
        totalTasks === 0
          ? 0
          : Math.round((completedTasks / totalTasks) * 10000) / 100,
      tasks: mod.tasks.map((t) => ({
        ...t,
        isCompleted: completedSet.has(t.id),
        completedAt:
          progressRecords.find((p) => p.taskId === t.id)?.completedAt ?? null,
      })),
    };
  }

  async getMyProgress(
    user: AuthenticatedUser,
    query?: { programId?: string },
  ): Promise<unknown> {
    if (query?.programId) {
      return this.getProgramProgress(user, query.programId);
    }
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: user.userId },
      select: { programId: true },
    });
    return Promise.all(
      enrollments.map((e) => this.getProgramProgress(user, e.programId)),
    );
  }

  async resetTaskProgress(user: AuthenticatedUser, taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { module: { select: { programId: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_programId: {
          userId: user.userId,
          programId: task.module.programId,
        },
      },
    });
    if (!enrollment && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Not enrolled in this program');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.progress.deleteMany({
        where: { userId: user.userId, taskId },
      });
      if (enrollment) {
        await this.recalculateEnrollmentStatus(
          tx,
          user.userId,
          task.module.programId,
          enrollment.status,
        );
      }
    });

    return { deleted: true, taskId };
  }

  async resetProgramProgress(user: AuthenticatedUser, programId: string) {
    const program = await this.prisma.program.findUnique({
      where: { id: programId },
      include: { modules: { include: { tasks: { select: { id: true } } } } },
    });
    if (!program) throw new NotFoundException('Program not found');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_programId: { userId: user.userId, programId } },
    });
    if (!enrollment && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Not enrolled in this program');
    }

    const taskIds = program.modules.flatMap((m) => m.tasks.map((t) => t.id));

    await this.prisma.$transaction(async (tx) => {
      if (taskIds.length > 0) {
        await tx.progress.deleteMany({
          where: { userId: user.userId, taskId: { in: taskIds } },
        });
      }
      if (enrollment && enrollment.status !== EnrollmentStatus.CANCELLED) {
        await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { status: EnrollmentStatus.ACTIVE },
        });
      }
    });

    return { deleted: true, programId };
  }

  private async recalculateEnrollmentStatus(
    tx: Prisma.TransactionClient,
    userId: string,
    programId: string,
    currentStatus: EnrollmentStatus,
  ) {
    if (currentStatus === EnrollmentStatus.CANCELLED) return;
    const totalTasks = await tx.task.count({
      where: { module: { programId } },
    });
    if (totalTasks === 0) {
      await tx.enrollment.update({
        where: { userId_programId: { userId, programId } },
        data: { status: EnrollmentStatus.ACTIVE },
      });
      return;
    }
    const completedTasks = await tx.progress.count({
      where: {
        userId,
        isCompleted: true,
        task: { module: { programId } },
      },
    });
    const nextStatus =
      completedTasks === totalTasks
        ? EnrollmentStatus.COMPLETED
        : EnrollmentStatus.ACTIVE;
    await tx.enrollment.update({
      where: { userId_programId: { userId, programId } },
      data: { status: nextStatus },
    });
  }
}
