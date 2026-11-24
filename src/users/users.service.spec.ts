import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../generated/prisma/enums';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
  };

  const publicUser = {
    id: '1',
    email: 'user1@test.com',
    name: 'User 1',
    role: Role.USER,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      user: {
        create: jest.fn().mockResolvedValue(publicUser),
        findMany: jest.fn().mockResolvedValue([publicUser]),
        findUnique: jest.fn().mockResolvedValue(publicUser),
        update: jest.fn().mockResolvedValue(publicUser),
        delete: jest.fn().mockResolvedValue(publicUser),
        count: jest.fn().mockResolvedValue(2),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a user with hashed password', async () => {
    const created = await service.createUser({
      email: 'new@test.com',
      password: 'password123',
      name: 'New User',
      role: Role.USER,
    });
    expect(created).toEqual(publicUser);
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it('should return all users', async () => {
    const users = await service.getUsers();
    expect(users).toHaveLength(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.any(Object) }),
    );
  });

  it('should return a user by id', async () => {
    const user = await service.getUserById('1');
    expect(user).toEqual(publicUser);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '1' },
        select: expect.any(Object),
      }),
    );
  });

  it('throws when user not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getUserById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('should modify user by id', async () => {
    const updated = await service.modifyUserById('1', { name: 'Updated Name' });
    expect(updated).toEqual(publicUser);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '1' },
        data: expect.objectContaining({ name: 'Updated Name' }),
      }),
    );
  });

  it('should delete user when valid', async () => {
    const result = await service.deleteUser('admin-id', '1', Role.ADMIN);
    expect(result).toEqual({ deleted: true, id: '1' });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: '1' } });
  });

  it('should prevent admin from deleting own account', async () => {
    await expect(
      service.deleteUser('admin-1', 'admin-1', Role.ADMIN),
    ).rejects.toThrow(BadRequestException);
  });

  it('should prevent deleting the last administrator', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...publicUser,
      id: 'admin-2',
      role: Role.ADMIN,
    });
    prisma.user.count.mockResolvedValue(1);

    await expect(
      service.deleteUser('admin-1', 'admin-2', Role.ADMIN),
    ).rejects.toThrow(BadRequestException);
  });
});
