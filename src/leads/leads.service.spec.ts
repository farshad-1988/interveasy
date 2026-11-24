import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LeadSource, LeadStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { LeadsService } from './leads.service';

describe('LeadsService', () => {
  let service: LeadsService;
  const prisma: Record<string, any> = {
    lead: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
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
      providers: [LeadsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = mod.get(LeadsService);
  });

  describe('submitDemoRequest', () => {
    it('successfully submits a demo request with normalized email', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      prisma.lead.create.mockResolvedValue({
        id: 'l1',
        fullName: 'Alice Walker',
        email: 'alice@company.com',
        status: LeadStatus.NEW,
      });

      const res = await service.submitDemoRequest({
        fullName: ' Alice Walker ',
        email: '  Alice@Company.COM  ',
        company: 'Acme Corp',
        teamSize: 50,
      });

      expect(res.id).toBe('l1');
      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fullName: 'Alice Walker',
            email: 'alice@company.com',
            company: 'Acme Corp',
            teamSize: 50,
            status: LeadStatus.NEW,
          }),
        }),
      );
    });

    it('rejects duplicate active lead with 409 Conflict', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'existing-l',
        status: LeadStatus.NEW,
      });

      await expect(
        service.submitDemoRequest({
          fullName: 'Alice',
          email: 'alice@company.com',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('getLeads', () => {
    it('returns paginated and filtered leads', async () => {
      prisma.lead.count.mockResolvedValue(1);
      prisma.lead.findMany.mockResolvedValue([
        { id: 'l1', fullName: 'Alice', status: LeadStatus.NEW },
      ]);

      const res = await service.getLeads({
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        status: LeadStatus.NEW,
      });

      expect(res.data).toHaveLength(1);
      expect(res.meta.total).toBe(1);
    });
  });

  describe('getLeadById', () => {
    it('returns lead if found', async () => {
      prisma.lead.findUnique.mockResolvedValue({
        id: 'l1',
        fullName: 'Alice',
      });

      const res = await service.getLeadById('l1');
      expect(res.id).toBe('l1');
    });

    it('throws 404 when lead is not found', async () => {
      prisma.lead.findUnique.mockResolvedValue(null);
      await expect(service.getLeadById('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updateLeadStatus', () => {
    it('allows valid status transition NEW -> CONTACTED', async () => {
      prisma.lead.findUnique.mockResolvedValue({
        id: 'l1',
        status: LeadStatus.NEW,
      });
      prisma.lead.update.mockResolvedValue({
        id: 'l1',
        status: LeadStatus.CONTACTED,
      });

      const res = await service.updateLeadStatus('l1', {
        status: LeadStatus.CONTACTED,
        adminNotes: 'Called Alice',
      });

      expect(res.status).toBe(LeadStatus.CONTACTED);
      expect(prisma.lead.update).toHaveBeenCalled();
    });

    it('rejects invalid status transition NEW -> CONVERTED with 400 BadRequest', async () => {
      prisma.lead.findUnique.mockResolvedValue({
        id: 'l1',
        status: LeadStatus.NEW,
      });

      await expect(
        service.updateLeadStatus('l1', {
          status: LeadStatus.CONVERTED,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws 404 when updating non-existent lead', async () => {
      prisma.lead.findUnique.mockResolvedValue(null);

      await expect(
        service.updateLeadStatus('missing', {
          status: LeadStatus.CONTACTED,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('assignLead', () => {
    it('assigns lead to an existing user', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'l1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.lead.update.mockResolvedValue({ id: 'l1', assignedToId: 'u1' });

      const res = await service.assignLead('l1', { assignedToId: 'u1' });
      expect(res.assignedToId).toBe('u1');
    });

    it('throws 404 when assignee user does not exist', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'l1' });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.assignLead('l1', { assignedToId: 'missing-user' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createLead', () => {
    it('creates lead with all admin fields', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.lead.create.mockResolvedValue({
        id: 'l1',
        fullName: 'Admin Created',
        email: 'admin@created.com',
        status: LeadStatus.QUALIFIED,
        assignedToId: 'u1',
      });

      const res = await service.createLead({
        fullName: 'Admin Created',
        email: 'admin@created.com',
        status: LeadStatus.QUALIFIED,
        assignedToId: 'u1',
      });

      expect(res.id).toBe('l1');
      expect(prisma.lead.create).toHaveBeenCalled();
    });

    it('throws NotFoundException if assigned user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.createLead({
          fullName: 'Test',
          email: 'test@example.com',
          assignedToId: 'missing-user',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateLead', () => {
    it('updates lead fields', async () => {
      prisma.lead.findUnique.mockResolvedValue({
        id: 'l1',
        status: LeadStatus.NEW,
      });
      prisma.lead.update.mockResolvedValue({
        id: 'l1',
        fullName: 'Updated Name',
        status: LeadStatus.CONTACTED,
      });

      const res = await service.updateLead('l1', {
        fullName: 'Updated Name',
        status: LeadStatus.CONTACTED,
      });

      expect(res.fullName).toBe('Updated Name');
      expect(prisma.lead.update).toHaveBeenCalled();
    });
  });

  describe('deleteLead', () => {
    it('successfully deletes non-converted lead', async () => {
      prisma.lead.delete = jest.fn().mockResolvedValue({ id: 'l1' });
      prisma.lead.findUnique.mockResolvedValue({
        id: 'l1',
        status: LeadStatus.NEW,
      });

      const res = await service.deleteLead('l1');
      expect(res).toEqual({ deleted: true, id: 'l1' });
      expect(prisma.lead.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
    });

    it('throws ConflictException when deleting converted lead', async () => {
      prisma.lead.findUnique.mockResolvedValue({
        id: 'l1',
        status: LeadStatus.CONVERTED,
      });

      await expect(service.deleteLead('l1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws NotFoundException when lead not found', async () => {
      prisma.lead.findUnique.mockResolvedValue(null);
      await expect(service.deleteLead('l-missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getLeadAnalytics', () => {
    it('computes status distribution and conversion rate', async () => {
      prisma.lead.count.mockResolvedValue(10);
      prisma.lead.groupBy
        .mockResolvedValueOnce([
          { status: LeadStatus.NEW, _count: { id: 5 } },
          { status: LeadStatus.CONVERTED, _count: { id: 2 } },
        ])
        .mockResolvedValueOnce([
          { source: LeadSource.WEBSITE, _count: { id: 8 } },
          { source: LeadSource.REFERRAL, _count: { id: 2 } },
        ]);
      prisma.$queryRaw.mockResolvedValue([{ period: '2026-11-01', count: 10 }]);

      const res = await service.getLeadAnalytics({});

      expect(res.totalLeads).toBe(10);
      expect(res.conversionRate).toBe(20.0); // 2 / 10 = 20%
      expect(res.byStatus).toHaveLength(2);
      expect(res.bySource).toHaveLength(2);
      expect(res.trends).toHaveLength(1);
    });
  });
});
