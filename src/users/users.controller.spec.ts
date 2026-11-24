import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../generated/prisma/enums';

describe('UsersController', () => {
  let controller: UsersController;
  let service: {
    createUser: jest.Mock;
    getUsers: jest.Mock;
    getUserById: jest.Mock;
    modifyUserById: jest.Mock;
    updateRole: jest.Mock;
    deleteUser: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      createUser: jest
        .fn()
        .mockResolvedValue({ id: '1', email: 'user1@test.com' }),
      getUsers: jest
        .fn()
        .mockResolvedValue([{ id: '1', email: 'user1@test.com' }]),
      getUserById: jest
        .fn()
        .mockResolvedValue({ id: '1', email: 'user1@test.com' }),
      modifyUserById: jest
        .fn()
        .mockResolvedValue({ id: '1', email: 'user1@test.com' }),
      updateRole: jest.fn().mockResolvedValue({ id: '1', role: Role.ADMIN }),
      deleteUser: jest.fn().mockResolvedValue({ deleted: true, id: '1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: service,
        },
        RolesGuard,
        Reflector,
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createUser', () => {
    it('should create a new user (admin)', async () => {
      const dto = { email: 'test@example.com', password: 'password123' };
      const result = await controller.createUser(dto);
      expect(result).toEqual({ id: '1', email: 'user1@test.com' });
      expect(service.createUser).toHaveBeenCalledWith(dto);
    });
  });

  describe('getAllUsers', () => {
    it('should return all users (admin-only at guard level)', async () => {
      const result = await controller.getAllUsers();
      expect(result).toEqual([{ id: '1', email: 'user1@test.com' }]);
      expect(service.getUsers).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUser', () => {
    it('should allow admin to get any user', async () => {
      const admin = {
        userId: '1',
        email: 'admin@test.com',
        role: Role.ADMIN,
        sessionId: 's1',
      };
      const result = await controller.getUser(admin, '2');
      expect(result).toEqual({ id: '1', email: 'user1@test.com' });
      expect(service.getUserById).toHaveBeenCalledWith('2');
    });

    it('should allow user to get their own data', async () => {
      const user = {
        userId: '1',
        email: 'user1@test.com',
        role: Role.USER,
        sessionId: 's1',
      };
      const result = await controller.getUser(user, '1');
      expect(result).toEqual({ id: '1', email: 'user1@test.com' });
      expect(service.getUserById).toHaveBeenCalledWith('1');
    });

    it('should deny regular user from accessing another user', () => {
      const user = {
        userId: '1',
        email: 'user1@test.com',
        role: Role.USER,
        sessionId: 's1',
      };
      expect(() => controller.getUser(user, '2')).toThrow(ForbiddenException);
    });
  });

  describe('modifyUser', () => {
    it('should allow admin to modify user details', async () => {
      const dto = { name: 'Admin Edited Name' };
      const result = await controller.modifyUser('2', dto);
      expect(result).toEqual({ id: '1', email: 'user1@test.com' });
      expect(service.modifyUserById).toHaveBeenCalledWith('2', dto);
    });
  });

  describe('deleteUser', () => {
    it('should allow admin to delete user', async () => {
      const admin = {
        userId: '1',
        email: 'admin@test.com',
        role: Role.ADMIN,
        sessionId: 's1',
      };
      const result = await controller.deleteUser(admin, '2');
      expect(result).toEqual({ deleted: true, id: '1' });
      expect(service.deleteUser).toHaveBeenCalledWith('1', '2', Role.ADMIN);
    });

    it('should allow user to delete their own account', async () => {
      const user = {
        userId: '2',
        email: 'user@test.com',
        role: Role.USER,
        sessionId: 's2',
      };
      const result = await controller.deleteUser(user, '2');
      expect(result).toEqual({ deleted: true, id: '1' });
      expect(service.deleteUser).toHaveBeenCalledWith('2', '2', Role.USER);
    });

    it('should deny regular user from deleting another user', () => {
      const user = {
        userId: '1',
        email: 'user1@test.com',
        role: Role.USER,
        sessionId: 's1',
      };
      expect(() => controller.deleteUser(user, '2')).toThrow(
        ForbiddenException,
      );
    });
  });
});
