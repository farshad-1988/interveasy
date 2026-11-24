import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ProgramsService } from './programs.service';

describe('ProgramsService', () => {
  let service: ProgramsService;
  const prisma: any = {
    program: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (arg: any) =>
      Promise.all(arg),
    );
    const module = await Test.createTestingModule({
      providers: [
        ProgramsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ProgramsService);
  });

  it('returns paginated programs with meta', async () => {
    prisma.program.count.mockResolvedValue(11);
    prisma.program.findMany.mockResolvedValue([{ id: 'p1', title: 'AWS' }]);
    const res = await service.findAll({
      page: 1,
      limit: 10,
      sortOrder: 'asc',
    } as any);
    expect(res.meta).toEqual({
      total: 11,
      page: 1,
      limit: 10,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });
});
