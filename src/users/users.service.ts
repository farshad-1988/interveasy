import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client';
import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateUserDto,
  UpdateProfileDto,
  UpdateUserDto,
  UpdateUserRoleDto,
} from './dto/user.dto';

const BCRYPT_ROUNDS = 12;

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      return await this.prisma.user.create({
        data: {
          email: dto.email,
          password: passwordHash,
          name: dto.name,
          role: dto.role ?? Role.USER,
        },
        select: PUBLIC_USER_SELECT,
      });
    } catch (error) {
      this.handleKnownErrors(error);
      throw error;
    }
  }

  getUsers() {
    return this.prisma.user.findMany({ select: PUBLIC_USER_SELECT });
  }

  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async modifyUserById(userId: string, dto: UpdateProfileDto | UpdateUserDto) {
    await this.getUserById(userId);
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { ...dto },
        select: PUBLIC_USER_SELECT,
      });
    } catch (error) {
      this.handleKnownErrors(error);
      throw error;
    }
  }

  async updateRole(userId: string, dto: UpdateUserRoleDto) {
    await this.getUserById(userId);
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { role: dto.role },
        select: PUBLIC_USER_SELECT,
      });
    } catch (error) {
      this.handleKnownErrors(error);
      throw error;
    }
  }

  async deleteUser(
    currentUserId: string,
    targetUserId: string,
    currentUserRole: string,
  ) {
    const targetUser = await this.getUserById(targetUserId);

    if (currentUserRole === Role.ADMIN && currentUserId === targetUserId) {
      throw new BadRequestException(
        'Administrators cannot delete their own account via this endpoint',
      );
    }

    if (targetUser.role === Role.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: { role: Role.ADMIN },
      });
      if (adminCount <= 1) {
        throw new BadRequestException(
          'Cannot delete the last remaining administrator',
        );
      }
    }

    await this.prisma.user.delete({
      where: { id: targetUserId },
    });

    return { deleted: true, id: targetUserId };
  }

  private handleKnownErrors(error: unknown): never | void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Email is already in use');
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException('User not found');
    }
  }
}
