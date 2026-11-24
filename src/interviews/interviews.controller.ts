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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../generated/prisma/enums';
import {
  AdminInterviewQueryDto,
  AvailabilitySlotsQueryDto,
  CreateInterviewDto,
  CreateInterviewNoteDto,
  InterviewQueryDto,
  UpdateInterviewDto,
  UpdateInterviewNoteDto,
  UpdateInterviewStatusDto,
} from './dto/interview.dto';
import { InterviewsService } from './interviews.service';

@ApiTags('Interviews')
@ApiBearerAuth()
@Controller('interviews')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Post()
  @ApiOperation({
    summary: 'Book a new interview session',
    description:
      'Creates an interview reservation in PENDING state, enforcing interviewer availability, timezone conversions, and overlapping double-booking prevention.',
  })
  @ApiResponse({ status: 201, description: 'Interview booked successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid timezone, past date, or outside availability',
  })
  @ApiResponse({
    status: 404,
    description: 'Interviewer or assessment not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Scheduling conflict: overlapping interview exists',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInterviewDto,
  ) {
    return this.interviewsService.create(user, dto);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'List all interviews (Admin only)',
    description:
      'Returns paginated list of all interviews platform-wide with status, date, candidate, and interviewer filters.',
  })
  @ApiResponse({ status: 200, description: 'Paginated interviews list' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  findAll(@Query() query: AdminInterviewQueryDto) {
    return this.interviewsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get interview details by ID',
    description:
      'Retrieves interview info with notes visible according to ownership permissions.',
  })
  @ApiResponse({ status: 200, description: 'Interview details' })
  @ApiResponse({
    status: 403,
    description: 'Access denied (must be participant or admin)',
  })
  @ApiResponse({ status: 404, description: 'Interview not found' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.interviewsService.findOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update interview details',
    description:
      'Updates interview title, description, meetingUrl, or reschedules time with conflict validation (Participant or Admin).',
  })
  @ApiResponse({ status: 200, description: 'Interview updated successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid time range or completed interview',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Interview not found' })
  @ApiResponse({ status: 409, description: 'Scheduling conflict' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateInterviewDto,
  ) {
    return this.interviewsService.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete or cancel an interview',
    description:
      'Deletes an interview session. Completed interviews cannot be deleted to preserve evaluation history.',
  })
  @ApiResponse({ status: 200, description: 'Interview deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Interview not found' })
  @ApiResponse({
    status: 409,
    description: 'Cannot delete completed interview',
  })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.interviewsService.remove(user, id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update interview status',
    description:
      'Transitions interview status (e.g. PENDING -> CONFIRMED/CANCELLED/REJECTED) with strict role authorization and status history tracking.',
  })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden (action restricted by participant role)',
  })
  @ApiResponse({ status: 404, description: 'Interview not found' })
  @ApiResponse({
    status: 409,
    description: 'Scheduling conflict preventing confirmation',
  })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateInterviewStatusDto,
  ) {
    return this.interviewsService.updateStatus(user, id, dto);
  }

  // ─── Interview Notes CRUD ──────────────────────────────────────────────

  @Get(':id/notes')
  @ApiOperation({
    summary: 'List notes for an interview',
    description:
      'Retrieves all notes visible to the caller (shared notes and caller private notes; admin sees all).',
  })
  @ApiResponse({ status: 200, description: 'List of interview notes' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Interview not found' })
  listNotes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.interviewsService.listNotes(user, id);
  }

  @Get(':id/notes/:noteId')
  @ApiOperation({
    summary: 'Get an interview note by ID',
  })
  @ApiResponse({ status: 200, description: 'Interview note found' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden (private note of another user)',
  })
  @ApiResponse({ status: 404, description: 'Note not found' })
  getNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('noteId', new ParseUUIDPipe()) noteId: string,
  ) {
    return this.interviewsService.getNote(user, id, noteId);
  }

  @Post(':id/notes')
  @ApiOperation({
    summary: 'Add an interview note',
    description:
      'Adds an evaluation or preparatory note (SHARED or PRIVATE) linked to this interview.',
  })
  @ApiResponse({ status: 201, description: 'Note added successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: only participants or admins can add notes',
  })
  @ApiResponse({ status: 404, description: 'Interview not found' })
  createNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateInterviewNoteDto,
  ) {
    return this.interviewsService.createNote(user, id, dto);
  }

  @Patch(':id/notes/:noteId')
  @ApiOperation({
    summary: 'Update an interview note',
    description: 'Updates note content or visibility. Author or admin only.',
  })
  @ApiResponse({ status: 200, description: 'Note updated' })
  @ApiResponse({ status: 403, description: 'Forbidden (not author or admin)' })
  @ApiResponse({ status: 404, description: 'Note not found' })
  updateNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('noteId', new ParseUUIDPipe()) noteId: string,
    @Body() dto: UpdateInterviewNoteDto,
  ) {
    return this.interviewsService.updateNote(user, id, noteId, dto);
  }

  @Delete(':id/notes/:noteId')
  @ApiOperation({
    summary: 'Delete an interview note',
    description: 'Permanently removes an interview note. Author or admin only.',
  })
  @ApiResponse({ status: 200, description: 'Note deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden (not author or admin)' })
  @ApiResponse({ status: 404, description: 'Note not found' })
  deleteNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('noteId', new ParseUUIDPipe()) noteId: string,
  ) {
    return this.interviewsService.deleteNote(user, id, noteId);
  }
}

@ApiTags('User Profile & Interviews')
@ApiBearerAuth()
@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UserInterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Get('interviews')
  @ApiOperation({
    summary: 'List my scheduled interviews',
    description:
      'Returns paginated interviews for the authenticated user (as candidate or interviewer), with optional status and date filters.',
  })
  @ApiResponse({ status: 200, description: 'Paginated user interviews' })
  findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: InterviewQueryDto,
  ) {
    return this.interviewsService.findMine(user, query);
  }
}

@ApiTags('Interviewers - Availability')
@ApiBearerAuth()
@Controller('interviewers')
@UseGuards(JwtAuthGuard)
export class InterviewersController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Get(':id/availability')
  @ApiOperation({
    summary: 'Get available booking slots for an interviewer',
    description:
      'Computes free time slots within a date range, taking into account recurring weekly availability rules and existing booked interviews.',
  })
  @ApiResponse({ status: 200, description: 'Available slot intervals' })
  @ApiResponse({ status: 400, description: 'Invalid date range' })
  @ApiResponse({ status: 404, description: 'Interviewer not found' })
  getAvailability(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: AvailabilitySlotsQueryDto,
  ) {
    return this.interviewsService.getInterviewerAvailability(id, query);
  }
}
