import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Lead,
  LeadSource,
  LeadStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPaginationMeta,
  getSkipTake,
  PaginatedResponse,
} from '../common/utils/pagination.util';
import {
  AdminLeadsQueryDto,
  AssignLeadDto,
  CreateDemoRequestDto,
  CreateLeadDto,
  UpdateLeadDto,
  UpdateLeadStatusDto,
} from './dto/lead.dto';

const ALLOWED_LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  [LeadStatus.NEW]: [
    LeadStatus.CONTACTED,
    LeadStatus.QUALIFIED,
    LeadStatus.UNQUALIFIED,
    LeadStatus.REJECTED,
  ],
  [LeadStatus.CONTACTED]: [
    LeadStatus.QUALIFIED,
    LeadStatus.UNQUALIFIED,
    LeadStatus.REJECTED,
  ],
  [LeadStatus.QUALIFIED]: [
    LeadStatus.CONVERTED,
    LeadStatus.UNQUALIFIED,
    LeadStatus.REJECTED,
  ],
  [LeadStatus.UNQUALIFIED]: [LeadStatus.QUALIFIED, LeadStatus.REJECTED],
  [LeadStatus.CONVERTED]: [],
  [LeadStatus.REJECTED]: [LeadStatus.NEW],
};

export interface LeadAnalytics {
  totalLeads: number;
  byStatus: Array<{ status: LeadStatus; count: number }>;
  conversionRate: number;
  bySource: Array<{ source: LeadSource; count: number }>;
  trends: Array<{ period: string; count: number }>;
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submitDemoRequest(
    dto: CreateDemoRequestDto,
    ipAddress?: string,
  ): Promise<{ id: string; message: string }> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    return await this.prisma.$transaction(async (tx) => {
      // Duplicate detection policy:
      // Active leads (not REJECTED, not CONVERTED) with the same email trigger a conflict.
      const existing = await tx.lead.findFirst({
        where: {
          email: normalizedEmail,
          status: {
            notIn: [LeadStatus.REJECTED, LeadStatus.CONVERTED],
          },
        },
        select: { id: true, status: true },
      });

      if (existing) {
        this.logger.warn(
          `Duplicate demo request rejected for ${normalizedEmail} (existing active lead: ${existing.id})`,
        );
        throw new ConflictException(
          'A demo request with this email is already active and being processed',
        );
      }

      const lead = await tx.lead.create({
        data: {
          fullName: dto.fullName.trim(),
          email: normalizedEmail,
          phone: dto.phone,
          company: dto.company,
          jobTitle: dto.jobTitle,
          teamSize: dto.teamSize,
          message: dto.message,
          source: dto.source ?? LeadSource.WEBSITE,
          status: LeadStatus.NEW,
        },
      });

      this.logger.log(
        `Demo request received [${lead.id}] from ${normalizedEmail} (${dto.company ?? 'No Company'}) [IP: ${ipAddress ?? 'unknown'}]`,
      );

      return {
        id: lead.id,
        message:
          'Demo request received successfully. Our team will contact you shortly.',
      };
    });
  }

  async createLead(dto: CreateLeadDto): Promise<Lead> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    if (dto.assignedToId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: dto.assignedToId },
        select: { id: true },
      });
      if (!assignee) {
        throw new NotFoundException(
          `Assignee user with ID ${dto.assignedToId} not found`,
        );
      }
    }

    const lead = await this.prisma.lead.create({
      data: {
        fullName: dto.fullName.trim(),
        email: normalizedEmail,
        phone: dto.phone,
        company: dto.company,
        jobTitle: dto.jobTitle,
        teamSize: dto.teamSize,
        message: dto.message,
        source: dto.source ?? LeadSource.WEBSITE,
        status: dto.status ?? LeadStatus.NEW,
        adminNotes: dto.adminNotes,
        assignedToId: dto.assignedToId,
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    this.logger.log(
      `Lead created manually [${lead.id}] for ${normalizedEmail}`,
    );
    return lead;
  }

  async getLeads(query: AdminLeadsQueryDto): Promise<PaginatedResponse<Lead>> {
    const { skip, take } = getSkipTake(query.page, query.limit);

    const where: Prisma.LeadWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.email
        ? { email: { contains: query.email, mode: 'insensitive' } }
        : {}),
      ...(query.company
        ? { company: { contains: query.company, mode: 'insensitive' } }
        : {}),
      ...(query.teamSizeMin || query.teamSizeMax
        ? {
            teamSize: {
              ...(query.teamSizeMin ? { gte: query.teamSizeMin } : {}),
              ...(query.teamSizeMax ? { lte: query.teamSizeMax } : {}),
            },
          }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { company: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const orderBy = { [sortBy]: sortOrder };

    const [total, data] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  }

  async getLeadById(id: string): Promise<Lead> {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }

    return lead;
  }

  async updateLead(id: string, dto: UpdateLeadDto): Promise<Lead> {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }

    if (dto.assignedToId) {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.assignedToId },
        select: { id: true },
      });
      if (!user) {
        throw new NotFoundException(
          `Assignee user with ID ${dto.assignedToId} not found`,
        );
      }
    }

    if (dto.status && dto.status !== lead.status) {
      const allowedNext = ALLOWED_LEAD_TRANSITIONS[lead.status] ?? [];
      if (!allowedNext.includes(dto.status)) {
        throw new BadRequestException(
          `Invalid status transition: cannot change lead from ${lead.status} to ${dto.status}. Allowed transitions: [${allowedNext.join(', ')}]`,
        );
      }
    }

    return await this.prisma.lead.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.company !== undefined ? { company: dto.company } : {}),
        ...(dto.jobTitle !== undefined ? { jobTitle: dto.jobTitle } : {}),
        ...(dto.teamSize !== undefined ? { teamSize: dto.teamSize } : {}),
        ...(dto.message !== undefined ? { message: dto.message } : {}),
        ...(dto.source !== undefined ? { source: dto.source } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.adminNotes !== undefined ? { adminNotes: dto.adminNotes } : {}),
        ...(dto.assignedToId !== undefined
          ? { assignedToId: dto.assignedToId }
          : {}),
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async updateLeadStatus(id: string, dto: UpdateLeadStatusDto): Promise<Lead> {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true, status: true, adminNotes: true },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }

    if (lead.status === dto.status) {
      // Idempotent or note update only
      if (dto.adminNotes !== undefined) {
        return await this.prisma.lead.update({
          where: { id },
          data: { adminNotes: dto.adminNotes },
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
          },
        });
      }
      return await this.getLeadById(id);
    }

    const allowedNext = ALLOWED_LEAD_TRANSITIONS[lead.status] ?? [];
    if (!allowedNext.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid status transition: cannot change lead from ${lead.status} to ${dto.status}. Allowed transitions: [${allowedNext.join(', ')}]`,
      );
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.adminNotes !== undefined ? { adminNotes: dto.adminNotes } : {}),
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });

    this.logger.log(
      `Lead ${id} transitioned from ${lead.status} -> ${dto.status}`,
    );

    return updated;
  }

  async assignLead(id: string, dto: AssignLeadDto): Promise<Lead> {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }

    if (dto.assignedToId) {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.assignedToId },
        select: { id: true },
      });
      if (!user) {
        throw new NotFoundException(
          `Assignee user with ID ${dto.assignedToId} not found`,
        );
      }
    }

    return await this.prisma.lead.update({
      where: { id },
      data: { assignedToId: dto.assignedToId ?? null },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async deleteLead(id: string): Promise<{ deleted: boolean; id: string }> {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }

    if (lead.status === LeadStatus.CONVERTED) {
      throw new ConflictException(
        'Cannot delete a converted lead. Converted leads are permanent business conversion records.',
      );
    }

    await this.prisma.lead.delete({
      where: { id },
    });

    this.logger.log(`Lead [${id}] permanently deleted`);
    return { deleted: true, id };
  }

  async getLeadAnalytics(query: {
    from?: string;
    to?: string;
  }): Promise<LeadAnalytics> {
    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;

    const where: Prisma.LeadWhereInput = {
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };

    const [totalLeads, byStatusGroup, bySourceGroup] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.prisma.lead.groupBy({
        by: ['source'],
        where,
        _count: { id: true },
      }),
    ]);

    const byStatus = byStatusGroup.map((g) => ({
      status: g.status,
      count: g._count.id,
    }));

    const bySource = bySourceGroup.map((g) => ({
      source: g.source,
      count: g._count.id,
    }));

    const convertedCount =
      byStatus.find((s) => s.status === LeadStatus.CONVERTED)?.count ?? 0;

    const conversionRate =
      totalLeads > 0
        ? Number(((convertedCount / totalLeads) * 100).toFixed(2))
        : 0;

    // Monthly trends
    let trends: Array<{ period: string; count: number }> = [];
    try {
      const rawTrends = await this.prisma.$queryRaw<
        Array<{ period: string; count: number }>
      >`
        SELECT
          DATE_TRUNC('month', "createdAt")::text AS period,
          COUNT(id)::int AS count
        FROM "Lead"
        WHERE (${fromDate ?? null}::timestamp IS NULL OR "createdAt" >= ${fromDate ?? null}::timestamp)
          AND (${toDate ?? null}::timestamp IS NULL OR "createdAt" <= ${toDate ?? null}::timestamp)
        GROUP BY DATE_TRUNC('month', "createdAt")
        ORDER BY period ASC;
      `;
      trends = rawTrends.map((t) => ({
        period: t.period,
        count: Number(t.count),
      }));
    } catch {
      // Fallback
      const records = await this.prisma.lead.findMany({
        where,
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      const counts = new Map<string, number>();
      for (const r of records) {
        const key = r.createdAt.toISOString().slice(0, 7) + '-01';
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      trends = Array.from(counts.entries()).map(([period, count]) => ({
        period,
        count,
      }));
    }

    return {
      totalLeads,
      byStatus,
      conversionRate,
      bySource,
      trends,
    };
  }
}
