import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../generated/prisma/enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateProfileDto,
  UpdateUserDto,
  UpdateUserRoleDto,
} from './dto/user.dto';

@ApiTags('Users & Administration')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new user (Admin only)' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  createUser(@Body() dto: CreateUserDto) {
    return this.usersService.createUser(dto);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all registered users (Admin only)' })
  @ApiResponse({ status: 200, description: 'List of users' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  getAllUsers() {
    return this.usersService.getUsers();
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getUserById(user.userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update profile information for current user' })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  modifyCurrentUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.modifyUserById(user.userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by UUID (Admin or own profile)' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 403, description: 'Forbidden (IDOR protection)' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    if (user.role !== Role.ADMIN && user.userId !== id) {
      throw new ForbiddenException('Forbidden (IDOR protection)');
    }
    return this.usersService.getUserById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update user profile by UUID (Admin only)' })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  modifyUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.modifyUserById(id, dto);
  }

  @Put(':id/role')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update user system role (Admin only)' })
  @ApiResponse({ status: 200, description: 'User role updated' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  changeUserRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.usersService.updateRole(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user (Admin or account owner)' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid deletion request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'User not found' })
  deleteUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    if (user.role !== Role.ADMIN && user.userId !== id) {
      throw new ForbiddenException(
        'Forbidden (cannot delete another user account)',
      );
    }
    return this.usersService.deleteUser(user.userId, id, user.role);
  }
}
