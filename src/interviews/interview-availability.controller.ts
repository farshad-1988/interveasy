import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  CreateAvailabilityDto,
  UpdateAvailabilityDto,
} from './dto/interview.dto';
import { InterviewsService } from './interviews.service';

@ApiTags('Interviewers - Availability Management')
@ApiBearerAuth()
@Controller('interview-availability')
@UseGuards(JwtAuthGuard)
export class InterviewAvailabilityController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Post()
  @ApiOperation({
    summary: 'Define recurring weekly availability',
    description:
      'Creates a recurring weekly time block (e.g. Tuesdays 09:00 - 17:00 in America/New_York) during which candidates can book interviews.',
  })
  @ApiResponse({ status: 201, description: 'Availability created' })
  @ApiResponse({
    status: 400,
    description: 'Invalid time format or day of week',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAvailabilityDto,
  ) {
    return this.interviewsService.createAvailability(user, dto);
  }

  @Get('me')
  @ApiOperation({
    summary:
      'List recurring availability rules for the authenticated interviewer',
  })
  @ApiResponse({ status: 200, description: 'List of availability rules' })
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.interviewsService.listMyAvailability(user);
  }

  @Get('interviewer/:interviewerId')
  @ApiOperation({
    summary: 'List recurring availability rules for a specific interviewer',
  })
  @ApiResponse({ status: 200, description: 'List of availability rules' })
  @ApiResponse({ status: 404, description: 'Interviewer not found' })
  listByInterviewer(
    @Param('interviewerId', new ParseUUIDPipe()) interviewerId: string,
  ) {
    return this.interviewsService.listInterviewerRules(interviewerId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an existing availability rule by ID',
  })
  @ApiResponse({ status: 200, description: 'Rule found' })
  @ApiResponse({ status: 403, description: 'Forbidden (not the owner)' })
  @ApiResponse({ status: 404, description: 'Rule not found' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.interviewsService.getAvailabilityById(user, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an existing availability rule',
  })
  @ApiResponse({ status: 200, description: 'Rule updated' })
  @ApiResponse({ status: 403, description: 'Forbidden (not the owner)' })
  @ApiResponse({ status: 404, description: 'Rule not found' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.interviewsService.updateAvailability(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete an availability rule',
  })
  @ApiResponse({ status: 200, description: 'Rule removed' })
  @ApiResponse({ status: 403, description: 'Forbidden (not the owner)' })
  @ApiResponse({ status: 404, description: 'Rule not found' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.interviewsService.deleteAvailability(user, id);
  }
}
