import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InterviewStatus,
  NoteVisibility,
  Prisma,
  Role,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPaginationMeta,
  getSkipTake,
  PaginatedResponse,
} from '../common/utils/pagination.util';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  AdminInterviewQueryDto,
  AvailabilitySlotsQueryDto,
  CreateAvailabilityDto,
  CreateInterviewDto,
  CreateInterviewNoteDto,
  InterviewQueryDto,
  UpdateAvailabilityDto,
  UpdateInterviewDto,
  UpdateInterviewNoteDto,
  UpdateInterviewStatusDto,
} from './dto/interview.dto';
import {
  addDaysYmd,
  assertValidIanaTimezone,
  getZonedParts,
  isPast,
  minutesOfDay,
  overlaps,
  parseHHmm,
  weekdayInZone,
  zonedTimeToUtc,
} from './interview-time.util';
import { canTransition } from './interview-status.util';

const INTERVIEW_SORT_FIELDS = new Set([
  'startAt',
  'endAt',
  'createdAt',
  'status',
]);
const ACTIVE_STATUSES: InterviewStatus[] = [
  InterviewStatus.PENDING,
  InterviewStatus.CONFIRMED,
];

@Injectable()
export class InterviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthenticatedUser, dto: CreateInterviewDto) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    const now = new Date();

    assertValidIanaTimezone(dto.timezone);
    if (!(startAt < endAt)) {
      throw new BadRequestException('startAt must be before endAt');
    }
    if (isPast(startAt, now)) {
      throw new BadRequestException('Cannot book interviews in the past');
    }
    if (dto.interviewerId === user.userId) {
      throw new BadRequestException(
        'Candidate and interviewer must be different users',
      );
    }

    const [interviewer, assessment] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.interviewerId } }),
      dto.assessmentId
        ? this.prisma.assessment.findUnique({ where: { id: dto.assessmentId } })
        : Promise.resolve(null),
    ]);
    if (!interviewer) throw new NotFoundException('Interviewer not found');
    if (dto.assessmentId && !assessment)
      throw new NotFoundException('Assessment not found');

    await this.ensureWithinAvailability(dto.interviewerId, startAt, endAt);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.ensureNoConflicts(
          tx,
          user.userId,
          dto.interviewerId,
          startAt,
          endAt,
        );
        const interview = await tx.interview.create({
          data: {
            userId: user.userId,
            interviewerId: dto.interviewerId,
            assessmentId: dto.assessmentId,
            title: dto.title,
            description: dto.description,
            startAt,
            endAt,
            timezone: dto.timezone,
            meetingUrl: dto.meetingUrl,
            status: InterviewStatus.PENDING,
          },
        });
        await tx.interviewStatusHistory.create({
          data: {
            interviewId: interview.id,
            fromStatus: InterviewStatus.PENDING,
            toStatus: InterviewStatus.PENDING,
            changedById: user.userId,
            reason: 'Interview created',
          },
        });
        return interview;
      });
    } catch (error) {
      throw this.mapConflictError(error);
    }
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
        interviewer: {
          select: { id: true, email: true, name: true, role: true },
        },
        assessment: { select: { id: true, title: true } },
        notes: {
          include: {
            author: {
              select: { id: true, email: true, name: true, role: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!interview) throw new NotFoundException('Interview not found');
    this.assertCanView(interview.userId, interview.interviewerId, user);
    const filteredNotes = interview.notes.filter((n) =>
      this.canViewNote(n, interview, user),
    );
    return { ...interview, notes: filteredNotes };
  }

  async updateStatus(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateInterviewStatusDto,
  ) {
    return this.prisma
      .$transaction(async (tx) => {
        const interview = await tx.interview.findUnique({ where: { id } });
        if (!interview) throw new NotFoundException('Interview not found');
        this.assertCanView(interview.userId, interview.interviewerId, user);

        if (!canTransition(interview.status, dto.status)) {
          throw new ConflictException(
            `Invalid status transition from ${interview.status} to ${dto.status}`,
          );
        }
        this.assertCanPerformTransition(interview, dto.status, user);

        if (dto.status === InterviewStatus.CONFIRMED) {
          await this.ensureNoConflicts(
            tx,
            interview.userId,
            interview.interviewerId,
            interview.startAt,
            interview.endAt,
            interview.id,
          );
        }

        const updated = await tx.interview.update({
          where: { id },
          data: { status: dto.status },
        });
        await tx.interviewStatusHistory.create({
          data: {
            interviewId: id,
            fromStatus: interview.status,
            toStatus: dto.status,
            changedById: user.userId,
            reason: dto.reason,
          },
        });
        return updated;
      })
      .catch((e) => {
        throw this.mapConflictError(e);
      });
  }

  async findMine(
    user: AuthenticatedUser,
    query: InterviewQueryDto,
  ): Promise<PaginatedResponse<unknown>> {
    const { page, limit, sortBy, sortOrder, status, role, from, to } = query;
    const where: Prisma.InterviewWhereInput = {};
    if (role === 'candidate') where.userId = user.userId;
    else if (role === 'interviewer') where.interviewerId = user.userId;
    else where.OR = [{ userId: user.userId }, { interviewerId: user.userId }];
    if (status) where.status = status;
    if (from || to) {
      where.startAt = {};
      if (from) (where.startAt as Prisma.DateTimeFilter).gte = new Date(from);
      if (to) (where.startAt as Prisma.DateTimeFilter).lte = new Date(to);
    }
    const orderField =
      sortBy && INTERVIEW_SORT_FIELDS.has(sortBy) ? sortBy : 'startAt';
    const [total, data] = await this.prisma.$transaction([
      this.prisma.interview.count({ where }),
      this.prisma.interview.findMany({
        where,
        orderBy: {
          [orderField]: sortOrder,
        },
        include: {
          interviewer: { select: { id: true, email: true, name: true } },
          user: { select: { id: true, email: true, name: true } },
          assessment: { select: { id: true, title: true } },
        },
        ...getSkipTake(page, limit),
      }),
    ]);
    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async findAll(
    query: AdminInterviewQueryDto,
  ): Promise<PaginatedResponse<unknown>> {
    const {
      page,
      limit,
      sortBy,
      sortOrder,
      status,
      userId,
      interviewerId,
      from,
      to,
      search,
    } = query;
    const where: Prisma.InterviewWhereInput = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;
    if (interviewerId) where.interviewerId = interviewerId;
    if (from || to) {
      where.startAt = {};
      if (from) (where.startAt as Prisma.DateTimeFilter).gte = new Date(from);
      if (to) (where.startAt as Prisma.DateTimeFilter).lte = new Date(to);
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    const orderField =
      sortBy && INTERVIEW_SORT_FIELDS.has(sortBy) ? sortBy : 'startAt';
    const [total, data] = await this.prisma.$transaction([
      this.prisma.interview.count({ where }),
      this.prisma.interview.findMany({
        where,
        orderBy: {
          [orderField]: sortOrder,
        },
        include: {
          interviewer: { select: { id: true, email: true, name: true } },
          user: { select: { id: true, email: true, name: true } },
          assessment: { select: { id: true, title: true } },
        },
        ...getSkipTake(page, limit),
      }),
    ]);
    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateInterviewDto) {
    const interview = await this.prisma.interview.findUnique({ where: { id } });
    if (!interview) throw new NotFoundException('Interview not found');
    if (
      !this.isParticipant(interview.userId, interview.interviewerId, user) &&
      user.role !== Role.ADMIN
    ) {
      throw new ForbiddenException(
        'Only participants or admin can update this interview',
      );
    }

    if (interview.status === InterviewStatus.COMPLETED) {
      throw new BadRequestException('Cannot modify completed interviews');
    }

    const timezone = dto.timezone ?? interview.timezone;
    assertValidIanaTimezone(timezone);

    const startAt = dto.startAt ? new Date(dto.startAt) : interview.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : interview.endAt;

    if (!(startAt < endAt)) {
      throw new BadRequestException('startAt must be before endAt');
    }

    const timeChanged =
      (dto.startAt &&
        new Date(dto.startAt).getTime() !== interview.startAt.getTime()) ||
      (dto.endAt &&
        new Date(dto.endAt).getTime() !== interview.endAt.getTime());

    if (timeChanged) {
      await this.ensureWithinAvailability(
        interview.interviewerId,
        startAt,
        endAt,
      );
    }

    return await this.prisma.$transaction(async (tx) => {
      if (timeChanged && ACTIVE_STATUSES.includes(interview.status)) {
        await this.ensureNoConflicts(
          tx,
          interview.userId,
          interview.interviewerId,
          startAt,
          endAt,
          interview.id,
        );
      }

      return tx.interview.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.meetingUrl !== undefined
            ? { meetingUrl: dto.meetingUrl }
            : {}),
          ...(dto.assessmentId !== undefined
            ? { assessmentId: dto.assessmentId }
            : {}),
          ...(dto.timezone !== undefined ? { timezone } : {}),
          ...(timeChanged ? { startAt, endAt } : {}),
        },
        include: {
          interviewer: { select: { id: true, email: true, name: true } },
          user: { select: { id: true, email: true, name: true } },
          assessment: { select: { id: true, title: true } },
        },
      });
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    const interview = await this.prisma.interview.findUnique({ where: { id } });
    if (!interview) throw new NotFoundException('Interview not found');
    if (
      !this.isParticipant(interview.userId, interview.interviewerId, user) &&
      user.role !== Role.ADMIN
    ) {
      throw new ForbiddenException(
        'Only participants or admin can delete this interview',
      );
    }

    if (interview.status === InterviewStatus.COMPLETED) {
      throw new ConflictException(
        'Cannot delete a completed interview. Completed records are preserved for history.',
      );
    }

    await this.prisma.interview.delete({ where: { id } });
    return { deleted: true, id };
  }

  async getInterviewerAvailability(
    interviewerId: string,
    query: AvailabilitySlotsQueryDto,
  ) {
    const interviewer = await this.prisma.user.findUnique({
      where: { id: interviewerId },
    });
    if (!interviewer) throw new NotFoundException('Interviewer not found');
    assertValidIanaTimezone(query.timezone ?? 'UTC');
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (!(from < to)) throw new BadRequestException('from must be before to');
    const slotMinutes = query.slotMinutes ?? 30;

    const rules = await this.prisma.interviewAvailability.findMany({
      where: { interviewerId, isActive: true },
    });
    const busy = await this.prisma.interview.findMany({
      where: {
        OR: [{ interviewerId }, { userId: interviewerId }],
        status: { in: ACTIVE_STATUSES },
        startAt: { lt: to },
        endAt: { gt: from },
      },
      select: { startAt: true, endAt: true },
    });

    const slots: { startAt: string; endAt: string }[] = [];
    for (const rule of rules) {
      assertValidIanaTimezone(rule.timezone);
      const st = parseHHmm(rule.startTime);
      const et = parseHHmm(rule.endTime);
      const startMin = minutesOfDay(st.hour, st.minute);
      const endMin = minutesOfDay(et.hour, et.minute);
      const crossesMidnight = endMin <= startMin;
      // iterate days in [from,to) in rule timezone
      const cursor = new Date(from);
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      const endCursor = new Date(to);
      endCursor.setUTCDate(endCursor.getUTCDate() + 2);
      const seen = new Set<string>();
      for (
        let d = new Date(cursor);
        d <= endCursor;
        d = new Date(d.getTime() + 86400000)
      ) {
        const p = getZonedParts(d, rule.timezone);
        // check the base day matching rule.dayOfWeek
        const base = { year: p.year, month: p.month, day: p.day };
        // consider rule on days where local dayOfWeek == rule.dayOfWeek
        const dayChecks = [
          base,
          addDaysYmd(base.year, base.month, base.day, -1),
        ];
        for (const dc of dayChecks) {
          const dcDate = new Date(
            Date.UTC(dc.year, dc.month - 1, dc.day, 12, 0, 0),
          );
          const dcDow = dcDate.getUTCDay();
          if (dcDow !== rule.dayOfWeek) continue;
          const windowStart = zonedTimeToUtc(
            dc.year,
            dc.month,
            dc.day,
            st.hour,
            st.minute,
            rule.timezone,
          );
          let windowEnd: Date;
          if (crossesMidnight) {
            const next = addDaysYmd(dc.year, dc.month, dc.day, 1);
            windowEnd = zonedTimeToUtc(
              next.year,
              next.month,
              next.day,
              et.hour,
              et.minute,
              rule.timezone,
            );
          } else {
            windowEnd = zonedTimeToUtc(
              dc.year,
              dc.month,
              dc.day,
              et.hour,
              et.minute,
              rule.timezone,
            );
          }
          for (
            let t = windowStart.getTime();
            t + slotMinutes * 60000 <= windowEnd.getTime();
            t += slotMinutes * 60000
          ) {
            const s = new Date(t);
            const e = new Date(t + slotMinutes * 60000);
            if (s < from || e > to) continue;
            if (s <= new Date()) continue;
            const key = `${s.toISOString()}_${e.toISOString()}`;
            if (seen.has(key)) continue;
            const conflict = busy.some((b) =>
              overlaps(s, e, b.startAt, b.endAt),
            );
            if (conflict) continue;
            seen.add(key);
            slots.push({ startAt: s.toISOString(), endAt: e.toISOString() });
          }
        }
      }
    }
    slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return {
      interviewerId,
      from: from.toISOString(),
      to: to.toISOString(),
      slotMinutes,
      slots,
    };
  }

  async createNote(
    user: AuthenticatedUser,
    interviewId: string,
    dto: CreateInterviewNoteDto,
  ) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
    });
    if (!interview) throw new NotFoundException('Interview not found');
    if (
      !this.isParticipant(interview.userId, interview.interviewerId, user) &&
      user.role !== Role.ADMIN
    ) {
      throw new ForbiddenException(
        'Only authorized participants can create notes',
      );
    }
    return this.prisma.interviewNote.create({
      data: {
        interviewId,
        authorId: user.userId,
        content: dto.content,
        visibility: dto.visibility,
      },
      include: {
        author: { select: { id: true, email: true, name: true, role: true } },
      },
    });
  }

  async listNotes(user: AuthenticatedUser, interviewId: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
    });
    if (!interview) throw new NotFoundException('Interview not found');
    this.assertCanView(interview.userId, interview.interviewerId, user);

    const notes = await this.prisma.interviewNote.findMany({
      where: { interviewId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, email: true, name: true, role: true } },
      },
    });
    return notes.filter((n) => this.canViewNote(n, interview, user));
  }

  async getNote(user: AuthenticatedUser, interviewId: string, noteId: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
    });
    if (!interview) throw new NotFoundException('Interview not found');
    this.assertCanView(interview.userId, interview.interviewerId, user);

    const note = await this.prisma.interviewNote.findFirst({
      where: { id: noteId, interviewId },
      include: {
        author: { select: { id: true, email: true, name: true, role: true } },
      },
    });
    if (!note) throw new NotFoundException('Interview note not found');
    if (!this.canViewNote(note, interview, user)) {
      throw new ForbiddenException('Access denied');
    }
    return note;
  }

  async updateNote(
    user: AuthenticatedUser,
    interviewId: string,
    noteId: string,
    dto: UpdateInterviewNoteDto,
  ) {
    const note = await this.prisma.interviewNote.findFirst({
      where: { id: noteId, interviewId },
    });
    if (!note) throw new NotFoundException('Interview note not found');
    if (note.authorId !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Only the author or admin can update this note',
      );
    }

    return this.prisma.interviewNote.update({
      where: { id: noteId },
      data: {
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.visibility !== undefined ? { visibility: dto.visibility } : {}),
      },
      include: {
        author: { select: { id: true, email: true, name: true, role: true } },
      },
    });
  }

  async deleteNote(
    user: AuthenticatedUser,
    interviewId: string,
    noteId: string,
  ) {
    const note = await this.prisma.interviewNote.findFirst({
      where: { id: noteId, interviewId },
    });
    if (!note) throw new NotFoundException('Interview note not found');
    if (note.authorId !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Only the author or admin can delete this note',
      );
    }

    await this.prisma.interviewNote.delete({ where: { id: noteId } });
    return { deleted: true, id: noteId };
  }

  async createAvailability(
    user: AuthenticatedUser,
    dto: CreateAvailabilityDto,
  ) {
    assertValidIanaTimezone(dto.timezone);
    const st = parseHHmm(dto.startTime);
    const et = parseHHmm(dto.endTime);
    if (minutesOfDay(st.hour, st.minute) === minutesOfDay(et.hour, et.minute)) {
      throw new BadRequestException('startTime and endTime must be different');
    }
    return this.prisma.interviewAvailability.create({
      data: {
        interviewerId: user.userId,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        timezone: dto.timezone,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async listMyAvailability(user: AuthenticatedUser) {
    const data = await this.prisma.interviewAvailability.findMany({
      where: { interviewerId: user.userId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    const total = data.length;
    return { data, meta: buildPaginationMeta(total, 1, total || 1) };
  }

  async updateAvailability(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateAvailabilityDto,
  ) {
    const existing = await this.prisma.interviewAvailability.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Availability not found');
    if (existing.interviewerId !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Access denied');
    }
    const timezone = dto.timezone ?? existing.timezone;
    assertValidIanaTimezone(timezone);
    const startTime = dto.startTime ?? existing.startTime;
    const endTime = dto.endTime ?? existing.endTime;
    const st = parseHHmm(startTime);
    const et = parseHHmm(endTime);
    if (minutesOfDay(st.hour, st.minute) === minutesOfDay(et.hour, et.minute)) {
      throw new BadRequestException('startTime and endTime must be different');
    }
    return this.prisma.interviewAvailability.update({
      where: { id },
      data: { ...dto, timezone, startTime, endTime },
    });
  }

  async deleteAvailability(user: AuthenticatedUser, id: string) {
    const existing = await this.prisma.interviewAvailability.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Availability not found');
    if (existing.interviewerId !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Access denied');
    }
    await this.prisma.interviewAvailability.delete({ where: { id } });
    return { deleted: true };
  }

  async getAvailabilityById(user: AuthenticatedUser, id: string) {
    const existing = await this.prisma.interviewAvailability.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Availability not found');
    if (existing.interviewerId !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Access denied');
    }
    return existing;
  }

  async listInterviewerRules(interviewerId: string) {
    const interviewer = await this.prisma.user.findUnique({
      where: { id: interviewerId },
    });
    if (!interviewer) throw new NotFoundException('Interviewer not found');
    return this.prisma.interviewAvailability.findMany({
      where: { interviewerId, isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  /**
   * Validates that requested interview startAt and endAt fall entirely within
   * at least one active availability window defined by the interviewer.
   * Handles multi-timezone mapping and windows that cross midnight (e.g., 22:00 -> 02:00).
   */
  private async ensureWithinAvailability(
    interviewerId: string,
    startAt: Date,
    endAt: Date,
  ) {
    const rules = await this.prisma.interviewAvailability.findMany({
      where: { interviewerId, isActive: true },
    });
    if (rules.length === 0) {
      throw new BadRequestException(
        'Interviewer has no availability configured',
      );
    }
    const ok = rules.some((rule) => {
      try {
        assertValidIanaTimezone(rule.timezone);
        const st = parseHHmm(rule.startTime);
        const et = parseHHmm(rule.endTime);
        const startMin = minutesOfDay(st.hour, st.minute);
        const endMin = minutesOfDay(et.hour, et.minute);
        const crossesMidnight = endMin <= startMin;
        const startDow = weekdayInZone(startAt, rule.timezone);
        // candidate windows: rule day and previous day if crossing midnight
        const candidates: { dow: number; offset: number }[] = [
          { dow: rule.dayOfWeek, offset: 0 },
        ];
        for (const c of candidates) {
          if (c.dow !== startDow) continue;
          const p = getZonedParts(startAt, rule.timezone);
          const wStart = zonedTimeToUtc(
            p.year,
            p.month,
            p.day,
            st.hour,
            st.minute,
            rule.timezone,
          );
          let wEnd: Date;
          if (crossesMidnight) {
            const n = addDaysYmd(p.year, p.month, p.day, 1);
            wEnd = zonedTimeToUtc(
              n.year,
              n.month,
              n.day,
              et.hour,
              et.minute,
              rule.timezone,
            );
          } else {
            wEnd = zonedTimeToUtc(
              p.year,
              p.month,
              p.day,
              et.hour,
              et.minute,
              rule.timezone,
            );
          }
          if (startAt >= wStart && endAt <= wEnd) return true;
        }
        // also check if start falls on day after rule start (midnight crossing)
        if (crossesMidnight) {
          const prevDow = (startDow + 6) % 7;
          if (prevDow === rule.dayOfWeek) {
            const p = getZonedParts(startAt, rule.timezone);
            const prev = addDaysYmd(p.year, p.month, p.day, -1);
            const wStart = zonedTimeToUtc(
              prev.year,
              prev.month,
              prev.day,
              st.hour,
              st.minute,
              rule.timezone,
            );
            const wEnd = zonedTimeToUtc(
              p.year,
              p.month,
              p.day,
              et.hour,
              et.minute,
              rule.timezone,
            );
            if (startAt >= wStart && endAt <= wEnd) return true;
          }
        }
        return false;
      } catch {
        return false;
      }
    });
    if (!ok) {
      throw new BadRequestException(
        'Requested time is outside interviewer availability',
      );
    }
  }

  /**
   * Conflict Detection Algorithm:
   * Two time intervals [A_start, A_end] and [B_start, B_end] overlap if and only if:
   *   A_start < B_end AND A_end > B_start.
   *
   * We check this for all ACTIVE interviews (PENDING, CONFIRMED) where either:
   * 1. The candidate is already booked as candidate or interviewer
   * 2. The interviewer is already booked as interviewer or candidate
   *
   * If any record exists, an HTTP 409 ConflictException is thrown.
   */
  private async ensureNoConflicts(
    tx: Prisma.TransactionClient,
    userId: string,
    interviewerId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ) {
    const conflicts = await tx.interview.findMany({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        status: { in: ACTIVE_STATUSES },
        OR: [
          { userId },
          { interviewerId },
          { userId: interviewerId },
          { interviewerId: userId },
        ],
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (conflicts.length > 0) {
      throw new ConflictException(
        'Scheduling conflict: overlapping interview exists',
      );
    }
  }

  private assertCanView(
    interviewUserId: string,
    interviewerId: string,
    user: AuthenticatedUser,
  ) {
    if (user.role === Role.ADMIN) return;
    if (this.isParticipant(interviewUserId, interviewerId, user)) return;
    throw new ForbiddenException('Access denied');
  }

  private isParticipant(
    interviewUserId: string,
    interviewerId: string,
    user: AuthenticatedUser,
  ) {
    return user.userId === interviewUserId || user.userId === interviewerId;
  }

  private canViewNote(
    note: { visibility: NoteVisibility; authorId: string },
    _interview: { userId: string; interviewerId: string },
    user: AuthenticatedUser,
  ): boolean {
    if (note.visibility === NoteVisibility.SHARED) return true;
    if (user.role === Role.ADMIN) return true;
    return note.authorId === user.userId;
  }

  private assertCanPerformTransition(
    interview: { userId: string; interviewerId: string },
    to: InterviewStatus,
    user: AuthenticatedUser,
  ) {
    const isAdmin = user.role === Role.ADMIN;
    const isCandidate = user.userId === interview.userId;
    const isInterviewer = user.userId === interview.interviewerId;
    if (isAdmin) return;

    if (
      to === InterviewStatus.CONFIRMED ||
      to === InterviewStatus.REJECTED ||
      to === InterviewStatus.COMPLETED ||
      to === InterviewStatus.NO_SHOW
    ) {
      if (!isInterviewer)
        throw new ForbiddenException(
          'Only the interviewer can perform this action',
        );
      return;
    }
    if (to === InterviewStatus.CANCELLED) {
      if (isCandidate || isInterviewer) return;
      throw new ForbiddenException(
        'Only participants can cancel this interview',
      );
    }
    throw new ForbiddenException('Not allowed to perform this transition');
  }

  private mapConflictError(error: unknown): Error {
    if (
      error instanceof ConflictException ||
      error instanceof BadRequestException ||
      error instanceof ForbiddenException ||
      error instanceof NotFoundException
    ) {
      return error;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (
        error.code === 'P2002' ||
        error.code === 'P2034' ||
        error.code === 'P2004'
      ) {
        return new ConflictException(
          'Scheduling conflict: overlapping interview exists',
        );
      }
    }
    // exclusion constraint violations may surface as unknown request errors
    const msg = (error as { message?: string })?.message ?? '';
    if (
      msg.includes('Interview_no_overlap') ||
      msg.toLowerCase().includes('exclusion') ||
      msg.toLowerCase().includes('conflict')
    ) {
      return new ConflictException(
        'Scheduling conflict: overlapping interview exists',
      );
    }
    return error as Error;
  }
}
