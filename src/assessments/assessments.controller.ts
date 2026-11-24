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
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { Role } from '../generated/prisma/enums';
import {
  AssessmentQueryDto,
  CreateAssessmentDto,
  CreateAssignmentDto,
  CreateOptionDto,
  CreateQuestionDto,
  SaveAnswerDto,
  UpdateAssessmentDto,
  UpdateAssignmentDto,
  UpdateOptionDto,
  UpdateQuestionDto,
} from './dto/assessment.dto';
import { AssessmentsService } from './assessments.service';

@ApiTags('Assessments - Management')
@ApiBearerAuth()
@Controller('assessments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a draft assessment (Admin only)' })
  @ApiResponse({ status: 201, description: 'Assessment created' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  create(@Body() dto: CreateAssessmentDto) {
    return this.assessmentsService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List assessments (Published for users, all for admin)',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of assessments' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AssessmentQueryDto,
  ) {
    const isAdmin = user.role === Role.ADMIN;
    return this.assessmentsService.findAll(query, isAdmin);
  }

  @Get('assignments/me')
  @ApiOperation({ summary: 'List my assigned assessments' })
  @ApiResponse({
    status: 200,
    description: 'List of own assessment assignments',
  })
  getMyAssignments(@CurrentUser() user: AuthenticatedUser) {
    return this.assessmentsService.getMyAssignments(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get assessment details with questions' })
  @ApiResponse({ status: 200, description: 'Assessment details' })
  @ApiResponse({ status: 404, description: 'Assessment not found' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const isAdmin = user.role === Role.ADMIN;
    return this.assessmentsService.findOne(id, isAdmin);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update assessment metadata (Admin only)' })
  @ApiResponse({ status: 200, description: 'Assessment updated' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAssessmentDto,
  ) {
    return this.assessmentsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete assessment (Admin only)' })
  @ApiResponse({ status: 200, description: 'Assessment deleted' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({
    status: 409,
    description: 'Cannot delete assessment with submitted attempts',
  })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.assessmentsService.remove(id);
  }

  @Post(':id/publish')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Publish an assessment after validating question options (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Assessment published' })
  @ApiResponse({
    status: 400,
    description: 'Invalid question/option configuration',
  })
  publish(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.assessmentsService.publish(id);
  }

  @Post(':id/unpublish')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Unpublish an assessment to draft status (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Assessment unpublished' })
  unpublish(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.assessmentsService.unpublish(id);
  }

  // ─── Question Endpoints ───────────────────────────────────────────────────

  @Post(':id/questions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Add a question to an assessment (Admin only)' })
  @ApiResponse({ status: 201, description: 'Question created' })
  addQuestion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.assessmentsService.addQuestion(id, dto);
  }

  @Get(':id/questions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all questions in an assessment (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Questions with options & correctness',
  })
  getQuestions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.assessmentsService.getQuestions(id, user.role === Role.ADMIN);
  }

  // ─── Assignment Endpoints ─────────────────────────────────────────────────

  @Post(':id/assignments')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Assign assessment to a user (Admin only)' })
  @ApiResponse({ status: 201, description: 'Assessment assigned' })
  @ApiResponse({
    status: 400,
    description: 'Cannot assign unpublished assessment',
  })
  @ApiResponse({
    status: 409,
    description: 'Duplicate active assignment exists',
  })
  createAssignment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.assessmentsService.createAssignment(id, dto);
  }

  @Get(':id/assignments')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List assignments for an assessment (Admin only)' })
  @ApiResponse({ status: 200, description: 'List of assignments' })
  getAssignments(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.assessmentsService.getAssessmentAssignments(id);
  }

  // ─── Attempt Endpoints ───────────────────────────────────────────────────

  @Post(':id/start')
  @ApiOperation({
    summary:
      'Start taking an assessment (creates immutable question snapshots)',
  })
  @ApiResponse({ status: 201, description: 'Attempt started' })
  @ApiResponse({ status: 400, description: 'Unpublished or expired' })
  @ApiResponse({ status: 403, description: 'No active assignment' })
  startAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.assessmentsService.startAttempt(user, id);
  }

  @Get(':id/attempts')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all attempts for an assessment (Admin only)' })
  @ApiResponse({ status: 200, description: 'List of attempts' })
  getAssessmentAttempts(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.assessmentsService.getAssessmentAttempts(id);
  }
}

@ApiTags('Assessments - Questions & Options')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuestionsOptionsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Get('questions/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get question details by ID (Admin only)' })
  getQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.assessmentsService.getQuestion(id, user.role === Role.ADMIN);
  }

  @Patch('questions/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update question (Admin only)' })
  updateQuestion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.assessmentsService.updateQuestion(id, dto);
  }

  @Delete('questions/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete question (Admin only)' })
  removeQuestion(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.assessmentsService.removeQuestion(id);
  }

  @Post('questions/:id/options')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Add option to a question (Admin only)' })
  addOption(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateOptionDto,
  ) {
    return this.assessmentsService.addOption(id, dto);
  }

  @Patch('options/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update option text or correctness (Admin only)' })
  updateOption(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOptionDto,
  ) {
    return this.assessmentsService.updateOption(id, dto);
  }

  @Delete('options/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete option (Admin only)' })
  removeOption(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.assessmentsService.removeOption(id);
  }
}

@ApiTags('Assessments - Assignments')
@ApiBearerAuth()
@Controller('assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Update assignment due date or status (Admin only)',
  })
  updateAssignment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.assessmentsService.updateAssignment(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete an assignment (Admin only)' })
  removeAssignment(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.assessmentsService.removeAssignment(id);
  }
}

@ApiTags('Assessments - Attempts & Examination')
@ApiBearerAuth()
@Controller('attempts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttemptsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Get attempt with snapshot questions (safe for candidate)',
  })
  @ApiResponse({ status: 200, description: 'Attempt questions & options' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Attempt not found' })
  getAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.assessmentsService.getAttempt(user, id);
  }

  @Post(':id/answers')
  @ApiOperation({
    summary: 'Save or update answer for a question in an in-progress attempt',
  })
  @ApiResponse({ status: 200, description: 'Answer saved' })
  @ApiResponse({ status: 400, description: 'Invalid options' })
  @ApiResponse({
    status: 409,
    description: 'Attempt expired or not in progress',
  })
  saveAnswer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SaveAnswerDto,
  ) {
    return this.assessmentsService.saveAnswer(user, id, dto);
  }

  @Post(':id/submit')
  @ApiOperation({
    summary: 'Finalize and submit assessment attempt for backend scoring',
  })
  @ApiResponse({ status: 200, description: 'Attempt graded and submitted' })
  @ApiResponse({
    status: 409,
    description: 'Attempt expired or already submitted',
  })
  submitAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.assessmentsService.submitAttempt(user, id);
  }

  @Get(':id/result')
  @ApiOperation({ summary: 'Get submission score and level result' })
  @ApiResponse({
    status: 200,
    description: 'Attempt score, percentage, and level',
  })
  @ApiResponse({ status: 400, description: 'Attempt not yet submitted' })
  getAttemptResult(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.assessmentsService.getAttemptResult(user, id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete an attempt record (Admin only)' })
  @ApiResponse({ status: 200, description: 'Attempt deleted' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  removeAttempt(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.assessmentsService.removeAttempt(id);
  }
}

@ApiTags('User Profile & Assessments')
@ApiBearerAuth()
@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UserAttemptsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Get('attempts')
  @ApiOperation({
    summary: 'List my completed and in-progress assessment attempts',
  })
  @ApiResponse({ status: 200, description: 'User attempt history' })
  getMyAttempts(@CurrentUser() user: AuthenticatedUser) {
    return this.assessmentsService.getMyAttempts(user);
  }
}
