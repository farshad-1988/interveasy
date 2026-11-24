import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../generated/prisma/enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  CreateEnrollmentDto,
  EnrollmentQueryDto,
  UpdateEnrollmentStatusDto,
} from './dto/enrollment.dto';
import { EnrollmentsService } from './enrollments.service';

@ApiTags('LMS - Enrollments')
@ApiBearerAuth()
@Controller('enrollments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Enroll authenticated user into a program' })
  @ApiResponse({ status: 201, description: 'Enrolled successfully' })
  @ApiResponse({ status: 400, description: 'Program is inactive' })
  @ApiResponse({ status: 404, description: 'Program not found' })
  @ApiResponse({ status: 409, description: 'Already enrolled in this program' })
  enroll(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEnrollmentDto,
  ) {
    return this.enrollmentsService.enroll(user, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user enrollments' })
  @ApiResponse({ status: 200, description: 'List of own enrollments' })
  findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EnrollmentQueryDto,
  ) {
    return this.enrollmentsService.findMine(user, query);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all enrollments platform-wide (Admin only)' })
  @ApiResponse({ status: 200, description: 'Paginated enrollments list' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EnrollmentQueryDto,
  ) {
    return this.enrollmentsService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get enrollment details by ID' })
  @ApiResponse({
    status: 200,
    description: 'Enrollment details with program modules',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.enrollmentsService.findOne(user, id);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update enrollment lifecycle status (Admin only)' })
  @ApiResponse({ status: 200, description: 'Enrollment status updated' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEnrollmentStatusDto,
  ) {
    return this.enrollmentsService.updateStatus(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel enrollment (sets status to CANCELLED)' })
  @ApiResponse({ status: 200, description: 'Enrollment cancelled' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.enrollmentsService.cancel(user, id);
  }

  @Delete(':id/permanent')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Permanently delete an enrollment record (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Enrollment permanently removed' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  deletePermanent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.enrollmentsService.deletePermanent(user, id);
  }
}
